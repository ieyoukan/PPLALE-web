import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { fruitNames } from '@pplale/game-core';
import { fruitArt } from '@/lib/game/roomThumbnail';
import type { RoomThumbnail } from '@/lib/game/roomThumbnail';

// A room's share picture (Discord, X): the board's mat, the logo, the game's friends, and the fruits its rules allow.
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
  const title = 'ルームであそぼう！', chips = [extended ? '拡張プレイアブル' : '通常プレイアブル', turn ? `1ターン${turn / 60}分` : '時間無制限'];
  const [bg, logo, friends, data] = await Promise.all([
    backdrop(), picture('images/game/logo.webp', 300, 147),
    // The supplied illustration of the game's friends, as on the battle entrance.
    picture('images/game/characters/friends.webp', 440, 369, 'contain'),
    font(`${title}${chips.join('')}${fruits.map(fruit => fruitNames[fruit]).join('')}ぷりえ`),
  ]);
  const outline = '0 3px 0 #fff, 3px 0 0 #fff, -3px 0 0 #fff, 0 -3px 0 #fff';
  const response = new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', fontFamily: FONT, background: '#fff9ef' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
      <img alt="" src={bg} width={WIDTH} height={HEIGHT} style={{ position: 'absolute', left: 0, top: 0 }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
      <img alt="" src={friends} width={440} height={369} style={{ position: 'absolute', right: -10, bottom: -6 }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', width: 400, height: '100%', padding: '0 0 0 40px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori draws plain img */}
        <img alt="" src={logo} width={270} height={132} />
        <div style={{ display: 'flex', marginTop: 14, fontSize: 38, whiteSpace: 'nowrap', color: '#785858', textShadow: outline }}>{title}</div>
        {/* The fruits the decks may use, each in its own colour. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
          {fruits.map(fruit => <div key={fruit} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px 5px 7px', borderRadius: 30, background: '#fff', border: `3px solid ${fruitArt[fruit].tone}`, color: '#634747', fontSize: 17 }}>
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 14, background: fruitArt[fruit].tone }} />{fruitNames[fruit]}
          </div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {chips.map(chip => <div key={chip} style={{ display: 'flex', padding: '6px 16px', borderRadius: 30, background: '#fff', border: '3px solid #e8c8c8', color: '#634747', fontSize: 19 }}>{chip}</div>)}
        </div>
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
