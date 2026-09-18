import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

test.describe('Assemble — fill once, the document writes itself', () => {
  test('new IHM document: live preview, conditional Section 4, pre-submission checks, real PDF/DOCX downloads, review → email → Sent', async ({ page }) => {
    await page.goto('/#/assemble');
    await expect(page.getByTestId('assemble-empty')).toBeVisible();
    await expect(page.getByTestId('preview-empty')).toBeVisible();

    await page.getByTestId('template-select').selectOption('t_ihm');
    await expect(page).toHaveURL(/#\/assemble\/d_/);
    await expect(page.getByTestId('doc-status')).toHaveText(/Draft/);

    // pre-filled hints from the most recent work order + today's date
    await expect(page.getByTestId('input-vessel_name')).toHaveValue('MV Ocean Pioneer');
    await expect(page.getByTestId('hint-vessel_name')).toContainText('Pre-filled from');
    await expect(page.getByTestId('input-imo_no')).toHaveValue('9876543');
    await expect(page.getByTestId('hint-imo_no')).toHaveText(/Checksum valid/);
    await expect(page.getByTestId('hint-date_work')).toContainText("today");

    // export is blocked while mandatory fields are empty
    await expect(page.getByTestId('export-blocked')).toContainText('Export is blocked');
    await expect(page.getByTestId('export-pdf')).toBeDisabled();
    await expect(page.getByTestId('export-docx')).toBeDisabled();
    await expect(page.getByTestId('check').filter({ hasText: 'All mandatory fields present' })).toHaveAttribute('data-ok', 'false');

    // the document rebuilds live as you type
    await page.getByTestId('input-vessel_name').fill('Sea Falcon 7');
    await expect(page.getByTestId('live-field').filter({ hasText: 'Sea Falcon 7' })).toBeVisible();
    await expect(page.getByTestId('doc-file')).toContainText('Sea-Falcon-7');

    // invalid IMO checksum: hint + precheck fail, valid again afterwards
    await page.getByTestId('input-imo_no').fill('9876544');
    await expect(page.getByTestId('hint-imo_no')).toContainText('Checksum invalid');
    await expect(page.getByTestId('check').filter({ hasText: 'IMO number checksum valid' })).toHaveAttribute('data-ok', 'false');
    await page.getByTestId('input-imo_no').fill('9074729');
    await expect(page.getByTestId('check').filter({ hasText: 'IMO number checksum valid' })).toHaveAttribute('data-ok', 'true');

    // signatory not on the authorised list is flagged, then fixed
    await page.getByTestId('input-auth_person').fill('Random Person, Intern');
    await expect(page.getByTestId('hint-auth_person')).toContainText('Not on the authorised-signatory list');
    await expect(page.getByTestId('check').filter({ hasText: 'Signatory on the authorised list' })).toHaveAttribute('data-ok', 'false');
    await page.getByTestId('input-auth_person').fill('Rachel Tan, QA Manager');
    await expect(page.getByTestId('hint-auth_person')).toContainText('On the authorised-signatory list');

    await page.getByTestId('input-contact_person').fill('Rachel Tan, QA Manager');
    await page.getByTestId('input-contact_email').fill('qa@harbourline.example.sg');
    await page.getByTestId('input-work_order_no').fill('WO-2440');
    await page.getByTestId('input-desc').fill('Insulation renewal, accommodation deck');

    // conditional logic: Yes inserts Section 4 (and asks for its fields), No removes it
    await expect(page.getByTestId('section-included')).toHaveCount(0);
    await page.getByTestId('input-haz_material_present-yes').click();
    await expect(page.getByTestId('rule-card')).toHaveAttribute('data-included', 'true');
    await expect(page.getByTestId('rule-card')).toContainText('Section 4 is INCLUDED because haz_material_present = Yes');
    await expect(page.getByTestId('section-included')).toBeVisible();
    await expect(page.getByTestId('paper')).toContainText('4. HAZARDOUS MATERIALS DECLARED');
    await expect(page.getByTestId('section-form')).toHaveCount(5);
    await expect(page.locator('[data-testid="check"][data-id="qty_s4"]')).toHaveAttribute('data-ok', 'false');
    await expect(page.getByTestId('export-blocked')).toContainText('Quantity');

    await page.getByTestId('input-material').selectOption('Asbestos');
    await page.getByTestId('input-qty').fill('3.2 kg');
    await page.getByTestId('input-location_board').fill('Accommodation deck B');
    await page.getByTestId('input-hkc_threshold').fill('0.1 % (Table A)');
    await expect(page.locator('[data-testid="check"][data-id="qty_s4"]')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('export-blocked')).toHaveCount(0);
    await expect(page.getByTestId('precheck-count')).toHaveText('5 / 5 passed');
    await page.screenshot({ path: 'test-results/shot-assemble-yes.png' });

    await page.getByTestId('input-haz_material_present-no').click();
    await expect(page.getByTestId('rule-card')).toHaveAttribute('data-included', 'false');
    await expect(page.getByTestId('rule-card')).toContainText('OMITTED because haz_material_present = No');
    await expect(page.getByTestId('section-omitted')).toBeVisible();
    await expect(page.getByTestId('section-included')).toHaveCount(0);
    await expect(page.getByTestId('section-form-omitted')).toBeVisible();
    await expect(page.getByTestId('doc-minutes')).toContainText('5 of 6 sections included');
    await expect(page.locator('[data-testid="check"][data-id="qty_s4"]')).toContainText('is not required, because');
    await page.screenshot({ path: 'test-results/shot-assemble-no.png' });
    await page.getByTestId('input-haz_material_present-yes').click();

    // email is gated on a human review step
    await expect(page.getByTestId('export-email')).toBeDisabled();

    // real PDF download
    const [pdfDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    expect(pdfDl.suggestedFilename()).toBe('HKC-IHM_Sea-Falcon-7_WO-2440.pdf');
    const pdfPath = await pdfDl.path();
    const pdfHead = readFileSync(pdfPath!).subarray(0, 5).toString();
    expect(pdfHead).toBe('%PDF-');
    expect(readFileSync(pdfPath!).length).toBeGreaterThan(2000);

    // real DOCX download whose XML contains the assembled values and Section 4
    const [docxDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    expect(docxDl.suggestedFilename()).toBe('HKC-IHM_Sea-Falcon-7_WO-2440.docx');
    const zip = await JSZip.loadAsync(readFileSync((await docxDl.path())!));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Sea Falcon 7');
    expect(xml).toContain('Asbestos');
    expect(xml).toContain('HAZARDOUS MATERIALS DECLARED');

    // HTML export from the more-menu
    await page.getByTestId('export-more').click();
    const [htmlDl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-html').click()]);
    expect(htmlDl.suggestedFilename()).toMatch(/\.html$/);
    expect(readFileSync((await htmlDl.path())!).toString()).toContain('<h1>SUPPLIER');

    // Mark reviewed → Email → Sent (mailto carries subject + summary)
    await page.getByTestId('mark-reviewed').click();
    await expect(page.getByTestId('doc-status')).toHaveText(/Reviewed/);
    await expect(page.getByTestId('export-email')).toBeEnabled();
    await page.getByTestId('export-email').click();
    await page.getByTestId('email-to').fill('surveyor@class.example');
    await page.getByTestId('email-send').click();
    await expect(page.getByTestId('doc-status')).toHaveText(/Sent/);
    await expect(page.getByTestId('sent-confirmation')).toContainText('surveyor@class.example');
    const href = await page.getByTestId('sent-mailto').getAttribute('href');
    expect(href).toMatch(/^mailto:surveyor%40class\.example\?subject=/);
    expect(decodeURIComponent(href!)).toContain('Sea Falcon 7');
    await expect(page.getByTestId('input-vessel_name')).toBeDisabled();
    await page.screenshot({ path: 'test-results/shot-assemble-sent.png' });

    // the library received it with the right status and exports
    await page.goto('/#/library');
    const row = page.getByTestId('doc-row').filter({ hasText: 'WO-2440' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Sent');
  });

  test('a sent document cannot be sent again from draft, and editing a reviewed document returns it to draft', async ({ page }) => {
    await page.goto('/#/assemble/d_03'); // seeded IHM, status reviewed
    await expect(page.getByTestId('doc-status')).toHaveText(/Reviewed/);
    await page.getByTestId('input-desc').fill('Edited after review');
    await expect(page.getByTestId('doc-status')).toHaveText(/Draft/);
    await expect(page.getByTestId('export-email')).toBeDisabled();
    await expect(page.getByTestId('mark-reviewed')).toBeVisible();
  });

  test('a document whose template was deleted opens as a locked snapshot', async ({ page }) => {
    await page.goto('/#/templates/t_tiw');
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('delete-template').click();
    await page.goto('/#/assemble/d_19');
    await expect(page.getByTestId('template-missing')).toBeVisible();
    await expect(page.getByTestId('snapshot-paper')).toContainText('Toxic Industrial Waste Consignment Note');
  });
});
