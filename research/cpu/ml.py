"""scikit-learn / PyTorch experiments on the shared research data.

value:  局面の勝ち負け予測。固定poolingの入力でscikit-learn（ロジスティック回帰・勾配ブースティング）と
        PyTorch（正則化MLP・カードごとの変換を学習するDeep Sets）を比べる。TSで推論できる線形/tanh MLPは
        pplale-pooled-value-v1として書き出し、実戦で比較できる。
policy: 手の模倣。さいきょうCPUが選んだ手を、提示された合法手の中から当てる（探索の候補を絞る用途）。

分割はデータに記録された試合単位のsplitに従い、validationで選び、testは最後の診断だけに使う。
"""
from __future__ import annotations

import argparse
import copy
from pathlib import Path
import time

import numpy as np
try:
    from .dataset import Dataset, fingerprint
    from .learning import MODEL_VERSION, fit, load_data, metrics, sha256, write_json
    from .pooling import PoolEncoder, flatten, pool_spec
except ImportError:
    from dataset import Dataset, fingerprint
    from learning import MODEL_VERSION, fit, load_data, metrics, sha256, write_json
    from pooling import PoolEncoder, flatten, pool_spec

ZONES = ["hand", "field", "nap", "exile", "choice"]


def standardize(x, train, weight):
    mean = np.average(x[train], axis=0, weights=weight[train])
    scale = np.sqrt(np.average((x[train] - mean) ** 2, axis=0, weights=weight[train]))
    scale[scale < 0.05] = 1  # learning.fitと同じ規則（TS推論と一致させる）
    return mean, scale


def export_model(data, mean, scale, kind, hidden, weights, training):
    """learning.fitと同じpplale-pooled-value-v1形式。TSのpooled-value.tsでそのまま推論できる。"""
    return {"version": MODEL_VERSION, "kind": kind, "hidden": hidden, "weights": weights, "spec": data["spec"], "poolHash": fingerprint(data["spec"]),
            "schemaHash": data["manifest"]["schemaHash"], "catalogHash": data["manifest"]["catalogHash"],
            "gameHash": data["manifest"].get("gameHash"), "rulesEngineHash": data["manifest"]["provenance"].get("rulesEngineHash"),
            "inputs": len(mean), "mean": mean.tolist(), "scale": scale.tolist(), "valueScale": 100,
            "training": {**training, "sources": data["sources"], "engineHash": data["manifest"]["provenance"]["engineHash"],
                         "matchWeighting": "equal-total-per-match", "origins": data["audit"].get("origins", {})}}


def evaluate_all(data, probability):
    result = {}
    for name in ("train", "validation", "test"):
        ids = np.flatnonzero(data["split"] == name)
        result[name] = metrics(data["y"][ids], probability[ids], data["weight"][ids])
        result[name]["matches"] = len(set(data["groups"][ids]))
    return result


# ---------- value: scikit-learn ----------

def fit_sklearn_logistic(data, z, train, validation):
    from sklearn.linear_model import LogisticRegression
    y, weight = data["y"], data["weight"]
    hard = (y[train] >= 0.5).astype(int)  # 引き分けは重み半分ずつ勝ち/負けへ
    draws = y[train] == 0.5
    xs = np.concatenate([z[train], z[train][draws]])
    ys = np.concatenate([hard, np.zeros(draws.sum(), int)])
    ws = np.concatenate([np.where(draws, 0.5, 1) * weight[train], 0.5 * weight[train][draws]])
    ws = ws / ws.mean()
    trials, best = [], None
    for c in (0.0003, 0.001, 0.003, 0.01, 0.03):
        started = time.monotonic()
        model = LogisticRegression(C=c, max_iter=400, tol=1e-5).fit(xs, ys, sample_weight=ws)
        p = model.predict_proba(z[validation])[:, 1]
        loss = metrics(y[validation], p, weight[validation])["logLoss"]
        trials.append({"C": c, "validationLogLoss": loss, "seconds": time.monotonic() - started})
        print(f"  logistic C={c}: validation {loss:.4f}", flush=True)
        if best is None or loss < best[0]:
            best = (loss, c, model)
    return best[2], {"search": trials, "selectedC": best[1]}


