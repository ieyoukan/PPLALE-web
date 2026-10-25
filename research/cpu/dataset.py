"""Dependency-free reader/encoder for game-core research JSONL (Python 3.10+).

Only the exported schema defines feature order and normalization. No card rules,
heuristic scores or card-id vocabulary are duplicated in Python.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
from typing import Iterator

VERSION = "pplale-research-v1"
GROUPS = ("context", "player", "card", "effect", "action")


def split_for(seed: int, policy: str = "legacy-seed-v1") -> str:
    if policy not in ("legacy-seed-v1", "environment-block-v1"):
        raise ValueError(f"Unknown split policy: {policy}")
    bucket = (seed // 8 if policy == "environment-block-v1" else seed) % 10
    return "test" if bucket == 0 else "validation" if bucket == 1 else "train"


def replay_split(replay_hash: str) -> str:
    if len(replay_hash) != 64 or any(c not in "0123456789abcdef" for c in replay_hash):
        raise ValueError("Invalid replay hash")
    bucket = int(replay_hash[:8], 16) % 10
    return "test" if bucket == 0 else "validation" if bucket == 1 else "train"


def fingerprint(value: object) -> str:
    def normalize(item):
        if isinstance(item, bool) or item is None:
            return item
        if isinstance(item, (int, float)):
            if not math.isfinite(item):
                raise ValueError("Non-finite fingerprint number")
            return {"$f64": struct.pack(">d", 0 if item == 0 else item).hex()}
        if isinstance(item, list):
            return [normalize(v) for v in item]
        if isinstance(item, dict):
            return {key: normalize(v) for key, v in item.items()}
        return item

    text = json.dumps(normalize(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _read(data, path):
    for key in path:
        if isinstance(data, list):
            if not key.isascii() or not key.isdecimal() or str(int(key)) != key or int(key) >= len(data):
                return None
            data = data[int(key)]
        elif isinstance(data, dict) and key in data:
            data = data[key]
        else:
            return None
    return data


def encode_features(data: dict, specs: list[dict]) -> dict:
    for spec in specs:
        if spec["kind"] not in ("number", "boolean", "length", "contains", "equals"):
            raise ValueError(f"Unknown feature kind: {spec['kind']}")
        if not isinstance(spec["path"], list) or any(not isinstance(part, str) or "." in part for part in spec["path"]):
            raise ValueError(f"Invalid feature path: {spec['name']}")
    groups: dict[str, set[str]] = {}
    for spec in specs:
        if spec["kind"] in ("contains", "equals"):
            if not isinstance(spec.get("value"), str):
                raise ValueError(f"Missing feature category: {spec['name']}")
            groups.setdefault(".".join(spec["path"]), set()).add(spec["value"])
    unmapped = {}
    for path, vocabulary in groups.items():
        raw = _read(data, path.split("."))
        items = raw if isinstance(raw, list) else [raw] if isinstance(raw, str) else []
        unknown = sorted({v for v in items if isinstance(v, str) and v not in vocabulary})
        if unknown:
            unmapped[path] = unknown

    values, known, names = [], [], set()
    for spec in specs:
        name, kind, scale = spec["name"], spec["kind"], spec["scale"]
        if name in names:
            raise ValueError(f"Duplicate feature name: {name}")
        names.add(name)
        if isinstance(scale, bool) or not isinstance(scale, (int, float)) or not math.isfinite(scale) or scale <= 0:
            raise ValueError(f"Invalid feature scale: {name}")
        raw = _read(data, spec["path"])
        available = raw is not None and not (kind == "equals" and ".".join(spec["path"]) in unmapped)
        known.append(available)
        if not available:
            values.append(0)
            continue
        if kind == "number":
            if isinstance(raw, bool) or not isinstance(raw, (int, float)):
                raise ValueError(f"Expected number: {name}")
            value = raw
        elif kind == "boolean":
            if not isinstance(raw, bool):
                raise ValueError(f"Expected boolean: {name}")
            value = int(raw)
        elif kind in ("length", "contains"):
            if not isinstance(raw, list):
                raise ValueError(f"Expected array: {name}")
            value = len(raw) if kind == "length" else int(spec["value"] in raw)
        elif kind == "equals":
            if not isinstance(raw, str):
                raise ValueError(f"Expected category: {name}")
            value = int(raw == spec["value"])
        else:
            raise ValueError(f"Unknown feature kind: {kind}")
        normalized = value / scale
        if not math.isfinite(normalized):
            raise ValueError(f"Non-finite feature: {name}")
        try:
            values.append(struct.unpack("<f", struct.pack("<f", normalized))[0])
        except OverflowError as error:
            raise ValueError(f"Non-finite feature: {name}") from error
    return {"values": values, "known": known, "unmapped": unmapped}


def encode_observation(observation: dict, catalog: dict, schema: dict) -> dict:
    if observation["version"] != VERSION or schema["version"] != VERSION:
        raise ValueError("Unsupported research schema/observation version")
    cards = []
    for card in observation["cards"]:
        card_id = card["cardId"]
        definition = None if card_id is None else catalog.get(card_id)
        if card_id is not None and definition is None:
            raise ValueError(f"Card absent from research catalog: {card_id}")
        cards.append({
            "ref": card["ref"], "cardId": card_id,
            "vector": encode_features({**card, "definition": definition}, schema["card"]),
            "effects": [encode_features(effect, schema["effect"]) for effect in (definition or {}).get("effects", [])],
        })
    return {
        "version": VERSION,
        "context": encode_features(observation, schema["context"]),
        "players": [encode_features(player, schema["player"]) for player in observation["players"]],
        "cards": cards,
        "options": [dict(option) for option in (observation.get("pending") or {}).get("options", [])],
        "actions": [{**action, "cards": list(action["cards"]), "vector": encode_features(action, schema["action"])}
                    for action in observation["actions"]],
    }


class Dataset:
    def __init__(self, path: str | Path, *, expected_schema_hash: str | None = None, expected_catalog_hash: str | None = None):
        self.path = Path(path)
        with self.path.open(encoding="utf-8") as source:
            self.manifest = json.loads(source.readline())
        m = self.manifest
        if m.get("type") != "manifest" or m.get("version") != VERSION or m["schema"].get("version") != VERSION:
            raise ValueError("Unsupported research dataset version")
        for field in ("schema", "catalog"):
            if fingerprint(m[field]) != m[f"{field}Hash"]:
                raise ValueError(f"Research {field} hash mismatch")
        if "game" in m and fingerprint(m["game"]) != m.get("gameHash"):
            raise ValueError("Research game description hash mismatch")
        if expected_schema_hash is not None and m["schemaHash"] != expected_schema_hash:
            raise ValueError("Unexpected research schema hash")
        if expected_catalog_hash is not None and m["catalogHash"] != expected_catalog_hash:
            raise ValueError("Unexpected research catalog hash")
        for group in GROUPS:
            encode_features({}, m["schema"][group])

    def samples(self, split: str | None = None) -> Iterator[dict]:
        if split is not None and split not in ("train", "validation", "test"):
            raise ValueError("Unknown dataset split")
        match_splits = {}
        match, remaining, matches, decisions, unfinished, last_step = None, 0, 0, 0, 0, -1
        completed = False
        with self.path.open(encoding="utf-8") as source:
            # The file may have changed since this Dataset was constructed.
            if json.loads(source.readline()) != self.manifest:
                raise ValueError("Dataset manifest changed")
            for line_no, line in enumerate(source, 2):
                sample = json.loads(line)
                if completed:
                    raise ValueError("Records after dataset summary")
                if sample.get("type") == "summary":
                    if remaining or sample.get("games") != matches or matches != self.manifest["provenance"]["games"] or sample.get("decisions") != decisions or sample.get("unfinished") != unfinished:
                        raise ValueError("Incomplete/inconsistent dataset summary")
                    completed = True
                    continue
                if sample.get("type") == "match":
                    if remaining or sample["matchId"] in match_splits or sample["split"] not in ("train", "validation", "test"):
                        raise ValueError("Invalid match or match leaks between splits")
                    policy = self.manifest["provenance"].get("splitPolicy", "legacy-seed-v1")
                    if policy == "replay-hash-v1":
                        replay_hash = fingerprint(sample["replay"])
                        expected_seed = sample["replay"]["seed"]
                        expected_split, expected_id = replay_split(replay_hash), f"replay:{replay_hash}"
                        if sample.get("replayHash") != replay_hash:
                            raise ValueError("Replay hash mismatch")
                    else:
                        expected_seed = self.manifest["provenance"]["seedStart"] + matches
                        expected_split, expected_id = split_for(expected_seed, policy), f"seed:{expected_seed}"
                    if sample["seed"] != expected_seed or sample["matchId"] != expected_id or sample["split"] != expected_split:
                        raise ValueError("Match provenance/split mismatch")
                    remaining = sample["decisions"]
                    if isinstance(remaining, bool) or not isinstance(remaining, int) or remaining < 0:
                        raise ValueError("Invalid match decision count")
                    match_splits[sample["matchId"]] = sample["split"]
                    match, matches, last_step = sample, matches + 1, -1
                    unfinished += int(sample["result"]["winner"] is None)
                    continue
                if sample.get("type") != "decision" or sample.get("split") not in ("train", "validation", "test"):
                    raise ValueError(f"Invalid decision at line {line_no}")
                match_id = sample["matchId"]
                if not match or not remaining or match_id != match["matchId"] or match_splits[match_id] != sample["split"]:
                    raise ValueError(f"Match leaks between splits: {match_id}")
                if sample["viewer"] not in (0, 1) or isinstance(sample["viewer"], bool) or not isinstance(sample["step"], int) or sample["step"] <= last_step:
                    raise ValueError(f"Invalid viewer/step at line {line_no}")
                observation = sample["observation"]
                action = sample["selectedAction"]
                if observation.get("version") != VERSION or isinstance(action, bool) or not isinstance(action, int) or not 0 <= action < len(observation["actions"]):
                    raise ValueError(f"Invalid observation/action at line {line_no}")
                if sample.get("outcome") not in ("win", "loss", "draw", "unfinished"):
                    raise ValueError(f"Invalid outcome at line {line_no}")
                winner = match["result"]["winner"]
                outcome = "unfinished" if winner is None else "draw" if winner == "draw" else "win" if winner == sample["viewer"] else "loss"
                if sample["outcome"] != outcome:
                    raise ValueError(f"Outcome disagrees with match at line {line_no}")
                remaining, decisions, last_step = remaining - 1, decisions + 1, sample["step"]
                if split is None or sample["split"] == split:
                    yield sample
        if not completed:
            raise ValueError("Dataset has no completion summary (export may have failed)")

    def encoded(self, split: str | None = None, *, include_unfinished: bool = False) -> Iterator[dict]:
        labels = {"win": 1.0, "loss": 0.0, "draw": 0.5, "unfinished": None}
        for sample in self.samples(split):
            if sample["outcome"] == "unfinished" and not include_unfinished:
                continue
            yield {
                "matchId": sample["matchId"], "step": sample["step"], "split": sample["split"],
                "x": encode_observation(sample["observation"], self.manifest["catalog"], self.manifest["schema"]),
                "action": sample["selectedAction"], "y": labels[sample["outcome"]],
            }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--encode-out", type=Path)
    args = parser.parse_args()
    dataset = Dataset(args.dataset)
    counts = Counter((sample["split"], sample["outcome"]) for sample in dataset.samples())
    if args.encode_out:
        args.encode_out.parent.mkdir(parents=True, exist_ok=True)
        with args.encode_out.open("x", encoding="utf-8") as out:
            out.write(json.dumps({"type": "encoded-manifest", "source": dataset.manifest}, ensure_ascii=False, allow_nan=False) + "\n")
            for sample in dataset.encoded():
                out.write(json.dumps(sample, ensure_ascii=False, allow_nan=False) + "\n")
    print(json.dumps({
        "decisions": sum(counts.values()), "counts": {f"{split}/{outcome}": n for (split, outcome), n in sorted(counts.items())},
        "coverage": dict(Counter(card["coverage"] for card in dataset.manifest["catalog"].values())),
        "features": {group: len(dataset.manifest["schema"][group]) for group in GROUPS},
        "schemaHash": dataset.manifest["schemaHash"], "catalogHash": dataset.manifest["catalogHash"],
    }))


if __name__ == "__main__":
    main()
