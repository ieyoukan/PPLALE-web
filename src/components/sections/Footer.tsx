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
        bg: 'black/80',
        textAlign: 'center',
      })}
    >
      <div className={css({ fontSize: 'xs', color: 'gray.400' })}>© 2025 ぷぷりえーる デッキ構築</div>
      <div className={css({ display: 'flex', gap: '3', fontSize: 'xs' })}>
        <Link
          href="/privacy-policy"
          className={css({
            color: 'gray.400',
            _hover: { color: 'gray.300' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          プライバシーポリシー
        </Link>
        <span className={css({ color: 'gray.600' })}>•</span>
        <Link
          href="/terms"
          className={css({
            color: 'gray.400',
            _hover: { color: 'gray.300' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          利用規約
        </Link>
        <span className={css({ color: 'gray.600' })}>•</span>
        <Link
          href="/credits"
          className={css({
            color: 'gray.400',
            _hover: { color: 'gray.300' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          クレジット
        </Link>
        <span className={css({ color: 'gray.600' })}>•</span>
        <Link
          href="/contact"
          className={css({
            color: 'gray.400',
            _hover: { color: 'gray.300' },
            transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          })}
        >
          お問い合わせ
        </Link>
      </div>
    </footer>
  );
}
