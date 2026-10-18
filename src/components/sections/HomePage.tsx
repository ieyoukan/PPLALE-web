import '@/app/panda.css';
import { homeFont, homeTitleFont } from './homeFont';

import { HeroSection, ExplanationSection, CardPickupSection, ToolsSection, Footer } from '@/components/sections';
import { css } from 'styled-system/css';

export default function HomePage() {
  return (
    <div className={`${homeFont.className} ${homeTitleFont.variable} ${css({ minH: 'screen', w: 'full', color: 'var(--brand-cocoa-deep)', bg: 'var(--brand-cream)', position: 'relative', overflowX: 'hidden' })}`}>
      <HeroSection />
      <ExplanationSection />
      <ToolsSection />
      <CardPickupSection />
      <Footer />
    </div>
  );
}
