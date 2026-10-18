import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cache } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { db } from '@/lib/firebase';
import { displayCards } from '@/lib/game/catalog';

/** Small on purpose: share cards are shown at about 500px wide, and a JPEG this size stays near 30KB. */
const WIDTH = 800;
const HEIGHT = 420;
const ICON = 220;
const FONT = 'M PLUS Rounded 1c';
const MAX_CACHE = 200;
const images = new Map<string, Promise<Buffer>>();

export interface OgProfile { displayName: string; comment: string; iconCardId: string }

export const PROFILE_ID = /^[\w-]{1,128}$/;

/** Profiles are publicly readable, so the server reads them with the same client SDK the deck page uses. */
export const readOgProfile = cache(async (uid: string): Promise<OgProfile | null> => {
  if (!PROFILE_ID.test(uid)) return null;
  const value = await getDoc(doc(db, 'profiles', uid));
  const data = value.data();
  if (!value.exists() || !data) return null;
  return {
    displayName: typeof data.displayName === 'string' ? data.displayName : 'プレイヤー',
    comment: typeof data.comment === 'string' ? data.comment : '',
    iconCardId: typeof data.iconCardId === 'string' && displayCards[data.iconCardId] ? data.iconCardId : 'p_1',
  };
});

export const profileOgVersion = ({ displayName, comment, iconCardId }: OgProfile) =>
  createHash('sha256').update(JSON.stringify(['og-p1', displayName, comment, iconCardId])).digest('hex').slice(0, 12);

/** The face crop the profile avatar shows (object-position 18%, scale 1.6), from the small OG copy of the card. */
async function face(id: string): Promise<string> {
  const url = displayCards[id]?.imageUrl ?? displayCards.p_1.imageUrl;
  const og = join(process.cwd(), 'public', url.replace(/^\/images\//, 'og-cards/').replace(/\.webp$/i, '.png'));
  const bytes = await readFile(og).catch(() => readFile(join(process.cwd(), 'public', url)));
  const card = sharp(bytes).resize(240, 360, { fit: 'cover' });
  const jpeg = await card.extract({ left: 45, top: 47, width: 150, height: 150 }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

/** Google Fonts serves only the glyphs in `text`, so a Japanese rounded font costs a few KB per image. */
async function font(text: string): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${FONT.replaceAll(' ', '+')}:wght@800&text=${encodeURIComponent(text)}`)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error('font subset not found');
  return (await fetch(src)).arrayBuffer();
}

const dot = (left: number, top: number, size: number, color: string) =>
  <div style={{ position: 'absolute', left, top, width: size, height: size, borderRadius: size, background: color }} />;

async function render({ displayName, comment, iconCardId }: OgProfile): Promise<Buffer> {
  const name = Array.from(displayName).slice(0, 12).join('') || 'プレイヤー';
  const said = Array.from(comment || 'よろしくお願いします！').slice(0, 80).join('');
  const brand = 'ぷぷりえーる';
  const [icon, data] = await Promise.all([face(iconCardId), font(`${name}${said}${brand}♡★`)]);
  const nameSize = Math.min(56, Math.floor(390 / Math.max(1, Array.from(name).length)));
  const response = new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', padding: '0 56px', fontFamily: FONT, background: 'linear-gradient(135deg, #ffe7f0 0%, #fff8e6 100%)' }}>
      {dot(-40, -50, 170, '#ffd3e2')}{dot(690, 300, 190, '#ffefc2')}{dot(640, 40, 26, '#ffc4d8')}{dot(300, 360, 18, '#ffd88f')}{dot(40, 330, 14, '#f7a8c3')}
      <div style={{ position: 'relative', display: 'flex', width: ICON + 20, height: ICON + 20, borderRadius: ICON, background: 'linear-gradient(135deg, #ff9fc2, #ffd27f)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 0 #f3c3d3' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
        <img alt="" src={icon} width={ICON - 4} height={ICON - 4} style={{ borderRadius: ICON, border: '8px solid #fff' }} />
        <div style={{ position: 'absolute', right: -6, top: 4, color: '#ffb800', fontSize: 40 }}>★</div>
        <div style={{ position: 'absolute', left: -2, bottom: 10, color: '#ff7aa8', fontSize: 34 }}>♡</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 40, marginBottom: 20, flex: 1 }}>
        <div style={{ display: 'flex', fontSize: nameSize, whiteSpace: 'nowrap', color: '#8a4d67', letterSpacing: 1, textShadow: '0 3px 0 #fff' }}>{name}</div>
        <div style={{ position: 'relative', display: 'flex', marginTop: 18, padding: '18px 24px', borderRadius: 26, background: '#fff', border: '4px solid #f6bfd2', color: '#6b4a52', fontSize: said.length > 40 ? 20 : 27, lineHeight: 1.4 }}>
          <div style={{ position: 'absolute', left: -15, top: 22, width: 24, height: 24, background: '#fff', borderLeft: '4px solid #f6bfd2', borderBottom: '4px solid #f6bfd2', transform: 'rotate(45deg)' }} />
          {said}
        </div>
      </div>
      <div style={{ position: 'absolute', right: 28, bottom: 18, display: 'flex', padding: '6px 18px', borderRadius: 30, background: '#ff8fb5', color: '#fff', fontSize: 22 }}>{brand}</div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts: [{ name: FONT, data, weight: 800, style: 'normal' }] },
  );
  return sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

/** Cached by content, so repeat crawls and identical profiles reuse one JPEG. */
export function getOgProfileImage(profile: OgProfile): Promise<Buffer> {
  const key = profileOgVersion(profile);
  let job = images.get(key);
  if (job) { images.delete(key); images.set(key, job); return job; }
  job = render(profile);
  images.set(key, job);
  job.catch(() => images.delete(key));
  if (images.size > MAX_CACHE) images.delete(images.keys().next().value!);
  return job;
}
