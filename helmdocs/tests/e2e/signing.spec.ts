import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

test.describe('Signatures — library, signing, the seal', () => {
  test('type a signature in Settings, sign a document, edit it → seal breaks, re-sign, exports carry the image', async ({ page }) => {
    // signature library in Settings: Type tab
    await page.goto('/#/assemble/d_03');
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('signature-card')).toHaveCount(0);
    await expect(page.getByTestId('add-signature')).toBeVisible();
    await page.getByTestId('signature-tab-type').click();
    await page.getByTestId('signature-owner').selectOption('Rachel Tan, QA Manager');
    await page.getByTestId('signature-typed').fill('Rachel Tan');
    await page.getByTestId('signature-save').click();
    await expect(page.getByTestId('signature-card')).toHaveCount(1);
    await expect(page.getByTestId('signature-card')).toHaveAttribute('data-default', 'true');
    await expect(page.getByTestId('signature-card').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await page.getByRole('button', { name: 'Close' }).click();

    // sign the reviewed IHM document
    await expect(page.getByTestId('sign-button')).toHaveText(/Sign$/);
    await page.getByTestId('sign-button').click();
    await expect(page.getByTestId('sign-popover')).toContainText('Rachel Tan, QA Manager');
    await page.getByTestId('signature-use').click();
    await expect(page.getByTestId('toast').last()).toContainText('sealed with SHA-256');
    await expect(page.getByTestId('seal-card')).toHaveAttribute('data-state', 'valid');
    await expect(page.getByTestId('signature-image')).toBeVisible();
    await expect(page.getByTestId('paper-seal')).toHaveAttribute('data-state', 'valid');
    await expect(page.locator('[data-testid="check"][data-id="seal"]')).toHaveAttribute('data-ok', 'true');
    await expect(page.getByTestId('sign-button')).toHaveText(/Signed/);
    await page.screenshot({ path: 'test-results/shot-signed.png' });

    // signed PDF and DOCX carry the image + seal line
    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()]);
    const pdfBytes = readFileSync((await pdf.path())!);
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBytes.toString('latin1')).toContain('/Image');
    const [docx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    const zip = await JSZip.loadAsync(readFileSync((await docx.path())!));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Signed by Rachel Tan, QA Manager');

    // change one character → the seal breaks, the image is withheld, the check fails
    await page.getByTestId('input-qty').fill('3.3 kg');
    await expect(page.getByTestId('seal-card')).toHaveAttribute('data-state', 'broken');
    await expect(page.getByTestId('signature-image')).toHaveCount(0);
    await expect(page.getByTestId('paper-seal')).toHaveAttribute('data-state', 'broken');
    await expect(page.locator('[data-testid="check"][data-id="seal"]')).toHaveAttribute('data-ok', 'false');
    await expect(page.getByTestId('sign-button')).toHaveText(/Re-sign/);
    await page.screenshot({ path: 'test-results/shot-seal-broken.png' });
    const [docx2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-docx').click()]);
    const zip2 = await JSZip.loadAsync(readFileSync((await docx2.path())!));
    expect(Object.keys(zip2.files).some((f) => f.startsWith('word/media/'))).toBe(false);
    expect(await zip2.file('word/document.xml')!.async('string')).toContain('UNSIGNED COPY');

    // re-sign → valid again; survives reload; remove signature
    await page.getByTestId('sign-button').click();
    await page.getByTestId('signature-use').click();
    await expect(page.getByTestId('seal-card')).toHaveAttribute('data-state', 'valid');
    await page.reload();
    await expect(page.getByTestId('seal-card')).toHaveAttribute('data-state', 'valid');
    await page.getByTestId('sign-button').click();
    await page.getByTestId('unsign').click();
    await expect(page.getByTestId('seal-card')).toHaveCount(0);
  });

  test('draw a signature on the pad and upload one with the white background removed', async ({ page }) => {
    await page.goto('/#/assemble/d_15'); // PTW, reviewed
    await page.getByTestId('sign-button').click();
    const pad = page.getByTestId('signature-pad');
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 90); await page.mouse.down();
    for (let i = 1; i <= 40; i++) await page.mouse.move(box.x + 20 + i * 10, box.y + 90 + Math.sin(i / 3) * 30);
    await page.mouse.up();
    await expect(page.getByTestId('add-signature')).toContainText('1 stroke');
    await page.getByTestId('signature-owner').selectOption('Sean Lim, Yard Supervisor');
    await page.getByTestId('signature-save').click();
    await expect(page.getByTestId('signature-card')).toHaveCount(1);

    // upload: a 4×4 PNG with a white background and one dark pixel
    await page.getByTestId('signature-add').click();
    await page.getByTestId('signature-tab-upload').click();
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 20; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, 40, 20); x.fillStyle = '#123'; x.fillRect(10, 8, 20, 4); return c.toDataURL('image/png').split(',')[1]; });
    await page.getByTestId('signature-file').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await expect(page.getByTestId('signature-upload-preview')).toBeVisible();
    const transparentCorner = await page.evaluate(async () => { const img = document.querySelector('[data-testid="signature-upload-preview"]') as HTMLImageElement; await new Promise((r) => { if (img.complete) r(0); else img.onload = () => r(0); }); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d')!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, 1, 1).data[3]; });
    expect(transparentCorner).toBe(0);
    await page.getByTestId('signature-save').click();
    await expect(page.getByTestId('signature-card')).toHaveCount(2);
    await page.getByTestId('signature-use').first().click();
    await expect(page.getByTestId('seal-card')).toHaveAttribute('data-state', 'valid');
  });

  test('sample data files download from the Attached data card and can be dropped back in', async ({ page }) => {
    await page.goto('/#/assemble');
    await page.getByTestId('template-select').selectOption('t_tiw');
    await expect(page.getByTestId('sample-download')).toHaveCount(4);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('sample-download').first().click()]);
    expect(dl.suggestedFilename()).toBe('drum-log-WO-2418.csv');
    const path = (await dl.path())!;
    expect(readFileSync(path).toString()).toContain('quantity_kg');
    await page.getByTestId('attach-input').setInputFiles({ name: 'drum-log-WO-2418.csv', mimeType: 'text/csv', buffer: readFileSync(path) });
    await expect(page.getByTestId('attachment')).toContainText('6 rows × 5 columns');
    await page.getByTestId('calc-qty').click();
    await expect(page.getByTestId('calc-preview-qty')).toContainText('750 kg');
  });
});
