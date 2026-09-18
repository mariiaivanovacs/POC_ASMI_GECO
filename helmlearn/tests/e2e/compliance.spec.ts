import { expect, test } from '@playwright/test';

async function approveAllDrafts(page: import('@playwright/test').Page, materialId: string) {
  await page.goto('/#/builder/' + materialId);
  await page.getByTestId('filter-needs-review').click();
  let remaining = await page.getByTestId('task-row').count();
  while (remaining > 0) {
    await page.getByTestId('task-row').first().getByTestId('approve-task').click();
    if (await page.getByRole('dialog', { name: 'Who is reviewing?' }).isVisible()) {
      await page.getByTestId('reviewer-name').fill('Melissa Tan');
      await page.getByTestId('reviewer-confirm').click();
    }
    await expect(page.getByTestId('task-row')).toHaveCount(remaining - 1);
    remaining--;
  }
}

test.describe('Review, sign-off and audit trail', () => {
  test('approving a task prompts for reviewer identity once, then stamps every approval', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('filter-needs-review').click();
    const drafts = await page.getByTestId('task-row').count();
    expect(drafts).toBeGreaterThan(3);

    const row = page.getByTestId('task-row').first();
    await expect(row).toHaveAttribute('data-review', 'draft');
    await row.getByTestId('approve-task').click();
    await expect(page.getByRole('dialog', { name: 'Who is reviewing?' })).toBeVisible();
    await expect(page.getByTestId('reviewer-confirm')).toBeDisabled();
    await page.getByTestId('reviewer-name').fill('Priya Nair');
    await page.getByTestId('reviewer-role').selectOption('HSE Manager');
    await expect(page.getByTestId('reviewer-confirm')).toBeEnabled();
    await page.getByTestId('reviewer-confirm').click();
    await expect(page.getByTestId('task-row')).toHaveCount(drafts - 1);

    // second approval does not re-prompt
    await page.getByTestId('task-row').first().getByTestId('approve-task').click();
    await expect(page.getByRole('dialog', { name: 'Who is reviewing?' })).toHaveCount(0);
    await expect(page.getByTestId('task-row')).toHaveCount(drafts - 2);

    // reject with a note
    page.once('dialog', (d) => d.accept('Wrong distance for this yard'));
    await page.getByTestId('task-row').first().getByTestId('reject-task').click();
    await expect(page.getByTestId('task-row')).toHaveCount(drafts - 3);

    await page.getByRole('button', { name: /^All \d+$/ }).click();
    await expect(page.locator('[data-testid="task-row"][data-review="rejected"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="task-row"][data-review="rejected"]').getByTestId('review-pill')).toHaveAttribute('title', /Priya Nair: Wrong distance/);
    await expect(page.locator('[data-testid="task-row"][data-review="approved"]').filter({ has: page.locator('[title*="Priya Nair"]') })).toHaveCount(2);

    // audit log recorded it all
    await page.goto('/#/compliance');
    await page.getByTestId('compliance-tabs').getByText('Audit log').click();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'exercise approved' }).first()).toContainText('Priya Nair');
    await expect(page.getByTestId('audit-row').filter({ hasText: 'exercise rejected' }).first()).toContainText('Wrong distance');
  });

  test('every task row shows its quality signal, and the two-line layout keeps the actions visible', async ({ page }) => {
    await page.goto('/#/builder/hw');
    const rows = page.getByTestId('task-row');
    await expect(rows.first().getByTestId('quality-pill')).toBeVisible();
    const flags = await rows.locator('[data-testid="quality-pill"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-flag')));
    expect(new Set(flags).size).toBeGreaterThan(1);
    // the approve/reject/delete controls sit inside the card, never clipped off the right edge
    const card = await page.getByTestId('task-list').boundingBox();
    const btn = await rows.first().getByTestId('reject-task').boundingBox();
    expect(btn!.x + btn!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
  });

  test('publish gate blocks unreviewed content until acknowledged, and clears once fully approved', async ({ page }) => {
    await page.goto('/#/builder/hw');
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('publish-review-status')).not.toContainText('All');
    await expect(page.getByTestId('publish-confirm')).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await approveAllDrafts(page, 'hw');
    await page.getByTestId('publish').click();
    await expect(page.getByTestId('publish-review-status')).toContainText('All');
    await expect(page.getByTestId('publish-confirm')).toBeEnabled();
  });
});

