import { expect, test } from '@playwright/test';

test.describe('Task builder', () => {
  test('answering a task records an attempt for the selected learner', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await expect(page.getByTestId('phone-body')).toContainText('flammables must be cleared');
    await page.getByTestId('play-as').selectOption('l7');
    await page.evaluate(() => { (window as unknown as { __bursts: number }).__bursts = 0; window.addEventListener('helmlearn:celebrate', () => { (window as unknown as { __bursts: number }).__bursts++; }); });
    await page.getByTestId('option').filter({ hasText: '11 m (35 ft)' }).click();
    await expect(page.getByTestId('feedback')).toContainText('Correct');
    await expect(page.getByTestId('toast').first()).toContainText('recorded for Md Hasan');
    expect(await page.evaluate(() => (window as unknown as { __bursts: number }).__bursts)).toBe(1);
    // options lock after answering
    await page.getByTestId('option').first().click();
    await expect(page.getByTestId('feedback')).toHaveCount(1);
  });

  test('language and level toggles change the same task', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await expect(page.getByTestId('phone-body')).toContainText('SOP-HW-04 step 3 sets the distance');
    await page.getByTestId('level-toggle').getByText('Experienced').click();
    await expect(page.getByTestId('phone-body')).not.toContainText('SOP-HW-04 step 3 sets the distance');
    await page.getByTestId('lang-toggle').getByText('Bahasa').click();
    await expect(page.getByTestId('phone-body')).toContainText('Sebelum memulakan kerja panas');
    await page.getByTestId('lang-toggle').getByText('中文').click();
    await expect(page.getByTestId('phone-body')).toContainText('热工作业');
    // generated (English-only) task shows the badge in another language
    await page.getByTestId('type-photo').click();
    await page.locator('[data-testid="task-row"][data-title*="Helmet"]').click();
    await expect(page.getByTestId('phone-body')).toContainText('仅英文');
  });

  test('sequence, matching and sign-off tasks are playable', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('type-seq').click();
    await expect(page.getByTestId('seq-card')).toHaveCount(4);
    for (const label of ['Obtain the signed permit', 'Clear or shield flammables', 'Post the fire watch', 'Start hot work']) {
      await page.getByTestId('seq-card').filter({ hasText: label }).click();
    }
    await expect(page.getByTestId('feedback')).toContainText('Right order');

    await page.getByTestId('type-match').click();
    await expect(page.getByTestId('term')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const term = page.getByTestId('term').nth(i);
      const text = (await term.textContent()) || '';
      await term.click();
      const map: Record<string, string> = { 'Fire watch': 'Stays 30 min', 'Permit': 'one shift', 'Flash point': 'Lowest temperature' };
      const key = Object.keys(map).find((k) => text.includes(k))!;
      await page.getByTestId('def').filter({ hasText: map[key] }).click();
    }
    await expect(page.getByTestId('feedback')).toContainText('matched');

    await page.getByTestId('type-sign').click();
    await page.locator('[data-testid="task-row"][data-title="Supervisor: flammables cleared"]').click();
    await expect(page.getByTestId('pin-entry')).toBeDisabled();
    for (const c of await page.getByTestId('check').all()) await c.click();
    await expect(page.getByTestId('pin-entry')).toBeEnabled();
    await page.getByTestId('pin-entry').fill('9999');
    await page.getByTestId('sign-submit').click();
    await expect(page.getByTestId('feedback')).toContainText('not recognised');
    await page.getByTestId('pin-entry').fill('1234');
    await page.getByTestId('sign-submit').click();
    await expect(page.getByTestId('feedback')).toContainText('Signed off');
  });

  test('flashcards and fill-the-blank are playable tasks in the phone and record attempts', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('type-cards').click();
    await page.locator('[data-testid="task-row"][data-title="Flashcards: hot work terms"]').click();
    const phone = page.getByTestId('phone-body');
    await expect(phone.getByTestId('cards-progress')).toContainText('Card 1 of 3');
    for (let i = 0; i < 3; i++) {
      await expect(phone.getByTestId('flashcard')).toHaveAttribute('data-face', 'front');
      await phone.getByTestId('flashcard-front').click();
      await expect(phone.getByTestId('flashcard')).toHaveAttribute('data-face', 'back');
      await phone.getByTestId(i === 1 ? 'flashcard-missed' : 'flashcard-known').click();
    }
    await expect(phone.getByTestId('feedback')).toContainText('2 of 3 recalled');
    await expect(page.getByTestId('toast').first()).toContainText('recorded for');

    // Bahasa version of the same hand-written flashcards
    await page.getByTestId('lang-toggle').getByText('Bahasa').click();
    await expect(phone).toContainText('Ingat maksud');

    await page.getByTestId('lang-toggle').getByText('English').click();
    await page.getByTestId('type-fill').click();
    await page.locator('[data-testid="task-row"][data-title="Fill the blanks: clearance and fire watch"]').click();
    await expect(phone.getByTestId('fill-sentence')).toContainText('Clear flammables within');
    await phone.getByTestId('token').filter({ hasText: '5 m' }).click();
    await phone.getByTestId('token').filter({ hasText: 'one hour' }).click();
    await expect(phone.getByTestId('feedback')).toContainText('Not quite');
    await phone.getByRole('button', { name: /again|Retry/i }).click();
    await phone.getByTestId('token').filter({ hasText: '11 m' }).click();
    await phone.getByTestId('token').filter({ hasText: '30 minutes' }).click();
    await expect(phone.getByTestId('feedback')).toContainText('Both correct');
  });

  test('audio task plays, answers and reveals the transcript', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('type-audio').click();
    await page.getByTestId('play').click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.getByTestId('option').filter({ hasText: 'Acknowledge and wait' }).click();
    await expect(page.getByTestId('feedback')).toContainText('Right');
    await expect(page.getByTestId('phone-body')).toContainText('Transcript');
  });

  test('inline title edit persists across reload; delete and regenerate change the list', async ({ page }) => {
    await page.goto('/#/builder/hw');
    const before = await page.getByTestId('task-row').count();
    const title = page.getByTestId('task-title').first();
    await title.fill('Renamed by test');
    await title.press('Enter');
    await page.reload();
    await expect(page.getByTestId('task-title').first()).toHaveValue('Renamed by test');

    await page.getByTestId('task-row').last().getByTestId('delete-task').click();
    await expect(page.getByTestId('task-row')).toHaveCount(before - 1);

    await page.getByTestId('type-scen').click();
    const scenBefore = await page.getByTestId('task-row').count();
    await page.getByTestId('regenerate').click();
    await expect(page.getByTestId('toast').first()).toContainText('regenerated');
    expect(await page.getByTestId('task-row').count()).toBeGreaterThanOrEqual(scenBefore);
  });

  test('publishing enrols learners of the chosen departments', async ({ page }) => {
    await page.goto('/#/builder/rig');
    await page.getByTestId('publish').click();
    await expect(page.getByRole('dialog', { name: 'Publish module' })).toBeVisible();
    // rig is fully reviewed in the seed, so no acknowledgement is needed
    await expect(page.getByTestId('publish-review-status')).toContainText(/All \d+ tasks in this module are approved/);
    await expect(page.getByTestId('publish-ack')).toHaveCount(0);
    await expect(page.getByTestId('publish-confirm')).toBeEnabled();
    await page.getByTestId('publish-confirm').click();
    await expect(page.getByTestId('toast').first()).toContainText(/enrolled/);
    await page.goto('/#/learners/l7');
    await expect(page.getByTestId('module-row')).toHaveCount(2);
  });

  test('switching material and handling a missing one', async ({ page }) => {
    await page.goto('/#/builder/does-not-exist');
    await expect(page).toHaveURL(/#\/materials/);
    await page.goto('/#/builder/hw');
    await page.getByTestId('material-select').selectOption('erp');
    await expect(page).toHaveURL(/#\/builder\/erp/);
    await expect(page.getByTestId('phone-body')).toContainText(/general-alarm|H₂S|Listen/);
  });
});
