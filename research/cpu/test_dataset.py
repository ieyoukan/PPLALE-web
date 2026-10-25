import copy
import json
from pathlib import Path
import tempfile
import unittest

from dataset import Dataset, VERSION, encode_features, fingerprint, split_for, replay_split


def fixture():
    schema = {"version": VERSION, **{key: [] for key in ("context", "player", "card", "effect", "action")}}
    manifest = {"type": "manifest", "version": VERSION, "schema": schema, "catalog": {},
                "schemaHash": fingerprint(schema), "catalogHash": fingerprint({}), "provenance": {"games": 1, "seedStart": 2}}
    match = {"type": "match", "matchId": "seed:2", "split": "train", "seed": 2, "decisions": 1, "result": {"winner": 0}}
    observation = {"version": VERSION, "players": [], "cards": [], "actions": [{"id": "action.0", "source": None,
                   "target": None, "option": None, "cards": [], "type": "end"}]}
    sample = {"type": "decision", "matchId": "seed:2", "step": 1, "viewer": 0, "split": "train", "observation": observation,
              "selectedAction": 0, "outcome": "win"}
    summary = {"type": "summary", "games": 1, "decisions": 1, "unfinished": 0}
    return [manifest, match, sample, summary]


class DatasetTests(unittest.TestCase):
    def test_feedback_identity_and_split_are_bound_to_replay(self):
        rows = fixture()
        replay = {"seed": 2, "decks": [], "commands": [{"type": "end", "actor": 0}]}
        hash_value = fingerprint(replay)
        rows[0]["provenance"]["splitPolicy"] = "replay-hash-v1"
        rows[1].update(replay=replay, replayHash=hash_value)
        for row in rows[1:3]:
            row.update(matchId=f"replay:{hash_value}", split=replay_split(hash_value))
        self.assertEqual(len(list(self.write(rows).samples())), 1)
        rows[1]["replay"]["seed"] = 3
        with self.assertRaisesRegex(ValueError, "hash"):
            list(self.write(rows).samples())

    def test_split_covers_each_environment_and_ex_setting(self):
        groups = {split: set() for split in ("train", "validation", "test")}
        for seed in range(80):
            groups[split_for(seed, "environment-block-v1")].add((seed % 4, (seed >> 2) % 2))
        self.assertTrue(all(len(group) == 8 for group in groups.values()))
        with self.assertRaises(ValueError):
            split_for(1, "unknown")

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "dataset.jsonl"

    def write(self, rows):
        self.path.write_text("".join(json.dumps(row) + "\n" for row in rows), encoding="utf-8")
        return Dataset(self.path)

    def test_streaming_labels_and_split_selection(self):
        data = self.write(fixture())
        self.assertEqual(list(data.encoded())[0]["y"], 1)
        self.assertEqual(list(data.samples("test")), [])
        with self.assertRaises(ValueError):
            list(data.samples("unknown"))

    def test_unknown_missing_and_zero(self):
        features = [{"name": "value", "path": ["value"], "kind": "number", "scale": 10}]
        self.assertEqual(encode_features({"value": 0}, features)["known"], [True])
        self.assertEqual(encode_features({}, features)["known"], [False])
        for invalid in (float("nan"), float("inf"), True, "1"):
            with self.assertRaises(ValueError):
                encode_features({"value": invalid}, features)

    def test_incompatible_or_tampered_schema_is_rejected(self):
        rows = fixture()
        rows[0]["schema"]["context"].append({"name": "changed", "path": [], "kind": "number", "scale": 1})
        with self.assertRaisesRegex(ValueError, "hash"):
            self.write(rows)
        self.write(fixture())
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            Dataset(self.path, expected_schema_hash="different")
        rows = fixture()
        rows[0]["version"] = "future-version"
        with self.assertRaisesRegex(ValueError, "version"):
            self.write(rows)

    def test_split_leakage_and_mislabeled_outcomes_are_rejected(self):
        rows = fixture()
        rows[2]["split"] = "test"
        with self.assertRaisesRegex(ValueError, "splits"):
            list(self.write(rows).samples())
        rows = fixture()
        rows[2]["outcome"] = "loss"
        with self.assertRaisesRegex(ValueError, "Outcome"):
            list(self.write(rows).samples())

    def test_truncation_and_extra_records_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "completion"):
            list(self.write(fixture()[:-1]).samples())
        rows = fixture()
        rows[-1]["decisions"] = 5
        with self.assertRaisesRegex(ValueError, "summary"):
            list(self.write(rows).samples())
        rows = fixture()
        rows.append(copy.deepcopy(rows[2]))
        with self.assertRaisesRegex(ValueError, "after"):
            list(self.write(rows).samples())

    def test_unfinished_matches_are_not_training_losses(self):
        rows = fixture()
        rows[1]["result"]["winner"] = None
        rows[2]["outcome"] = "unfinished"
        rows[3]["unfinished"] = 1
        dataset = self.write(rows)
        self.assertEqual(list(dataset.encoded()), [])
        self.assertIsNone(list(dataset.encoded(include_unfinished=True))[0]["y"])

    def test_selected_action_must_exist(self):
        rows = fixture()
        rows[2]["selectedAction"] = 1
        with self.assertRaisesRegex(ValueError, "action"):
            list(self.write(rows).samples())


if __name__ == "__main__":
    unittest.main()
