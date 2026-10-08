import type { Metadata } from 'next';
import BoardEditor from '@/components/game/editor/BoardEditor';
export const metadata: Metadata = {
    title: 'ぷぷりえーる 盤面エディタ',
    description: '好きなカードを場や手札に置いて、その盤面から対戦する。このターンに勝てるか、どう動くのがよいかを調べられる。',
    alternates: { canonical: '/game/editor/' },
};
export default function Page() {
    return <BoardEditor />;
}
