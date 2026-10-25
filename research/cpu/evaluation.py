"""Paired-match estimates and a fixed-sample adoption gate. Never treat the two seats as independent."""
from __future__ import annotations

from collections import defaultdict
import json
import math
from pathlib import Path
import random
import statistics as stdstats
try:
    from .dataset import fingerprint
except ImportError:
    from dataset import fingerprint


def percentile(values, fraction):
    ordered = sorted(values)
    if not ordered:
        return None
    position = (len(ordered) - 1) * fraction
    lo = math.floor(position)
    return ordered[lo] + (ordered[min(lo + 1, len(ordered) - 1)] - ordered[lo]) * (position - lo)


def paired_interval(scores, *, alpha=0.05, seed=17, repeats=2000):
    if not scores:
        raise ValueError("No paired scores")
    rng = random.Random(seed)
    boot = [sum(rng.choices(scores, k=len(scores))) / len(scores) for _ in range(repeats)]
    mean = stdstats.mean(scores)
    # Distribution-free one-sided bound for bounded independent pair scores; used for the gate.
    lower = max(0, mean - math.sqrt(math.log(1 / alpha) / (2 * len(scores))))
    return {"pairs": len(scores), "score": mean,
            "bootstrap95": [percentile(boot, 0.025), percentile(boot, 0.975)], "hoeffdingLower": lower}


def read_experiment(path):
    with Path(path).open(encoding="utf-8") as source:
        manifest = json.loads(next(source))
        if manifest.get("type") != "manifest" or fingerprint(manifest["plan"]) != manifest.get("planHash"):
            raise ValueError("Invalid experiment manifest/plan hash")
        pairs, seen, complete = [], set(), False
        jobs = manifest["plan"]["jobs"]
        for line in source:
            row = json.loads(line)
            if complete:
                raise ValueError("Data after experiment summary")
            if row.get("type") == "summary":
                if row["pairs"] != len(pairs) or len(pairs) != len(jobs):
                    raise ValueError("Incomplete experiment")
                complete = True
                continue
            if row.get("type") != "pair" or row["index"] in seen or not 0 <= row["index"] < len(jobs):
                raise ValueError("Invalid/duplicate pair")
            job = jobs[row["index"]]
            if row["seed"] != job["seed"] or row["candidate"] != job["candidate"]["id"] or row["opponent"] != job["opponent"]["id"]:
                raise ValueError("Pair differs from frozen plan")
            if len(row["matches"]) != 2 or [m["candidateSeat"] for m in row["matches"]] != [0, 1]:
                raise ValueError("Both seats are required")
            score = 0
            for m in row["matches"]:
                expected = 0.5 if m["winner"] == "draw" else 1 if m["winner"] == m["candidateSeat"] else 0
                if m["score"] != expected:
                    raise ValueError("Incorrect score")
                score += expected / 2
            if score != row["score"] or row["unfinished"] != sum(m["winner"] is None for m in row["matches"]):
                raise ValueError("Incorrect paired score/completion count")
            pairs.append(row)
            seen.add(row["index"])
        if not complete:
            raise ValueError("Experiment has no completion summary")
    return manifest, sorted(pairs, key=lambda p: p["index"])


def summarize(pairs, *, alpha=0.05):
    result = paired_interval([pair["score"] for pair in pairs], alpha=alpha / 5)
    all_matches = [match for pair in pairs for match in pair["matches"]]
    own = [ms for match in all_matches for ms in match["candidateDecisionMs"]]
    foe = [ms for match in all_matches for ms in match["opponentDecisionMs"]]
    result.update({"games": len(all_matches), "wins": sum(m["winner"] == m["candidateSeat"] for m in all_matches),
                   "draws": sum(m["winner"] == "draw" for m in all_matches), "unfinished": sum(p["unfinished"] for p in pairs),
                   "meanDecisionMs": stdstats.mean(own) if own else 0, "p95DecisionMs": percentile(own, 0.95),
                   "opponentMeanMs": stdstats.mean(foe) if foe else 0,
                   "meanThinkingPerGameMs": sum(sum(m["candidateDecisionMs"]) for m in all_matches) / len(all_matches),
                   "opponentThinkingPerGameMs": sum(sum(m["opponentDecisionMs"]) for m in all_matches) / len(all_matches)})
    groups = defaultdict(list)
    for pair in pairs:
        groups[pair["environment"]["fruits"][-1]].append(pair["score"])
    result["environments"] = {env: paired_interval(values, alpha=alpha / 5) for env, values in groups.items()}
    result["timeRatio"] = result["meanThinkingPerGameMs"] / max(0.001, result["opponentThinkingPerGameMs"])
    return result


def adoption(summary, *, phase, rule):
    """A gate failure is 'not demonstrated', not proof that the candidate is worse."""
    reasons = []
    if phase != "test":
        reasons.append("Only the untouched test suite can authorize adoption")
    if summary["pairs"] < rule["minPairs"]:
        reasons.append("Insufficient independent pairs")
    if summary["unfinished"]:
        reasons.append("Unfinished games")
    environments = summary["environments"]
    if set(environments) != {"strawberry", "grape", "melon", "orange"}:
        reasons.append("Missing fruit environments")
    if any(row["pairs"] < rule["minPairsPerEnvironment"] for row in environments.values()):
        reasons.append("Insufficient pairs per environment")
    if summary["hoeffdingLower"] <= 0.5:
        reasons.append("Superiority over the incumbent is not demonstrated")
    if any(row["hoeffdingLower"] <= 0.5 - rule["environmentMargin"] for row in environments.values()):
        reasons.append("Environment non-inferiority is not demonstrated")
    if summary["timeRatio"] > rule["maxTimeRatio"]:
        reasons.append("Thinking-time budget exceeded")
    return {"adopt": not reasons, "reasons": reasons, "rule": rule,
            "inference": "Fixed-sample Hoeffding lower bounds with Bonferroni correction for overall + four environments; paired bootstrap intervals are descriptive"}


def summarize_file(path):
    manifest, pairs = read_experiment(path)
    groups = defaultdict(list)
    for pair in pairs:
        groups[pair["candidate"]].append(pair)
    return {"phase": manifest["plan"]["phase"], "planHash": manifest["planHash"], "provenance": manifest["provenance"],
            "candidates": {name: summarize(rows, alpha=manifest["plan"].get("gate", {}).get("alpha", 0.05)) for name, rows in groups.items()}}
