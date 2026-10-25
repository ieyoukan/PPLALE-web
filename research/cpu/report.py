"""Render saved evidence as Japanese figures and a standalone, plain-language research report."""
from __future__ import annotations

import argparse
import base64
import html
import hashlib
import json
import logging
import os
from pathlib import Path
import platform
import sys
cache = Path(__file__).resolve().parent / "runs/.plot-cache"
cache.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("MPLCONFIGDIR", str(cache / "matplotlib"))
os.environ.setdefault("XDG_CACHE_HOME", str(cache))
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter
import numpy as np

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
# 日本語を描ける丸ゴシックを優先し、無い環境では順に代替する。SVGは文字をパスで埋め込む。
plt.rcParams.update({
    "font.family": ["Hiragino Maru Gothic ProN", "Zen Maru Gothic", "Noto Sans JP", "IPAexGothic", "Hiragino Sans", "sans-serif"],
    "svg.fonttype": "path", "axes.unicode_minus": False, "font.size": 10.5,
    "axes.edgecolor": "#c8a8a8", "axes.labelcolor": "#634747", "axes.titlecolor": "#634747",
    "axes.titleweight": "bold", "axes.titlesize": 12, "xtick.color": "#7b5e58", "ytick.color": "#634747",
    "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": "#fffdf9", "axes.facecolor": "#fffdf9",
    "legend.frameon": False, "legend.fontsize": 9.5,
})

FRUITS = ["strawberry", "grape", "melon", "orange"]
FRUIT_NAMES = {"strawberry": "いちご", "grape": "ぶどう", "melon": "めろん", "orange": "おれんじ"}
# ロゴの桜色を濃くした色と葉っぱの緑。色覚の違い・コントラストを検証済みの2色。
ROSE, LEAF = "#8a3f5c", "#6f9a2e"
INK, SOFT, MUTED, GRID, SURFACE = "#634747", "#7b5e58", "#a08880", "#efe4df", "#fffdf9"
MODEL_NAMES = {"linear": "線形モデル", "mlp": "ニューラルネット（MLP）"}
CANDIDATE_NAMES = {"legacy-600": "旧学習評価", "rules-600": "手書き評価",
                   "linear-blend25": "線形25%＋旧評価", "mlp-blend25": "MLP25%＋旧評価",
                   "sklearn-logistic-blend25": "ロジ回帰25%＋旧評価", "sklearn-logistic-blend50": "ロジ回帰50%＋旧評価",
                   "sklearn-logistic-blend100": "ロジ回帰100%"}
LEVEL_NAMES = {"easy": "よわい", "normal": "ふつう", "hard": "つよい", "master": "さいきょう"}
PHASES = {"screen": "① ふるい分け", "validation": "② 絞り込み", "test": "③ 最終テスト"}
REASONS = {
    "Only the untouched test suite can authorize adoption": "採用判定は未使用の最終テストでのみ行う",
    "Insufficient independent pairs": "ペア数が足りない",
    "Unfinished games": "決着しなかった試合がある",
    "Missing fruit environments": "対戦していないフルーツ環境がある",
    "Insufficient pairs per environment": "フルーツ環境ごとのペア数が足りない",
    "Superiority over the incumbent is not demonstrated": "現行CPUより強いと言える差がない",
    "Environment non-inferiority is not demonstrated": "どのフルーツでも大きく負けない、とは言えない",
    "Thinking-time budget exceeded": "考える時間が長すぎる",
    "Synthetic feedback fixtures are for workflow verification, not adoption evidence": "合成した動作確認用の記録は採用の根拠にしない",
}


