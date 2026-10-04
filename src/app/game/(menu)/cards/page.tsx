import type { Metadata } from 'next';
import { CardsMenu } from '@/components/game/home/CardsMenu';
export const metadata: Metadata = {
    title: 'ぷぷりえーる カード',
    description: 'ぷぷりえーるのカード図鑑とデッキ構築への入口。',
    alternates: { canonical: '/game/cards/' },
};
export default function Page() {
    return <CardsMenu />;
}
