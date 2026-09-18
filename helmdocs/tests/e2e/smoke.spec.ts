import { expect, test } from '@playwright/test';

test('all three screens render without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/#/templates');
  await expect(page.getByTestId('paper')).toBeVisible();
  await expect(page.getByTestId('template-chip')).toHaveCount(7);
  await expect(page.getByTestId('tenant')).toContainText('Harbourline Marine Services Pte Ltd');
  await page.screenshot({ path: 'test-results/shot-templates.png' });

  await page.goto('/#/assemble/d_02');
  await expect(page.getByTestId('paper')).toHaveAttribute('data-mode', 'live');
  await page.screenshot({ path: 'test-results/shot-assemble.png' });

  await page.goto('/#/library');
  await expect(page.getByTestId('charts')).toBeVisible();
  await expect(page.getByTestId('doc-row')).toHaveCount(22);
  await page.screenshot({ path: 'test-results/shot-library.png' });

  expect(errors, errors.join('\n')).toEqual([]);
});

test('localStorage unavailable: the app still works in memory and says so', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError: storage disabled'); } });
  });
  await page.goto('/#/library');
  await expect(page.getByTestId('storage-banner')).toContainText('Browser storage is unavailable');
  await expect(page.getByTestId('doc-row')).toHaveCount(22);
  await page.getByTestId('new-document').click();
  await expect(page).toHaveURL(/#\/assemble\/d_/);
  await page.getByTestId('open-settings').click();
  await expect(page.getByRole('dialog')).toContainText('storage unavailable');
});
