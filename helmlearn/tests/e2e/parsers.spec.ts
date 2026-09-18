import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('Document parsers in the real browser', () => {
  test('PDF with a text layer is read by pdf.js and produces exercises', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sop-hot-work.pdf'));
    const row = page.getByTestId('material-row').first();
    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'processed', { timeout: 30_000 });
    await expect(row).toContainText('1 pages');
    await expect(row).toContainText(/\d+ exercises/);
    await expect(page.getByTestId('widget-qa')).toBeVisible();
    await page.screenshot({ path: 'test-results/shot-pdf-processed.png' });
  });

  test('DOCX is read by mammoth; a non-procedural document yields fewer types but does not fail', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('file-input').setInputFiles(path.resolve('tests/e2e/fixtures/sample.docx'));
    const row = page.getByTestId('material-row').first();
    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'processed', { timeout: 60_000 });
    await expect(row).toContainText(/\d+ pages/);
    await expect(page.getByTestId('toast').last()).toContainText(/exercises drafted/);
  });

  test('processing progress is visible mid-way (real stages, not a timer)', async ({ page }) => {
    await page.goto('/#/materials');
    const lng = page.getByTestId('material-row').filter({ hasText: 'LNG bunkering' });
    await lng.getByTestId('process').click();
    await expect(lng).toHaveAttribute('data-status', 'processing');
    await page.screenshot({ path: 'test-results/shot-processing.png' });
    await expect(lng).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test-results/shot-lng-done.png' });
  });
});
