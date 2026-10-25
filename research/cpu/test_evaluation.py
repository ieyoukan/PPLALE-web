import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from dataset import fingerprint
from evaluation import adoption, paired_interval, read_experiment, summarize
from study import GATE, reserve


def pair(index=0, score=1, fruit="strawberry"):
    matches = [{"candidateSeat": seat, "winner": seat if score == 1 else 1 - seat,
                "score": score, "candidateDecisionMs": [2], "opponentDecisionMs": [4]} for seat in (0, 1)]
    return {"type": "pair", "index": index, "seed": 80 + index, "candidate": "new", "opponent": "old",
            "environment": {"fruits": [fruit], "extendedPlayable": False}, "matches": matches,
            "score": score, "unfinished": 0}


class EvaluationTests(unittest.TestCase):
    def test_pair_not_individual_seats_is_the_sampling_unit(self):
        result = summarize([pair(0, 1), pair(1, 0)])
        self.assertEqual(result["pairs"], 2)
        self.assertEqual(result["games"], 4)
        self.assertEqual(result["score"], 0.5)
        self.assertEqual(result["timeRatio"], 0.5)
        self.assertEqual(paired_interval([0.5] * 50)["bootstrap95"], [0.5, 0.5])

    def test_gate_rejects_untested_incomplete_or_environment_regressions(self):
        result = summarize([pair(i, 1, ["strawberry", "grape", "melon", "orange"][i % 4]) for i in range(128)])
        self.assertTrue(adoption(result, phase="test", rule=GATE)["adopt"])
        self.assertFalse(adoption(result, phase="validation", rule=GATE)["adopt"])
        for key, value in (("pairs", 2), ("unfinished", 1), ("timeRatio", 2), ("hoeffdingLower", 0.49)):
            changed = {**result, key: value}
            self.assertFalse(adoption(changed, phase="test", rule=GATE)["adopt"], key)
        changed = copy.deepcopy(result)
        changed["environments"]["orange"]["hoeffdingLower"] = 0.39
        self.assertFalse(adoption(changed, phase="test", rule=GATE)["adopt"])

    def test_frozen_plan_duplicate_rows_and_truncation(self):
        job = {"candidate": {"id": "new"}, "opponent": {"id": "old"}, "seed": 80}
        plan = {"jobs": [job]}
        manifest = {"type": "manifest", "plan": plan, "planHash": fingerprint(plan)}
        rows = [manifest, pair(), {"type": "summary", "pairs": 1}]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "results.jsonl"
            def write(records):
                path.write_text("".join(json.dumps(row) + "\n" for row in records))
            write(rows)
            self.assertEqual(len(read_experiment(path)[1]), 1)
            for invalid in (rows[:-1], [*rows[:2], pair(), rows[-1]]):
                write(invalid)
                with self.assertRaises(ValueError):
                    read_experiment(path)
            bad = copy.deepcopy(rows)
            bad[1]["matches"][0]["winner"] = 1
            write(bad)
            with self.assertRaisesRegex(ValueError, "score"):
                read_experiment(path)
            bad = copy.deepcopy(rows)
            bad[0]["plan"]["jobs"][0]["seed"] = 81
            write(bad)
            with self.assertRaisesRegex(ValueError, "hash"):
                read_experiment(path)

    def test_evaluation_ledger_refuses_test_seed_reuse(self):
        with tempfile.TemporaryDirectory() as directory, patch("study.ROOT", Path(directory)):
            run = Path(directory) / "example"
            reserve({"phase": "test", "jobs": [{"seed": 800}]}, run)
            with self.assertRaisesRegex(ValueError, "consumed"):
                reserve({"phase": "screen", "jobs": [{"seed": 800}]}, run)
            reserve({"phase": "test", "jobs": [{"seed": 801}]}, run)


if __name__ == "__main__":
    unittest.main()
