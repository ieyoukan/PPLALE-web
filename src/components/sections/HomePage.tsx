'use client';

import '@/app/panda.css';

import React, { useEffect, useState } from 'react';
import { useScroll, useTransform } from 'framer-motion';
import { HeroSection, ExplanationSection, CardPickupSection, ToolsSection, Footer } from '@/components/sections';
import { css } from 'styled-system/css';

export default function HomePage() {
  const { scrollY } = useScroll();
  const [isMounted, setIsMounted] = useState(false);

  // 解説カードの表示制御
  const explanationOpacity = useTransform(scrollY, [400, 600], [0, 1]);
  const explanationY = useTransform(scrollY, [400, 700], [100, 0]);

  // クライアント側でのみマウント状態を設定
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <main className={css({ minH: 'screen', w: 'full', position: 'relative', overflowX: 'hidden' })}>
      {/* ヒーローセクション */}
      <HeroSection />

      {/* 解説セクション */}
      {isMounted && (
        <>
          <ExplanationSection
            explanationOpacity={explanationOpacity}
            explanationY={explanationY}
          />
          <CardPickupSection />
          <ToolsSection />
        </>
      )}

      {/* フッター */}
      <Footer />
    </main>
  );
}
