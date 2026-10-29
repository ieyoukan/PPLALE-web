import type { ReactNode } from 'react';
import DarkModeProvider from '@/components/site/DarkModeProvider';

export default function Layout({ children }: { children: ReactNode }) {
  return <DarkModeProvider>{children}</DarkModeProvider>;
}
