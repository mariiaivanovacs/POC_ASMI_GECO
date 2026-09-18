import { expect, test } from '@playwright/test';
import path from 'node:path';

const FX = (n: string) => path.resolve('tests/e2e/fixtures/' + n);

test.describe('Templates — form becomes template', () => {
  test('upload a text form → fields detected → toggle static/dynamic → edit fields → save → persists after reload', async ({ page }) => {
    await page.goto('/#/templates');
    await expect(page.getByTestId('template-chip')).toHaveCount(7);

    await page.getByTestId('file-input').setInputFiles(FX('ihm-declaration.txt'));
    const chip = page.getByTestId('upload-chip').first();
    await expect(chip).toContainText('ihm-declaration.txt');
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'detected', { timeout: 15_000 });
    await expect(page.getByTestId('toast').first()).toContainText('fields detected');

    // the log reports what the engine computed
    const log = page.getByTestId('detection-log');
    await expect(log).toContainText('Read 1 page');
    await expect(log).toContainText(/Found \d+ variable fields/);
    await expect(log).toContainText('Found 1 conditional section (Section 4)');
    await expect(log).toContainText('Found 1 signature block');
    await expect(log).toContainText('Hong Kong Convention');
    const count = parseInt((await page.getByTestId('field-count').textContent())!);
    expect(count).toBeGreaterThanOrEqual(10);
    await expect(page.getByTestId('field-row')).toHaveCount(count);

    // static view shows the original values, dynamic shows merge-field chips and the conditional marker
    await expect(page.getByTestId('paper')).toHaveAttribute('data-mode', 'static');
    await expect(page.getByTestId('static-field').filter({ hasText: 'Sea Falcon 7' })).toBeVisible();
    await expect(page.getByTestId('merge-field')).toHaveCount(0);
    await page.getByTestId('mode-dynamic').click();
    await expect(page.getByTestId('paper')).toHaveAttribute('data-mode', 'dynamic');
    await expect(page.getByTestId('dynamic-banner')).toContainText('1 conditional section');
    await expect(page.getByTestId('merge-field').filter({ hasText: '{{vessel_name}}' })).toBeVisible();
    await expect(page.getByTestId('conditional-marker')).toContainText('haz_material_present = Yes');
    await expect(page.getByTestId('doc-meta')).toContainText('viewing as dynamic template');
    await page.screenshot({ path: 'test-results/shot-templates-dynamic.png' });

    // rename a field inline: the chip in the document follows
    const row = page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{contact_person}}' }) });
    await row.getByTestId('field-label').fill('Supplier contact');
    await row.getByTestId('field-label').press('Enter');
    await expect(page.getByTestId('field-key').filter({ hasText: '{{supplier_contact}}' })).toBeVisible();
    await expect(page.getByTestId('merge-field').filter({ hasText: '{{supplier_contact}}' })).toBeVisible();

    // change a type
    const loc = page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{location_board}}' }) });
    await loc.getByTestId('field-type').selectOption('list');
    await expect(loc).toHaveAttribute('data-type', 'list');

    // delete a field: the text becomes fixed content again
    page.once('dialog', (d) => d.accept());
    const email = page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{desc}}' }) });
    await email.getByTestId('field-delete').click();
    await expect(page.getByTestId('field-row')).toHaveCount(count - 1);
    await expect(page.getByTestId('merge-field').filter({ hasText: '{{desc}}' })).toHaveCount(0);
    await expect(page.getByTestId('paper')).toContainText('Replacement of gasket set');

    // save → becomes a template chip; the upload chip disappears; reload keeps it
    await page.getByTestId('save-template').click();
    await expect(page.getByTestId('toast').last()).toContainText('Saved "ihm declaration" as a dynamic template');
    await expect(page.getByTestId('template-chip')).toHaveCount(8);
    await expect(page.getByTestId('upload-chip')).toHaveCount(0);
    await expect(page.getByTestId('doc-meta')).toContainText('saved template');
    await page.reload();
    await expect(page.getByTestId('template-chip')).toHaveCount(8);
    await expect(page.getByTestId('doc-name')).toHaveText('ihm declaration');
    await expect(page.getByTestId('field-key').filter({ hasText: '{{supplier_contact}}' })).toBeVisible();
  });

  test('PDF with a text layer is read by pdf.js in the browser', async ({ page }) => {
    await page.goto('/#/templates');
    await page.getByTestId('file-input').setInputFiles(FX('ihm-declaration.pdf'));
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'detected', { timeout: 30_000 });
    await expect(page.getByTestId('detection-log')).toContainText('Read 1 page');
    await expect(page.getByTestId('static-field').filter({ hasText: '9074729' })).toBeVisible();
    await expect(page.getByTestId('conditional-marker')).toHaveCount(0); // static view
    await page.getByTestId('mode-dynamic').click();
    await expect(page.getByTestId('conditional-marker')).toBeVisible();
  });

  test('DOCX is read by mammoth', async ({ page }) => {
    await page.goto('/#/templates');
    await page.getByTestId('file-input').setInputFiles(FX('ihm-declaration.docx'));
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'detected', { timeout: 30_000 });
    await expect(page.getByTestId('static-field').filter({ hasText: 'WO-2433' })).toBeVisible();
  });

  test('scanned PDF without a text layer fails with a named reason and can be retried or removed', async ({ page }) => {
    await page.goto('/#/templates');
    await page.getByTestId('file-input').setInputFiles(FX('scanned.pdf'));
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
    await expect(page.getByTestId('detection-log')).toContainText('scanned PDF');
    await expect(page.getByTestId('paper-state')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('save-template')).toBeDisabled();
    await page.screenshot({ path: 'test-results/shot-templates-scanned.png' });
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
    await page.getByTestId('delete-upload').click();
    await expect(page.getByTestId('upload-chip')).toHaveCount(0);
  });

  test('unsupported and empty files are refused with a reason', async ({ page }) => {
    await page.goto('/#/templates');
    await page.getByTestId('file-input').setInputFiles({ name: 'form.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('PK junk') });
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(page.getByTestId('detection-log')).toContainText('Unsupported file type ".xlsx"');
    await page.getByTestId('file-input').setInputFiles({ name: 'blank.txt', mimeType: 'text/plain', buffer: Buffer.from('') });
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'failed', { timeout: 10_000 });
    await expect(page.getByTestId('detection-log')).toContainText('empty');
  });

  test('a form with no detectable fields cannot be saved and says why', async ({ page }) => {
    await page.goto('/#/templates');
    await page.getByTestId('file-input').setInputFiles(FX('no-fields.txt'));
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'detected', { timeout: 15_000 });
    await expect(page.getByTestId('detection-log')).toContainText('Found 0 variable fields');
    await expect(page.getByTestId('no-fields')).toBeVisible();
    await expect(page.getByTestId('save-template')).toBeDisabled();
    await expect(page.getByTestId('toast').first()).toContainText('No variable fields detected');
  });

  test('reload mid-processing does not leave an upload spinning forever', async ({ page }) => {
    await page.goto('/#/templates');
    await expect(page.getByTestId('template-chip')).toHaveCount(7);
    // freeze the store in the "processing" state as a reload would find it
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('helmdocs-v1') || '{"state":{},"version":0}');
      raw.state.uploads = [{ id: 'u_stuck', fileName: 'stuck.pdf', ext: 'pdf', kind: 'PDF form', status: 'processing', stage: 'reading', pct: 40, error: null, text: null, pages: 0, detection: null, fields: [], sections: [], regime: '', regimeShort: '', createdAt: Date.now() }];
      localStorage.setItem('helmdocs-v1', JSON.stringify(raw));
    });
    await page.goto('/#/templates/u_stuck');
    await page.reload(); // a hash change alone does not re-hydrate the store
    await expect(page.getByTestId('detection-card')).toHaveAttribute('data-status', 'failed');
    await expect(page.getByTestId('detection-log')).toContainText('interrupted by a reload');
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('detection-log')).toContainText('drop the file again');
  });

  test('deleting a template that has generated documents keeps the documents', async ({ page }) => {
    await page.goto('/#/templates/t_ptw');
    await expect(page.getByTestId('doc-name')).toHaveText('Permit-to-Work (Hot Work / Confined Space)');
    let message = '';
    page.once('dialog', (d) => { message = d.message(); d.accept(); });
    await page.getByTestId('delete-template').click();
    expect(message).toContain('4 generated documents will stay in the library');
    await expect(page.getByTestId('template-chip')).toHaveCount(6);
    await expect(page.getByTestId('toast').last()).toContainText('4 documents kept');
    await page.goto('/#/library');
    await expect(page.getByTestId('doc-row').filter({ hasText: 'PTW' }).first()).toBeVisible();
    await expect(page.getByTestId('doc-row').filter({ hasText: 'template deleted' }).first()).toBeVisible();
  });
});
