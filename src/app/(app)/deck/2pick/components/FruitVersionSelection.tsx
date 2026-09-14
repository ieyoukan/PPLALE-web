/**
 * フルーツとプレイアブルカードバージョン選択コンポーネント
 * 
 * 2Pickモードでプレイするフルーツとプレイアブルカードのバージョンを選択する機能を提供します。
 * 
 * @packageDocumentation
 */

'use client';

import React from 'react';
import { Controller, Control, UseFormHandleSubmit, ControllerRenderProps } from 'react-hook-form';
import { CardVersion, FruitType } from '@/types/card';
import Image from 'next/image';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';

/**
 * フルーツとバージョン選択コンポーネントのProps
 * 
 * @interface
 * @property {Control<FormData>} control - react-hook-formのコントロール
 * @property {UseFormHandleSubmit<FormData>} handleSubmit - フォーム送信ハンドラ
 * @property {FruitType[]} selectedFruits - 選択されているフルーツの配列
 * @property {string[]} selectedPlayableVersions - 選択されているプレイアブルカードのバージョンの配列
 * @property {() => void} onSubmit - フォーム送信時のコールバック関数
 */
interface FruitVersionSelectionProps {
  /** react-hook-formのコントロール */
  control: Control<FormData>;
  /** フォーム送信ハンドラ */
  handleSubmit: UseFormHandleSubmit<FormData>;
  /** 選択されているフルーツの配列 */
  selectedFruits: FruitType[];
  /** 選択されているプレイアブルカードのバージョンの配列 */
  selectedPlayableVersions: CardVersion[];
  /** フォーム送信時のコールバック関数 */
  onSubmit: () => void;
}

/** フォームデータの型定義 */
interface FormData {
  /** 選択されたフルーツの配列 */
  fruits: FruitType[];
  /** 選択されたプレイアブルカードのバージョンの配列 */
  playableVersions: CardVersion[];
}

/**
 * フルーツとバージョン選択コンポーネント
 * 
 * @param {FruitVersionSelectionProps} props - コンポーネントのプロパティ
 * @returns {JSX.Element} フルーツとバージョン選択画面
 */
const FruitVersionSelection: React.FC<FruitVersionSelectionProps> = ({
  control,
  handleSubmit,
  selectedFruits,
  selectedPlayableVersions,
  onSubmit,
}) => {
  const { t, fruitLabel, versionLabel } = useI18n();
  const versionImage: Record<CardVersion, string> = { normal: '通常', beta: 'β' };
  return (
    <div className={css({ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: '8' })}>
      <h2 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '8' })}>{t('カードのフルーツを選択してください')}</h2>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className={css({ display: 'flex', flexDirection: 'column', gap: '8', w: 'full', maxW: '4xl' })}
      >
        <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', md: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }, gap: '6' })}>
          {(['strawberry', 'grape', 'melon', 'orange'] as FruitType[]).map(fruit => (
            <Controller
              key={fruit}
              name="fruits"
              control={control}
              render={({ field }: { field: ControllerRenderProps<FormData, 'fruits'> }) => (
                <label className={css({ position: 'relative', cursor: 'pointer' })}>
                  <input
                    type="checkbox"
                    value={fruit}
                    checked={field.value.includes(fruit)}
                    onChange={e => {
                      const newValue = e.target.checked
                        ? [...field.value, fruit]
                        : field.value.length > 1 // 最低1つは残す
                          ? field.value.filter(f => f !== fruit)
                          : field.value;
                      field.onChange(newValue);
                    }}
                    className={css({ display: 'none' })}
                  />
                  <div className={css({
                    position: 'relative',
                    rounded: 'xl',
                    overflow: 'hidden',
                    transitionProperty: 'all',
                    transitionDuration: '300ms',
                    boxShadow: field.value.includes(fruit) ? '0 0 0 4px var(--colors-special)' : '0 0 0 2px var(--colors-gray-200)',
                  })}>
                    <div className={css({ w: 'full', h: '32', position: 'relative' })} style={{ backgroundColor: fruit === 'strawberry' ? '#9B4341' : fruit === 'grape' ? '#6E25AB' : fruit === 'melon' ? '#40923D' : '#E5872C' }}>
                      <Image
                        src="/pupu_game.webp"
                        alt="background"
                        width={500}
                        height={281}
                        className={css({ w: 'full', h: 'full', objectFit: 'cover' })}
                      />
                    </div>
                    {field.value.includes(fruit) && (
                      <div className={css({ position: 'absolute', inset: '0', bg: 'black/20', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                        <div className={css({ w: '12', h: '12', bg: 'special', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                          <svg className={css({ w: '8', h: '8', color: 'white' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className={css({ textAlign: 'center', mt: '2', fontWeight: 'medium' })}>{fruitLabel(fruit)}</p>
                </label>
              )}
            />
          ))}
        </div>

        <h2 className={css({ fontSize: 'xl', fontWeight: 'bold', mb: '8', mt: '12' })}>{t('プレイアブルカードのバージョンを選択してください')}</h2>
        <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6' })}>
          {(['normal', 'beta'] as CardVersion[]).map(version => (
            <Controller
              key={version}
              name="playableVersions"
              control={control}
              render={({ field }: { field: ControllerRenderProps<FormData, 'playableVersions'> }) => (
                <label className={css({ position: 'relative', cursor: 'pointer' })}>
                  <input
                    type="checkbox"
                    value={version}
                    checked={field.value.includes(version)}
                    onChange={e => {
                      const newValue = e.target.checked
                        ? [...field.value, version]
                        : field.value.length > 1 // 最低1つは残す
                          ? field.value.filter(v => v !== version)
                          : field.value;
                      field.onChange(newValue);
                    }}
                    className={css({ display: 'none' })}
                  />
                  <div className={css({
                    position: 'relative',
                    rounded: 'xl',
                    overflow: 'hidden',
                    transitionProperty: 'all',
                    transitionDuration: '300ms',
                    boxShadow: field.value.includes(version) ? '0 0 0 4px var(--colors-special)' : '0 0 0 2px var(--colors-gray-200)',
                  })}>
                    <Image
                      src={`/images/versions/${versionImage[version]}.webp`}
                      alt={versionLabel(version)}
                      className={css({ w: 'full', h: '48', objectFit: 'cover' })}
                      width={200}
                      height={200}
                      priority
                    />
                    {field.value.includes(version) && (
                      <div className={css({ position: 'absolute', inset: '0', bg: 'black/20', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                        <div className={css({ w: '12', h: '12', bg: 'special', rounded: 'full', display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                          <svg className={css({ w: '8', h: '8', color: 'white' })} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className={css({ textAlign: 'center', mt: '2', fontWeight: 'medium' })}>{versionLabel(version)}</p>
                </label>
              )}
            />
          ))}
        </div>
        <div className={css({ display: 'flex', justifyContent: 'center', mt: '8' })}>
          <button
            type="submit"
            className={`${button({ variant: 'primary', size: 'lg' })} ${css({
              opacity: (selectedFruits.length === 0 || selectedPlayableVersions.length === 0) ? '0.5' : undefined,
            })}`}
            disabled={selectedFruits.length === 0 || selectedPlayableVersions.length === 0}
          >
            {t('次へ')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FruitVersionSelection;