STYLE = """
:root{--cream:#fff8f0;--paper:#fffdf9;--blush:#f8e8e8;--pink:#e8c8c8;--edge:#c8a8a8;--sage:#c8d888;--sage-wash:#f0f3df;--vanilla:#f5df97;--vanilla-wash:#fcf3d9;--peach:#efb39d;--peach-wash:#fbece3;--cocoa:#785858;--deep:#634747;--soft:#7b5e58}
*{box-sizing:border-box}
body{margin:0;background:var(--vanilla-wash) radial-gradient(var(--peach-wash) 2px,transparent 2.5px) 0 0/22px 22px;color:var(--deep);font:16px/1.85 "Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 18px 64px}
h1,h2,.tile-value,.step b{font-family:"Mochiy Pop One","Hiragino Maru Gothic ProN","Zen Maru Gothic",sans-serif;font-weight:400;color:var(--cocoa)}
h1{font-size:2.1rem;margin:0}
.kicker{margin:0;color:var(--soft);font-size:.9rem}
h2{font-size:1.35rem;margin:0 0 .4em}
.hero{display:flex;gap:20px;align-items:flex-start;margin:22px 0;padding:22px 26px;border-radius:24px;background:var(--paper);border:2px solid var(--pink);box-shadow:0 6px 0 var(--pink)}
.hero.ok{border-color:var(--sage);box-shadow:0 6px 0 var(--sage)}
.badge{flex:none;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;font-size:1.8rem;background:var(--blush);color:var(--cocoa);animation:pop .6s ease-out}
.hero.ok .badge{background:var(--sage-wash)}
.hero-label{margin:0;color:var(--soft);font-size:.85rem}
.hero p,.hero ul{margin:.2em 0}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:0 0 18px}
.tile{background:var(--paper);border-radius:18px;padding:14px 16px;border:1.5px solid var(--blush)}
.tile p{margin:0}
.tile-label{font-size:.85rem;color:var(--soft)}
.tile-value{font-size:1.7rem;line-height:1.4}
.tile-note{font-size:.8rem;color:var(--soft)}
.flow{display:flex;gap:8px;overflow-x:auto;margin:0 0 22px;padding:4px 2px}
.step{flex:1 0 120px;position:relative;background:var(--paper);border-radius:16px;padding:10px 12px;text-align:center;border:1.5px dashed var(--edge)}
.step b{display:block;font-size:.95rem}
.step small{color:var(--soft);font-size:.78rem}
.num{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--vanilla);font-size:.8rem;font-weight:700}
.card{background:var(--paper);border-radius:24px;padding:24px 26px;margin:0 0 18px;box-shadow:0 4px 0 #78585818;animation:rise .5s ease-out both}
.lead{font-size:1.05rem;margin:.2em 0 .8em}
strong{color:var(--cocoa);background:linear-gradient(transparent 62%,var(--vanilla) 62%)}
figure{margin:12px 0}
figure img{width:100%;height:auto;border-radius:14px;background:var(--paper)}
figcaption{font-size:.85rem;color:var(--soft)}
a{color:var(--cocoa)}
.howto{background:var(--sage-wash);border-radius:16px;padding:10px 18px;margin:10px 0}
.howto-title{margin:0;font-weight:700;font-size:.9rem}
.howto ul{margin:.2em 0;padding-left:1.2em}
details{margin:10px 0;border-top:1px dashed var(--pink);padding-top:8px}
summary{cursor:pointer;font-weight:700;color:var(--cocoa)}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:.9rem}
th,td{padding:6px 10px;border-bottom:1px solid var(--blush);text-align:left}
th{background:var(--blush)}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.method li{margin:.3em 0}
dt{font-weight:700;margin-top:.4em}
dd{margin:0 0 0 1em}
.note{font-size:.85rem;color:var(--soft)}
@keyframes pop{0%{transform:scale(.4)}70%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
"""


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def pct(value):
    return f"{value:.1%}"


def candidate_name(key):
    if key.endswith("-master-budget"):
        return CANDIDATE_NAMES.get(key.removesuffix("-master-budget"), key) + "（同じ探索量）"
    return CANDIDATE_NAMES.get(key, key)


def search_note(run):
    """候補の探索量を、選択記録から読んで現行CPU（既定2400局面）と比べる文にする。"""
    path = run / "selected.json"
    search = read(path)["algorithm"].get("search") if path.exists() else None
    if search is None:
        return "候補の探索設定は記録から読めない。"
    if not search:
        return "候補も現行CPUと同じ探索量（既定の2400局面・勝ち筋4000局面）。違うのは局面の評価だけ。"
    return f"候補は探索を{search.get('maxNodes', 2400)}局面に制限している。現行CPUは2400局面なので、同じ探索量の比較ではない。"


def environment_name(row):
    return f"{FRUIT_NAMES.get(row['environment'], row['environment'])}・ExP{'あり' if row['extendedPlayable'] else 'なし'}"


def save(fig, directory, name):
    fig.tight_layout()
    for extension in ("png", "svg"):
        fig.savefig(directory / f"{name}.{extension}", dpi=170, bbox_inches="tight", facecolor=SURFACE)
    plt.close(fig)


def tidy(ax, axis="both"):
    ax.grid(axis=axis, color=GRID, linewidth=1, linestyle="-")
    ax.set_axisbelow(True)
    ax.tick_params(length=0)


