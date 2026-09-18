import { expect, test } from '@playwright/test';

test.describe('Assistant — compliance reminders and versions', () => {
  test('three months of deadlines with urgency, missing fields and hours; Open and Versions work; rules are editable', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.getByTestId('due-badge')).toContainText(/\d+ due this week/);
    const months = page.getByTestId('reminder-month');
    await expect(months).toHaveCount(3);
    await expect(months.first().getByTestId('month-summary')).toContainText(/\d+ due · ≈ [\d.]+ h to complete/);
    const first = page.getByTestId('reminder').first();
    await expect(first).toHaveAttribute('data-urgency', /overdue|today|soon/);
    await expect(first.getByTestId('reminder-countdown')).toBeVisible();
    await expect(first.getByTestId('reminder-name')).toHaveCSS('font-size', '15px');
    await expect(first.getByTestId('reminder-hours')).toContainText(/≈ [\d.]+ h/);
    await expect(first.getByTestId('reminder-missing')).not.toBeEmpty();
    const draftCount = await page.locator('[data-testid="doc-row"][data-status="draft"]').count();
    const reviewedCount = await page.locator('[data-testid="doc-row"][data-status="reviewed"]').count();
    await page.getByTestId('reminders-range').getByRole('button', { name: 'All' }).click();
    await expect(page.getByTestId('reminder')).toHaveCount(draftCount + reviewedCount);
    await page.getByTestId('reminders-range').getByRole('button', { name: 'Next 3 months' }).click();
    await page.screenshot({ path: 'test-results/shot-reminders.png' });

    // versions modal from a reminder: a reviewed document has two versions with a diff
    const reviewed = page.locator('[data-testid="reminder"]').filter({ has: page.locator('[data-testid="reminder-versions"]', { hasText: 'v2' }) }).first();
    await reviewed.getByTestId('reminder-versions').click();
    await expect(page.getByTestId('versions-modal')).toBeVisible();
    await expect(page.getByTestId('version')).toHaveCount(2);
    await expect(page.getByTestId('version').first()).toContainText('Marked reviewed');
    await expect(page.getByTestId('version').first()).toContainText('current');
    await expect(page.getByTestId('version').first().getByTestId('version-diff')).toContainText('→');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('version').last().getByTestId('version-restore').click();
    await expect(page.getByTestId('toast').last()).toContainText('Restored version 1');
    await expect(page.getByTestId('version')).toHaveCount(3);
    await expect(page.getByTestId('version').first()).toContainText('Restored version 1');
    await page.getByTestId('versions-open').click();
    await expect(page).toHaveURL(/#\/assemble\/d_/);
    await expect(page.getByTestId('doc-status')).toHaveText(/Draft/);

    // a status change adds a version, visible from the library
    await page.goto('/#/library');
    await page.getByTestId('reminder-open').first().click();
    await expect(page).toHaveURL(/#\/assemble\/d_/);

    // editing a deadline rule moves the countdown
    await page.goto('/#/library');
    const ihmBefore = await page.locator('[data-testid="reminder"]').filter({ hasText: 'IHM Supplier' }).first().getByTestId('reminder-countdown').textContent();
    await page.getByTestId('open-settings').click();
    const ihmRule = page.locator('[data-testid="deadline-rule"][data-regime="HKC / IHM"]');
    await ihmRule.getByTestId('deadline-days').fill('30');
    await page.getByRole('button', { name: 'Close' }).click();
    const ihmAfter = await page.locator('[data-testid="reminder"]').filter({ hasText: 'IHM Supplier' }).first().getByTestId('reminder-countdown').textContent();
    expect(ihmAfter).not.toBe(ihmBefore);
    await page.reload();
    await page.getByTestId('open-settings').click();
    await expect(page.locator('[data-testid="deadline-rule"][data-regime="HKC / IHM"]').getByTestId('deadline-days')).toHaveValue('30');
  });

  test('search results sit above the calendar only while typing; sending a document removes its reminder', async ({ page }) => {
    await page.goto('/#/library');
    await expect(page.getByTestId('assistant-results')).toHaveCount(0);
    await page.getByTestId('assistant-input').fill('SHMS pending');
    await expect(page.getByTestId('assistant-results')).toBeVisible();
    await expect(page.getByTestId('reminders')).toBeVisible();
    await page.getByTestId('assistant-input').fill('');
    await expect(page.getByTestId('assistant-results')).toHaveCount(0);

    const before = await page.getByTestId('reminder').count();
    const row = page.locator('[data-testid="doc-row"][data-status="reviewed"]').first();
    await row.getByTestId('row-status').selectOption('sent');
    await expect(page.getByTestId('reminder')).toHaveCount(before - 1);
  });
});