test.describe('Compliance dashboard', () => {
  test('matrix shows every learner × regime state, filters to gaps, and drills into a learner', async ({ page }) => {
    await page.goto('/#/compliance');
    await expect(page.locator('[data-testid="matrix-regime"][data-regime="hotwork"]')).toBeVisible();
    await expect(page.getByTestId('matrix-row')).toHaveCount(10);

    const kpi = (kind: string) => page.getByTestId('kpi-' + kind).getByTestId('kpi-value');
    await expect(kpi('ok')).not.toHaveText('0');
    await expect(kpi('risk')).not.toHaveText('0');
    await expect(kpi('err')).not.toHaveText('0');
    await expect(kpi('none')).not.toHaveText('0');

    for (const status of ['compliant', 'expiring', 'expired', 'not-covered', 'eligible', 'n/a']) {
      await expect(page.locator('[data-testid="cell"][data-status="' + status + '"]').first(), status).toBeVisible();
    }

    const before = await page.getByTestId('matrix-row').count();
    await page.getByTestId('gaps-only').check();
    const after = await page.getByTestId('matrix-row').count();
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeGreaterThan(0);

    await page.locator('[data-testid="cell"][data-status="not-covered"]').first().click();
    await expect(page).toHaveURL(/#\/(learners|builder)\//);
  });

  test('issuing from the matrix downloads a PDF and turns the cell green', async ({ page }) => {
    await page.goto('/#/compliance');
    const chen = page.locator('[data-testid="matrix-row"][data-learner="l4"]');
    const eligible = chen.locator('[data-testid="cell"][data-status="eligible"]').first();
    await expect(eligible).toBeVisible();
    const eligibleBefore = await chen.locator('[data-testid="cell"][data-status="eligible"]').count();
    const compliantBefore = await chen.locator('[data-testid="cell"][data-status="compliant"]').count();
    const [download] = await Promise.all([page.waitForEvent('download'), eligible.click()]);
    expect(download.suggestedFilename()).toMatch(/Certificate_.*\.pdf/);
    // one module can cover more than one regime (rigging -> cranes + bizSAFe), so every cell it backs turns green
    await expect(chen.locator('[data-testid="cell"][data-status="eligible"]')).toHaveCount(0);
    await expect(chen.locator('[data-testid="cell"][data-status="compliant"]')).toHaveCount(compliantBefore + eligibleBefore);
    await page.getByTestId('compliance-tabs').getByText('Audit log').click();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'certificate issued' }).first()).toContainText('Chen Wei');
  });

  test('renewals list expired and expiring certificates with refresher and re-issue actions', async ({ page }) => {
    await page.goto('/#/compliance');
    await page.getByTestId('compliance-tabs').getByText('Renewals').click();
    const expired = page.locator('[data-testid="renewal-row"][data-status="expired"]').first();
    await expect(expired).toContainText('Ravi Shankar');
    await expect(expired.getByTestId('reissue')).toBeDisabled(); // module not 100% again yet
    await expired.getByTestId('schedule-refresher').click();
    await expect(expired).toContainText('Refresher');

    const expiring = page.locator('[data-testid="renewal-row"][data-status="expiring"]').first();
    await expect(expiring).toContainText('Nurul Aisyah');
    await expect(expiring.getByTestId('reissue')).toBeEnabled();
    const [download] = await Promise.all([page.waitForEvent('download'), expiring.getByTestId('reissue').click()]);
    expect(download.suggestedFilename()).toMatch(/Certificate_.*\.pdf/);
    await expect(page.locator('[data-testid="renewal-row"][data-status="expiring"]')).toHaveCount(0);
    await expect(page.getByTestId('kpi-risk').getByTestId('kpi-value')).toHaveText('0');
  });

  test('audit log filters by action and exports CSV', async ({ page }) => {
    await page.goto('/#/materials');
    const lng = page.getByTestId('material-row').filter({ hasText: 'LNG bunkering' });
    await lng.getByTestId('process').click();
    await expect(lng).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });

    await page.goto('/#/compliance');
    await page.getByTestId('compliance-tabs').getByText('Audit log').click();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'material processed' }).first()).toBeVisible();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'certificate issued' }).first()).toBeVisible();
    await page.getByTestId('audit-filter').selectOption('material_processed');
    expect(await page.getByTestId('audit-row').count()).toBeGreaterThan(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-audit').click()]);
    expect(download.suggestedFilename()).toMatch(/helmlearn-audit-log-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test('xAPI and compliance-record exports download real files from the compliance page', async ({ page }) => {
    await page.goto('/#/compliance');
    const [xapiDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xapi').click()]);
    expect(xapiDownload.suggestedFilename()).toMatch(/helmlearn-xapi-statements-\d{4}-\d{2}-\d{2}\.json/);
    const stream = await xapiDownload.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]).toHaveProperty('actor.mbox');
    expect(parsed[0]).toHaveProperty('verb.id');
    expect(parsed[0]).toHaveProperty('result.score.scaled');

    const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-compliance').click()]);
    expect(csvDownload.suggestedFilename()).toMatch(/helmlearn-compliance-records-\d{4}-\d{2}-\d{2}\.csv/);
    const s2 = await csvDownload.createReadStream();
    const c2: Buffer[] = [];
    for await (const c of s2!) c2.push(c as Buffer);
    const csv = Buffer.concat(c2).toString('utf8');
    expect(csv.split('\n')[0]).toContain('certificate_code');
    expect(csv).toMatch(/valid|expired|expiring/);
  });
});