def score_dots(ax, names, rows, color=ROSE):
    """1系列の点と95%区間。50%の互角線を基準に、値は区間の右へ直接書く。"""
    means = np.array([row["score"] for row in rows])
    low = np.array([row["bootstrap95"][0] for row in rows])
    high = np.array([row["bootstrap95"][1] for row in rows])
    y = np.arange(len(rows))
    ax.axvline(0.5, color=MUTED, linewidth=1.2, zorder=1)
    ax.text(0.5 + 0.01, 0.015, "互角", transform=ax.get_xaxis_transform(), ha="left", va="bottom", color=SOFT, fontsize=9)
    ax.hlines(y, low, high, color=color, linewidth=2.5, alpha=0.45, capstyle="round", zorder=2)
    ax.scatter(means, y, s=70, color=color, edgecolors=SURFACE, linewidths=2, zorder=3)
    for yi, mean, top, row in zip(y, means, high, rows):
        detail = f"{pct(mean)}（{row['pairs']}ペア）" if "pairs" in row else pct(mean)
        ax.text(top + 0.02, yi, detail, va="center", ha="left", color=INK, fontsize=9)
    ax.set_yticks(y, names)
    ax.set_ylim(len(rows) - 0.4, -0.6)
    ax.set_xlim(0, 1.22)  # 100%の右に値の文字の余白を取る
    ax.set_xticks(np.linspace(0, 1, 6))
    ax.spines["bottom"].set_bounds(0, 1)
    ax.xaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.set_xlabel("現行CPUに対する得点率（勝ち=1・引き分け=0.5）")
    tidy(ax, "x")


def figure_data(directory, name):
    return "data:image/svg+xml;base64," + base64.b64encode((directory / f"{name}.svg").read_bytes()).decode()


def table(head, rows, numeric_from=1):
    cells = "".join(f"<th>{html.escape(h)}</th>" for h in head)
    body = "".join("<tr>" + "".join(
        f"<td class='{'n' if i >= numeric_from else ''}'>{html.escape(str(v))}</td>" for i, v in enumerate(r)) + "</tr>" for r in rows)
    return f"<table><thead><tr>{cells}</tr></thead><tbody>{body}</tbody></table>"


def md_table(head, rows):
    return "\n".join(["| " + " | ".join(head) + " |", "| " + " | ".join(["---"] * len(head)) + " |"] +
                     ["| " + " | ".join(str(v) for v in r) + " |" for r in rows])


