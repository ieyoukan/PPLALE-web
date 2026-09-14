#!/usr/bin/env node
/**
 * assets/ の英語版 CSV・画像 ZIP から、英語カードデータと WebP 画像を生成する。
 *
 * 出力:
 *   src/data/en/{yojo,sweet,playable,tokenYojo}.json
 *   public/images/en/{yojo,sweet,playable}/*.webp
 *
 * 既存デッキとの互換性を保つため、カード ID とゲーム内判定用の type / fruit /
 * sweetType / version は日本語版データを正として引き継ぐ。
 *
 * 使い方: npm run cards:import-en
 */

import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'assets');
const outputDataDir = path.join(root, 'src', 'data', 'en');
const CARD_WIDTH = 800;
const CARD_QUALITY = 80;
const sourceDifferences = [];

const sourceData = {
  yojo: JSON.parse(await readFile(path.join(root, 'src/data/yojo.json'), 'utf8')).yojo,
  sweet: JSON.parse(await readFile(path.join(root, 'src/data/sweet.json'), 'utf8')).sweet,
  playable: JSON.parse(await readFile(path.join(root, 'src/data/playable.json'), 'utf8')).playable,
  tokenYojo: JSON.parse(await readFile(path.join(root, 'src/data/tokenYojo.json'), 'utf8')).tokenYojo,
};

const assetNames = await readdir(assetsDir);

function findAsset(suffix) {
  const matches = assetNames.filter((name) => name.endsWith(suffix));
  if (matches.length !== 1) {
    throw new Error(`${suffix} に一致する assets ファイルが1件ではありません: ${matches.join(', ')}`);
  }
  return path.join(assetsDir, matches[0]);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const character = content[index];

    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV の引用符が閉じられていません');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  if (rows[0]?.[0]?.startsWith('\uFEFF')) rows[0][0] = rows[0][0].slice(1);
  return rows;
}

async function readCsv(suffix) {
  return parseCsv(await readFile(findAsset(suffix), 'utf8'));
}

function normalizeEnglishName(value) {
  const normalized = value.normalize('NFKC').toLowerCase().replace(/[^\da-z]/g, '');
  return normalized === 'h0zuki' ? 'hozuki' : normalized;
}

function katakanaToHiragana(value) {
  return [...value].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character;
  }).join('');
}

function normalizeJapaneseName(value) {
  return katakanaToHiragana(
    value.normalize('NFKC').toLowerCase()
      .replace(/ワールド/g, '')
      .replace(/改\d*/g, '')
      .replace(/en$/i, '')
  )
    .replace(/[^\p{L}\p{N}]/gu, '');
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolute) : [absolute];
  }));
  return nested.flat();
}

function extractZip(zipPath, destination) {
  const result = spawnSync('tar', ['-xf', zipPath, '-C', destination], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`ZIP の展開に失敗しました: ${path.basename(zipPath)}\n${result.stderr}`);
  }
}