test.describe('Certificates', () => {
  test('certificate is only issuable once every task is approved and progress is 100%, and downloads a real PDF', async ({ page }) => {
    // Nurul Aisyah is 100% complete on hw, but hw still has AI drafts on top of the approved
    // hand-written tasks — approve those first so the module is fully reviewed.
    await approveAllDrafts(page, 'hw');
    await page.goto('/#/learners/l5');
    const row = page.getByTestId('module-row').first();
    await expect(row.getByTestId('issue-certificate')).toBeEnabled();

    const [download] = await Promise.all([page.waitForEvent('download'), row.getByTestId('issue-certificate').click()]);
    expect(download.suggestedFilename()).toMatch(/Certificate_.*\.pdf/);
    expect(await download.path()).toBeTruthy();
    await expect(row.getByTestId('issue-certificate')).toContainText('Re-download');

    await page.goto('/#/compliance');
    await page.getByTestId('compliance-tabs').getByText('Audit log').click();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'certificate issued' }).first()).toContainText('Nurul Aisyah');
  });

  test('certificate button stays disabled for a learner with unapproved or incomplete modules', async ({ page }) => {
    await page.goto('/#/learners/l1'); // Arjun Pillai — partial progress
    const row = page.getByTestId('module-row').first();
    await expect(row.getByTestId('issue-certificate')).toBeDisabled();
  });
});

