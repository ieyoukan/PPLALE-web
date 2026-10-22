import type { Metadata } from 'next';
import { PlayPerformancePanel } from '@/components/game/performance/PlayPerformancePanel';
export const metadata: Metadata = { title: 'ぷぷりえーる 通信計測', robots: { index: false, follow: false } };
export default function Page() { return <PlayPerformancePanel />; }
