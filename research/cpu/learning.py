"""Reproducible logistic/MLP value learning. Training-only scaling, match weights, validation selection."""
from __future__ import annotations

import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import time
import numpy as np
try:
    from .audit import audit
    from .dataset import Dataset, fingerprint
    from .pooling import PoolEncoder, pool_spec
except ImportError:
    from audit import audit
    from dataset import Dataset, fingerprint
    from pooling import PoolEncoder, pool_spec

MODEL_VERSION = "pplale-pooled-value-v1"


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path, value):
    with Path(path).open("x", encoding="utf-8") as out:
        json.dump(value, out, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def load_data(paths):
    initial_hashes = {str(Path(p).resolve()): sha256(p) for p in paths}
    audit_result = audit(paths)
    if not audit_result["eligible"]:
        raise ValueError("Data not eligible: " + "; ".join(audit_result["issues"]))
    first = Dataset(paths[0]).manifest
    spec = pool_spec(first["schema"])
    encode = PoolEncoder(first["catalog"], spec)
    x, y, groups, splits, environments = [], [], [], [], []
    for path in paths:
        data = Dataset(path)
        with Path(path).open(encoding="utf-8") as source:
            match_environments = {row["matchId"]: row.get("environment", {}).get("fruits", ["unknown"])[-1]
                                  for line in source if (row := json.loads(line)).get("type") == "match"}
        for sample in data.samples():
            if sample["outcome"] == "unfinished":
                continue
            x.append(encode(sample["observation"]))
            y.append({"win": 1, "loss": 0, "draw": 0.5}[sample["outcome"]])
            groups.append(sample["matchId"])
            splits.append(sample["split"])
            environments.append(match_environments[sample["matchId"]])
    counts = Counter(groups)
    weights = np.array([1 / counts[group] for group in groups], dtype=np.float64)
    if any(sha256(p) != initial_hashes[str(Path(p).resolve())] for p in paths):
        raise ValueError("Training data changed while being read")
    return {"x": np.asarray(x, dtype=np.float64), "y": np.asarray(y), "weight": weights,
            "groups": np.asarray(groups), "split": np.asarray(splits), "environment": np.asarray(environments),
            "spec": spec, "manifest": first, "audit": audit_result,
            "sources": [{"path": str(Path(p).resolve()), "sha256": initial_hashes[str(Path(p).resolve())]} for p in paths]}


def sigmoid(z):
    return np.exp(-np.logaddexp(0, -z))


def forward(x, params):
    if "w1" in params:
        hidden = np.tanh(x @ params["w1"] + params["b1"])
        return hidden @ params["w2"] + params["b2"], hidden
    return x @ params["w"] + params["b"], None


def loss_grad(x, y, weight, params, l2):
    logits, hidden = forward(x, params)
    normalized = weight / weight.sum()
    loss = np.sum(normalized * (np.logaddexp(0, logits) - y * logits))
    error = (sigmoid(logits) - y) * normalized
    if hidden is None:
        gradients = {"w": x.T @ error, "b": np.sum(error)}
    else:
        back = np.outer(error, params["w2"]) * (1 - hidden ** 2)
        gradients = {"w1": x.T @ back, "b1": back.sum(axis=0), "w2": hidden.T @ error, "b2": error.sum()}
    for key, value in params.items():
        if key.startswith("w"):
            loss += l2 * np.sum(value ** 2) / 2
            gradients[key] += l2 * value
    return float(loss), gradients


def metrics(y, probability, weight):
    w = weight / weight.sum()
    p = np.clip(probability, 1e-8, 1 - 1e-8)
    bins = []
    for low in np.linspace(0, 0.9, 10):
        mask = (probability >= low) & (probability < low + 0.1 + (1e-12 if low > 0.89 else 0))
        if mask.any():
            bins.append({"low": float(low), "count": int(mask.sum()), "predicted": float(np.average(probability[mask], weights=weight[mask])),
                         "observed": float(np.average(y[mask], weights=weight[mask])), "weight": float(w[mask].sum())})
    decisive = y != 0.5
    accuracy = float(np.average((probability[decisive] >= 0.5) == (y[decisive] == 1), weights=weight[decisive])) if decisive.any() else None
    return {"samples": int(len(y)), "logLoss": float(np.sum(w * (-y * np.log(p) - (1 - y) * np.log1p(-p)))),
            "brier": float(np.sum(w * (probability - y) ** 2)), "accuracy": accuracy, "decisiveSamples": int(decisive.sum()),
            "ece": sum(b["weight"] * abs(b["predicted"] - b["observed"]) for b in bins), "calibration": bins}


def fit(data, *, hidden=0, seed=7, epochs=40, learning_rate=0.003, patience=7, l2=0.0001):
    x, y, weight, split = (data[key] for key in ("x", "y", "weight", "split"))
    train, validation = np.flatnonzero(split == "train"), np.flatnonzero(split == "validation")
    if len(train) < 2 or not len(validation):
        raise ValueError("Need independent train and validation matches")
    mean = np.average(x[train], axis=0, weights=weight[train])
    scale = np.sqrt(np.average((x[train] - mean) ** 2, axis=0, weights=weight[train]))
    scale[scale < 0.05] = 1
    standardized = np.clip((x - mean) / scale, -8, 8)
    rng = np.random.default_rng(seed)
    prior = float(np.clip(np.average(y[train], weights=weight[train]), 0.001, 0.999))
    bias = np.log(prior / (1 - prior))
    width = x.shape[1]
    params = {"w": np.zeros(width), "b": np.array(bias)} if hidden == 0 else {
        "w1": rng.normal(0, 1 / np.sqrt(width), (width, hidden)), "b1": np.zeros(hidden),
        "w2": rng.normal(0, 0.05, hidden), "b2": np.array(bias)}
    moments = {key: [np.zeros_like(value), np.zeros_like(value)] for key, value in params.items()}
    history, best, best_loss, stale, step = [], None, float("inf"), 0, 0
    started = time.monotonic()
    for epoch in range(epochs):
        order = rng.permutation(train)
        for start in range(0, len(order), 128):
            batch = order[start:start + 128]
            _, gradients = loss_grad(standardized[batch], y[batch], weight[batch], params, l2)
            step += 1
            for key, gradient in gradients.items():
                first, second = moments[key]
                first *= 0.9
                first += 0.1 * gradient
                second *= 0.999
                second += 0.001 * gradient ** 2
                params[key] -= learning_rate * (first / (1 - 0.9 ** step)) / (np.sqrt(second / (1 - 0.999 ** step)) + 1e-8)
        row = {"epoch": epoch + 1}
        for name, ids in (("train", train), ("validation", validation)):
            p = sigmoid(forward(standardized[ids], params)[0])
            row[name] = metrics(y[ids], p, weight[ids])
        history.append(row)
        loss = row["validation"]["logLoss"]
        if loss < best_loss - 1e-6:
            best_loss, best, stale = loss, {"params": copy.deepcopy(params), "epoch": epoch + 1}, 0
        else:
            stale += 1
        if stale >= patience:
            break
    params = best["params"]
    model = {"version": MODEL_VERSION, "kind": "mlp" if hidden else "linear", "spec": data["spec"],
             "poolHash": fingerprint(data["spec"]), "schemaHash": data["manifest"]["schemaHash"],
             "catalogHash": data["manifest"]["catalogHash"], "gameHash": data["manifest"].get("gameHash"),
             "rulesEngineHash": data["manifest"]["provenance"].get("rulesEngineHash"),
             "inputs": width, "hidden": hidden, "mean": mean.tolist(), "scale": scale.tolist(),
             "weights": {key: value.tolist() for key, value in params.items()}, "valueScale": 100,
             "training": {"seed": seed, "epochs": len(history), "selectedEpoch": best["epoch"], "learningRate": learning_rate,
                          "l2": l2, "optimizer": "Adam", "matchWeighting": "equal-total-per-match", "sources": data["sources"],
                          "engineHash": data["manifest"]["provenance"]["engineHash"], "seconds": time.monotonic() - started}}
    model["training"]["origins"] = data["audit"].get("origins", {})
    evaluations = {}
    for name in ("train", "validation", "test"):
        ids = np.flatnonzero(split == name)
        if len(ids):
            probability = sigmoid(forward(standardized[ids], params)[0])
            evaluations[name] = metrics(y[ids], probability, weight[ids])
            evaluations[name]["matches"] = len(set(data["groups"][ids]))
            evaluations[name]["constantBaseline"] = metrics(y[ids], np.full(len(ids), prior), weight[ids])
            evaluations[name]["environments"] = {}
            for env in sorted(set(data["environment"][ids])):
                mask = data["environment"][ids] == env
                evaluations[name]["environments"][env] = metrics(y[ids][mask], probability[mask], weight[ids][mask])
    return model, {"history": history, "evaluation": evaluations, "seconds": time.monotonic() - started}


def train(paths, output, *, epochs=40, seed=7):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    data = load_data(paths)
    write_json(output / "audit.json", data["audit"])
    results = {}
    for name, hidden in (("linear", 0), ("mlp", 16)):
        print(f"fitting {name}: {len(data['y'])} positions, {data['x'].shape[1]} inputs", flush=True)
        model, result = fit(data, hidden=hidden, epochs=epochs, seed=seed)
        write_json(output / f"{name}.json", model)
        write_json(output / f"{name}-metrics.json", result)
        results[name] = {"model": str((output / f"{name}.json").resolve()), "sha256": sha256(output / f"{name}.json"),
                         "validationLogLoss": result["evaluation"]["validation"]["logLoss"], "test": result["evaluation"]["test"]}
    # Selection uses validation only. Test scores are diagnostic, never the selection key.
    chosen = min(results, key=lambda name: results[name]["validationLogLoss"])
    write_json(output / "summary.json", {"selected": chosen, "selection": "minimum validation log loss", "models": results})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("datasets", nargs="+", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    train(args.datasets, args.out, epochs=args.epochs, seed=args.seed)
