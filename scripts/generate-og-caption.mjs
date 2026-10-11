#!/usr/bin/env node
// Regenerate the bundled caption when its text/style changes. Runtime OGP needs no font fetch.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { ImageResponse } from '@vercel/og';

const text = '#お菓子争奪戦争ぷぷりえーる';
const cssUrl = new URL('https://fonts.googleapis.com/css2');
cssUrl.searchParams.set('family', 'Noto Sans JP');
cssUrl.searchParams.set('text', text);
const cssResponse = await fetch(cssUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1' },
  signal: AbortSignal.timeout(30000),
});
if (!cssResponse.ok) throw new Error(`Font CSS: ${cssResponse.status}`);
const fontUrl = (await cssResponse.text()).match(/src: url\((.+)\) format\('(opentype|truetype)'\)/)?.[1];
if (!fontUrl) throw new Error('No TTF font was returned');
const fontResponse = await fetch(fontUrl, { signal: AbortSignal.timeout(30000) });
if (!fontResponse.ok) throw new Error(`Font: ${fontResponse.status}`);
const image = new ImageResponse(createElement('div', {
  style: { display: 'flex', alignItems: 'center', width: '100%', height: '100%', fontFamily: 'Caption', fontSize: 28, color: '#000' },
}, text), {
  width: 440, height: 48,
  fonts: [{ name: 'Caption', data: await fontResponse.arrayBuffer(), weight: 400, style: 'normal' }],
});
await writeFile(fileURLToPath(new URL('../public/og-cards/caption.png', import.meta.url)), Buffer.from(await image.arrayBuffer()));
console.log('[OK] OGP caption generated');
