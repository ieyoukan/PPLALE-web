// The CPU server (services/cpu-server). It serves the value model さいきょう plays with and
// receives finished matches against さいきょう, which it keeps training on. Without
// NEXT_PUBLIC_CPU_SERVER_URL none of this is active and さいきょう uses the model built into the app.
import type { Command, Deck } from '@pplale/game-core';

export const cpuServerUrl = (process.env.NEXT_PUBLIC_CPU_SERVER_URL ?? '').replace(/\/+$/, '') || null;

/** As received. The CPU checks that it fits this build before using it (board/cpuThink.ts). */
export interface ServedModel { version: string; model: unknown }

const CONSENT_KEY = 'pplale-cpu-learning-consent-v1';
/** Whether this browser agreed to send its matches against さいきょう. Asked before the first one. */
export const learningConsent = {
  given() {
    try { return localStorage.getItem(CONSENT_KEY) === 'agreed'; } catch { return false; }
  },
  set(agreed: boolean) {
    try {
      if (agreed) localStorage.setItem(CONSENT_KEY, 'agreed');
      else localStorage.removeItem(CONSENT_KEY);
    } catch { /* Without storage the question is simply asked again. */ }
  },
};

let served: Promise<ServedModel | null> | undefined;
/** The server's current model, asked once per page. Null without a server or when it does not answer in time. */
export function servedModel(): Promise<ServedModel | null> {
  served ??= (async () => {
    if (!cpuServerUrl) return null;
    try {
      const response = await fetch(`${cpuServerUrl}/model`, { signal: AbortSignal.timeout(4000) });
      const body = response.ok ? await response.json() as Partial<ServedModel> | null : null;
      return typeof body?.version === 'string' && body.model ? { version: body.version, model: body.model } : null;
    } catch { return null; }
  })();
  return served;
}

/**
 * Sends a finished match against さいきょう. Only the cards of both decks, the shuffle seed and the
 * moves leave the browser: no names, no deck names, no account. The server replays it to find the winner.
 */
export function reportMatch(match: { seed: number; decks: [Deck, Deck]; commands: Command[]; model: string }) {
  if (!cpuServerUrl) return;
  const cards = ({ yojo, sweet, playable }: Deck) => ({ yojo, sweet, playable });
  const body = JSON.stringify({ level: 'master', model: match.model, seed: match.seed, decks: match.decks.map(cards), commands: match.commands });
  // A lost report is not worth bothering the player with.
  void fetch(`${cpuServerUrl}/reports`, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body }).catch(() => {});
}