function numeric(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} が整数ではありません: ${value}`);
  return parsed;
}

function assertStats(card, { cost, attack, hp }, sourceLabel) {
  const differences = [
    ['cost', card.cost, cost],
    ['attack', card.attack, attack],
    ['hp', card.hp, hp],
  ].filter(([, current, english]) => current !== english);

  if (differences.length > 0) {
    sourceDifferences.push(
      `${sourceLabel} / ${card.id}: ` +
      differences.map(([key, current, english]) => `${key}=${current}(ja)/${english}(en)`).join(', ')
    );
  }
}

async function convertImage(source, output) {
  await mkdir(path.dirname(output), { recursive: true });
  await sharp(source, { failOn: 'none' })
    .resize({ width: CARD_WIDTH, withoutEnlargement: true })
    .webp({ quality: CARD_QUALITY })
    .toFile(output);
}

async function mapLimit(items, limit, task) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

function findHeaderIndex(rows, header) {
  const index = rows.findIndex((row) => row.includes(header));
  if (index < 0) throw new Error(`CSV ヘッダー ${header} が見つかりません`);
  return index;
}

async function buildYojoCards(extractedFiles) {
  const specs = [
    ['イチゴカード英語版.csv', 'Strawberry'],
    ['ぶどうカード英語版.csv', 'Grape'],
    ['メロンカード英語版.csv', 'Melon'],
    ['オレンジカード英語版.csv', 'Orange'],
  ];
  const rowsByCode = new Map();

  for (const [csvSuffix] of specs) {
    const rows = await readCsv(csvSuffix);
    const headerIndex = findHeaderIndex(rows, 'LG-Code');
    const header = rows[headerIndex];
    const codeIndex = header.indexOf('LG-Code');
    const costIndex = header.indexOf('Cost');
    const attackIndex = header.indexOf('ATK');
    const hpIndex = header.indexOf('VIT');
    const effectIndex = header.indexOf('Effect');

    for (const row of rows.slice(headerIndex + 1)) {
      if (!/^\d+$/.test(row[codeIndex]?.trim() ?? '')) continue;
      const code = numeric(row[codeIndex].trim(), `${csvSuffix} LG-Code`);
      if (rowsByCode.has(code)) throw new Error(`LG-Code ${code} が重複しています`);
      rowsByCode.set(code, {
        name: row[0].trim(),
        cost: numeric(row[costIndex], `${csvSuffix} Cost`),
        attack: numeric(row[attackIndex], `${csvSuffix} ATK`),
        hp: numeric(row[hpIndex], `${csvSuffix} VIT`),
        effect: row[effectIndex]?.trim() ?? '',
      });
    }
  }

  if (rowsByCode.size !== sourceData.yojo.length) {
    throw new Error(`幼女 CSV は ${sourceData.yojo.length} 件必要ですが ${rowsByCode.size} 件でした`);
  }

  const yojoAssets = extractedFiles.flatMap((file) => {
    if (path.extname(file).toLowerCase() !== '.png') return [];
    const match = path.basename(file, path.extname(file)).match(/^(strawberry|grape|melon|orange)(\d{3})(.+)en1$/i);
    if (!match) return [];
    return [{
      file,
      fruit: match[1].toLowerCase(),
      stats: match[2],
      name: normalizeEnglishName(match[3]),
      isToken: /token/i.test(match[3]),
    }];
  });

  const imageNameOverrides = new Map([
    ['y_114', 'rimachan'],
  ]);
  const conversions = [];
  const missingEnglishImages = [];

  const cards = sourceData.yojo.map((card, code) => {
    const row = rowsByCode.get(code);
    if (!row) throw new Error(`${card.id} に対応する英語 CSV 行がありません`);
    assertStats(card, row, `LG-Code ${code}`);

    const expectedImageName = imageNameOverrides.get(card.id) ?? normalizeEnglishName(row.name);
    const image = yojoAssets.find((asset) =>
      !asset.isToken &&
      asset.fruit === card.fruit &&
      asset.name === expectedImageName
    );

    let imageUrl = card.imageUrl;
    if (image) {
      const csvStats = `${row.cost}${row.attack}${row.hp}`;
      if (image.stats !== csvStats) {
        throw new Error(`${card.id} の英語画像内能力値が不一致です: ${image.stats}/${csvStats}`);
      }
      imageUrl = `/images/en/yojo/${card.id}.webp`;
      conversions.push({ source: image.file, imageUrl });
    } else {
      missingEnglishImages.push(card.id);
    }

    return {
      ...card,
      name: row.name,
      imageUrl,
      cost: row.cost,
      hp: row.hp,
      attack: row.attack,
      effect: row.effect,
      role: card.role,
    };
  });

  const tokenText = {
    yt_0: {
      name: 'Young lady Uyuchi',
      effect: 'When this little girl is destroyed, put a “Beautiful woman Uyuchi” into your hand. When this little girl comes into play from your hand, if there are already 5 or more little girls with the name “Uyuchi” in their names of the Strawberry type that you’ve played from your hand during this match, gains +3/+3 and Fast eater.',
      imageStats: '222',
    },
    yt_1: {
      name: 'Beautiful woman Uyuchi',
      effect: 'When this little girl comes into play from your hand, if there are already 5 or more little girls with the name “Uyuchi” in their names of the Strawberry type that you’ve played from your hand during this match, gains +3/+3 and Fast eater.',
      imageStats: '333',
    },
  };

  const tokenCards = sourceData.tokenYojo.map((card) => {
    const text = tokenText[card.id];
    if (!text) throw new Error(`${card.id} の英語トークン定義がありません`);
    const image = yojoAssets.find((asset) =>
      asset.isToken && asset.fruit === 'strawberry' && asset.stats === text.imageStats
    );
    if (!image) throw new Error(`${card.id} の英語トークン画像がありません`);
    const imageUrl = `/images/en/yojo/${card.id}.webp`;
    conversions.push({ source: image.file, imageUrl });
    return { ...card, name: text.name, effect: text.effect, imageUrl };
  });

  return { cards, tokenCards, conversions, missingEnglishImages };
}

async function buildSweetCards(extractedFiles) {
  const rows = await readCsv('お菓子カード英語版.csv');
  const headerIndex = findHeaderIndex(rows, 'S-Code');
  const header = rows[headerIndex];
  const codeIndex = header.indexOf('S-Code');
  const costIndex = header.indexOf('Cost');
  const rowsByCode = new Map();

  for (const row of rows.slice(headerIndex + 1)) {
    if (!/^\d+$/.test(row[codeIndex]?.trim() ?? '')) continue;
    const code = numeric(row[codeIndex].trim(), 'S-Code');
    rowsByCode.set(code, {
      name: row[0].trim(),
      cost: numeric(row[costIndex], `S-Code ${code} Cost`),
      effectParts: row.slice(costIndex + 1).map((cell) => cell.trim()).filter(Boolean),
    });
  }

  if (rowsByCode.size !== sourceData.sweet.length) {
    throw new Error(`お菓子 CSV は ${sourceData.sweet.length} 件必要ですが ${rowsByCode.size} 件でした`);
  }

  const sharedEffects = new Map();
  for (const codes of [[0, 1, 2, 3, 4, 5], [28, 29, 30, 31]]) {
    const parts = codes.flatMap((code) => rowsByCode.get(code).effectParts);
    const effect = [
      ...parts.filter((part) => !/^x=\d+/i.test(part)),
      ...parts.filter((part) => /^x=\d+/i.test(part)).sort((left, right) => {
        const leftIndex = Number(left.match(/^x=(\d+)/i)?.[1]);
        const rightIndex = Number(right.match(/^x=(\d+)/i)?.[1]);
        return leftIndex - rightIndex;
      }),
    ].join('\n');
    for (const code of codes) sharedEffects.set(code, effect);
  }

  const sweetAssets = extractedFiles.flatMap((file) => {
    if (path.extname(file).toLowerCase() !== '.png' || !file.includes('お菓子EN')) return [];
    return [{ file, name: normalizeJapaneseName(path.basename(file, path.extname(file))) }];
  });
  const imageNameOverrides = new Map([
    ['s_6', normalizeJapaneseName('ネコカフェオレEN')],
    ['s_7', normalizeJapaneseName('犬カフェオレEN')],
    ['s_21', normalizeJapaneseName('ぷるぷるギガプリンEN')],
    ['s_43', normalizeJapaneseName('犬さん団子EN')],
    ['s_44', normalizeJapaneseName('全力応援ぷぷりえーるEN')],
  ]);
  const conversions = [];

  const cards = sourceData.sweet.map((card, code) => {
    const row = rowsByCode.get(code);
    if (!row) throw new Error(`${card.id} に対応する英語 CSV 行がありません`);
    assertStats(card, { cost: row.cost, attack: card.attack, hp: card.hp }, `S-Code ${code}`);

    const sourceStem = path.basename(card.imageUrl, path.extname(card.imageUrl));
    const expectedImageName = imageNameOverrides.get(card.id) ?? normalizeJapaneseName(sourceStem);
    const matches = sweetAssets.filter((asset) => asset.name === expectedImageName);
    if (matches.length !== 1) {
      throw new Error(`${card.id} の英語画像が1件ではありません (${expectedImageName}): ${matches.map((match) => match.file).join(', ')}`);
    }

    const imageUrl = `/images/en/sweet/${card.id}.webp`;
    conversions.push({ source: matches[0].file, imageUrl });
    return {
      ...card,
      name: row.name,
      imageUrl,
      cost: row.cost,
      effect: sharedEffects.get(code) ?? row.effectParts.join('\n'),
    };
  });

  return { cards, conversions };
}

async function buildPlayableCards(extractedFiles) {
  const rows = await readCsv('プレイアブル英語版.csv');
  const headerRows = [];
  const blocks = [];

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!cell.includes('【Playable character】')) return;
      headerRows.push(rowIndex);
      blocks.push({
        rowIndex,
        sourceName: row[columnIndex - 1]?.trim() ?? '',
        englishName: cell.replace('【Playable character】', '').trim(),
        effectColumn: columnIndex,
      });
    });
  });

  const distinctHeaderRows = [...new Set(headerRows)].sort((a, b) => a - b);
  for (const block of blocks) {
    const nextHeader = distinctHeaderRows.find((rowIndex) => rowIndex > block.rowIndex) ?? rows.length;
    const parts = rows.slice(block.rowIndex + 1, nextHeader)
      .map((row) => row[block.effectColumn]?.trim())
      .filter(Boolean);
    if (block.sourceName === 'しゅれい') parts.unshift('Starting MP: 3', 'Max MP: 20');
    block.effect = parts.join(' ')
      .replace(/\s+/g, ' ')
      .replace(/ (?=・?(?:Common skill|Unique (?:passive )?skill))/g, '\n');
  }

  const normalizedSourceName = (value) => normalizeJapaneseName(value).replace(/店長$/, '');
  const blocksByName = new Map(blocks.map((block) => [normalizedSourceName(block.sourceName), block]));
  if (blocksByName.size !== sourceData.playable.length) {
    throw new Error(`プレイアブル CSV は ${sourceData.playable.length} 件必要ですが ${blocksByName.size} 件でした`);
  }

  const playableAssets = extractedFiles.flatMap((file) => {
    if (path.extname(file).toLowerCase() !== '.png' || !file.includes('プレイアブルEN')) return [];
    const stem = path.basename(file, path.extname(file)).replace(/プレイアブルen$/i, '');
    return [{ file, name: normalizeJapaneseName(stem) }];
  });
  const conversions = [];

  const cards = sourceData.playable.map((card) => {
    const block = blocksByName.get(normalizedSourceName(card.name));
    if (!block) throw new Error(`${card.id} (${card.name}) に対応する英語 CSV ブロックがありません`);
    const matches = playableAssets.filter((asset) => asset.name === normalizedSourceName(card.name));
    if (matches.length !== 1) throw new Error(`${card.id} の英語画像が1件ではありません`);
    const imageUrl = `/images/en/playable/${card.id}.webp`;
    conversions.push({ source: matches[0].file, imageUrl });
    return { ...card, name: block.englishName, imageUrl, effect: block.effect };
  });

  return { cards, conversions };
}

async function writeJson(filename, key, value) {
  await mkdir(outputDataDir, { recursive: true });
  await writeFile(
    path.join(outputDataDir, filename),
    `${JSON.stringify({ [key]: value }, null, 2)}\n`,
    'utf8'
  );
}

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'pplale-english-cards-'));
try {
  for (const zipName of [
    '幼女ENイチゴ.zip',
    '幼女ENぶどう.zip',
    '幼女ENメロン.zip',
    '幼女ENオレンジ.zip',
    'お菓子EN.zip',
    'プレイアブルEN.zip',
  ]) {
    extractZip(findAsset(zipName), temporaryDirectory);
  }

  const extractedFiles = await listFiles(temporaryDirectory);
  const yojo = await buildYojoCards(extractedFiles);
  const sweet = await buildSweetCards(extractedFiles);
  const playable = await buildPlayableCards(extractedFiles);
  const conversions = [...yojo.conversions, ...sweet.conversions, ...playable.conversions];

  await mapLimit(conversions, 6, async ({ source, imageUrl }, index) => {
    await convertImage(source, path.join(root, 'public', imageUrl));
    if ((index + 1) % 25 === 0 || index + 1 === conversions.length) {
      console.log(`[画像] ${index + 1}/${conversions.length}`);
    }
  });

  await Promise.all([
    writeJson('yojo.json', 'yojo', yojo.cards),
    writeJson('sweet.json', 'sweet', sweet.cards),
    writeJson('playable.json', 'playable', playable.cards),
    writeJson('tokenYojo.json', 'tokenYojo', yojo.tokenCards),
  ]);

  console.log('---');
  console.log(`英語カードデータ: ${yojo.cards.length + sweet.cards.length + playable.cards.length + yojo.tokenCards.length} 件`);
  console.log(`英語画像: ${conversions.length} 件`);
  if (yojo.missingEnglishImages.length > 0) {
    console.warn(`英語画像なし（日本語画像へフォールバック）: ${yojo.missingEnglishImages.join(', ')}`);
  }
  if (sourceDifferences.length > 0) {
    console.warn('日本語版との能力値差分:');
    for (const difference of sourceDifferences) console.warn(`  - ${difference}`);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
