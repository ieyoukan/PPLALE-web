import '@/app/panda.css';
import { homeFont } from './homeFont';

import { HeroSection, ExplanationSection, CardPickupSection, ToolsSection, Footer } from '@/components/sections';
import { css } from 'styled-system/css';

export default function HomePage() {
  return (
    <div className={`${homeFont.className} ${css({ minH: 'screen', w: 'full', position: 'relative', overflowX: 'hidden' })}`}>
      <HeroSection />
      <ExplanationSection />
      <ToolsSection />
      <CardPickupSection />
      <Footer />
    </div>
  );
}
