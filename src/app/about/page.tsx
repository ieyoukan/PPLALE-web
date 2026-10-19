import type { Metadata } from 'next';
import AboutPage from '@/components/about/AboutPage';
import RulesDoc, { loadRules } from '@/components/about/RulesDoc';

export const metadata: Metadata = {
  title: 'ぷぷりえーるとは',
  description: 'お菓子争奪戦争ぷぷりえーるのあらすじ・ルール説明・FAQ・裁定集。',
  alternates: { canonical: '/about' },
};

export default async function About() {
  const { markdown, headings } = await loadRules();
  return <AboutPage rulesDoc={<RulesDoc markdown={markdown} />} rulesHeadings={headings} />;
}
