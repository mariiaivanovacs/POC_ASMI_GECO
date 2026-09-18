import { expect, test } from '@playwright/test';
import path from 'node:path';

const FIXTURE = path.resolve('tests/e2e/fixtures/sop-hot-work.txt');

test.describe('Materials', () => {
  test('upload a text SOP, process it with the engine, play the generated widgets', async ({ page }) => {
    await page.goto('/#/materials');
    await expect(page.getByTestId('material-row')).toHaveCount(6);
    const statsBefore = await page.getByTestId('library-stats').textContent();

    await page.getByTestId('upload-category').selectOption('emergency');
    await page.getByTestId('file-input').setInputFiles(FIXTURE);
    await expect(page.getByTestId('material-row')).toHaveCount(7);
    const row = page.getByTestId('material-row').first();
    await expect(row).toContainText('sop-hot-work.txt');
    await expect(row).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('preview-empty')).toContainText('Not processed yet');

    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'processing');
    await expect(row.getByTestId('progress')).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    await expect(page.getByTestId('toast').first()).toContainText('exercises drafted');
    await expect(row).toContainText('exercises');

    const statsAfter = await page.getByTestId('library-stats').textContent();
    expect(statsAfter).not.toBe(statsBefore);
    expect(statsAfter).toMatch(/4 processed/);

    await expect(page.getByTestId('preview-title')).toContainText('sop-hot-work');
    await expect(page.getByTestId('widget-qa')).toBeVisible();
    await expect(page.getByTestId('widget-audio')).toBeVisible();
    await expect(page.getByTestId('widget-cards')).toBeVisible();
    await expect(page.getByTestId('widget-fill')).toBeVisible();

    // Q&A match: pick the first question, then the matching answer (the pairs come from the document's numbers)
    const q = page.getByTestId('qa-q').first();
    const qText = (await q.textContent()) || '';
    await q.click();
    const answers = page.getByTestId('qa-a');
    const n = await answers.count();
    for (let i = 0; i < n; i++) {
      await answers.nth(i).click();
      if ((await page.getByTestId('qa-count').textContent())?.startsWith('1')) break;
      await q.click();
    }
    await expect(page.getByTestId('qa-count')).toHaveText('1 / 3');
    expect(qText.length).toBeGreaterThan(3);

    // Flashcard flips to its meaning, "Got it" celebrates and counts
    await page.evaluate(() => { (window as unknown as { __bursts: number }).__bursts = 0; window.addEventListener('helmlearn:celebrate', () => { (window as unknown as { __bursts: number }).__bursts++; }); });
    const card = page.getByTestId('flashcard').first();
    await expect(card).toHaveAttribute('data-face', 'front');
    await card.getByTestId('flashcard-front').click();
    await expect(card).toHaveAttribute('data-face', 'back');
    await card.getByTestId('flashcard-known').click();
    await expect(page.getByTestId('cards-known')).toHaveText('1 / 3 known');
    await expect(card.getByTestId('flashcard-result')).toContainText('Got it');
    expect(await page.evaluate(() => (window as unknown as { __bursts: number }).__bursts)).toBeGreaterThanOrEqual(1);

    // Fill the blank: the first two tokens fill the two blanks; counter reflects correctness
    await page.getByTestId('token').nth(0).click();
    await page.getByTestId('token').nth(1).click();
    await expect(page.getByTestId('fill-count')).toHaveText(/[0-2] \/ 2/);

    // Audio widget answer locks and reveals the transcript
    await page.getByTestId('widget-audio-opt').first().click();
    await expect(page.getByTestId('widget-audio')).toContainText('Transcript');

    await page.getByTestId('open-builder').click();
    await expect(page).toHaveURL(/#\/builder\//);
    await expect(page.getByTestId('phone')).toBeVisible();
  });

  test('a queued demo material processes from its embedded text and survives reload', async ({ page }) => {
    await page.goto('/#/materials');
    const wah = page.getByTestId('material-row').filter({ hasText: 'Working at height' });
    await wah.getByTestId('process').click();
    await expect(wah).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    await expect(wah).toContainText(/\d+ exercises/);
    await page.reload();
    await expect(page.getByTestId('material-row').filter({ hasText: 'Working at height' })).toHaveAttribute('data-status', 'processed');
  });

  test('an unsupported file fails with a readable reason and can be deleted', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('file-input').setInputFiles({ name: 'notes.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ binary') });
    const row = page.getByTestId('material-row').first();
    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(row).toContainText('Unsupported file type');
    await expect(row.getByTestId('process')).toHaveText(/Retry/);
    page.on('dialog', (d) => d.accept());
    await row.getByTestId('delete-material').click();
    await expect(page.getByTestId('material-row')).toHaveCount(6);
  });

  test('an empty document reports no readable text', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('file-input').setInputFiles({ name: 'blank.txt', mimeType: 'text/plain', buffer: Buffer.from('   \n  ') });
    const row = page.getByTestId('material-row').first();
    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(row).toContainText(/empty|No readable text/);
  });

  test('category filter narrows the library', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByRole('button', { name: 'Emergency', exact: true }).click();
    await expect(page.getByTestId('material-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByTestId('material-row')).toHaveCount(6);
  });

  test('a URL can be added as a material, fetched through the dev proxy and processed like a file', async ({ page }) => {
    await page.goto('/#/materials');
    await expect(page.getByTestId('material-row')).toHaveCount(6);

    await expect(page.getByTestId('add-url')).toBeDisabled();
    await page.getByTestId('url-input').fill('example.com');
    await expect(page.getByTestId('add-url')).toBeEnabled();
    await page.getByTestId('add-url').click();

    await expect(page.getByTestId('material-row')).toHaveCount(7);
    const row = page.getByTestId('material-row').first();
    await expect(row).toContainText('example.com');
    await expect(row.getByTestId('material-source-link')).toHaveAttribute('href', 'https://example.com/');
    await expect(row).toHaveAttribute('data-status', 'queued');

    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
  });

  test('a URL that cannot be reached fails with a readable reason instead of hanging', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('url-input').fill('https://this-domain-should-not-exist-xyz123.test');
    await page.getByTestId('add-url').click();
    const row = page.getByTestId('material-row').first();
    await row.getByTestId('process').click();
    await expect(row).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
    await expect(row).toContainText(/reach|domain|fetch/i);
  });
});

