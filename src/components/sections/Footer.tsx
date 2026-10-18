'use client';

import React from 'react';
import Link from 'next/link';
import { css } from 'styled-system/css';

export default function Footer() {
  return (
    <footer
      className={css({
        py: '2',
        px: '4',
        w: 'full',
        justifyContent: 'center',
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '1',
        bg: 'var(--brand-cocoa-deep)',
        textAlign: 'center',
      })}
    >
      <div className={css({ fontSize: 'xs', color: 'var(--brand-cream)' })}>© 2025 ぷぷりえーる</div>
      <div className={css({ display: 'flex', gap: '3', fontSize: 'xs' })}>
        <Link
          href="/privacy-policy"
          className={css({
            color: 'var(--brand-cream)',
            _hover: { color: 'var(--brand-vanilla)' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          プライバシーポリシー
        </Link>
        <span className={css({ color: 'var(--brand-pink)' })}>•</span>
        <Link
          href="/terms"
          className={css({
            color: 'var(--brand-cream)',
            _hover: { color: 'var(--brand-vanilla)' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          利用規約
        </Link>
        <span className={css({ color: 'var(--brand-pink)' })}>•</span>
        <Link
          href="/credits"
          className={css({
            color: 'var(--brand-cream)',
            _hover: { color: 'var(--brand-vanilla)' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          クレジット
        </Link>
        <span className={css({ color: 'var(--brand-pink)' })}>•</span>
        <Link
          href="/contact"
          className={css({
            color: 'var(--brand-cream)',
            _hover: { color: 'var(--brand-vanilla)' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          お問い合わせ
        </Link>
      </div>
    </footer>
  );
}
