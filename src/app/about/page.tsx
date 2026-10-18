import type { Metadata } from 'next';
import AboutPage from '@/components/about/AboutPage';

export const metadata: Metadata = {
  title: 'ぷぷりえーるとは',
  description: 'お菓子争奪戦争ぷぷりえーるのあらすじ・ルール説明・FAQ。',
  alternates: { canonical: '/about' },
};

export default function About() {
  return <AboutPage />;
}
