import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

test.describe('Library — dashboard, documents, data extraction, assistant', () => {
  test('stats and charts are computed from the documents and move when a document is assembled', async ({ page }) => {
    await page.goto('/#/library');
    const generated = parseInt((await page.getByTestId('stat-generated').textContent())!);
    const pending = parseInt((await page.getByTestId('stat-pending').textContent())!);
    const rows = await page.getByTestId('doc-row').count();
    expect(rows).toBe(22);
    expect(generated).toBe(22);
    await expect(page.getByTestId('chart-days')).toBeVisible();
    await expect(page.getByTestId('chart-regime')).toBeVisible();
    await expect(page.getByTestId('chart-weeks')).toBeVisible();
    await expect(page.getByTestId('chart-status')).toBeVisible();
    await expect(page.getByTestId('chart-status')).toContainText('22');
    await page.screenshot({ path: 'test-results/shot-library.png' });

    // assemble a new PTW from the library's New document button
    await page.getByTestId('new-document').click();
    await expect(page).toHaveURL(/#\/assemble\/d_/);
    await page.getByTestId('input-desc').fill('Gasket replacement');
    await page.goto('/#/library');
    await expect(page.getByTestId('stat-generated')).toHaveText(String(generated + 1));
    await expect(page.getByTestId('stat-pending')).toHaveText(String(pending + 1));
    await expect(page.getByTestId('doc-row')).toHaveCount(rows + 1);
    await expect(page.getByTestId('chart-status')).toContainText('23');
  });

  test('template cards and status chips filter the strip, the charts and the list; sort works', async ({ page }) => {
    await page.goto('/#/library');
    const ihm = page.getByTestId('template-card').first();
    const n = parseInt((await ihm.getAttribute('data-count'))!);
    await ihm.click();
    await expect(ihm).toHaveClass(/on/);
    await expect(page.getByTestId('doc-row')).toHaveCount(n);
    await expect(page.getByTestId('row-count')).toContainText('IHM Supplier Declaration of Conformity');
    await expect(page.getByTestId('stat-generated')).toHaveText(String(n));
    await expect(page.getByTestId('chart-status')).toContainText(String(n));
    await expect(page.getByTestId('chart-regime')).toContainText('HKC / IHM');
    await expect(page.getByTestId('chart-regime')).not.toContainText('PTW');

    await page.getByTestId('filter-sent').click();
    const sentRows = await page.getByTestId('doc-row').count();
    expect(sentRows).toBeLessThan(n);
    for (let i = 0; i < sentRows; i++) await expect(page.getByTestId('doc-row').nth(i)).toHaveAttribute('data-status', 'sent');
    await expect(page.getByTestId('stat-pending')).toHaveText('0');
    await page.screenshot({ path: 'test-results/shot-library-filtered.png' });

    await page.getByTestId('filter-sent').click();
    await page.getByTestId('filter-all').click();
    await expect(page.getByTestId('doc-row')).toHaveCount(22);

    // sort by date flips order
    const first = await page.getByTestId('doc-row').first().getAttribute('data-id');
    await page.getByTestId('sort-date').click();
    const firstAsc = await page.getByTestId('doc-row').first().getAttribute('data-id');
    expect(firstAsc).not.toBe(first);

    // a filter with no documents shows an honest empty state
    await page.getByTestId('template-card').last().click();
    await page.getByTestId('filter-draft').click();
    await page.getByTestId('filter-reviewed').click();
    await page.getByTestId('filter-sent').click();
    const shown = await page.getByTestId('doc-row').count();
    if (shown === 0) await expect(page.getByTestId('docs-empty')).toBeVisible();
  });

  test('status changes respect Draft → Reviewed → Sent; delete removes a document', async ({ page }) => {
    await page.goto('/#/library');
    const draft = page.getByTestId('doc-row').filter({ has: page.locator('[data-status="draft"]') }).first();
    const draftRow = page.locator('[data-testid="doc-row"][data-status="draft"]').first();
    await draftRow.getByTestId('row-status').selectOption('sent');
    await expect(page.getByTestId('toast').last()).toContainText('must be marked reviewed by a person');
    await expect(draftRow).toHaveAttribute('data-status', 'draft');
    const id = await draftRow.getAttribute('data-id');
    await draftRow.getByTestId('row-status').selectOption('reviewed');
    const row = page.locator('[data-testid="doc-row"][data-id="' + id + '"]');
    await expect(row).toHaveAttribute('data-status', 'reviewed');
    await row.getByTestId('row-status').selectOption('sent');
    await expect(row).toHaveAttribute('data-status', 'sent');
    void draft;

    const before = await page.getByTestId('doc-row').count();
    page.once('dialog', (d) => d.accept());
    await row.getByTestId('delete-doc').click();
    await expect(page.getByTestId('doc-row')).toHaveCount(before - 1);
    await page.reload();
    await expect(page.getByTestId('doc-row')).toHaveCount(before - 1);
  });

  test('CSV, XLSX, TSV and XML extraction are real downloads of the filtered rows', async ({ page }) => {
    await page.goto('/#/library');
    await page.getByTestId('template-card').first().click();
    const n = await page.getByTestId('doc-row').count();

    await page.getByTestId('export-data').click();
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(csv.suggestedFilename()).toMatch(/helmdocs-library-\d{4}-\d{2}-\d{2}\.csv/);
    const csvText = readFileSync((await csv.path())!).toString();
    expect(csvText.split('\n')[0]).toBe('document,template,regime,vessel_or_site,status,generated,reviewed,sent,by,minutes,manual_minutes,minutes_saved,exports');
    expect(csvText.trim().split('\n')).toHaveLength(n + 1);
    expect(csvText).toContain('HKC / IHM');

    await page.getByTestId('export-data').click();
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    const zip = await JSZip.loadAsync(readFileSync((await xlsx.path())!));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('<t>document</t>');
    expect((sheet.match(/<row /g) || []).length).toBe(n + 1);

    await page.getByTestId('export-data').click();
    const [tsv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-tsv').click()]);
    expect(readFileSync((await tsv.path())!).toString().split('\n')[0]).toContain('document\ttemplate');

    await page.getByTestId('export-data').click();
    const [xml] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xml').click()]);
    const xmlText = readFileSync((await xml.path())!).toString();
    expect(xmlText).toContain('<documents>');
    expect((xmlText.match(/<record>/g) || []).length).toBe(n);
  });

  test('assistant finds documents by vessel / regime / status, explains matches, and is honest about no results', async ({ page }) => {
    await page.goto('/#/library');
    await page.getByTestId('suggestion').filter({ hasText: 'IHM declaration for MV Ocean Pioneer' }).click();
    await expect(page.getByTestId('assistant-answer')).toContainText(/Found \d+ documents/);
    const top = page.getByTestId('assistant-hit').first();
    await expect(top).toContainText('IHM Supplier Declaration of Conformity · MV Ocean Pioneer');
    await expect(top.getByTestId('hit-why')).toContainText('vessel: mv ocean pioneer');
    await expect(top.getByTestId('hit-why')).toContainText('regime: ihm');

    await page.getByTestId('suggestion').filter({ hasText: 'SHMS evidence still pending' }).click();
    const hits = page.getByTestId('assistant-hit');
    expect(await hits.count()).toBeGreaterThan(0);
    for (let i = 0; i < await hits.count(); i++) { await expect(hits.nth(i)).toContainText('SHMS'); await expect(hits.nth(i)).not.toContainText('Sent'); }

    await page.getByTestId('assistant-input').fill('WO-2409');
    await expect(page.getByTestId('assistant-hit').first().getByTestId('hit-why')).toContainText('wo2409');
    const woHits = await page.getByTestId('assistant-hit').count();
    expect(woHits).toBeGreaterThanOrEqual(2); // the bizSAFE RA, the PTW and the confined-space RA for that work order
    for (let i = 0; i < woHits; i++) await expect(page.getByTestId('assistant-hit').nth(i)).toContainText('Sea Falcon 7');
    await page.screenshot({ path: 'test-results/shot-library-assistant.png' });

    await page.getByTestId('assistant-input').fill('zebra crossing on the moon');
    await expect(page.getByTestId('assistant-answer')).toContainText('Nothing in the library matches');
    await expect(page.getByTestId('assistant-empty')).toBeVisible();

    // clicking a hit opens the document
    await page.getByTestId('assistant-input').fill('Sea Falcon 7 permits');
    await page.getByTestId('assistant-hit').first().click();
    await expect(page).toHaveURL(/#\/assemble\/d_/);
    await expect(page.getByTestId('input-vessel_name')).toHaveValue('Sea Falcon 7');
  });

  test('settings: signatory list drives the pre-submission check; reset restores the demo', async ({ page }) => {
    await page.goto('/#/assemble/d_03');
    await expect(page.locator('[data-testid="check"][data-id="signatory"]')).toHaveAttribute('data-ok', 'true');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('signatory').filter({ hasText: 'Rachel Tan' }).getByTestId('remove-signatory').click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.locator('[data-testid="check"][data-id="signatory"]')).toHaveAttribute('data-ok', 'false');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('signatory-input').fill('Rachel Tan, QA Manager');
    await page.getByTestId('add-signatory').click();
    await expect(page.getByTestId('signatory')).toHaveCount(6);
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('reset-demo').click();
    await expect(page.getByTestId('toast').last()).toContainText('Demo data restored');
    await page.goto('/#/library');
    await expect(page.getByTestId('doc-row')).toHaveCount(22);
  });
});
