import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test.describe(`about book ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    test('turns pages, jumps chapters and enlarges portrait pages', async ({ page }, info) => {
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('/about/');
      const book = page.getByRole('region', { name: 'ぷぷりえーるの本' });
      const status = book.getByRole('status');
      await expect(status).toContainText('1 / 23');
      await expect(book.getByRole('button', { name: '前のページ', exact: true })).toBeDisabled();
      await book.getByRole('button', { name: '次のページ', exact: true }).click();
      await expect(book.getByRole('img', { name: 'ルール説明① 対戦前の準備・勝利条件・カードの見方' })).toBeVisible();
      await book.focus();
      await page.keyboard.press('ArrowLeft');
      await expect(status).toContainText('1 / 23');
      const cover = book.getByRole('img', { name: 'あらすじ', exact: true });
      await expect(cover).toBeVisible();
      const bounds = await cover.boundingBox();
      await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * .25, bounds.y + bounds.height / 2, { steps: 10 });
      await page.mouse.up();
      await expect(status).toContainText('2 / 23');
      await expect(book.getByRole('img', { name: 'ルール説明① 対戦前の準備・勝利条件・カードの見方' })).toBeVisible();
      await expect.poll(() => book.getByRole('img', { name: 'ルール説明① 対戦前の準備・勝利条件・カードの見方' }).evaluate(img => getComputedStyle(img.parentElement).transform)).toBe('none');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath('about-book.png'), fullPage: true });
      await page.getByRole('button', { name: '🍇 FAQを開く', exact: true }).click();
      await expect(status).toContainText('17 / 23');
      await expect(page.getByRole('button', { name: '🍇 FAQを開く', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await book.focus();
      await page.keyboard.press('End');
      await expect(status).toContainText('23 / 23');
      await expect(book.getByRole('button', { name: '次のページ', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: '🃏 ルールを開く', exact: true }).click();
      for (let i = 0; i < 7; i++) await book.getByRole('button', { name: '次のページ', exact: true }).click();
      const portrait = book.getByRole('img', { name: 'キーワード早見表', exact: true });
      await expect(portrait).toBeVisible();
      await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await book.getByRole('button', { name: 'このページを大きく見る', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'キーワード早見表', exact: true });
      await expect(dialog).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', '6面ダイスだけでランダム効果の裁定を行うやり方');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(status).toContainText('9 / 23');
      await book.getByRole('button', { name: '23ページ クレジット', exact: true }).click();
      await expect(status).toContainText('23 / 23');
      await expect(book.getByRole('button', { name: '23ページ クレジット', exact: true })).toHaveAttribute('aria-current', 'page');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

    test('shows docs/game-rules.md as text', async ({ page }, info) => {
      await page.goto('/about/');
      await page.getByRole('tab', { name: /もじでよむ/ }).click();
      await expect(page).toHaveURL(/#text$/);
      const doc = page.getByRole('article', { name: 'ルール・裁定集' });
      await expect(doc.getByRole('heading', { level: 2, name: '1. 対戦開始と初期手札' })).toBeVisible();
      await expect(doc).not.toContainText('この会話');
      await expect(doc.getByRole('cell', { name: '早食い', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'ぶどうタイプのFAQ', exact: true }).click();
      await expect(doc.getByRole('heading', { level: 2, name: '5. ぶどうタイプのFAQ' })).toBeInViewport();
      await page.screenshot({ path: info.outputPath('about-text.png') });
      await page.reload();
      await expect(page.getByRole('tab', { name: /もじでよむ/ })).toHaveAttribute('aria-selected', 'true');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

test('editor hides unlimited Ex counters and keeps limited counters editable', async ({ page }) => {
  await page.goto('/game/editor/');
  await page.getByRole('button', { name: /新しい盤面を作る/ }).click();
  await page.getByRole('button', { name: 'あなたの設定', exact: true }).click();
  for (const name of ['魅惑の水煙', '不思議の国のアリス', 'ダブルダガー']) {
    const toggle = page.getByRole('button', { name, exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: `${name}の残り回数`, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'ここあの献身', exact: true }).click();
  const healing = page.getByRole('group', { name: 'ここあの献身の残り回数', exact: true });
  await expect(healing).toContainText('3');
  await healing.getByRole('button', { name: 'ここあの献身の残り回数を1減らす', exact: true }).click();
  await expect(healing).toContainText('2');
  await page.reload();
  await page.getByRole('button', { name: 'あなたの設定', exact: true }).click();
  await expect(page.getByRole('button', { name: '魅惑の水煙', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: '魅惑の水煙の残り回数', exact: true })).toHaveCount(0);
});
