'use client';

import React, { useEffect, useState } from 'react';
import { useScroll, useTransform } from 'framer-motion';
import { HeroSection, ExplanationSection, CardPickupSection, Footer } from '@/components/sections';
import { css } from 'styled-system/css';

export default function Home() {
  const { scrollY } = useScroll();
  const [isMounted, setIsMounted] = useState(false);
  
  // スクロール量に基づいたカードの位置調整
  const cardsYPosition = useTransform(
    scrollY, 
    [0, 100, 600], 
    ['calc(100vh + 30vh)', 'calc(100vh - 30vh)', 'calc(100vh - 100vh)']
  );
  
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
      <HeroSection cardsYPosition={cardsYPosition} />

      {/* 解説セクション */}
      {isMounted && (
        <>
          <ExplanationSection
            explanationOpacity={explanationOpacity}
            explanationY={explanationY}
          />
          <CardPickupSection />
        </>
      )}

      {/* フッター */}
      <Footer />
    </main>
  );
}
