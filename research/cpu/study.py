"""Run a reproducible research cycle: data, learning, held-out CPU comparisons, and deck search."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile
try:
    from .dataset import fingerprint
    from .evaluation import summarize_file, adoption
except ImportError:
    from dataset import fingerprint
    from evaluation import summarize_file, adoption

ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "packages/game-core/scripts/experiment.mjs"
GATE = {"alpha": 0.05, "minPairs": 128, "minPairsPerEnvironment": 32, "environmentMargin": 0.1, "maxTimeRatio": 1.25}


def write(path, value):
    with Path(path).open("x", encoding="utf-8") as out:
        json.dump(value, out, ensure_ascii=False, indent=2, allow_nan=False)


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def node(*args, capture=False):
    result = subprocess.run(["node", str(RUNNER), *map(str, args)], cwd=ROOT, text=True,
                            stdout=subprocess.PIPE if capture else None, check=True)
    return json.loads(result.stdout) if capture else None


def reserve(plan, run):
    """Reserve seed families before evaluation; a test family is never reused for another plan."""
    ledger = ROOT / "research/cpu/runs/suites.jsonl"
    ledger.parent.mkdir(parents=True, exist_ok=True)
    seeds = sorted(set(job["seed"] for job in plan["jobs"]))
    record = {"run": str(run.resolve()), "phase": plan["phase"], "planHash": fingerprint(plan), "seeds": seeds}
    with ledger.open("a+", encoding="utf-8") as stream:
        fcntl.flock(stream, fcntl.LOCK_EX)
        stream.seek(0)
        for line in stream:
            previous = json.loads(line)
            if set(previous["seeds"]) & set(seeds):
                raise ValueError(f"Evaluation seeds already consumed by {previous['run']} / {previous['phase']}; choose a fresh seed range")
        stream.write(json.dumps(record) + "\n")
        stream.flush()


def evaluate(run, phase, algorithms, seed, pairs_per_environment, *, workers=4, jobs=None, gate=GATE):
    if seed % 8 or pairs_per_environment < 2 or pairs_per_environment % 2:
        raise ValueError("Evaluation seed must be divisible by 8; pairs per environment must be positive and even")
    incumbent = {"id": "current-master", "kind": "level", "level": "master"}
    if jobs is None:
        jobs = [{"candidate": algorithm, "opponent": incumbent, "seed": seed + i, "maxCommands": 600}
                for algorithm in algorithms for i in range(pairs_per_environment * 4)]
    plan = {"version": "pplale-experiment-v1", "phase": phase, "workers": workers, "gate": gate,
            "sampling": "fixed pairs; all fruits and both Ex settings; no early stopping", "jobs": jobs}
    plan_path, results_path = run / f"{phase}-plan.json", run / f"{phase}.jsonl"
    write(plan_path, plan)  # freeze before seeing any result
    reserve(plan, run)
    node("run", plan_path, results_path)
    summary = summarize_file(results_path)
    write(run / f"{phase}-summary.json", summary)
    return summary


SCREEN_SEARCH = {"maxNodes": 600, "beamWidth": 4, "worlds": 2, "candidates": 5, "lethalNodes": 400}


def algorithms(models, search=SCREEN_SEARCH, suffix=""):
    """空のsearchはcreateMasterの既定値、つまり現行masterと同じ探索量を使う。"""
    result = [{"id": f"legacy-600{suffix}" if search is SCREEN_SEARCH else f"legacy{suffix}", "kind": "legacy-search", "search": search},
              {"id": f"rules-600{suffix}" if search is SCREEN_SEARCH else f"rules{suffix}", "kind": "rule-search", "search": search}]
    for name in ("linear", "mlp"):
        path = (models / f"{name}.json").resolve()
        result.append({"id": f"{name}-blend25{suffix}", "kind": "pooled-search", "search": search,
                       "model": str(path), "modelHash": file_hash(path), "blend": 0.25})
    return result


def confirm(run, models, candidate, search, seed, test_pairs, *, suffix, origin):
    """事前に1つに決めた仮説だけを、新しいseedの最終テストで確かめる（候補選択の段階を挟まない）。"""
    pool = {a["id"]: a for a in algorithms(models, search, suffix)}
    if candidate + suffix not in pool:
        raise ValueError(f"Unknown candidate: {candidate}")
    selected = pool[candidate + suffix]
    write(run / "selected.json", {"algorithm": selected, "selection": f"fixed before testing: {origin}"})
    test = evaluate(run, "test", [selected], seed, test_pairs)
    verdict = adoption(test["candidates"][selected["id"]], phase="test", rule=GATE)
    write(run / "decision.json", {"algorithm": selected, "verdict": verdict, "testPlanHash": test["planHash"]})
    if verdict["adopt"]:
        write(run / "approved-candidate.json", {"algorithm": selected, "evidence": str((run / 'test.jsonl').resolve()), "verdict": verdict})
    return selected, verdict


def compare(run, models, seed, screen_pairs, validation_pairs, test_pairs):
    candidates = algorithms(models)
    screening = evaluate(run, "screen", candidates, seed, screen_pairs)
    ranked = sorted(candidates, key=lambda a: (-screening["candidates"][a["id"]]["score"], screening["candidates"][a["id"]]["timeRatio"]))[:2]
    validation = evaluate(run, "validation", ranked, seed + 100000, validation_pairs)
    selected = min(ranked, key=lambda a: (-validation["candidates"][a["id"]]["score"], validation["candidates"][a["id"]]["timeRatio"]))
    write(run / "selected.json", {"algorithm": selected, "selection": "screen top two, then highest validation paired score; time breaks ties"})
    test = evaluate(run, "test", [selected], seed + 200000, test_pairs)
    verdict = adoption(test["candidates"][selected["id"]], phase="test", rule=GATE)
    if selected.get("model"):
        origins = json.loads(Path(selected["model"]).read_text())["training"].get("origins", {})
        if origins.get("synthetic-smoke", 0):
            verdict["adopt"] = False
            verdict["reasons"].append("Synthetic feedback fixtures are for workflow verification, not adoption evidence")
    write(run / "decision.json", {"algorithm": selected, "verdict": verdict, "testPlanHash": test["planHash"]})
    # A candidate is recorded separately; adoption never means an unvalidated production deployment.
    if verdict["adopt"]:
        write(run / "approved-candidate.json", {"algorithm": selected, "evidence": str((run / 'test.jsonl').resolve()), "verdict": verdict})
    return selected, verdict


def decks(run, seed, *, count=6, screen_pairs=4, test_pairs=16, generations=2):
    strategy = {"id": "deck-driver-hard", "kind": "level", "level": "hard"}
    results = []
    for env in range(4):
        incumbent = None
        for generation in range(generations):
            generation_dir = run / f"deck-{env}-generation-{generation}"
            generation_dir.mkdir()
            args = ["decks", seed + env + generation * 80, count, 2]
            if incumbent is not None:
                path = generation_dir / "parent.json"
                write(path, incumbent)
                args.append(path)
            pool = node(*args, capture=True)
            write(generation_dir / "pool.json", pool)
            jobs = []
            seed_start = seed + generation * 10000 + env * 1000
            for i, candidate in enumerate(pool):
                for k in range(screen_pairs):
                    pair_seed = seed_start + k * 8 + env
                    opponent = node("decks", pair_seed + 800000, 1, 2, capture=True)[0]
                    jobs.append({"candidate": {**strategy, "id": f"deck-{i}"}, "opponent": strategy, "decks": [candidate, opponent],
                                 "deckComparison": True, "seed": pair_seed, "maxCommands": 600})
            summary = evaluate(generation_dir, "deck-screen", [], seed_start - seed_start % 8, 2, jobs=jobs)
            best = max(range(len(pool)), key=lambda i: summary["candidates"][f"deck-{i}"]["score"])
            incumbent = pool[best]
        test_dir = run / f"deck-{env}-test"
        test_dir.mkdir()
        write(test_dir / "deck.json", incumbent)
        jobs = []
        for k in range(test_pairs):
            pair_seed = seed + 100000 + k * 8 + env
            opponent = node("decks", pair_seed + 800000, 1, 2, capture=True)[0]
            jobs.append({"candidate": {**strategy, "id": "selected-deck"}, "opponent": strategy, "decks": [incumbent, opponent],
                         "deckComparison": True, "seed": pair_seed, "maxCommands": 600})
        summary = evaluate(test_dir, "deck-test", [], seed + 100000 - seed % 8, 2, jobs=jobs)
        results.append({"environment": ["strawberry", "grape", "melon", "orange"][env], "extendedPlayable": bool((seed >> 2) % 2),
                        "deck": incumbent, "test": summary["candidates"]["selected-deck"], "search": {"generations": generations, "candidates": count, "copyLimit": 2, "driver": "hard"}})
    write(run / "decks.json", {"results": results, "claim": "Best found within this bounded search and opponent distribution; not a global optimum"})


def snapshot(run):
    with zipfile.ZipFile(run / "source.zip", "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for folder, patterns in ((ROOT / "packages/game-core/src", ["*.ts"]), (ROOT / "packages/game-core/scripts", ["*.mjs"]),
                                 (ROOT / "research/cpu", ["*.py", "requirements*.txt"]), (ROOT / "src/data", ["*.json"])):
            for pattern in patterns:
                for path in folder.glob(pattern) if folder.name == "cpu" else folder.rglob(pattern):
                    archive.write(path, path.relative_to(ROOT))
        for name in ("mise.toml", "pnpm-lock.yaml", "packages/game-core/package.json", "packages/game-core/tsconfig.json"):
            archive.write(ROOT / name, name)
        archive.write(ROOT / "services/cpu-server/src/report.ts", "services/cpu-server/src/report.ts")
        archive.write(ROOT / "package.json", "package.json")
        archive.write(ROOT / "pnpm-workspace.yaml", "pnpm-workspace.yaml")


def feedback_cycle(run, paths, reports, seed, *, origin, smoke=False, screen_pairs=2, validation_pairs=8, test_pairs=32):
    """Append verified feedback to a frozen base cohort, refit from scratch, and evaluate on fresh seeds."""
    try:
        from .learning import train
        from .report import generate
    except ImportError:
        from learning import train
        from report import generate
    if not paths or not reports:
        raise ValueError("Feedback cycles require --datasets and --feedback")
    if origin == "synthetic-smoke" and not smoke:
        raise ValueError("Synthetic feedback is allowed only with --smoke")
    run.mkdir(parents=True, exist_ok=False)
    snapshot(run)
    output = run / "feedback.jsonl"
    subprocess.run(["node", str(ROOT / "packages/game-core/scripts/feedback.mjs"), "import", str(reports), str(output), origin], cwd=ROOT, check=True)
    plan = {"origin": origin, "base": [{"path": str(p.resolve()), "sha256": file_hash(p)} for p in paths],
            "reportsHash": file_hash(reports), "seed": seed, "smoke": smoke, "gate": GATE,
            "split": "immutable match split; replay-hash-v1 for feedback", "weight": "equal total per match"}
    write(run / "feedback-plan.json", plan)
    train([*paths, output], run / "training")
    if smoke:
        candidate = algorithms(run / "training")[-1]
        jobs = [{"candidate": candidate, "opponent": {"id": "current-master", "kind": "level", "level": "master"},
                 "seed": seed + i, "maxCommands": 600} for i in range(2)]
        evaluate(run, "screen", [candidate], seed, 2, jobs=jobs, workers=2)
        status = "再生検証・再学習・TS推論・実戦実行の動作確認のみ。採用判定は実施しない"
        write(run / "smoke-verdict.json", {"adopt": False, "reason": "Workflow smoke test is not evidence of improvement"})
    else:
        compare(run, run / "training", seed, screen_pairs, validation_pairs, test_pairs)
        status = "新しいseed群でscreen→validation→testと採用判定を完了"
    write(run / "feedback-cycle.json", {**plan, "status": status})
    generate(run)


def collect(run, games, seed):
    if games < 80 or games % 80 or seed % 80:
        raise ValueError("Use at least 80 games, and multiples of 80 for games and seed, to cover each split/environment")
    shards = min(4, games // 80)
    sizes = [games // 80 // shards * 80] * shards
    for i in range((games // 80) % shards):
        sizes[i] += 80
    jobs, cursor = [], seed
    for i, size in enumerate(sizes):
        jobs.append((run / f"data-{i}.jsonl", cursor, size))
        cursor += size
    def work(job):
        path, start, size = job
        subprocess.run(["node", str(ROOT / "packages/game-core/scripts/research.mjs"), "collect", "--out", str(path),
                        "--games", str(size), "--seed", str(start), "--share", "0.16", "--level", "hard", "--exploration", "0.15", "--max-commands", "600"], cwd=ROOT, check=True)
    with ThreadPoolExecutor(max_workers=shards) as pool:
        for future in as_completed([pool.submit(work, job) for job in jobs]):
            future.result()
    return [job[0] for job in jobs]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=["run", "compare", "confirm", "decks", "feedback", "report"])
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--models", type=Path)
    parser.add_argument("--seed", type=int, default=1600000)
    parser.add_argument("--games", type=int, default=640)
    parser.add_argument("--screen-pairs", type=int, default=2)
    parser.add_argument("--validation-pairs", type=int, default=8)
    parser.add_argument("--test-pairs", type=int, default=32)
    parser.add_argument("--datasets", nargs="+", type=Path)
    parser.add_argument("--feedback", type=Path)
    parser.add_argument("--origin", choices=["human-report", "synthetic-smoke"], default="human-report")
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--candidate", default="mlp-blend25", help="confirm: 検証する候補（algorithmsのID）")
    parser.add_argument("--search", type=json.loads, default={}, help="confirm: 探索設定のJSON。{}は現行masterと同じ既定値")
    parser.add_argument("--suffix", default="-master-budget", help="confirm: 候補IDの接尾辞")
    parser.add_argument("--hypothesis", default="", help="confirm: 仮説を決めた根拠（記録用）")
    args = parser.parse_args()
    run = args.run.resolve()
    if args.task == "run":
        run.mkdir(parents=True, exist_ok=False)
        write(run / "study-plan.json", {"task": "run", "seed": args.seed, "games": args.games, "screenPairs": args.screen_pairs,
                                        "validationPairs": args.validation_pairs, "testPairs": args.test_pairs, "gate": GATE})
        subprocess.run(["pnpm", "--filter", "@pplale/game-core", "run", "build"], cwd=ROOT, check=True)
        snapshot(run)
        paths = collect(run, args.games, args.seed)
        try:
            from .learning import train
        except ImportError:
            from learning import train
        train(paths, run / "training")
        compare(run, run / "training", args.seed + 2000000, args.screen_pairs, args.validation_pairs, args.test_pairs)
        for name, offset in (("decks", 3000000), ("decks-ex", 4000004)):
            directory = run / name
            directory.mkdir()
            decks(directory, args.seed + offset)
        try:
            from .report import generate
        except ImportError:
            from report import generate
        generate(run)
    elif args.task == "compare":
        run.mkdir(parents=True, exist_ok=True)
        compare(run, (args.models or run / "training").resolve(), args.seed, args.screen_pairs, args.validation_pairs, args.test_pairs)
    elif args.task == "confirm":
        run.mkdir(parents=True, exist_ok=False)
        subprocess.run(["pnpm", "--filter", "@pplale/game-core", "run", "build"], cwd=ROOT, check=True)
        snapshot(run)
        models = (args.models or run / "training").resolve()
        if not args.hypothesis:
            raise ValueError("confirm requires --hypothesis describing why this candidate was fixed in advance")
        confirm(run, models, args.candidate, args.search, args.seed, args.test_pairs, suffix=args.suffix, origin=args.hypothesis)
        try:
            from .report import generate
        except ImportError:
            from report import generate
        generate(run)
    elif args.task == "decks":
        run.mkdir(parents=True, exist_ok=True)
        decks(run, args.seed)
    elif args.task == "feedback":
        subprocess.run(["pnpm", "--filter", "@pplale/game-core", "run", "build"], cwd=ROOT, check=True)
        feedback_cycle(run, args.datasets, args.feedback, args.seed, origin=args.origin, smoke=args.smoke,
                       screen_pairs=args.screen_pairs, validation_pairs=args.validation_pairs, test_pairs=args.test_pairs)
    else:
        try:
            from .report import generate
        except ImportError:
            from report import generate
        generate(run)


if __name__ == "__main__":
    main()
