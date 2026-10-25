import importlib.util
import copy
import json
from pathlib import Path
import subprocess
import unittest

HAS_NUMPY = importlib.util.find_spec("numpy") is not None


@unittest.skipUnless(HAS_NUMPY, "Install research/cpu/requirements.lock.txt to test training")
class LearningTests(unittest.TestCase):
    def test_fitted_models_match_typescript_and_test_labels_do_not_affect_training(self):
        import numpy as np
        from learning import fit, forward
        root = Path(__file__).resolve().parents[2]
        program = "import {poolSpec,poolNames} from './packages/game-core/dist/research/index.js';console.log(JSON.stringify({spec:poolSpec(),inputs:poolNames(poolSpec()).length}));"
        config = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", program], cwd=root, text=True))
        rng = np.random.default_rng(23)
        width = config["inputs"]
        data = {"x": rng.normal(size=(12, width)), "y": np.array([0, 1] * 6), "weight": np.ones(12),
                "split": np.array(["train"] * 8 + ["validation"] * 2 + ["test"] * 2),
                "groups": np.arange(12), "environment": np.array(["strawberry"] * 12), "spec": config["spec"],
                "manifest": {"schemaHash": "fixture", "catalogHash": "fixture", "provenance": {"engineHash": "fixture"}},
                "sources": [], "audit": {}}
        for hidden in (0, 3):
            model, _ = fit(data, hidden=hidden, epochs=3)
            x = data["x"][-1]
            expected = float(forward(np.clip((x - model["mean"]) / model["scale"], -8, 8),
                                     {k: np.asarray(v) for k, v in model["weights"].items()})[0])
            program = "import {readFileSync} from 'node:fs';import {parsePooledValueModel,pooledLogit} from './packages/game-core/dist/ai/index.js';const d=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(pooledLogit(parsePooledValueModel(d.model),d.x)));"
            actual = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", program], cwd=root,
                                                       input=json.dumps({"model": model, "x": x.tolist()}), text=True))
            self.assertAlmostEqual(expected, actual, places=10)
            changed = copy.deepcopy(data)
            changed["x"][-2:] = 10000
            changed["y"][-2:] = 1 - changed["y"][-2:]
            other, _ = fit(changed, hidden=hidden, epochs=3)
            for key in ("mean", "scale", "weights"):
                self.assertEqual(model[key], other[key], f"Test leakage: {key}")

    def test_mlp_gradients_match_finite_differences(self):
        import numpy as np
        from learning import loss_grad
        rng = np.random.default_rng(31)
        x, y, weights = rng.normal(size=(5, 3)), np.array([0, 1, 0.5, 1, 0]), np.array([1, 2, 0.5, 1, 1])
        parameters = {"w1": rng.normal(size=(3, 2)) * 0.1, "b1": np.array([0.1, 0.2]), "w2": np.array([0.3, -0.2]), "b2": np.array(0.1)}
        _, gradients = loss_grad(x, y, weights, parameters, 0.01)
        for key, value in parameters.items():
            for index in np.ndindex(value.shape):
                original = value[index]
                value[index] = original + 1e-5
                plus = loss_grad(x, y, weights, parameters, 0.01)[0]
                value[index] = original - 1e-5
                minus = loss_grad(x, y, weights, parameters, 0.01)[0]
                value[index] = original
                self.assertAlmostEqual(float(gradients[key][index]), (plus - minus) / 2e-5, places=7)

    def test_metrics_are_match_weighted_and_calibration_is_bounded(self):
        import numpy as np
        from learning import metrics
        result = metrics(np.array([1, 1, 0]), np.array([0.8, 0.8, 0.8]), np.array([0.5, 0.5, 1]))
        self.assertEqual(result["accuracy"], 0.5)
        self.assertGreaterEqual(result["ece"], 0)
        self.assertLessEqual(result["ece"], 1)
        self.assertIsNone(metrics(np.array([0.5]), np.array([0.9]), np.array([1]))["accuracy"])


if __name__ == "__main__":
    unittest.main()