def generate(run):
    run = Path(run).resolve()
    output = run / "report"
    output.mkdir(exist_ok=True)
    evidence = {"run": str(run), "renderer": {"sourceHash": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "python": sys.version.split()[0], "numpy": np.__version__,
                "matplotlib": matplotlib.__version__, "machine": platform.machine(), "platform": platform.platform()}, "sources": []}
    tiles, sections, hero = [], [], None  # sections: (id, 見出し, ひとこと, 図, 読み方, 表(head, rows), 補足)

    audit_path = run / "training/audit.json"
    if audit_path.exists():
        audit = read(audit_path)
        evidence["data"] = audit
        tiles.append(("学習に使った対戦", f"{audit['matches']:,}試合", f"{audit['decisions']:,}局面・未決着{audit['unfinished']}"))
        coverage = audit["annotationCoverage"]
        tiles.append(("効果を数値化したカード", f"{coverage.get('complete', 0)}枚", f"未記述{coverage.get('unannotated', 0)}枚" + (f"・一部{coverage['partial']}枚" if coverage.get("partial") else "")))

    training = run / "training"
    if (training / "summary.json").exists():
        summary = read(training / "summary.json")
        evidence["learning"] = summary
        evidence["sources"].append("../training/summary.json")
        fig, axes = plt.subplots(1, 2, figsize=(10, 4.6), gridspec_kw={"width_ratios": [1.35, 1]})
        rows, notes, baseline = [], [], None
        for name, color in (("linear", ROSE), ("mlp", LEAF)):
            result = read(training / f"{name}-metrics.json")
            history = result["history"]
            epochs = [row["epoch"] for row in history]
            validation = [row["validation"]["logLoss"] for row in history]
            axes[0].plot(epochs, [row["train"]["logLoss"] for row in history], "--", color=color, linewidth=1.5, alpha=0.6)
            axes[0].plot(epochs, validation, "-", color=color, linewidth=2, solid_capstyle="round", label=MODEL_NAMES[name])
            best = int(np.argmin(validation))
            axes[0].scatter([epochs[best]], [validation[best]], s=80, color=color, edgecolors=SURFACE, linewidths=2, zorder=4)
            axes[0].annotate("採用", (epochs[best], validation[best]), textcoords="offset points", xytext=(0, -16), ha="center", color=INK, fontsize=9)
            calibration = result["evaluation"]["test"]["calibration"]
            counts = np.array([row["count"] for row in calibration], dtype=float)
            axes[1].plot([row["predicted"] for row in calibration], [row["observed"] for row in calibration], "-", color=color, linewidth=2, label=MODEL_NAMES[name])
            axes[1].scatter([row["predicted"] for row in calibration], [row["observed"] for row in calibration],
                            s=20 + 140 * counts / counts.max(), color=color, edgecolors=SURFACE, linewidths=2, zorder=3)
            test = result["evaluation"]["test"]
            baseline = test["constantBaseline"]["logLoss"]
            rows.append([MODEL_NAMES[name], f"{epochs[best]}回目 / {len(epochs)}回", f"{summary['models'][name]['validationLogLoss']:.3f}",
                         f"{test['logLoss']:.3f}", f"{test['brier']:.3f}", pct(test["accuracy"])])
            notes.append((name, epochs[best], len(epochs)))
        rows.append(["当てずっぽう（常に同じ勝率）", "—", "—", f"{baseline:.3f}", f"{read(training / 'mlp-metrics.json')['evaluation']['test']['constantBaseline']['brier']:.3f}", "—"])
        axes[0].axhline(baseline, color=MUTED, linewidth=1.2)
        axes[0].text(axes[0].get_xlim()[1], baseline, "当てずっぽう", ha="right", va="top", color=SOFT, fontsize=9)
        axes[0].set(xlabel="学習の回数（エポック）", ylabel="予測の外れ具合（log loss・低いほど良い）", title="学習の進み方")
        axes[0].plot([], [], "--", color=MUTED, label="点線＝学習用データ")
        axes[0].plot([], [], "-", color=MUTED, label="実線＝検証用データ")
        axes[0].legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncols=4, fontsize=9)
        axes[1].plot([0, 1], [0, 1], color=MUTED, linewidth=1.2)
        axes[1].text(0.97, 0.9, "予測どおり", ha="right", color=SOFT, fontsize=9, rotation=35)
        axes[1].set(xlabel="予測した勝率", ylabel="実際に勝った割合", title="予測の当たり方（未使用の局面）", xlim=(0, 1), ylim=(0, 1))
        axes[1].xaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
        axes[1].yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
        axes[1].legend(loc="upper left")
        for ax in axes:
            tidy(ax)
        save(fig, output, "learning")
        early = [MODEL_NAMES[n] for n, best, total in notes if best <= 2]
        lead = f"局面を見て「この先勝てるか」を当てる練習。最も良かったのは **{MODEL_NAMES[summary['selected']]}**（検証用データで選択）。"
        if early:
            lead += f" {'・'.join(early)}は早い回で最良になり、その後は学習用データだけ上手くなる「覚えすぎ（過学習）」が見える。"
        sections.append(("learning", "勝ち負けの予測を学習", lead, ("learning", "左：学習の回数と予測の外れ具合。右：予測した勝率と実際の勝率。対角線に近いほど予測が正直。"),
                         ["左の灰色の線は、局面を見ずに常に同じ勝率を答えた場合。これより下なら局面から何かを学べている。",
                          "点線（学習用）だけが下がり続け、実線（検証用）が下がらないときは覚えすぎ。",
                          "右の点の大きさは局面の数。予測の良さと対戦の強さは別に測る。"],
                         (["モデル", "採用した回", "検証 log loss", "テスト log loss", "テスト Brier", "テスト正解率"], rows), None))
        tiles.append(("局面の予測", f"{summary['models'][summary['selected']]['test']['logLoss']:.3f}", f"当てずっぽうは{baseline:.3f}（低いほど良い）"))

    available = [(phase, read(run / f"{phase}-summary.json")) for phase in ("screen", "validation", "test") if (run / f"{phase}-summary.json").exists()]
    if available:
        heights = [len(summary["candidates"]) + 0.8 for _, summary in available]
        fig, axes = plt.subplots(len(available), 1, figsize=(8.5, 0.5 * sum(heights) + 1.2), squeeze=False, sharex=True,
                                 gridspec_kw={"height_ratios": heights})
        rows = []
        for ax, (phase, summary) in zip(axes[:, 0], available):
            candidates = summary["candidates"]
            score_dots(ax, [candidate_name(k) for k in candidates], list(candidates.values()))
            ax.set_title(f"{PHASES[phase]}（{sum(r['games'] for r in candidates.values())}試合）", loc="left")
            if ax is not axes[-1][0]:
                ax.set_xlabel("")
            evidence["sources"].append(f"../{phase}.jsonl")
            evidence[phase] = summary
            for key, r in candidates.items():
                losses = r["games"] - r["wins"] - r["draws"] - r["unfinished"]
                rows.append([PHASES[phase], candidate_name(key), r["pairs"], f"{r['wins']}勝{losses}敗{r['draws']}分", pct(r["score"]),
                             f"{pct(r['bootstrap95'][0])}–{pct(r['bootstrap95'][1])}", pct(r["timeRatio"])])
        save(fig, output, "cpu-comparison")
        first = available[0][1]["candidates"]
        best = max(first, key=lambda k: first[k]["score"])
        lead = (f"候補を少しずつ絞って最後に1つだけ本番の試験へ。ふるい分けでは **{candidate_name(best)}** が最も良かった。" if len(available) > 1
                else f"事前に決めた **{candidate_name(best)}** だけを、新しいseedで現行CPUと対戦させた。")
        sections.append(("comparison", "候補のCPUを現行CPUと対戦", lead,
                         ("cpu-comparison", "点が得点率、横棒は95%の幅（ペア単位のブートストラップ）。灰色の縦線が互角。"),
                         ["先手・後手を入れ替えた2試合を1ペアとして数える。デッキやseedの運の偏りを打ち消すため。",
                          "①と②で候補を選び、③は選んだ1つだけを新しいseedで試す。③の結果を見て選び直さない。" if len(available) > 1
                          else "候補は前の研究の結果から事前に1つに決めた。最終テストの結果を見て選び直さない。",
                          search_note(run)],
                         (["段階", "候補", "ペア", "勝敗", "得点率", "95%の幅", "時間（現行比）"], rows), None))

    decision_path = run / "decision.json"
    if decision_path.exists():
        decision = read(decision_path)
        evidence["decision"] = decision
        selected = decision["algorithm"]["id"]
        result = evidence["test"]["candidates"][selected]
        fig, axes = plt.subplots(1, 2, figsize=(9.2, 3.4), gridspec_kw={"width_ratios": [1.4, 1]})
        environments = [result["environments"][f] for f in FRUITS]
        score_dots(axes[0], [FRUIT_NAMES[f] for f in FRUITS], environments)
        axes[0].set_title(f"フルーツ別（{candidate_name(selected)}）", loc="left")
        seconds = [result["meanThinkingPerGameMs"] / 1000, result["opponentThinkingPerGameMs"] / 1000]
        bars = axes[1].barh([0, 1], seconds, height=0.42, color=[ROSE, MUTED])
        for bar, value in zip(bars, seconds):
            axes[1].text(bar.get_width() + max(seconds) * 0.02, bar.get_y() + bar.get_height() / 2, f"{value:.1f}秒", va="center", color=INK)
        axes[1].set_yticks([0, 1], ["候補", "現行CPU"])
        axes[1].set_ylim(1.6, -0.6)
        axes[1].set_xlim(0, max(seconds) * 1.25)
        axes[1].set(xlabel="1試合で考えた時間（秒）", title="考える時間")
        tidy(axes[1], "x")
        save(fig, output, "cpu-environments")
        adopt = decision["verdict"]["adopt"]
        losses = result["games"] - result["wins"] - result["draws"] - result["unfinished"]
        reasons = [REASONS.get(r, r) for r in decision["verdict"]["reasons"]]
        hero = {"adopt": adopt, "title": "研究候補として合格" if adopt else "今の本番CPUを続ける",
                "line": f"{candidate_name(selected)}は、まだ使っていない{result['games']}試合で現行CPUに {result['wins']}勝{losses}敗{result['draws']}分（得点率 {pct(result['score'])}）。考える時間は現行の{pct(result['timeRatio'])}。",
                "reasons": reasons}
        tiles.insert(0, ("最終テストの得点率", pct(result["score"]), f"{result['wins']}勝{losses}敗・互角は50%"))
        tiles.insert(1, ("考える時間", pct(result["timeRatio"]), "現行CPUを100%として"))
        weak = [FRUIT_NAMES[f] for f in FRUITS if result["environments"][f]["score"] < 0.45]
        rule = decision["verdict"]["rule"]
        sections.append(("final", "最終テストと採用判定", f"{'・'.join(weak) + 'で特に負け越し。' if weak else ''}{'考える時間は短いが、' if result['timeRatio'] < 1 else '考える時間も長く、'}強くなった証拠はまだない。" if not adopt else "全体で現行CPUを上回り、どのフルーツでも大きく負けなかった。",
                         ("cpu-environments", "左：フルーツ別の得点率と95%の幅。右：同じ試合での1試合あたりの思考時間（端末・負荷で変わる）。"),
                         [f"採用には、全体で現行CPUより強いこと、各フルーツで{rule['environmentMargin']:.0%}より大きく負けないこと、時間が現行の{rule['maxTimeRatio']:.0%}以内であることが必要。",
                          "判定はHoeffdingの不等式による保守的な下限と、Bonferroni補正（全体＋4フルーツ、α=0.05）で行う。グラフの95%の幅だけでは決めない。",
                          "合格しても本番のCPUは自動では入れ替えない。"],
                         (["フルーツ", "ペア", "得点率", "95%の幅", "保守的な下限"], [[FRUIT_NAMES[f], result["environments"][f]["pairs"], pct(result["environments"][f]["score"]),
                           f"{pct(result['environments'][f]['bootstrap95'][0])}–{pct(result['environments'][f]['bootstrap95'][1])}", pct(result["environments"][f]["hoeffdingLower"])] for f in FRUITS]), None))

    deck_rows = []
    for folder in (run / "decks", run / "decks-ex", run):
        if (folder / "decks.json").exists():
            deck_rows.extend(read(folder / "decks.json")["results"])
            evidence["sources"].append("../" + str((folder / "decks.json").relative_to(run)))
    if deck_rows:
        fig, ax = plt.subplots(figsize=(8.5, max(3.2, len(deck_rows) * 0.5)))
        score_dots(ax, [environment_name(r) for r in deck_rows], [r["test"] for r in deck_rows], color=LEAF)
        ax.set_xlabel("初見の相手デッキに対する得点率（勝ち=1・引き分け=0.5）")
        ax.set_title("見つけたデッキの強さ", loc="left")
        save(fig, output, "decks")
        evidence["decks"] = deck_rows
        strong = [environment_name(r) for r in deck_rows if r["test"]["score"] > 0.5]
        search = deck_rows[0].get("search", {})
        sections.append(("decks", "強いデッキを探す", f"勝ち越したのは {'、'.join(strong) if strong else 'なし'}。",
                         ("decks", "探索後にデッキを固定し、探索で使っていない相手デッキと対戦した結果。"),
                         [f"合法なデッキを少しずつ変えて比べる探索を{search.get('generations', '?')}世代×{search.get('candidates', '?')}候補。同じカードは最大{search.get('copyLimit', '?')}枚。",
                          f"デッキを動かすCPUは「{LEVEL_NAMES.get(search.get('driver'), search.get('driver', '?'))}」。人やさいきょうCPUが使うと結果が変わることがある。",
                          "限られた探索の中での一番であって、全デッキの中で最強とは言えない。"],
                         (["環境", "ペア", "得点率", "95%の幅"], [[environment_name(r), r["test"]["pairs"], pct(r["test"]["score"]),
                           f"{pct(r['test']['bootstrap95'][0])}–{pct(r['test']['bootstrap95'][1])}"] for r in deck_rows]),
                         "カードIDの一覧は decks/decks.json（ExPなし）と decks-ex/decks.json（ExPあり）。"))

    feedback_path = run / "feedback-cycle.json"
    if feedback_path.exists():
        feedback = read(feedback_path)
        evidence["feedback"] = feedback
        origin = {"synthetic-smoke": "合成した動作確認用の記録", "human-report": "対戦記録"}.get(feedback["origin"], feedback["origin"])
        sections.append(("feedback", "フィードバックからの再学習", f"使った記録：{origin}。{feedback['status']}。", None,
                         ["記録はゲームエンジンで再生し直し、決着した試合だけを使う。申告された勝者は教師にしない。",
                          "合成記録での再学習は手順の確認であり、人の対戦で賢くなった証拠ではない。"], None, None))
        if (run / "smoke-verdict.json").exists():
            hero = hero or {"adopt": False, "title": "動作確認のみ（採用判定なし）", "line": "フィードバックの取り込みから再学習・対戦までが動くことを確かめた実行。", "reasons": []}

    method = ["**集める**：「つよい」CPU（15%はランダムな合法手）同士の自己対戦。4フルーツ×ExP有無を均等に回す。",
              "**数値にする**：公開情報だけを使い、カード1枚ごとに基本値・現在値・効果の記述・原文の特徴（24次元のハッシュ）を作る。自分/相手×手札/場/お昼寝/除外/選択肢ごとに足し合わせ、2714個の数にする。",
              "**学習する**：その局面の側が最後に勝ったか（勝ち1・負け0・引き分け0.5）を当てる。線形のロジスティック回帰と、中間16個のニューラルネットをNumPyで作り、Adamで学習。",
              "**使う**：学習した評価を旧評価に25%混ぜ、既存の探索（手札を仮定して先を読む）で手を選ぶ。手を直接学ぶ強化学習（PPOなど）ではない。"]
    limits = ["同じデッキ生成のしかたの中で試合を分けている。まったく新しいデッキ系統でも通用するかは未確認。",
              "効果を数値で書いたカードは一部だけ。カード同士の関係（コンボなど）は十分に表せていない。",
              "今回の最終テストの結果を見て候補を選び直さない。次の改善では新しいseedを予約する。"]
    glossary = [("log loss", "予測した勝率がどれだけ外れたか。0に近いほど良い。常に50%と答えると約0.693。"),
                ("Brier", "予測した勝率と結果（0か1）の差の2乗の平均。常に50%と答えると0.25。"),
                ("得点率", "勝ち=1、引き分け=0.5、負け=0の平均。50%で互角。"),
                ("ペア", "同じseed・同じ2デッキで先手後手を入れ替えた2試合。1単位として数える。"),
                ("95%の幅", "ペアを選び直して計算し直したときに結果がおさまる範囲の目安。"),
                ("ExP", "Exプレイアブル。対戦環境の設定のひとつ。")]
    reproduce = "各JSONLの最初の行（manifest）に設定・モデルとコードのハッシュ・実行環境を保存。source.zipはローカル変更を含むソースの控え。Gitに未コミットの状態で実行したものは探索的な記録として扱う。"

    title = "CPU研究レポート"
    # Markdown（Gitで差分を見る・READMEから参照する用）
    markdown = [f"# {title} — {run.name}"]
    if hero:
        markdown.append(f"**判定：{hero['title']}**　{hero['line']}" + (f"\n\n理由：{' / '.join(hero['reasons'])}" if hero["reasons"] else ""))
    if tiles:
        markdown.append(md_table(["項目", "値", "補足"], tiles))
    sections = [(sid, f"{i + 1}. {heading}", *rest) for i, (sid, heading, *rest) in enumerate(sections)]
    for sid, heading, lead, figure, bullets, data, extra in sections:
        part = [f"## {heading}", lead]
        if figure:
            part.append(f"![{figure[1]}]({figure[0]}.png)\n\n{figure[1]}（[SVG]({figure[0]}.svg)）")
        part.append("\n".join(f"- {b}" for b in bullets))
        if data:
            part.append(md_table(*data))
        if extra:
            part.append(extra)
        markdown.append("\n\n".join(part))
    markdown.append("## 学習のしくみ\n\n" + "\n".join(f"{i + 1}. {m}" for i, m in enumerate(method)))
    markdown.append("## 限界\n\n" + "\n".join(f"- {m}" for m in limits))
    markdown.append("## 用語\n\n" + "\n".join(f"- **{k}**：{v}" for k, v in glossary))
    markdown.append(f"## 再現\n\n{reproduce}\n\n証拠：" + "、".join(f"[{p}]({p})" for p in evidence["sources"]))
    (output / "report.md").write_text("\n\n".join(markdown) + "\n", encoding="utf-8")
    (output / "report.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")

    def inline(text):
        escaped = html.escape(text)
        parts = escaped.split("**")
        return "".join(f"<strong>{p}</strong>" if i % 2 else p for i, p in enumerate(parts))

    body = [f"<header><p class='kicker'>{html.escape(run.name)}</p><h1>{title}</h1></header>"]
    if hero:
        reasons = "".join(f"<li>{html.escape(r)}</li>" for r in hero["reasons"])
        body.append(f"<section class='hero {'ok' if hero['adopt'] else 'keep'}'><div class='badge' aria-hidden='true'>{'✓' if hero['adopt'] else '…'}</div>"
                    f"<div><p class='hero-label'>判定</p><h2>{html.escape(hero['title'])}</h2><p>{html.escape(hero['line'])}</p>{f'<ul>{reasons}</ul>' if reasons else ''}</div></section>")
    if tiles:
        body.append("<section class='tiles'>" + "".join(f"<div class='tile'><p class='tile-label'>{html.escape(label)}</p><p class='tile-value'>{html.escape(value)}</p><p class='tile-note'>{html.escape(note)}</p></div>"
                                                      for label, value, note in tiles) + "</section>")
    steps = [("集める", "CPU同士で対戦"), ("数値にする", "カードを数字に"), ("学習する", "勝ちを予測"), ("ふるい分け", "候補を比べる"), ("最終テスト", "未使用の対戦で"), ("判定", "採用 or 維持")]
    body.append("<nav class='flow' aria-label='研究の流れ'>" + "".join(f"<div class='step'><span class='num'>{i + 1}</span><b>{a}</b><small>{b}</small></div>" for i, (a, b) in enumerate(steps)) + "</nav>")
    for sid, heading, lead, figure, bullets, data, extra in sections:
        figure_html = (f"<figure><img src='{figure_data(output, figure[0])}' alt='{html.escape(figure[1])}'><figcaption>{html.escape(figure[1])} "
                       f"<a href='{figure[0]}.svg'>SVG</a>・<a href='{figure[0]}.png'>PNG</a></figcaption></figure>") if figure else ""
        data_html = f"<details><summary>数値の表</summary>{table(*data)}</details>" if data else ""
        body.append(f"<section class='card' id='{sid}'><h2>{html.escape(heading)}</h2><p class='lead'>{inline(lead)}</p>{figure_html}"
                    f"<div class='howto'><p class='howto-title'>読み方</p><ul>{''.join(f'<li>{inline(b)}</li>' for b in bullets)}</ul></div>"
                    f"{data_html}{f'<p class=note>{html.escape(extra)}</p>' if extra else ''}</section>")
    body.append("<section class='card'><h2>学習のしくみ</h2><ol class='method'>" + "".join(f"<li>{inline(m)}</li>" for m in method) + "</ol>"
                "<details><summary>限界</summary><ul>" + "".join(f"<li>{html.escape(m)}</li>" for m in limits) + "</ul></details>"
                "<details><summary>用語</summary><dl>" + "".join(f"<dt>{html.escape(k)}</dt><dd>{html.escape(v)}</dd>" for k, v in glossary) + "</dl></details>"
                f"<details><summary>再現のための情報</summary><p>{html.escape(reproduce)}</p><p>" + "・".join(f"<a href='{html.escape(p)}'>{html.escape(p)}</a>" for p in evidence["sources"]) + "</p></details></section>")
    (output / "report.html").write_text(f"<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                                        f"<title>{title} — {html.escape(run.name)}</title><style>{STYLE}</style></head><body><main>{''.join(body)}</main></body></html>", encoding="utf-8")
    print(output / "report.html")
    return output


VALUE_NAMES = {"constant": "当てずっぽう", "numpy-linear": "線形（NumPy・従来）", "numpy-mlp": "MLP16（NumPy・従来）",
               "sklearn-logistic": "ロジスティック回帰（scikit-learn）", "sklearn-boosting": "勾配ブースティング（scikit-learn）",
               "torch-mlp": "MLP32＋ドロップアウト（PyTorch）", "torch-deepsets": "Deep Sets（PyTorch）"}
POLICY_NAMES = {"uniform": "ランダム", "type-prior": "手の種類の頻度", "sklearn-logistic": "ロジスティック回帰（scikit-learn）",
                "sklearn-boosting": "勾配ブースティング（scikit-learn）", "torch-listwise": "順位づけネット（PyTorch）"}


def two_series(ax, names, first, second, labels, *, lower_better):
    y = np.arange(len(names))
    for values, color, label, offset in ((first, ROSE, labels[0], -0.12), (second, LEAF, labels[1], 0.12)):
        ax.scatter(values, y + offset, s=70, color=color, edgecolors=SURFACE, linewidths=2, zorder=3, label=label)
    for values, offset in ((first, -0.12), (second, 0.12)):
        for yi, value in zip(y, values):
            ax.text(value, yi + offset, f"  {value:.3f}" if lower_better else f"  {value:.0%}", va="center", ha="left", color=INK, fontsize=8.5)
    ax.set_yticks(y, names)
    ax.set_ylim(len(names) - 0.5, -0.6)
    tidy(ax, "x")


def generate_ml(directory):
    """ml.pyの結果（value-summary.json / policy-summary.json）を図にする。"""
    directory = Path(directory)
    made = []
    if (directory / "value-summary.json").exists():
        summary = read(directory / "value-summary.json")
        results = summary["results"]
        order = [k for k in VALUE_NAMES if k in results]
        fig, ax = plt.subplots(figsize=(8.5, 0.55 * len(order) + 1.4))
        names = [VALUE_NAMES[k] + ("・対戦可" if results[k].get("playable") else "") for k in order]
        two_series(ax, names, [results[k]["metrics"]["validation"]["logLoss"] for k in order],
                   [results[k]["metrics"]["test"]["logLoss"] for k in order], ("検証用", "テスト用"), lower_better=True)
        ax.axvline(results["constant"]["metrics"]["test"]["logLoss"], color=MUTED, linewidth=1.2, zorder=1)
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.2), ncols=2)
        ax.set_xlabel("予測の外れ具合（log loss・左ほど良い）")
        ax.set_title(f"勝ち負け予測の比較（{summary['positions']:,}局面）", loc="left")
        save(fig, directory, "value-comparison")
        made.append("value-comparison")
    if (directory / "policy-summary.json").exists():
        summary = read(directory / "policy-summary.json")
        results = summary["results"]
        order = [k for k in POLICY_NAMES if k in results]
        fig, axes = plt.subplots(1, 2, figsize=(11, 0.55 * len(order) + 1.6), sharey=True)
        test = {k: results[k]["metrics"]["test"] for k in order}
        for ax, prefix, title in ((axes[0], "", f"すべての判断（平均{test['uniform']['meanActions']:.1f}択）"),
                                  (axes[1], "wide", f"選択肢6つ以上（{test['uniform']['wideDecisions']}判断）")):
            key = (lambda n: prefix + n[0].upper() + n[1:]) if prefix else (lambda n: n)
            two_series(ax, [POLICY_NAMES[k] for k in order], [test[k][key("top1")] for k in order], [test[k][key("top3")] for k in order],
                       ("1番目で当たり", "上位3つに入る"), lower_better=False)
            ax.set_xlim(0, 1.15)
            ax.set_xticks(np.linspace(0, 1, 6))
            ax.xaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
            ax.set_title(title, loc="left")
        axes[0].legend(loc="upper center", bbox_to_anchor=(1.0, -0.12), ncols=2)
        fig.supxlabel("さいきょうCPUが選んだ手を当てた割合（テスト用の試合・右ほど良い）", color=INK, fontsize=10.5)
        save(fig, directory, "policy-comparison")
        made.append("policy-comparison")
    return made


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--ml", action="store_true", help="ml.pyの出力ディレクトリから比較図だけを作る")
    args = parser.parse_args()
    print(generate_ml(args.run)) if args.ml else generate(args.run)
