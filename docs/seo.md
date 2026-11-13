# ぷぷりえーるの検索表示

## トップページの役割

`/` を「ぷぷりえーる」のホームページとして扱う。デッキ構築に加え、ゲーム紹介・ルール、ブラウザ対戦、2Pick、コミュニティ（Discord・VRChatワールド・大会情報）への入口を置く。

- サイト名・タイトル・説明文は `src/lib/site.ts` で管理する。
- トップページに `WebSite` と `WebPage` のJSON-LDを出力する。サイト名は「ぷぷりえーる」、別名は正式名称と「PPLALE」。
- 紹介文と各ページへのリンクはJavaScriptなしでも表示する。
- `sitemap.xml` は公開ページの正規URLを掲載する。更新日を正確に管理できない間は、ビルド日時を `lastmod` として出さない。
- Googleの所有権確認用メタタグと `robots.txt` のサイトマップ指定は設定済み。Search Consoleの登録状況やインデックス状況は別途確認する。

## ぷぷりえーるとは（`/about/`）

ルールのページは、検索エンジンとAIエージェントが**JavaScriptを実行せずに**本文を読めることを優先する（2026-11-06）。

- 絵の本（あらすじ・ルール・FAQの画像）と、`docs/game-rules.md` から作るルール・裁定集の全文を、同じページに上下に並べる。全文はサーバーで描画し、タブや `hidden` で隠さない。ヘッダーの「本でよむ」「もじでよむ」は `#book`・`#text` へのページ内リンクで、旧タブのURL `#text` もそのまま使える。
- 見出しは h1（ぷぷりえーるとは）→ h2（あらすじとルールの本／ルール・裁定集）→ h3（章）→ h4（節）。h1にアニメーションの初期値（`opacity:0`）を付けない。本のページ画像の `alt` はページ名。
- タイトル・説明・OGP（`og:url` は `/about/`、`og:type` は `article`）はこのページ専用に `src/app/about/page.tsx` で指定する。ルートのOGPはページの `openGraph` で丸ごと置き換わるため、サイト名・画像も書く。
- JSON-LDは `BreadcrumbList`（ホーム → ぷぷりえーるとは）と `AboutPage`（`about` に `Game`）。FAQの `FAQPage` は2026-11-07に外した：ルール本文と同じ内容が、HTMLとNext.jsの描画データ（RSC）に二重に入って約80KB重くなり、スマホのLCPを遅らせていた。GoogleはFAQのリッチリザルトを政府・医療などの権威あるサイトに限っていて（2023年8月〜）検索結果の表示には効かず、AIエージェントにはHTMLのルール本文と `/rules.md` がある。
- AIエージェント向けに、ルール・裁定集の本文をMarkdownで返す `/rules.md`（`src/app/rules.md/route.ts`）と、サイトの案内 `/llms.txt`（`src/app/llms.txt/route.ts`）を出す。`/about/` の `<link rel="alternate" type="text/markdown">` から `/rules.md` を案内する。llms.txtは提案段階の形式で、Googleの検索順位には使われない。

## 公開後に行うこと

1. Google Search Consoleで `https://pplale.vercel.app/` のプロパティを開く。
2. サイトマップ `https://pplale.vercel.app/sitemap.xml` を送信し、取得成功を確認する。
3. URL検査でトップページの公開URLをテストし、インデックス登録をリクエストする。
4. 検索パフォーマンスで「ぷぷりえーる」の表示回数・クリック数・平均掲載順位を記録し、再クロール後の推移を確認する。
5. ぷぷりえの公式サイト、VRChatワールドの案内、公式SNSなど、管理者が編集できる紹介元から、このホームページへ名前付きのリンクを掲載する。

Search Consoleの操作と外部サイトへのリンク掲載は、このコード変更では実施していない。上位表示は保証できない。再クロールと検索表示への反映には時間がかかるため、公開直後の順位だけで効果を判断しない。

## 参考

- [Google: サイト名](https://developers.google.com/search/docs/appearance/site-names?hl=ja)
- [Google: タイトルリンク](https://developers.google.com/search/docs/appearance/title-link?hl=ja)
- [Google: サイトマップの作成と送信](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap?hl=ja)
- [Google: 再クロールのリクエスト](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?hl=ja)
