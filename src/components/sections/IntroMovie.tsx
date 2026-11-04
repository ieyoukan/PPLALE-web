'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './IntroMovie.module.css';
import { useI18n } from '@/i18n/LocaleProvider';

// 紹介ムービー。近づいたら読み込み、見えている間だけ無音で再生する（ブラウザは無音でないと自動再生しない）。
// AV1に対応する端末は軽いAV1を、それ以外はH.264を選ぶ。ファイルを差し替えるときは名前の版を上げる（1年キャッシュ）。
const SOURCES = [
  { src: '/videos/pplale-intro-v1.av1.mp4', type: 'video/mp4; codecs="av01.0.05M.08, mp4a.40.2"' },
  { src: '/videos/pplale-intro-v1.h264.mp4', type: 'video/mp4; codecs="avc1.640028, mp4a.40.2"' },
];
const POSTER = '/images/home/movie-poster.webp';

export default function IntroMovie() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reduce);
    // 手前で読み込みを始め、4割が見えたら再生、外れたら止める。
    const loader = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); loader.disconnect(); }
    }, { rootMargin: '300px 0px' });
    const player = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (reduce) return;
      if (entry.isIntersecting) { if (video.currentSrc) void video.play().catch(() => {}); }
      else video.pause();
    }, { threshold: 0.4 });
    loader.observe(video);
    player.observe(video);
    return () => { loader.disconnect(); player.disconnect(); };
  }, []);

  // 読み込み前に見えた場合は、ソースを入れた直後に再生する。
  useEffect(() => {
    const video = videoRef.current;
    if (!near || !video || !visibleRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void video.play().catch(() => {});
  }, [near]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted && video.paused) void video.play().catch(() => {});
  };

  return (
    <div className={styles.frame}>
      <video
        ref={videoRef}
        className={styles.video}
        poster={near ? POSTER : undefined}
        muted
        loop
        playsInline
        preload="none"
        controls={reducedMotion}
        aria-label={t('紹介ムービー')}
      >
        {near && SOURCES.map(source => <source key={source.src} src={source.src} type={source.type} />)}
      </video>
      {!reducedMotion && (
        <button type="button" className={styles.sound} onClick={toggleSound} aria-pressed={!muted} aria-label={t(muted ? '音を出す' : '音を消す')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {muted
              ? <path d="M16.5 9.5l5 5m0-5l-5 5" />
              : <><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>}
          </svg>
        </button>
      )}
    </div>
  );
}
