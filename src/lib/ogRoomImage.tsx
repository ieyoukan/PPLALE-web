import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { fruitNames } from '@pplale/game-core';
import { fruitIllustrations } from '@/lib/game/roomThumbnail';
import type { RoomThumbnail } from '@/lib/game/roomThumbnail';

// The room thumbnail and share image: painted fruit illustrations, the logo and the game's friends.
// It is chosen by the rules alone (roomThumbnail.ts), so every room with the same rules shares one
// image, and nothing of who is in a room, its name or its invitation can be read from it.
const WIDTH = 800;
const HEIGHT = 420;
const FONT = 'M PLUS Rounded 1c';
const images = new Map<string, Promise<Buffer>>();
const files = new Map<string, Promise<string>>();

/** A picture of public/, as a PNG data URL Satori can draw (it does not read WebP); `contain` keeps transparency around it. */
function picture(path: string, width: number, height: number, fit: 'cover' | 'contain' = 'cover') {
  const key = `${path}:${width}x${height}:${fit}`;
  let job = files.get(key);
  if (!job) {
    job = readFile(join(process.cwd(), 'public', path)).then(bytes => sharp(bytes).resize(width, height, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).then(png => `data:image/png;base64,${png.toString('base64')}`);
    job.catch(() => files.delete(key));
    files.set(key, job);
  }
  return job;
}
const backdrop = () => readFile(join(process.cwd(), 'public', 'og-cards', 'profile-bg.jpg')).then(jpeg => `data:image/jpeg;base64,${jpeg.toString('base64')}`);

/** Google Fonts serves only the glyphs in `text`, so a Japanese rounded font costs a few KB per image. */
async function font(text: string): Promise<ArrayBuffer> {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${FONT.replaceAll(' ', '+')}:wght@800&text=${encodeURIComponent(text)}`)).text();
  const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!src) throw new Error('font subset not found');
  return (await fetch(src)).arrayBuffer();
}

async function render({ fruits, extended, turn }: RoomThumbnail): Promise<Buffer> {
  const chips = [extended ? '拡張' : '通常', turn ? `${turn / 60}分` : '時間無制限'];
  const fruitWidth = fruits.length > 1 ? 210 : 400, fruitHeight = fruits.length > 2 ? 160 : 300;
  const [bg, logo, friends, illustrations, data] = await Promise.all([
    backdrop(), picture('images/game/logo.webp', 240, 118),
    picture('images/game/characters/friends.webp', 320, 300, 'contain'),
    Promise.all(fruits.map(fruit => picture(fruitIllustrations[fruit], fruitWidth, fruitHeight, 'contain'))),
    font(chips.join('')),
  ]);
  const response = new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: FONT, background: '#fff9ef' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
      <img alt="" src={bg} width={WIDTH} height={HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
      <img alt="" src={friends} width={320} height={300} style={{ position: 'absolute', right: 0, bottom: 32 }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
      <img alt="" src={logo} width={240} height={118} style={{ position: 'absolute', right: 40, top: 8 }} />
      <div style={{ position: 'absolute', left: 24, top: 16, width: 440, height: 330, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
        {fruits.map((fruit, index) =>
          /* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */
          <img key={fruit} alt={fruitNames[fruit]} src={illustrations[index]} width={fruitWidth} height={fruitHeight} />)}
      </div>
      <div style={{ position: 'absolute', left: 40, bottom: 22, display: 'flex', gap: 12 }}>
        {chips.map(chip => <div key={chip} style={{ display: 'flex', padding: '8px 20px', borderRadius: 6, background: '#fff8f0', color: '#634747', fontSize: 26 }}>{chip}</div>)}
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT, fonts: [{ name: FONT, data, weight: 800, style: 'normal' }] },
  );
  return sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

/** Every combination of rules is drawn once per instance (there are only a few dozen). */
export function getOgRoomImage(thumbnail: RoomThumbnail): Promise<Buffer> {
  const key = JSON.stringify(thumbnail);
  let job = images.get(key);
  if (!job) {
    job = render(thumbnail);
    job.catch(() => images.delete(key));
    images.set(key, job);
  }
  return job;
}
