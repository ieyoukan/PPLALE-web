"""Validate training eligibility before fitting any model; report environment and information coverage."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
try:
    from .dataset import Dataset, fingerprint
except ImportError:
    from dataset import Dataset, fingerprint


def audit(paths):
    if not paths:
        raise ValueError("No datasets supplied")
    rows, matches, decisions, environments, seen, issues = Counter(), {}, 0, defaultdict(set), set(), []
    contract = None
    initial_conditions = set()
    origins = Counter()
    for path in paths:
        data = Dataset(path)
        m = data.manifest
        origins[m["provenance"].get("origin", "self-play")] += m["provenance"]["games"]
        signature = (m["schemaHash"], m["catalogHash"], m.get("gameHash"), m["provenance"].get("rulesEngineHash", m["provenance"].get("engineHash")))
        if contract is not None and signature != contract:
            raise ValueError("Datasets use different schema/catalog/rules/engine; regenerate before mixing")
        contract = signature
        if m["provenance"].get("splitPolicy") not in ("environment-block-v1", "replay-hash-v1"):
            issues.append(f"{path}: legacy split correlates with fruit environment; recollect")
        # Include matches with no sampled decisions in the disjointness/coverage check.
        with Path(path).open(encoding="utf-8") as source:
            for line in source:
                item = json.loads(line)
                if item.get("type") != "match":
                    continue
                identity = item["matchId"]
                if identity in seen:
                    raise ValueError(f"Duplicate match across datasets: {identity}")
                seen.add(identity)
                decks = item.get("decks", item.get("replay", {}).get("decks"))
                if decks:
                    initial = fingerprint([item["seed"], [{k: d[k] for k in ("yojo", "sweet", "playable")} for d in decks]])
                    if initial in initial_conditions:
                        raise ValueError("Repeated seed/deck initial condition across sources")
                    initial_conditions.add(initial)
                env = item.get("environment")
                key = "unknown" if not env else f"{env['fruits'][-1]}:ex{int(env['extendedPlayable'])}"
                matches[identity] = {"split": item["split"], "environment": key, "winner": item["result"]["winner"]}
                rows[f"matches/{item['split']}/{key}"] += 1
        for sample in data.samples():  # fully consume: validates summary, selected action and labels
            o = sample["observation"]
            if o["winner"] is not None:
                raise ValueError("Terminal outcome leaked into a training observation")
            if any(key in o for key in ("rng", "queue", "log", "decks", "outcome", "label", "selectedAction")):
                raise ValueError("Private state/label in model observation")
            refs = [card["ref"] for card in o["cards"]]
            if len(set(refs)) != len(refs):
                raise ValueError("Duplicate observation card references")
            for card in o["cards"]:
                if card["cardId"] is None and card["current"] is not None:
                    raise ValueError("Hidden card has current properties")
                if card["side"] == 1 and card["zone"] == "hand" and card["cardId"] is not None:
                    pending = o.get("pending") or {}
                    if not card["current"]["revealed"] and not (pending.get("operation") == "playResponse" and pending.get("source") == card["ref"]):
                        raise ValueError("Unrevealed opposing hand identity in observation")
            ids = [action["id"] for action in o["actions"]]
            if len(set(ids)) != len(ids):
                raise ValueError("Duplicate action IDs")
            info = matches[sample["matchId"]]
            if sample["outcome"] != "unfinished":
                environments[sample["split"]].add(info["environment"])
            rows[f"decisions/{sample['split']}/{info['environment']}/{sample['outcome']}"] += 1
            decisions += 1
    expected = {f"{fruit}:ex{ex}" for fruit in ("strawberry", "grape", "melon", "orange") for ex in (0, 1)}
    for split in ("train", "validation", "test"):
        missing = sorted(expected - environments[split])
        if missing:
            issues.append(f"{split}: missing completed samples in {', '.join(missing)}")
    return {"eligible": not issues, "issues": issues, "matches": len(matches), "decisions": decisions,
            "unfinished": sum(m["winner"] is None for m in matches.values()), "counts": dict(sorted(rows.items())),
            "contract": contract, "origins": dict(origins), "annotationCoverage": dict(Counter(c["coverage"] for c in data.manifest["catalog"].values())),
            "limitations": ["Match-level split does not establish generalization to wholly unseen deck archetypes",
                            "Text hashing preserves text signals but does not execute or fully parse unannotated effects"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("datasets", nargs="+", type=Path)
    args = parser.parse_args()
    result = audit(args.datasets)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["eligible"] else 1)
