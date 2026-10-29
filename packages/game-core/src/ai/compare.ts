// CPU同士の対戦結果を逐次検定（SPRT）で比較する。差が明確なら早く打ち切り、互角を改善と誤認しない。

export interface CompareRule {
    /** Win rate that counts as stronger (the alternative). Equal strength (0.5) is the null. */
    better: number;
    /** Chance of calling an equal one stronger, and of missing one that is `better`. */
    alpha: number;
    beta: number;
    /** Matches after which an open comparison counts as not stronger. */
    max: number;
}
export const defaultCompareRule: CompareRule = { better: 0.55, alpha: 0.05, beta: 0.05, max: 600 };

/**
 * True: stronger. False: not stronger. Null: play on. Draws and matches without a winner are left
 * out of `wins` / `matches`. With the default rule a CPU as strong as the other passes 3–4% of the
 * time, one winning 58% passes 96%; an even comparison takes about 400 matches.
 */
export function compareVerdict({ wins, matches }: { wins: number; matches: number }, rule: CompareRule = defaultCompareRule): boolean | null {
    const llr = wins * Math.log(rule.better / 0.5) + (matches - wins) * Math.log((1 - rule.better) / 0.5);
    if (llr >= Math.log((1 - rule.beta) / rule.alpha)) return true;
    if (llr <= Math.log(rule.beta / (1 - rule.alpha))) return false;
    return matches >= rule.max ? false : null;
}
