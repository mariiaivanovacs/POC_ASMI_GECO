import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('Templates — cards, selection → field, signature identification', () => {
  test('◀ ▶ and the arrow keys switch between templates like cards', async ({ page }) => {
    await page.goto('/#/templates');
    await expect(page.getByTestId('doc-name')).toHaveText('IHM Supplier Declaration of Conformity');
    await expect(page.getByTestId('template-pos')).toHaveText('1 / 7');
    await page.getByTestId('template-next').click();
    await expect(page.getByTestId('doc-name')).toHaveText('SHMS Audit Evidence Pack');
    await expect(page.getByTestId('template-pos')).toHaveText('2 / 7');
    await page.getByTestId('template-prev').click();
    await page.getByTestId('template-prev').click(); // wraps around
    await expect(page.getByTestId('doc-name')).toHaveText('Supplier ESG / Scope 3 Data Response');
    await page.getByTestId('template-strip').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('doc-name')).toHaveText('IHM Supplier Declaration of Conformity');
    await expect(page.getByTestId('template-chip').first()).toHaveAttribute('data-active', 'true');
  });

  test('selecting text in the document turns it into a field; selections inside a field are refused', async ({ page }) => {
    await page.goto('/#/templates/t_ihm');
    await expect(page.getByTestId('select-hint')).toBeVisible();
    const before = await page.getByTestId('field-row').count();
    // select "complete and accurate" inside the declaration paragraph
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('[data-line]')).find((x) => x.textContent!.includes('complete and accurate'))!;
      const tn = Array.from(el.childNodes).map((n) => (n.nodeType === 3 ? n : n.firstChild)).find((n) => n && n.textContent!.includes('complete and accurate'))!;
      const i = tn.textContent!.indexOf('complete and accurate');
      const r = document.createRange(); r.setStart(tn, i); r.setEnd(tn, i + 'complete and accurate'.length);
      const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r);
    });
    await page.getByTestId('paper').dispatchEvent('mouseup');
    await expect(page.getByTestId('add-field-popover')).toContainText('complete and accurate');
    await page.getByTestId('add-field-label').fill('Accuracy statement');
    await page.getByTestId('add-field-type').selectOption('list');
    await page.getByTestId('add-field-confirm').click();
    await expect(page.getByTestId('toast').last()).toContainText('Added the field "Accuracy statement"');
    await expect(page.getByTestId('field-row')).toHaveCount(before + 1);
    const row = page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{accuracy_statement}}' }) });
    await expect(row).toHaveAttribute('data-type', 'list');
    await expect(row.getByTestId('field-tag')).toHaveText('added by you');
    await expect(row.getByTestId('field-conf')).toHaveText('100%');
    await expect(page.locator('[data-testid="static-field"][data-key="accuracy_statement"]')).toHaveText('complete and accurate');
    await page.getByTestId('mode-dynamic').click();
    await expect(page.getByTestId('merge-field').filter({ hasText: '{{accuracy_statement}}' })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('field-key').filter({ hasText: '{{accuracy_statement}}' })).toBeVisible();

    // a selection that touches an existing field is refused with a reason
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="static-field"][data-key="vessel_name"]')!.firstChild!;
      const r = document.createRange(); r.setStart(el, 0); r.setEnd(el, 5);
      const s = window.getSelection()!; s.removeAllRanges(); s.addRange(r);
    });
    await page.getByTestId('paper').dispatchEvent('mouseup');
    await expect(page.getByTestId('add-field-popover')).toHaveAttribute('data-invalid', 'true');
  });

  test('a real mouse drag over undetected prose offers the field; labels and existing fields explain why not', async ({ page }) => {
    await page.goto('/#/templates/t_ihm');
    // drag across "Tuas yard berth 4" in the prose line that the detector left alone
    const line = page.locator('[data-line]').filter({ hasText: 'Tuas yard berth 4' });
    const box = await line.evaluate((el) => { const range = document.createRange(); const tn = Array.from(el.childNodes).map((n) => (n.nodeType === 3 ? n : n.firstChild)).find((n) => n && n.textContent!.includes('Tuas yard berth 4'))!; const i = tn.textContent!.indexOf('Tuas yard berth 4'); range.setStart(tn, i); range.setEnd(tn, i + 'Tuas yard berth 4'.length); const r = range.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
    await page.mouse.move(box.x + 1, box.y); await page.mouse.down(); await page.mouse.move(box.x + box.w - 1, box.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('add-field-popover')).toContainText('Tuas yard berth 4');
    await page.getByTestId('add-field-label').fill('Berth');
    await page.getByTestId('add-field-confirm').click();
    await expect(page.getByTestId('field-key').filter({ hasText: '{{berth}}' })).toBeVisible();

    // a label is refused with a specific message
    const lbl = page.locator('.plbl').filter({ hasText: 'Vessel name' }).first();
    const lb = (await lbl.boundingBox())!;
    await page.mouse.move(lb.x + 2, lb.y + lb.height / 2); await page.mouse.down(); await page.mouse.move(lb.x + lb.width - 4, lb.y + lb.height / 2, { steps: 5 }); await page.mouse.up();
    await expect(page.getByTestId('add-field-popover')).toHaveAttribute('data-invalid', 'true');
    await expect(page.getByTestId('add-field-popover')).toContainText('field label');
    // works in the dynamic view too
    await page.getByTestId('mode-dynamic').click();
    await expect(page.getByTestId('select-hint')).toBeVisible();

    // the new field is an input on the Assemble step and fills the sentence in the document
    await page.getByTestId('assemble-from-template').click();
    await expect(page).toHaveURL(/#\/assemble\/d_/);
    await page.getByTestId('input-berth').fill('Tuas yard berth 9');
    await expect(page.getByTestId('paper')).toContainText('applied at Tuas yard berth 9 by a crew');
    await expect(page.locator('[data-testid="live-field"][data-key="berth"]')).toHaveText('Tuas yard berth 9');
  });

  test('the signature block names who signs and the signing date', async ({ page }) => {
    await page.goto('/#/templates/t_ihm');
    await expect(page.getByTestId('log-signature')).toContainText('Section 5: signed by {{auth_person}}, dated {{date}}');
    await expect(page.getByTestId('signature-marker')).toHaveText('signature block · date');
    await expect(page.getByTestId('signature-who')).toHaveText('Rachel Tan, QA Manager');
    await expect(page.getByTestId('signature-date')).toHaveText('17 Sep 2026');
    await expect(page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{auth_person}}' }) }).getByTestId('field-tag')).toHaveText('signs here');
    await expect(page.getByTestId('field-row').filter({ has: page.getByTestId('field-key').filter({ hasText: '{{date}}' }) }).getByTestId('field-tag')).toHaveText('signing date');
    await page.getByTestId('mode-dynamic').click();
    await expect(page.getByTestId('signature-who')).toHaveText('{{auth_person}}');
    await page.screenshot({ path: 'test-results/shot-signature.png' });
  });
});

test.describe('Assemble — attached data → calculated fields', () => {
  test('a CSV drum log is summed into Quantity, shown as calculated, and unlinked when typed over', async ({ page }) => {
    await page.goto('/#/assemble');
    await page.getByTestId('template-select').selectOption('t_tiw');
    await expect(page.getByTestId('attachments-empty')).toContainText('number field');
    await page.getByTestId('calc-qty').click();
    await expect(page.getByTestId('calc-box-qty')).toContainText('No data attached yet');

    await page.getByTestId('attach-input').setInputFiles(path.resolve('tests/e2e/fixtures/drums.csv'));
    await expect(page.getByTestId('toast').last()).toContainText('drums.csv attached — 4 rows × 4 columns');
    await expect(page.getByTestId('attachment')).toHaveCount(1);
    await expect(page.getByTestId('attachment')).toContainText('numeric: quantity');

    await expect(page.getByTestId('calc-preview-qty')).toContainText('640 kg');
    await page.getByTestId('calc-fn-qty').selectOption('avg');
    await expect(page.getByTestId('calc-preview-qty')).toContainText('160 kg');
    await page.getByTestId('calc-fn-qty').selectOption('sum');
    await page.getByTestId('calc-apply-qty').click();
    await expect(page.getByTestId('input-qty')).toHaveValue('640 kg');
    await expect(page.getByTestId('bound-qty')).toContainText('sum of quantity from drums.csv · 4 rows');
    await expect(page.getByTestId('live-field').filter({ hasText: '640 kg' })).toBeVisible();
    await expect(page.getByTestId('attachment')).toContainText('feeds Quantity');
    await page.screenshot({ path: 'test-results/shot-calculated.png' });

    // the seed ESG document carries a bound fuel table
    await page.reload();
    await expect(page.getByTestId('bound-qty')).toBeVisible();
    await page.getByTestId('input-qty').fill('700 kg');
    await expect(page.getByTestId('bound-qty')).toHaveCount(0);

    // wrong file types are refused; removing an attachment keeps the last value
    await page.getByTestId('attach-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(page.getByTestId('toast').last()).toContainText('not one');
    await page.getByTestId('attachment-remove').click();
    await expect(page.getByTestId('attachment')).toHaveCount(0);
    await expect(page.getByTestId('input-qty')).toHaveValue('700 kg');
  });

  test('the seeded ESG response shows its diesel and electricity totals as calculated fields', async ({ page }) => {
    await page.goto('/#/assemble/d_21'); // the sent ESG response
    await expect(page.getByTestId('attachment')).toContainText('fuel-and-power-FY2025.csv');
    await expect(page.getByTestId('bound-diesel_consumed')).toContainText('sum of diesel_litres');
    await expect(page.getByTestId('input-diesel_consumed')).toHaveValue('84,200 L');
    await expect(page.getByTestId('input-electricity_consumed')).toHaveValue('312,500 kWh');
  });
});

test('Library template cards carry identifying visuals and still filter', async ({ page }) => {
  await page.goto('/#/library');
  const card = page.getByTestId('template-card').first();
  await expect(card.getByTestId('card-code')).toHaveText('SDoC-01');
  await expect(card.getByTestId('card-count')).toHaveText('5');
  await expect(card.getByTestId('card-statusbar')).toBeVisible();
  await expect(card.getByTestId('card-spark')).toBeVisible();
  await expect(card).toContainText('1 draft');
  await expect(card).toContainText('3 sent');
  await card.click();
  await expect(page.getByTestId('doc-row')).toHaveCount(5);
});
