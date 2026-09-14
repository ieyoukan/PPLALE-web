/**
 * @file FireBaseLogin.tsx
 * @description Firebaseを使用したGoogleログイン機能を提供するコンポーネント
 * ログインしていない場合はログインボタンを表示し、ログインしている場合はユーザーアイコンとメニューを表示する
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import {signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import Image from 'next/image';
import { auth } from '@/lib/firebase';
import { css } from 'styled-system/css';
import { useI18n } from '@/i18n/LocaleProvider';

const provider = new GoogleAuthProvider();

interface FireBaseLoginProps {
  isPopup?: boolean;
  onClose?: () => void;
}

/**
 * Firebaseログインコンポーネント
 * @param {FireBaseLoginProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} Firebaseログインコンポーネント
 */
const FireBaseLogin: React.FC<FireBaseLoginProps> = () => {
  const { t } = useI18n();
  const [user, set_user] = useState<User | null>(null);
  const [menu_open, set_menu_open] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        set_menu_open(false);
      }
    };

    if (menu_open) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menu_open]);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      set_user(user);
    });
    return () => unsubscribe();
  }, []);

  /**
   * Googleでログインする
   */
  const login_with_google = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('ログインエラー:', error);
    }
  };

  /**
   * ログアウトする
   */
  const logout = async () => {
    try {
      await signOut(auth);
      set_menu_open(false);
    } catch (error) {
      console.error('ログアウトエラー:', error);
    }
  };

  /**
   * メニューの表示・非表示を切り替える
   */
  const toggle_menu = () => {
    set_menu_open(!menu_open);
  };

  if (!user) {
    return (
      <button
        onClick={login_with_google}
        className={css({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          rounded: 'md',
          borderWidth: '1px',
          borderColor: 'gray.300',
          bg: 'white',
          px: '4',
          py: '2',
          color: 'gray.800',
          boxShadow: 'xs',
          transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke',
          _hover: { bg: 'gray.100' },
          _dark: {
            borderColor: 'gray.600',
            bg: 'gray.800',
            color: 'gray.100',
            _hover: { bg: 'gray.700' },
          },
        })}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" 
            fill="#4285F4" 
          />
          <path 
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" 
            fill="#34A853" 
          />
          <path 
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" 
            fill="#FBBC05" 
          />
          <path 
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" 
            fill="#EA4335" 
          />
        </svg>
        {t('ログイン')}
      </button>
    );
  }

  return (
    <div className={css({ position: 'relative' })} ref={menuRef}>
      <button
        onClick={toggle_menu}
        className={css({
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          rounded: 'full',
          overflow: 'hidden',
          _focus: { outline: 'none' },
        })}
      >
        {user.photoURL ? (
          <Image
            src={user.photoURL}
            alt={user.displayName ?? t('ユーザー')}
            width={40}
            height={40}
            className={css({ rounded: 'full' })}
          />
        ) : (
          <div className={css({ w: '10', h: '10', bg: 'gray.300', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' })}>
            {user.displayName?.[0] || user.email?.[0] || '?'}
          </div>
        )}
      </button>

      {menu_open && (
        <div
          className={css({
            position: 'absolute',
            right: '0',
            zIndex: '10',
            mt: '2',
            w: '48',
            rounded: 'md',
            borderWidth: '1px',
            borderColor: 'gray.200',
            bg: 'white',
            py: '1',
            boxShadow: 'lg',
            _dark: { borderColor: 'gray.700', bg: 'gray.800' },
          })}
        >
          <div
            className={css({
              borderBottomWidth: '1px',
              borderColor: 'gray.100',
              px: '4',
              py: '2',
              fontSize: 'sm',
              color: 'gray.700',
              _dark: { borderColor: 'gray.700', color: 'gray.200' },
            })}
          >
            {user.displayName || user.email}
          </div>
          <button
            onClick={logout}
            className={css({
              w: 'full',
              px: '4',
              py: '2',
              textAlign: 'left',
              fontSize: 'sm',
              color: 'gray.700',
              _hover: { bg: 'gray.100' },
              _dark: { color: 'gray.200', _hover: { bg: 'gray.700' } },
            })}
          >
            {t('ログアウト')}
          </button>
        </div>
      )}
    </div>
  );
};

export default FireBaseLogin;
