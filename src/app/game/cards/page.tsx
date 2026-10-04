import type { Metadata } from 'next';
import CardGallery from '@/components/game/home/CardGallery';
export const metadata: Metadata = {
    title: 'ぷぷりえーる カード図鑑',
    description: 'ぷぷりえーるの幼女・お菓子・プレイアブル・トークンのカード一覧。',
    alternates: { canonical: '/game/cards/' },
};
export default function Page() {
    return <CardGallery />;
}
