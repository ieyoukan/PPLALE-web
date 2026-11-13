import type { Metadata } from 'next';
import CommunityPage from '@/components/community/CommunityPage';

export const metadata: Metadata = {
  title: 'コミュニティ',
  description: 'ぷぷりえーるのDiscordサーバーとVRChatワールドへの入口。大会の案内もこちら。',
  alternates: { canonical: '/community' },
};

export default function Community() {
  return <CommunityPage />;
}
