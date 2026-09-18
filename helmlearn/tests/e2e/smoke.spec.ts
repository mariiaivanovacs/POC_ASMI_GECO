import { expect, test } from '@playwright/test';

test('all three screens render without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/#/materials');
  await expect(page.getByTestId('library')).toBeVisible();
  await expect(page.getByTestId('material-row')).toHaveCount(6);
  await page.screenshot({ path: 'test-results/shot-materials.png', fullPage: true });

  await page.goto('/#/builder/hw');
  await expect(page.getByTestId('phone')).toBeVisible();
  await page.screenshot({ path: 'test-results/shot-builder.png', fullPage: true });

  await page.goto('/#/learners');
  await expect(page.getByTestId('cohort')).toBeVisible();
  await page.screenshot({ path: 'test-results/shot-learners.png', fullPage: true });

  expect(errors, errors.join('\n')).toEqual([]);
});
