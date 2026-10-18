import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import type { Catalog } from '@pplale/game-core';
import type { HistoryRepository } from './repository.ts';

/** Keep card art by content hash too: later replacements/deletions must not change old replays. */
export async function archiveCatalog(catalog: Catalog, history: HistoryRepository): Promise<Catalog> {
    const directory = process.env.CARD_IMAGE_DIR ?? new URL('../../../../public/', import.meta.url).pathname;
    const root = resolve(directory), present = new Set(await history.assetIds());
    const saved = structuredClone(catalog);
    for (const definition of Object.values(saved)) {
        const card = definition as typeof definition & { imageUrl?: string; imageHash?: string };
        if (!card.imageUrl) continue;
        const file = resolve(root, '.' + card.imageUrl);
        if (!file.startsWith(root + '/')) throw new Error('Card image outside the public directory');
        const mime = ({ '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' } as Record<string, string>)[extname(file)];
        if (!mime) throw new Error(`Unsupported archived card image ${card.id}`);
        const bytes = readFileSync(file), id = createHash('sha256').update(bytes).digest('hex');
        if (!present.has(id)) { await history.putAsset(id, bytes.toString('base64'), mime); present.add(id); }
        card.imageHash = id;
    }
    return saved;
}
