import type { Metadata } from 'next';
import HomePage from '@/components/sections/HomePage';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function Home() {
  return <HomePage />;
}
