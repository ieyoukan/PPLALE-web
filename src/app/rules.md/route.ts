// ルール・裁定集の本文をMarkdownで返す。/about/ と同じ内容を、ページを読み込まずに読むAIエージェント向けに。
// /about/ の <link rel="alternate" type="text/markdown"> と /llms.txt から案内する（docs/seo.md）。
import { loadRules } from '@/components/about/RulesDoc';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

export async function GET() {
  const { markdown } = await loadRules();
  const body = `# ${site.fullName}：ルール・裁定集

> ${site.fullName}（${site.name} / PPLALE）は、VRChatの「ロリっ子喫茶ぷぷりえ」から生まれたカードゲーム。
> このファイルは ${site.url}/about/ の「ルール・裁定集」と同じ内容です。

${markdown.trim()}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
}