def fit_sklearn_boosting(data, x, train, validation):
    from sklearn.ensemble import HistGradientBoostingClassifier
    y, weight = data["y"], data["weight"]
    hard = (y[train] >= 0.5).astype(int)
    model = HistGradientBoostingClassifier(max_iter=400, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40,
                                           l2_regularization=1.0, early_stopping=False, random_state=7)
    model.fit(x[train], hard, sample_weight=weight[train] / weight[train].mean())
    losses = [metrics(y[validation], p[:, 1], weight[validation])["logLoss"] for p in model.staged_predict_proba(x[validation])]
    best = int(np.argmin(losses)) + 1
    model.set_params(max_iter=best)
    model.fit(x[train], hard, sample_weight=weight[train] / weight[train].mean())  # 決定論的に同じ木を作り直す
    return model, {"selectedIterations": best, "validationCurve": losses[::10]}


# ---------- value: PyTorch ----------

def torch_fit(make, inputs, y, weight, train, validation, *, epochs=40, patience=5, lr=1e-3, weight_decay=1e-4, batch=256, seed=7):
    import torch
    torch.manual_seed(seed)
    torch.set_num_threads(4)
    model = make()
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    yt, wt = torch.tensor(y, dtype=torch.float32), torch.tensor(weight, dtype=torch.float32)
    rng = np.random.default_rng(seed)
    history, best, stale = [], (float("inf"), None, 0), 0

    def predict(ids):
        model.eval()
        with torch.no_grad():
            return np.concatenate([torch.sigmoid(model(*inputs(ids[i:i + 2048]))).numpy() for i in range(0, len(ids), 2048)])
    for epoch in range(epochs):
        model.train()
        order = rng.permutation(train)
        for start in range(0, len(order), batch):
            ids = order[start:start + batch]
            logits = model(*inputs(ids))
            loss = (torch.nn.functional.binary_cross_entropy_with_logits(logits, yt[ids], reduction="none") * wt[ids]).sum() / wt[ids].sum()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        row = {"epoch": epoch + 1, "train": metrics(y[train], predict(train), weight[train])["logLoss"],
               "validation": metrics(y[validation], predict(validation), weight[validation])["logLoss"]}
        history.append(row)
        print(f"  epoch {epoch + 1}: train {row['train']:.4f} validation {row['validation']:.4f}", flush=True)
        if row["validation"] < best[0] - 1e-5:
            best, stale = (row["validation"], copy.deepcopy(model.state_dict()), epoch + 1), 0
        else:
            stale += 1
            if stale >= patience:
                break
    model.load_state_dict(best[1])
    return model, predict, {"history": history, "selectedEpoch": best[2]}


