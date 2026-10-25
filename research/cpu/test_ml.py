import unittest

import numpy as np

from ml import ranking_metrics


class RankingMetricsTest(unittest.TestCase):
    def test_ties_count_as_random_order(self):
        # 判断0：3択で選んだ手が単独1位。判断1：4択で全部同点（1番目で当たる期待値1/4、上位3つは3/4）
        owner = np.array([0, 0, 0, 1, 1, 1, 1])
        scores = np.array([0.1, 0.9, 0.2, 0.5, 0.5, 0.5, 0.5])
        result = ranking_metrics(scores, owner, np.array([1, 2]), np.array([0, 1]))
        self.assertAlmostEqual(result["top1"], (1 + 0.25) / 2)
        self.assertAlmostEqual(result["top3"], (1 + 0.75) / 2)
        self.assertEqual(result["wideDecisions"], 0)


if __name__ == "__main__":
    unittest.main()