test('flashcards fall back to fact cards, and to labelled samples when nothing is found', async ({ page }) => {
  await page.goto('/#/materials');
  await page.getByTestId('file-input').setInputFiles({ name: 'numbers-only.txt', mimeType: 'text/plain', buffer: Buffer.from('Yard rule sheet for crane operations today.\n1. Keep the exclusion zone at 5 m around the load path at all times.\n2. Hold the load at 300 mm for 10 seconds before the lift continues.\n3. Stop the lift when wind exceeds 15 knots on the anemometer.\n') });
  const row = page.getByTestId('material-row').first();
  await row.getByTestId('process').click();
  await expect(row).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
  await expect(page.getByTestId('flashcard')).toHaveCount(3);
  await expect(page.getByTestId('cards-sample-note')).toHaveCount(0);

  await page.getByTestId('file-input').setInputFiles({ name: 'prose.txt', mimeType: 'text/plain', buffer: Buffer.from('Welcome to the yard induction. This short note explains who to ask when you are unsure about anything on site. Your supervisor is your first point of contact, and the safety coordinator is always available at the quay office. Please read the notice boards every morning before work starts.') });
  const row2 = page.getByTestId('material-row').first();
  await row2.getByTestId('process').click();
  await expect(row2).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
  await expect(page.getByTestId('cards-sample-note')).toBeVisible();
  await expect(page.getByTestId('flashcard')).toHaveCount(3);
  await page.getByTestId('flashcard').first().getByTestId('flashcard-front').click();
  await expect(page.getByTestId('flashcard').first()).toHaveAttribute('data-face', 'back');
  await page.getByTestId('flashcard').first().getByTestId('flashcard-missed').click();
  await expect(page.getByTestId('flashcard').first().getByTestId('flashcard-result')).toContainText('Review again');
});