def tanh_mlp(width, hidden, dropout):
    import torch
    class Net(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.first, self.drop, self.out = torch.nn.Linear(width, hidden), torch.nn.Dropout(dropout), torch.nn.Linear(hidden, 1)
        def forward(self, x):
            return self.out(self.drop(torch.tanh(self.first(self.drop_in(x))))).squeeze(-1)
        def drop_in(self, x):
            return torch.nn.functional.dropout(x, 0.1, self.training)
    return Net()


class SetEncoder(PoolEncoder):
    """Deep Sets用：カードを足し合わせず1枚ずつの行として返す（観測・カード記述は固定poolingと共通）。"""
    def rows(self, observation):
        spec = self.spec
        glob = flatten(observation, spec["context"])
        for side in (0, 1):
            p = observation["players"][side]
            glob += flatten(p, spec["player"]) + self.describe(p["playable"]) + [
                len(p["skills"]) / 10, sum(max(0, n or 0) for n in p["skills"]) / 10, sum(p["skillHistory"]) / 10, sum(s["uses"] for s in p["extraSkills"]) / 10]
        cards, slots = [], []
        for card in observation["cards"]:
            if card["zone"] in ZONES:
                cards.append(self.describe(card["cardId"]) + flatten(card, spec["current"]))
                slots.append(card["side"] * len(ZONES) + ZONES.index(card["zone"]))
        return glob, cards, slots


def set_inputs(paths, data):
    first = Dataset(paths[0]).manifest
    encode = SetEncoder(first["catalog"], pool_spec(first["schema"]))
    globs, rows, slots, owner = [], [], [], []
    for path in paths:
        for sample in Dataset(path).samples():
            if sample["outcome"] == "unfinished":
                continue
            g, c, s = encode.rows(sample["observation"])
            owner += [len(globs)] * len(c)
            globs.append(g)
            rows += c
            slots += s
    if len(globs) != len(data["y"]):
        raise ValueError("Set encoding does not align with pooled samples")
    return np.asarray(globs, np.float32), np.asarray(rows, np.float32), np.asarray(slots, np.int64), np.asarray(owner, np.int64)


def deep_sets(globs, rows, slots, owner, train, weight):
    import torch
    sample_train = np.isin(owner, train)
    g_mean, g_scale = standardize(globs, train, weight)
    r_mean = rows[sample_train].mean(axis=0)
    r_scale = rows[sample_train].std(axis=0)
    r_scale[r_scale < 0.05] = 1
    g = torch.tensor(np.clip((globs - g_mean) / g_scale, -8, 8), dtype=torch.float32)
    r = torch.tensor(np.clip((rows - r_mean) / r_scale, -8, 8), dtype=torch.float32)
    starts = np.searchsorted(owner, np.arange(len(globs)))
    ends = np.searchsorted(owner, np.arange(len(globs)), side="right")
    slot_t = torch.tensor(slots)
    groups = 2 * len(ZONES)

    class Net(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.phi = torch.nn.Sequential(torch.nn.Linear(r.shape[1] + groups, 64), torch.nn.ReLU(), torch.nn.Linear(64, 24), torch.nn.ReLU())
            self.rho = torch.nn.Sequential(torch.nn.Dropout(0.1), torch.nn.Linear(g.shape[1] + groups * 25, 64), torch.nn.ReLU(), torch.nn.Dropout(0.2), torch.nn.Linear(64, 1))

        def forward(self, gb, rb, seg, count):
            one_hot = torch.nn.functional.one_hot(seg % groups, groups).float()
            phi = torch.cat([self.phi(torch.cat([rb, one_hot], 1)), torch.ones(len(rb), 1)], 1)  # 末尾1列は枚数
            pooled = torch.zeros(count * groups, 25).index_add_(0, seg, phi) / 7
            return self.rho(torch.cat([gb, pooled.view(count, -1)], 1)).squeeze(-1)

    def inputs(ids):
        index = np.concatenate([np.arange(starts[i], ends[i]) for i in ids]) if len(ids) else np.zeros(0, int)
        local = np.repeat(np.arange(len(ids)), ends[ids] - starts[ids])
        seg = torch.tensor(local * groups) + slot_t[index]
        return g[ids], r[index], seg, len(ids)
    return Net, inputs


def value(paths, output, *, skip=()):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    data = load_data(paths)
    print(f"loaded {len(data['y'])} positions x {data['x'].shape[1]} in {time.monotonic() - started:.0f}s", flush=True)
    results = {}
    for name, hidden in (("numpy-linear", 0), ("numpy-mlp", 16)):  # 従来の方式（learning.py）を同じデータで
        print(name, flush=True)
        model, result = fit(data, hidden=hidden)
        write_json(output / f"{name}.json", model)
        results[name] = {"kind": f"NumPy {'linear' if not hidden else 'tanh MLP 16'} (learning.py)", "playable": True,
                         "selectedEpoch": model["training"]["selectedEpoch"], "history": result["history"],
                         "metrics": {k: {m: v for m, v in result["evaluation"][k].items() if m != "environments"} for k in ("train", "validation", "test")}}
    x, y, weight, split = data["x"].astype(np.float32), data["y"], data["weight"], data["split"]
    del data["x"]
    train, validation = np.flatnonzero(split == "train"), np.flatnonzero(split == "validation")
    mean, scale = standardize(x, train, weight)
    z = np.clip((x - mean) / scale, -8, 8).astype(np.float32)
    prior = float(np.average(y[train], weights=weight[train]))
    results = {"constant": {"kind": "baseline", "metrics": evaluate_all(data, np.full(len(y), prior)), "playable": False}, **results}

    print("sklearn logistic regression", flush=True)
    model, info = fit_sklearn_logistic(data, z, train, validation)
    results["sklearn-logistic"] = {"kind": "scikit-learn LogisticRegression (L2)", "playable": True, **info,
                                   "metrics": evaluate_all(data, model.predict_proba(z)[:, 1])}
    export = export_model(data, mean, scale, "linear", 0, {"w": model.coef_[0].tolist(), "b": float(model.intercept_[0])},
                          {"library": "scikit-learn", "C": info["selectedC"]})
    write_json(output / "sklearn-logistic.json", export)

    if "boosting" not in skip:
        print("sklearn gradient boosting", flush=True)
        model, info = fit_sklearn_boosting(data, x, train, validation)
        results["sklearn-boosting"] = {"kind": "scikit-learn HistGradientBoosting", "playable": False, **info,
                                       "metrics": evaluate_all(data, model.predict_proba(x)[:, 1])}

    import torch
    print("torch tanh MLP (dropout)", flush=True)
    zt = torch.tensor(z)
    net, predict, info = torch_fit(lambda: tanh_mlp(z.shape[1], 32, 0.3), lambda ids: (zt[ids],), y, weight, train, validation, weight_decay=3e-3)
    results["torch-mlp"] = {"kind": "PyTorch tanh MLP 32 + dropout", "playable": True, **info, "metrics": evaluate_all(data, predict(np.arange(len(y))))}
    state = {k: v.numpy() for k, v in net.state_dict().items()}
    export = export_model(data, mean, scale, "mlp", 32, {"w1": state["first.weight"].T.tolist(), "b1": state["first.bias"].tolist(),
                          "w2": state["out.weight"][0].tolist(), "b2": float(state["out.bias"][0])}, {"library": "PyTorch", "dropout": 0.3, "inputDropout": 0.1})
    write_json(output / "torch-mlp.json", export)

    if "deepsets" not in skip:
        print("torch Deep Sets", flush=True)
        globs, rows, slots, owner = set_inputs(paths, data)
        Net, inputs = deep_sets(globs, rows, slots, owner, train, weight)
        net, predict, info = torch_fit(Net, inputs, y, weight, train, validation, weight_decay=1e-3)
        results["torch-deepsets"] = {"kind": "PyTorch Deep Sets (per-card encoder, learned pooling)", "playable": False, **info,
                                     "metrics": evaluate_all(data, predict(np.arange(len(y))))}
        torch.save(net.state_dict(), output / "torch-deepsets.pt")

    for name in ("numpy-linear", "numpy-mlp", "sklearn-logistic", "torch-mlp"):
        results[name]["model"] = str((output / f"{name}.json").resolve())
        results[name]["sha256"] = sha256(output / f"{name}.json")
    playable = [k for k, r in results.items() if r.get("playable")]
    selected = min(playable, key=lambda k: results[k]["metrics"]["validation"]["logLoss"])  # 実戦候補はvalidationだけで選ぶ
    summary = {"selectedPlayable": selected, "selectedModel": results[selected]["model"], "positions": int(len(y)), "inputs": int(x.shape[1]), "matches": {s: len(set(data["groups"][split == s])) for s in ("train", "validation", "test")},
               "selection": "validation log loss only; test is diagnostic", "results": results, "seconds": time.monotonic() - started}
    write_json(output / "value-summary.json", summary)
    return summary


# ---------- policy: imitate master's move ----------

ACTION_TYPES = ["play", "attack", "choose", "skill", "end", "reveal", "exSkill"]


def policy_rows(paths):
    first = Dataset(paths[0]).manifest
    encode = PoolEncoder(first["catalog"], pool_spec(first["schema"]))
    spec = encode.spec
    card_width = len(encode.describe(None)) + len(spec["current"]) * 2
    empty = [0.0] * (card_width + len(ZONES) + 2)
    def card(observation, ref):
        if ref is None:
            return empty
        c = next((c for c in observation["cards"] if c.get("ref") == ref), None)
        if c is None:
            return empty
        zone = [float(c["zone"] == z) for z in ZONES]
        return encode.describe(c["cardId"]) + flatten(c, spec["current"]) + zone + [float(c["side"] == 0), 1.0]
    states, actions, owner, chosen, groups, splits = [], [], [], [], [], []
    for path in paths:
        for sample in Dataset(path).samples():
            o = sample["observation"]
            if len(o["actions"]) < 2:
                continue  # 選択肢が1つなら当てる意味がない
            state = encode(o)
            for i, a in enumerate(o["actions"]):
                cost = a.get("cost") or {}
                actions.append([float(a["type"] == t) for t in ACTION_TYPES] + [cost.get("pp", 0) / 5, cost.get("mp", 0) / 5, cost.get("acorns", 0) / 5,
                               float(a.get("targetLeader") or False), float(a.get("option") is not None), float(a.get("index") is not None), float(a.get("skill") is not None)]
                               + card(o, a.get("source")) + card(o, a.get("target")))
                owner.append(len(states))
            chosen.append(sample["selectedAction"])
            states.append(state)
            groups.append(sample["matchId"])
            splits.append(sample["split"])
    return (np.asarray(states, np.float32), np.asarray(actions, np.float32), np.asarray(owner), np.asarray(chosen),
            np.asarray(groups), np.asarray(splits))


def ranking_metrics(scores, owner, chosen, ids):
    starts = np.searchsorted(owner, np.arange(owner.max() + 1))
    ends = np.searchsorted(owner, np.arange(owner.max() + 1), side="right")
    top1, top3, sizes = [], [], []
    for i in ids:
        s = scores[starts[i]:ends[i]]
        rank = int((s > s[chosen[i]]).sum())
        ties = int((s == s[chosen[i]]).sum())  # 同点はランダムに並べた場合の期待値で数える
        top1.append(max(0, min(1, rank + ties) - rank) / ties)
        top3.append(max(0, min(3, rank + ties) - rank) / ties)
        sizes.append(len(s))
    wide = np.array(sizes) >= 6  # 選択肢が多い判断（探索の絞り込みが効く場面）
    return {"decisions": len(ids), "top1": float(np.mean(top1)), "top3": float(np.mean(top3)), "meanActions": float(np.mean(sizes)),
            "wideDecisions": int(wide.sum()), "wideTop1": float(np.mean(np.array(top1)[wide])) if wide.any() else None,
            "wideTop3": float(np.mean(np.array(top3)[wide])) if wide.any() else None}


def policy(paths, output):
    import torch
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.linear_model import LogisticRegression
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    states, actions, owner, chosen, groups, splits = policy_rows(paths)
    print(f"policy: {len(states)} decisions, {len(actions)} actions in {time.monotonic() - started:.0f}s", flush=True)
    train, validation = np.flatnonzero(splits == "train"), np.flatnonzero(splits == "validation")
    starts = np.searchsorted(owner, np.arange(len(states)))
    label = np.zeros(len(actions), int)
    label[starts + chosen] = 1
    row_train = np.isin(owner, train)
    results = {}
    rng = np.random.default_rng(7)
    results["uniform"] = {"kind": "ランダム", "metrics": {s: ranking_metrics(rng.random(len(actions)), owner, chosen, np.flatnonzero(splits == s)) for s in ("validation", "test")}}
    # 行動の種類だけを見た頻度（例：選択肢が出たら選ぶ、など）
    type_index = actions[:, :len(ACTION_TYPES)].argmax(1)
    rate = np.array([label[row_train & (type_index == t)].mean() if (row_train & (type_index == t)).any() else 0 for t in range(len(ACTION_TYPES))])
    results["type-prior"] = {"kind": "行動の種類の頻度", "metrics": {s: ranking_metrics(rate[type_index] + 1e-6 * rng.random(len(actions)), owner, chosen, np.flatnonzero(splits == s)) for s in ("validation", "test")}}

    state_mean, state_scale = standardize(states, train, np.ones(len(states)))
    action_mean, action_scale = actions[row_train].mean(0), actions[row_train].std(0)
    action_scale[action_scale < 0.05] = 1
    za = np.clip((actions - action_mean) / action_scale, -8, 8).astype(np.float32)
    zs = np.clip((states - state_mean) / state_scale, -8, 8).astype(np.float32)
    print("sklearn logistic (action features)", flush=True)
    lr = LogisticRegression(C=0.01, max_iter=500).fit(za[row_train], label[row_train])
    results["sklearn-logistic"] = {"kind": "scikit-learn LogisticRegression", "metrics": {s: ranking_metrics(lr.decision_function(za), owner, chosen, np.flatnonzero(splits == s)) for s in ("validation", "test")}}
    print("sklearn boosting (action + state)", flush=True)
    joined = np.concatenate([za, zs[owner][:, :256]], 1)  # 局面は先頭の文脈・資源を中心に一部だけ
    hgb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, early_stopping=False, random_state=7).fit(joined[row_train], label[row_train])
    results["sklearn-boosting"] = {"kind": "scikit-learn HistGradientBoosting", "metrics": {s: ranking_metrics(hgb.decision_function(joined), owner, chosen, np.flatnonzero(splits == s)) for s in ("validation", "test")}}

    print("torch listwise scorer", flush=True)
    torch.manual_seed(7)
    at, st = torch.tensor(za), torch.tensor(zs)

    class Scorer(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.state = torch.nn.Sequential(torch.nn.Dropout(0.2), torch.nn.Linear(zs.shape[1], 64), torch.nn.ReLU())
            self.score = torch.nn.Sequential(torch.nn.Linear(za.shape[1] + 64, 64), torch.nn.ReLU(), torch.nn.Dropout(0.2), torch.nn.Linear(64, 1))
    counts = np.bincount(owner, minlength=len(states))

    def forward(model, ids):
        index = np.concatenate([np.arange(starts[i], starts[i] + counts[i]) for i in ids])
        local = torch.tensor(np.repeat(np.arange(len(ids)), counts[ids]))
        s = model.score(torch.cat([at[index], model.state(st[ids])[local]], 1)).squeeze(-1)
        return s, local, index, np.cumsum(counts[ids]) - counts[ids]
    model = Scorer()
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-3)
    def all_scores():
        model.eval()
        with torch.no_grad():
            out = np.zeros(len(actions), np.float32)
            for i in range(0, len(states), 2048):
                ids = np.arange(i, min(len(states), i + 2048))
                s, _, index, _ = forward(model, ids)
                out[index] = s.numpy()
        return out
    best, stale, history = (-1, None, 0), 0, []
    for epoch in range(40):
        model.train()
        order = rng.permutation(train)
        for b in range(0, len(order), 128):
            ids = order[b:b + 128]
            s, local, index, offsets = forward(model, ids)
            # 局面ごとのsoftmax（listwise cross entropy）
            log_norm = torch.zeros(len(ids)).scatter_reduce(0, local, s.detach(), "amax", include_self=False)
            exp = torch.exp(s - log_norm[local])
            denom = torch.zeros(len(ids)).index_add_(0, local, exp)
            pick = s[torch.tensor(offsets + chosen[ids])]
            loss = (log_norm + torch.log(denom) - pick).mean()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        val = ranking_metrics(all_scores(), owner, chosen, validation)["top1"]
        history.append({"epoch": epoch + 1, "validationTop1": val})
        print(f"  epoch {epoch + 1}: validation top1 {val:.3f}", flush=True)
        if val > best[0] + 1e-4:
            best, stale = (val, copy.deepcopy(model.state_dict()), epoch + 1), 0
        else:
            stale += 1
            if stale >= 5:
                break
    model.load_state_dict(best[1])
    scores = all_scores()
    results["torch-listwise"] = {"kind": "PyTorch listwise scorer", "history": history, "selectedEpoch": best[2],
                                 "metrics": {s: ranking_metrics(scores, owner, chosen, np.flatnonzero(splits == s)) for s in ("validation", "test")}}
    summary = {"decisions": int(len(states)), "actions": int(len(actions)), "matches": {s: len(set(groups[splits == s])) for s in ("train", "validation", "test")},
               "teacher": "master self-play choices", "selection": "validation only", "results": results, "seconds": time.monotonic() - started}
    write_json(output / "policy-summary.json", summary)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=["value", "policy"])
    parser.add_argument("datasets", nargs="+", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--skip", nargs="*", default=[])
    args = parser.parse_args()
    (value(args.datasets, args.out, skip=args.skip) if args.task == "value" else policy(args.datasets, args.out))
