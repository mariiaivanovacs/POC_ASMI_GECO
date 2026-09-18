import { expect, test } from '@playwright/test';

test.describe('Learners', () => {
  test('numbers move after an attempt is recorded in the builder', async ({ page }) => {
    await page.goto('/#/learners/l7');
    await expect(page.getByTestId('detail-name')).toHaveText('Md Hasan');
    await expect(page.getByTestId('band')).toHaveText('Needs support');
    const progressBefore = await page.getByTestId('module-progress').first().textContent();
    const gaugeBefore = await page.getByTestId('gauge-score').textContent();
    const row = page.getByTestId('learner-row').filter({ hasText: 'Md Hasan' });
    await expect(row).toContainText('Not started');

    await page.goto('/#/builder/hw');
    await page.getByTestId('play-as').selectOption('l7');
    await page.getByTestId('option').filter({ hasText: '11 m (35 ft)' }).click();
    await expect(page.getByTestId('feedback')).toContainText('Correct');

    await page.goto('/#/learners/l7');
    const progressAfter = await page.getByTestId('module-progress').first().textContent();
    expect(progressAfter).not.toBe(progressBefore);
    expect(parseInt(progressAfter || '0')).toBeGreaterThan(parseInt(progressBefore || '0'));
    expect(parseInt((await page.getByTestId('gauge-score').textContent()) || '0')).toBeGreaterThan(parseInt(gaugeBefore || '0'));
    await expect(page.getByTestId('learner-row').filter({ hasText: 'Md Hasan' })).toContainText('On track');
    await expect(page.getByTestId('hours')).not.toHaveText('0h');
    await expect(page.getByTestId('ai-note')).not.toContainText('No tasks attempted');
  });

  test('department filter and sorting re-render the cohort and KPIs', async ({ page }) => {
    await page.goto('/#/learners');
    await expect(page.getByTestId('learner-row')).toHaveCount(10);
    await expect(page.getByTestId('kpi-learners')).toHaveText('10');
    await page.getByTestId('dept-filter').filter({ hasText: 'Scaffolding' }).click();
    await expect(page.getByTestId('learner-row')).toHaveCount(2);
    await expect(page.getByTestId('kpi-learners')).toHaveText('2');
    await expect(page.getByTestId('kpi-risk')).toHaveText('2');
    await page.getByTestId('dept-filter').filter({ hasText: 'All' }).click();
    await page.locator('.row.head').getByRole('button', { name: /^Progress/ }).click();
    const first = await page.getByTestId('row-progress').first().textContent();
    await page.locator('.row.head').getByRole('button', { name: /^Progress/ }).click();
    const firstDesc = await page.getByTestId('row-progress').first().textContent();
    expect(parseInt(first || '0')).toBeLessThanOrEqual(parseInt(firstDesc || '0'));
    await expect(page.getByTestId('row-progress').first()).toHaveText('100%');
  });

  test('clicking a learner switches the whole detail view', async ({ page }) => {
    await page.goto('/#/learners');
    await page.getByTestId('learner-row').filter({ hasText: 'Chen Wei' }).click();
    await expect(page).toHaveURL(/#\/learners\/l4/);
    await expect(page.getByTestId('detail-name')).toHaveText('Chen Wei');
    await expect(page.getByTestId('band')).toHaveText('Above average');
    await expect(page.getByTestId('module-row')).toHaveCount(3);
    await expect(page.getByTestId('module-progress').first()).toHaveText('100%');
  });

  test('CSV export downloads a file with one row per visible learner', async ({ page }) => {
    await page.goto('/#/learners');
    await page.getByTestId('dept-filter').filter({ hasText: 'Engine' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(download.suggestedFilename()).toMatch(/helmlearn-learners-\d{4}-\d{2}-\d{2}\.csv/);
    const text = await (await download.createReadStream())?.toArray().then((c) => Buffer.concat(c as Buffer[]).toString('utf8'));
    const lines = (text || '').trim().split('\n');
    expect(lines[0]).toBe('name,code,role,department,path,language,progress_pct,quiz_avg,ai_score,last_active,flag');
    expect(lines.length).toBe(3);
  });

  test('reset demo data restores the seed after changes', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('play-as').selectOption('l7');
    await page.getByTestId('option').filter({ hasText: '11 m (35 ft)' }).click();
    await page.goto('/#/learners/l7');
    await expect(page.getByTestId('learner-row').filter({ hasText: 'Md Hasan' })).toContainText('On track');
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('open-settings').click();
    await page.getByTestId('reset-demo').click();
    await expect(page.getByTestId('learner-row').filter({ hasText: 'Md Hasan' })).toContainText('Not started');
  });
});

test.describe('Learning health', () => {
  test('retention forecast, alerts, error analysis and refresher scheduling', async ({ page }) => {
    await page.goto('/#/learners/l3');
    const rows = page.getByTestId('retention-row');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('[data-testid="retention-row"][data-state="due"]')).toHaveCount(1);
    await expect(page.getByTestId('health-panel')).toBeVisible();
    await expect(page.getByTestId('sum-due')).toContainText(/[1-9] overdue/);
    const alertsBefore = await page.getByTestId('alert').count();
    expect(alertsBefore).toBeGreaterThan(2);
    await expect(page.getByTestId('failure-chart').locator('svg')).not.toHaveCount(0);
    await expect(page.getByTestId('missed-list').locator('a')).not.toHaveCount(0);

    await page.locator('[data-testid="retention-row"][data-state="due"]').getByTestId('schedule-refresher').click();
    await expect(page.getByTestId('refresher-pill')).toHaveCount(1);
    expect(await page.getByTestId('alert').count()).toBeLessThan(alertsBefore);
    await page.reload();
    await expect(page.getByTestId('refresher-pill')).toHaveCount(1);

    const first = page.getByTestId('alert').first();
    if (await first.getByTestId('alert-ack').count()) {
      const n = await page.getByTestId('alert').count();
      await first.getByTestId('alert-ack').click();
      await expect(page.getByTestId('alert')).toHaveCount(n - 1);
    }
    await page.getByTestId('dept-filter').filter({ hasText: 'HSE' }).click();
    await expect(page.getByTestId('alert-list')).toContainText('Nothing open');
  });
});

test.describe('Cohort views and forecast', () => {
  test('cohort switches between table, bar chart and progress lines', async ({ page }) => {
    await page.goto('/#/learners');
    await expect(page.getByTestId('learner-row')).toHaveCount(10);
    await page.getByTestId('view-toggle').getByText('Bar chart').click();
    await expect(page.getByTestId('bar-row')).toHaveCount(10);
    await expect(page.getByTestId('learner-row')).toHaveCount(0);
    await page.getByTestId('bar-row').first().click();
    await expect(page).toHaveURL(/#\/learners\/l[45]/);
    await expect(page.getByTestId('cohort-bars').locator('rect[fill="url(#gProg)"]')).toHaveCount(10);
    await page.getByTestId('view-toggle').getByText('Progress lines').click();
    await expect(page.getByTestId('cohort-lines').locator('svg path')).toHaveCount(10);
    await page.getByTestId('dept-filter').filter({ hasText: 'Engine' }).click();
    await expect(page.getByTestId('cohort-lines').locator('svg path')).toHaveCount(2);
    await page.getByTestId('view-toggle').getByText('Table').click();
    await expect(page.getByTestId('learner-row')).toHaveCount(2);
  });

  test('forecast shows predicted mistakes, repeat intervals and 30-day retention', async ({ page }) => {
    await page.goto('/#/learners/l2');
    await expect(page.getByTestId('forecast-summary')).toContainText('Forgets soonest');
    await expect(page.getByTestId('forecast-summary')).toContainText('Repeat most often');
    await expect(page.getByTestId('mistakes-total')).toContainText(/\d+(\.\d)? → \d+(\.\d)? per 10 tasks/);
    await expect(page.getByTestId('retention-row')).toHaveCount(3);
    await expect(page.getByTestId('forecast-table')).toContainText('Repeat every');
    await expect(page.getByTestId('module-curve')).toHaveCount(3);
    await expect(page.getByTestId('module-curve').first()).toContainText('repeat every');
  });
});