test.describe('Content quality', () => {
  test('surfaces too-hard AI drafts, compares AI vs hand-written pass rates, and opens the task in the builder', async ({ page }) => {
    await page.goto('/#/quality');
    await expect(page.getByTestId('quality-insight')).toContainText(/pass|attention/);
    await expect(page.getByTestId('kpi-ai-pass')).toContainText('%');
    await expect(page.getByTestId('module-quality-row')).toHaveCount(3);

    await page.getByTestId('flag-too-hard').click();
    const hard = page.getByTestId('task-quality-row');
    expect(await hard.count()).toBeGreaterThan(0);
    await expect(hard.first().getByTestId('quality-pill')).toHaveAttribute('data-flag', 'too-hard');
    await expect(hard.first()).toContainText('AI draft');

    await page.getByTestId('quality-scope').selectOption('hw');
    await expect(page.getByTestId('module-quality')).toHaveCount(0);
    await page.getByTestId('flag-all').click();
    await page.getByTestId('task-quality-row').first().getByTestId('open-task').click();
    await expect(page).toHaveURL(/#\/builder\/hw/);
    await expect(page.getByTestId('task-row').first().getByTestId('quality-pill')).toBeVisible();
  });
});

test.describe('Compliance & training — per-regime people view', () => {
  test('selecting a regime shows every person with a pace-coloured row and one big action', async ({ page }) => {
    await page.goto('/#/compliance');
    await expect(page.locator('.topbar h1')).toHaveText('Compliance & training');
    await page.locator('[data-testid="regime-chip"][data-regime="cranes"]').click();
    await expect(page.getByTestId('staff-tab')).toHaveAttribute('data-regime', 'cranes');
    await expect(page.getByTestId('person-row')).toHaveCount(10);

    // colours follow the person's situation
    for (const tone of ['red', 'green', 'grey', 'blue']) await expect(page.locator('[data-testid="person-row"][data-tone="' + tone + '"]').first(), tone).toBeVisible();
    await expect(page.locator('[data-testid="person-row"][data-pace="overdue"]').first()).toContainText('Overdue by');
    await expect(page.locator('[data-testid="person-row"][data-tone="red"]').first().getByTestId('action-remind')).toBeVisible();

    // certified → download; not enrolled → enrol; finished + approved → issue
    await expect(page.locator('[data-testid="person-row"][data-learner="l5"]').getByTestId('action-download')).toBeVisible();
    await expect(page.locator('[data-testid="person-row"][data-learner="l4"]').getByTestId('action-issue')).toBeVisible();
    await expect(page.locator('[data-testid="person-row"][data-learner="l1"]').getByTestId('action-enrol')).toContainText('Enrol in Rigging');

    // "Needs action" hides the certified rows only
    const certified = await page.locator('[data-testid="person-row"][data-tone="green"]').count();
    await page.getByTestId('needs-action').click();
    await expect(page.getByTestId('person-row')).toHaveCount(10 - certified);
  });

  test('enrol, remind and issue all change the row and the audit log', async ({ page }) => {
    await page.goto('/#/compliance');
    await page.locator('[data-testid="regime-chip"][data-regime="cranes"]').click();

    const arjun = page.locator('[data-testid="person-row"][data-learner="l1"]');
    await expect(arjun).toHaveAttribute('data-tone', 'grey');
    await arjun.getByTestId('action-enrol').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'enrolled in Rigging' })).toBeVisible();
    await expect(arjun).toHaveAttribute('data-pace', 'not-started');
    await expect(arjun).toHaveAttribute('data-tone', 'amber');
    await expect(arjun.getByTestId('action-remind')).toBeVisible();

    const rafiqul = page.locator('[data-testid="person-row"][data-learner="l3"]');
    await expect(rafiqul).toHaveAttribute('data-tone', 'red');
    await rafiqul.getByTestId('action-remind').click();
    await expect(page.getByTestId('toast').filter({ hasText: 'supervisor S. Lim' })).toBeVisible();
    await expect(rafiqul.getByTestId('reminded')).toContainText('Reminded just now via S. Lim');
    await expect(rafiqul.getByTestId('action-remind')).toContainText('Remind again');

    const chen = page.locator('[data-testid="person-row"][data-learner="l4"]');
    const [download] = await Promise.all([page.waitForEvent('download'), chen.getByTestId('action-issue').click()]);
    expect(download.suggestedFilename()).toMatch(/Certificate_.*\.pdf/);
    await expect(chen).toHaveAttribute('data-tone', 'green');
    await expect(chen.getByTestId('action-download')).toBeVisible();

    // the learner detail page reflects the enrolment too
    await page.goto('/#/learners/l1');
    await expect(page.getByTestId('module-row')).toHaveCount(3);

    await page.goto('/#/compliance');
    await page.getByTestId('compliance-tabs').getByText('Audit log').click();
    await expect(page.getByTestId('audit-row').filter({ hasText: 'learner enrolled' }).first()).toContainText('Arjun Pillai');
    await expect(page.getByTestId('audit-row').filter({ hasText: 'reminder sent' }).first()).toContainText('Rafiqul Islam');
  });

  test('the KPI strip follows the selected regime and "All regimes" restores the matrix', async ({ page }) => {
    await page.goto('/#/compliance');
    const all = await page.getByTestId('kpi-ok').getByTestId('kpi-value').textContent();
    await page.locator('[data-testid="regime-chip"][data-regime="hotwork"]').click();
    await expect(page.getByTestId('kpi-ok').getByTestId('kpi-value')).toHaveText('0');
    await expect(page.getByTestId('staff-tab')).toContainText('Hot Work / Permit-to-Work');
    await page.locator('[data-testid="regime-chip"][data-regime="all"]').click();
    await expect(page.getByTestId('matrix')).toBeVisible();
    await expect(page.getByTestId('kpi-ok').getByTestId('kpi-value')).toHaveText(all!);
  });
});
