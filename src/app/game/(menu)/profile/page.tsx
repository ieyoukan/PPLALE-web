import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ProfilePage } from '@/components/game/social/ProfilePage';
import { profileOgVersion, readOgProfile } from '@/lib/ogProfileImage';

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }): Promise<Metadata> {
  const { id } = await searchParams;
  const uid = typeof id === 'string' ? id : null;
  const profile = uid ? await readOgProfile(uid).catch(() => null) : null;
  if (!uid || !profile) return { title: 'プロフィール | ぷぷりえーる' };
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://pplale.pgw.jp';
  const title = `${profile.displayName} | ぷぷりえーる`;
  const description = profile.comment || 'よろしくお願いします！';
  const image = { url: new URL(`/api/og/profile/${encodeURIComponent(uid)}/?v=${profileOgVersion(profile)}`, baseUrl).toString(), width: 800, height: 420, alt: title };
  return {
    title, description,
    openGraph: { title, description, images: [image], type: 'profile', url: `${baseUrl}/game/profile/?id=${encodeURIComponent(uid)}` },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

export default function Page() { return <Suspense><ProfilePage /></Suspense>; }
