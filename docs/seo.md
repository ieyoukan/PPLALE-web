# ぷぷりえーるの検索表示

## トップページの役割

`/` を「ぷぷりえーる」のホームページとして扱う。デッキ構築に加え、ゲーム紹介・ルール、ブラウザ対戦、2Pick、大会情報への入口を置く。

- サイト名・タイトル・説明文は `src/lib/site.ts` で管理する。
- トップページに `WebSite` と `WebPage` のJSON-LDを出力する。サイト名は「ぷぷりえーる」、別名は正式名称と「PPLALE」。
- 紹介文と各ページへのリンクはJavaScriptなしでも表示する。
- `sitemap.xml` は公開ページの正規URLを掲載する。更新日を正確に管理できない間は、ビルド日時を `lastmod` として出さない。
- Googleの所有権確認用メタタグと `robots.txt` のサイトマップ指定は設定済み。Search Consoleの登録状況やインデックス状況は別途確認する。

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
