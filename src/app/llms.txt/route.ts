// サイトの案内をAIエージェント向けにまとめる（llms.txt の提案形式）。検索順位には影響しない。docs/seo.md 参照。
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const body = `# ${site.name}（${site.fullName} / PPLALE）

> ${site.description}

## ルール

- [ぷぷりえーるとは（ルール・遊び方・FAQ）](${site.url}/about/): あらすじ、対戦の始め方、ターンの流れ、用語と能力、いちご・ぶどうのFAQ、裁定集
- [ルール・裁定集（Markdown）](${site.url}/rules.md): 上のページの本文をMarkdownにしたもの

## 遊ぶ

- [ゲーム](${site.url}/game/): ブラウザでCPU対戦・ルーム対戦
- [デッキ構築](${site.url}/build/): デッキを作って保存・共有する
- [2Pick](${site.url}/deck/2pick/): 2枚ずつ選んでデッキを組む
- [デッキ画像](${site.url}/deck-view/): デッキコードから画像を作る

## コミュニティ

- [コミュニティ](${site.url}/community/): Discordサーバー、VRChatワールド、大会の案内
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
}
