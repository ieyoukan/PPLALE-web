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
  const [volume, setVolume] = useState(0.35);
  const [reducedMotion, setReducedMotion] = useState(false);
  const visibleRef = useRef(false);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

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
    // Only after the page has loaded and the browser is idle: on a phone the movie is on the first screen, and
    // starting its ~6 MB at once took the bandwidth of the hero illustration (the home page's LCP).
    const idleSupported = typeof window.requestIdleCallback === 'function';
    let idle = 0;
    const watch = () => {
      const start = () => { loader.observe(video); player.observe(video); };
      idle = idleSupported ? window.requestIdleCallback(start, { timeout: 2000 }) : window.setTimeout(start, 200);
    };
    if (document.readyState === 'complete') watch(); else window.addEventListener('load', watch, { once: true });
    return () => {
      window.removeEventListener('load', watch);
      if (idleSupported) window.cancelIdleCallback(idle); else window.clearTimeout(idle);
      loader.disconnect(); player.disconnect();
    };
  }, []);

  // 読み込み前に見えた場合は、ソースを入れた直後に再生する。
  useEffect(() => {
    const video = videoRef.current;
    if (!near || !video) return;
    // The video has no <source> on first render. When the lazy-loaded sources are
    // added later, restart resource selection so browsers such as Firefox pick
    // them up instead of keeping the initial "no supported source" error.
    video.load();
    if (!visibleRef.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void video.play().catch(() => {});
  }, [near]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted && video.paused) void video.play().catch(() => {});
  };

  return (
    <div className={styles.frame}>
      <video
        ref={videoRef}
        className={styles.video}
        poster={near ? POSTER : undefined}
        muted={muted}
        loop
        playsInline
        preload="none"
        controls={reducedMotion}
        aria-label={t('紹介ムービー')}
      >
        {near && SOURCES.map(source => <source key={source.src} src={source.src} type={source.type} />)}
      </video>
      {!reducedMotion && (
        <>
          <label className={styles.volume}>
            <span className={styles.srOnly}>{t('音量')}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={event => setVolume(Number(event.currentTarget.value))}
              aria-label={t('音量')}
            />
          </label>
          <button type="button" className={styles.sound} onClick={toggleSound} aria-pressed={!muted} aria-label={t(muted ? '音を出す' : '音を消す')}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
              {muted
                ? <path d="M16.5 9.5l5 5m0-5l-5 5" />
                : <><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>}
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
