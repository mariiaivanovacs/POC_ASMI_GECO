import { expect, test, type Page } from '@playwright/test';

const CANNED = {
  exercises: [
    { type: 'mcq', title: 'Scaffold tag validity', step: 1, level: 'all',
      en: { q: 'A green scaffold tag is valid for how long?', opts: ['3 days', '7 days', '30 days', 'Until the next job'], correct: 1, hint: 'Slide 2.', ok: 'Right — 7 days.', no: 'The tag is valid for 7 days.' },
      bm: { q: 'Tag perancah hijau sah untuk berapa lama?', opts: ['3 hari', '7 hari', '30 hari', 'Sehingga kerja seterusnya'], correct: 1, hint: 'Slaid 2.', ok: 'Betul — 7 hari.', no: 'Tag sah selama 7 hari.' },
      zh: { q: '绿色脚手架标签有效期多久？', opts: ['3 天', '7 天', '30 天', '直到下一项工作'], correct: 1, hint: '第 2 页。', ok: '正确 — 7 天。', no: '标签有效期为 7 天。' } },
    { type: 'photo', title: 'Photo: scaffold tag', step: 1, level: 'all', en: { title: 'Photo checkpoint', body: 'Photograph the scaffold tag at the access point.', btn: 'Take photo', done: 'Tag visible.', item: 'Scaffold tag' } },
    { type: 'match', title: 'Scaffold terms', step: null, level: 'new', en: { title: 'Match', pairs: [['Toe board', 'Stops tools falling'], ['Mid rail', 'Halfway guardrail'], ['Twin lanyard', 'Stay clipped while moving']], hint: '', done: 'Done' } },
  ],
  widgets: { qaCaption: 'Scaffold basics', qa: [['Tag colour that means do not use?', 'Red'], ['Minimum toe board height?', '150 mm'], ['Max gap between planks?', '25 mm']], audioCaption: 'Scaffold supervisor call', audioTranscript: 'Scaffold crew to all hands, the north tower tag is red, nobody goes up until we re-inspect.', audio: ['Stay off the north tower', 'Use the north tower carefully', 'Remove the red tag'], audioCorrect: 0, cards: [['Toe board', 'Stops tools falling'], ['Mid rail', 'Halfway guardrail'], ['Twin lanyard', 'Stay clipped while moving']], fill: { pre: 'A green tag is valid for', mid: 'and planks may not gap more than', post: '.', ans: ['7 days', '25 mm'], tokens: ['7 days', '25 mm', '30 days', '50 mm'] } },
};

async function enableDeepSeek(page: Page) {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('provider-toggle').getByText('DeepSeek AI').click();
  await page.getByTestId('api-key').fill('sk-test-key');
  await page.getByTestId('save-key').click();
  await page.getByRole('button', { name: 'Close' }).click();
}

test.describe('DeepSeek provider (API mocked)', () => {
  test('settings test-connection reports the proxy result', async ({ page }) => {
    await page.route('**/api/deepseek/models', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }) }));
    await page.goto('/#/materials');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('provider-toggle').getByText('DeepSeek AI').click();
    await page.getByTestId('api-key').fill('sk-test-key');
    await page.getByTestId('test-key').click();
    await expect(page.getByTestId('test-result')).toContainText('Connected — 2 models');
  });

  test('processing sends the document to DeepSeek and uses its exercises, widgets and translations', async ({ page }) => {
    let sentBody = '';
    await page.route('**/api/deepseek/chat/completions', async (r) => {
      sentBody = r.request().postData() || '';
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANNED) } }] }) });
    });
    await page.goto('/#/materials');
    await enableDeepSeek(page);
    const wah = page.getByTestId('material-row').filter({ hasText: 'Working at height' });
    await wah.getByTestId('process').click();
    await expect(wah).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    expect(sentBody).toContain('deepseek-chat');
    expect(sentBody).toContain('Working at height');
    expect(sentBody).toContain('Bahasa Melayu');
    await expect(wah.getByTestId('source-badge')).toHaveText('DeepSeek');
    await expect(wah).toContainText('3 exercises · EN, BM, 中文');
    await expect(page.getByTestId('widget-qa')).toContainText('Scaffold basics');
    await expect(page.getByTestId('widget-audio')).toContainText('Scaffold supervisor call');
    await page.getByTestId('open-builder').click();
    await expect(page.getByTestId('phone-body')).toContainText('green scaffold tag is valid');
    await page.getByTestId('lang-toggle').getByText('中文').click();
    await expect(page.getByTestId('phone-body')).toContainText('绿色脚手架标签');
  });

  test('a failing DeepSeek call falls back to the offline engine and says so', async ({ page }) => {
    await page.route('**/api/deepseek/chat/completions', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await page.goto('/#/materials');
    await enableDeepSeek(page);
    const lng = page.getByTestId('material-row').filter({ hasText: 'LNG bunkering' });
    await lng.getByTestId('process').click();
    await expect(lng).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    await expect(lng.getByTestId('source-badge')).toHaveText('Offline');
    await expect(page.getByTestId('toast').filter({ hasText: 'rejected the API key' })).toBeVisible();
    await expect(lng).toContainText(/\d+ exercises/);
  });

  test('DeepSeek selected without a key still processes offline with a note', async ({ page }) => {
    await page.goto('/#/materials');
    await page.getByTestId('open-settings').click();
    await page.getByTestId('provider-toggle').getByText('DeepSeek AI').click();
    await page.getByRole('button', { name: 'Close' }).click();
    const eng = page.getByTestId('material-row').filter({ hasText: 'engine overhaul' });
    await eng.getByTestId('process').click();
    await expect(eng).toHaveAttribute('data-status', 'processed', { timeout: 20_000 });
    await expect(page.getByTestId('toast').filter({ hasText: 'no API key' })).toBeVisible();
  });
});
