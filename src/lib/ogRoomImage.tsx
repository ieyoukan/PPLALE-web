import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { fruitNames } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { fruitIllustrations, roomThumbnailTheme } from '@/lib/game/roomThumbnail';
import type { RoomThumbnail } from '@/lib/game/roomThumbnail';

// One public rule poster for thumbnails, loading and OGP. Room names, players and invite secrets
// never enter this renderer. The poster's fruit colours are deliberately pale, as in the supplied regulation artwork.
const WIDTH = 800, HEIGHT = 420;
const TITLE_FONT = 'Mochiy Pop One', BODY_FONT = 'Zen Maru Gothic';
const INK = '#634747'; // --brand-cocoa-deep in brand.css; Satori needs a concrete colour.
const images = new Map<string, Promise<Buffer>>();
const files = new Map<string, Promise<string>>();
const fonts = new Map<string, Promise<ArrayBuffer>>();
const COPY = `${Object.values(fruitNames).join('')}ルール通常拡張プレイアブルあり時間無制限ターン分まで・0123456789`;

/** Local, catalog-owned artwork as a PNG data URL; Satori does not decode WebP. */
function picture(path: string, width: number, height: number) {
  const key = `${path}:${width}x${height}`;
  let job = files.get(key);
  if (!job) {
    job = readFile(join(process.cwd(), 'public', path)).then(bytes => sharp(bytes).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()).then(png => `data:image/png;base64,${png.toString('base64')}`);
    job.catch(() => files.delete(key)); files.set(key, job);
  }
  return job;
}

/** Match the site's shared heading/body families; one subset covers every possible rule poster. */
function font(family: string, weight: 400 | 700): Promise<ArrayBuffer> {
  let job = fonts.get(family);
  if (!job) {
    job = (async () => {
      const response = await fetch(`https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weight}&text=${encodeURIComponent(COPY)}`);
      if (!response.ok) throw new Error('rule font stylesheet unavailable');
      const css = await response.text();
      const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
      if (!src) throw new Error('rule font subset not found');
      const data = await fetch(src);
      if (!data.ok) throw new Error('rule font unavailable');
      return data.arrayBuffer();
    })();
    job.catch(() => fonts.delete(family)); fonts.set(family, job);
  }
  return job;
}

async function render(thumbnail: RoomThumbnail): Promise<Buffer> {
  const { fruits, extended, turn } = thumbnail;
  const theme = roomThumbnailTheme(thumbnail);
  const featured = Object.values(displayCards).filter(card => card.type === 'yojo' && card.fruit === theme.fruit && card.cost >= 4).slice(0, 2);
  // The fan only shows cards legal in this environment, including the chosen playable category.
  const cards = [featured[0], displayCards[extended ? 'p_6' : 'p_1'], featured[1]];
  const [logo, hero, smallFruit, cardArt, titleFont, bodyFont] = await Promise.all([
    picture('images/game/logo.webp', 250, 120), picture(fruitIllustrations[theme.fruit], 190, 200),
    Promise.all(fruits.filter(fruit => fruit !== theme.fruit).map(fruit => picture(fruitIllustrations[fruit], 76, 82))),
    Promise.all(cards.map(card => picture(card.imageUrl.replace(/^\/images\//, '/og-cards/').replace(/\.webp$/i, '.png'), 150, 225))),
    font(TITLE_FONT, 400), font(BODY_FONT, 700),
  ]);
  const response = new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', background: theme.background, color: INK, fontFamily: BODY_FONT }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */}
      <img alt="" src={hero} width={310} height={326} style={{ position: 'absolute', right: -60, top: -128, opacity: .1, transform: 'rotate(18deg)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */}
      <img alt="" src={hero} width={260} height={274} style={{ position: 'absolute', left: -110, bottom: -145, opacity: .1, transform: 'rotate(-15deg)' }} />
      <div style={{ position: 'absolute', left: -30, top: 85, width: 870, height: 20, background: '#fff8f080', transform: 'rotate(-10deg)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */}
      <img alt="ぷぷりえーる" src={logo} width={250} height={120} style={{ position: 'absolute', left: 20, top: 10 }} />
      <div style={{ position: 'absolute', left: 298, top: 29, display: 'flex', fontFamily: TITLE_FONT, fontSize: 42 }}>{fruitNames[theme.fruit]}ルール</div>
      <div style={{ position: 'absolute', left: 300, top: 92, display: 'flex', fontSize: 23 }}>{extended ? '拡張プレイアブルあり' : '通常プレイアブル'}</div>
      <div style={{ position: 'absolute', left: 20, right: 20, top: 145, height: 57, display: 'flex', alignItems: 'center', paddingLeft: 22, background: theme.band, fontFamily: TITLE_FONT, fontSize: 27 }}>{fruits.map(fruit => fruitNames[fruit]).join('・')}</div>
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */}
      <img alt={fruitNames[theme.fruit]} src={hero} width={190} height={200} style={{ position: 'absolute', left: 24, top: 207 }} />
      <div style={{ position: 'absolute', left: 210, top: 221, display: 'flex', gap: 3 }}>
        {smallFruit.map((src, index) =>
          /* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */
          <img key={index} alt="" src={src} width={76} height={82} />)}
      </div>
      <div style={{ position: 'absolute', left: 216, top: smallFruit.length ? 320 : 266, display: 'flex', flexDirection: 'column', fontSize: 27 }}>
        {turn ? <><span style={{ fontSize: 20 }}>1ターン</span><span>{turn / 60}分</span></> : <><span>時間</span><span>無制限</span></>}
      </div>
      {cardArt.map((src, index) =>
        /* eslint-disable-next-line @next/next/no-img-element -- Satori renders local image data */
        <img key={cards[index].id} alt={cards[index].name} src={src} width={128} height={192} style={{ position: 'absolute', left: 470 + index * 84, top: index === 1 ? 200 : 212, transform: `rotate(${[-15, 0, 15][index]}deg)` }} />)}
    </div>,
    { width: WIDTH, height: HEIGHT, fonts: [{ name: TITLE_FONT, data: titleFont, weight: 400, style: 'normal' }, { name: BODY_FONT, data: bodyFont, weight: 700, style: 'normal' }] },
  );
  return sharp(Buffer.from(await response.arrayBuffer())).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

/** Identical rules share their in-flight render and cached result. Failed renders remain retryable. */
export function getOgRoomImage(thumbnail: RoomThumbnail): Promise<Buffer> {
  const key = JSON.stringify(thumbnail);
  let job = images.get(key);
  if (!job) {
    job = render(thumbnail);
    job.catch(() => images.delete(key)); images.set(key, job);
  }
  return job;
}
