#!/usr/bin/env node
// Regenerate the profile OGP backdrop when the board mat changes. It is baked once, so the server only reads a file
// and needs no Japanese font for the logo's text.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WIDTH = 800, HEIGHT = 420, CHECK = 80, LOGO_W = 560, LOGO_H = 315;
const at = path => fileURLToPath(new URL(`../public/${path}`, import.meta.url));
const uri = (type, bytes) => `data:${type};base64,${bytes.toString('base64')}`;

// The board's mat: the check pattern under the cafe logo, multiplied at low opacity (BoardEmulator.module.css .logoLayer).
const check = uri('image/png', await sharp(at('images/check-pattern.png')).resize(CHECK, CHECK).png().toBuffer());
const logo = uri('image/svg+xml', await readFile(at('images/game/cafe-logo.svg')));
// The logo's art fills only the middle of its canvas (about 380×236 here), so step by the art, staggering each row.
const logos = [0, 1].flatMap(row => [-1, 0, 1, 2].map(col =>
  `<image href="${logo}" x="${-210 + col * 420 + row * 210}" y="${-110 + row * 250}" width="${LOGO_W}" height="${LOGO_H}"/>`)).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs><pattern id="check" width="${CHECK}" height="${CHECK}" patternUnits="userSpaceOnUse"><image href="${check}" width="${CHECK}" height="${CHECK}"/></pattern></defs>
  <rect width="100%" height="100%" fill="#fff9ef"/><rect width="100%" height="100%" fill="url(#check)"/>
  <g opacity=".15" style="mix-blend-mode:multiply">${logos}</g>
</svg>`;
await sharp(Buffer.from(svg)).jpeg({ quality: 80, mozjpeg: true }).toFile(at('og-cards/profile-bg.jpg'));
console.log('[OK] profile OGP background generated');
