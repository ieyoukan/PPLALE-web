"""results/gallery.json に並べた研究結果の図を、1枚のHTMLで横に並べて見比べる。

各回の実戦結果（現行CPUに対する得点率）は1枚の図にまとめ、回ごとの図はカードに並べる。
図はSVGをHTMLへ埋め込むので、results/index.html だけで開ける。
"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path

import matplotlib.pyplot as plt
try:
    from .report import STYLE, figure_data, pct, save, score_dots, table
except ImportError:
    from report import STYLE, figure_data, pct, save, score_dots, table

RESULTS = Path(__file__).resolve().parent / "results"
EXTRA = """
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px}
.grid figure{margin:0;background:var(--cream);border-radius:16px;padding:10px}
.grid figure img{cursor:zoom-in}
.chip{display:inline-block;border-radius:999px;padding:0 12px;font-size:.85rem;margin-left:8px;vertical-align:middle}
.chip.keep{background:var(--blush)}
.chip.ok{background:var(--sage-wash)}
.chip.info{background:var(--vanilla-wash)}
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.toc a{background:var(--paper);border-radius:999px;padding:4px 14px;text-decoration:none;border:1.5px solid var(--blush)}
dialog{border:none;border-radius:18px;padding:12px;max-width:96vw;background:var(--paper)}
dialog img{max-width:92vw;max-height:88vh}
dialog::backdrop{background:#63474788}
"""
CHIPS = {"keep": "本番は維持", "ok": "研究候補として合格", "info": "参考（対戦なし）"}


def overview(entries, output):
    rows = [(f"{e['date']} {e['title']}", e["match"]) for e in entries if e.get("match")]
    if not rows:
        return None
    fig, ax = plt.subplots(figsize=(8.5, 0.55 * len(rows) + 1.3))
    score_dots(ax, [r[0] for r in rows], [r[1] for r in rows])
    ax.set_title("各回の候補と現行CPUの対戦（最終テスト）", loc="left")
    save(fig, output, "overview")
    return "overview"


def build(manifest_path=RESULTS / "gallery.json"):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    output = Path(manifest_path).parent
    entries = manifest["entries"]
    body = [f"<header><p class='kicker'>research/cpu/results</p><h1>{html.escape(manifest['title'])}</h1></header>",
            f"<section class='hero keep'><div class='badge' aria-hidden='true'>☆</div><div><p class='hero-label'>いまの結論</p><h2>{html.escape(manifest['headline'])}</h2>"
            f"<p>{html.escape(manifest['lead'])}</p></div></section>"]
    body.append("<nav class='toc'>" + "".join(f"<a href='#{e['id']}'>{html.escape(e['date'] + ' ' + e['title'])}</a>" for e in entries) + "</nav>")
    name = overview(entries, output)
    if name:
        rows = [[e["date"], e["title"], e["match"]["pairs"], pct(e["match"]["score"]), f"{pct(e['match']['bootstrap95'][0])}–{pct(e['match']['bootstrap95'][1])}",
                 pct(e["match"]["timeRatio"]) if e["match"].get("timeRatio") is not None else "—"] for e in entries if e.get("match")]
        body.append(f"<section class='card'><h2>対戦結果を並べる</h2><p class='lead'>灰色の縦線（50%）より右なら現行CPUより強い。横棒は95%の幅。</p>"
                    f"<figure><img src='{figure_data(output, name)}' alt='各回の得点率'></figure>"
                    f"<details open><summary>数値の表</summary>{table(['日付', '内容', 'ペア', '得点率', '95%の幅', '時間（現行比）'], rows, 2)}</details></section>")
    for e in entries:
        figures = "".join(f"<figure><img src='{figure_data(output, Path(f['file']).stem)}' alt='{html.escape(f['caption'])}' data-zoom>"
                          f"<figcaption>{html.escape(f['caption'])} <a href='{html.escape(f['file'])}'>SVG</a></figcaption></figure>" for f in e["figures"])
        points = "".join(f"<li>{html.escape(p)}</li>" for p in e.get("points", []))
        link = f"<p class='note'>詳しいレポート（ローカル）：<a href='{html.escape(e['report'])}'>{html.escape(e['report'])}</a></p>" if e.get("report") else ""
        body.append(f"<section class='card' id='{e['id']}'><h2>{html.escape(e['date'] + ' ' + e['title'])}<span class='chip {e['verdict']}'>{CHIPS[e['verdict']]}</span></h2>"
                    f"<p class='lead'>{html.escape(e['summary'])}</p>{f'<div class=howto><ul>{points}</ul></div>' if points else ''}<div class='grid'>{figures}</div>{link}</section>")
    script = ("<dialog id='zoom'><img alt=''></dialog><script>const d=document.getElementById('zoom');"
              "document.querySelectorAll('[data-zoom]').forEach(i=>i.addEventListener('click',()=>{d.querySelector('img').src=i.src;d.showModal()}));"
              "d.addEventListener('click',()=>d.close());</script>")
    (output / "index.html").write_text(f"<!doctype html><html lang='ja'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                                       f"<title>{html.escape(manifest['title'])}</title><style>{STYLE}{EXTRA}</style></head><body><main>{''.join(body)}</main>{script}</body></html>", encoding="utf-8")
    print(output / "index.html")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", nargs="?", type=Path, default=RESULTS / "gallery.json")
    build(parser.parse_args().manifest)
