import { expect, test } from '@playwright/test';

// Reproduces a real browser that had HelmLearn open before complianceIds/reviewStatus/audit/
// certificates existed in the data model — old persisted JSON is missing those fields entirely.
const OLD_SHAPE_STATE = {
  materials: [
    { id: 'hw', name: 'SOP-HW-04 Hot Work Permit Procedure', short: 'SOP-HW-04 Hot Work Permit', ext: 'pdf', kind: 'PDF document', category: 'safety', pages: 6, status: 'processed', stage: 'ready', pct: 100, error: null, text: 'Obtain a Hot Work Permit', structure: { title: 'x', sentences: [], steps: [], hazards: [], ppe: [], facts: [], terms: [] }, widgets: { qaCaption: 'x', qa: [], audioCaption: 'x', audioLen: '0:00', audioTranscript: 'x', audio: [], audioCorrect: 0, cards: [], fill: { pre: '', mid: '', post: '', ans: ['', ''], tokens: [] } }, seed: 1, createdAt: Date.now(), langs: ['en'], missingTypes: [] /* no complianceIds, no source, no note — pre-migration shape */ },
  ],
  exercises: [
    { id: 'hw_old_1', materialId: 'hw', type: 'mcq', level: 'all', title: 'Old cached task', sourceRef: 'x', stepIndex: null, generated: true, i18n: { en: { type: 'mcq', data: { q: 'q?', opts: ['a', 'b'], correct: 0, hint: '', ok: 'ok', no: 'no' } } } /* no reviewStatus/reviewedBy/reviewedAt/reviewNote — pre-migration shape */ },
  ],
  learners: [{ id: 'l1', name: 'Test Learner', code: 'T-1', joined: 'Jan 2026', role: 'Welder', dept: 'Hull & coating', level: 'new', lang: 'English', sup: 'Boss', avatar: { bg: '#fff', skin: '#fff', hat: '#fff', shirt: '#fff' } }],
  attempts: [],
  enrollments: [{ learnerId: 'l1', materialId: 'hw', at: Date.now() }],
  settings: { pin: '1234', lang: 'en', playAs: 'l1' /* no provider/apiKey/translate/reviewerName/reviewerRole */ },
  seededAt: Date.now(),
  // no refreshers, acked, audit or certificates keys at all — the pre-this-session shape
};

test.describe('Backward compatibility with pre-existing browser state', () => {
  test('a browser with old cached state (no complianceIds/reviewStatus/audit/certificates) still renders every page', async ({ page }) => {
    await page.addInitScript((state) => {
      window.localStorage.setItem('helmlearn-v1', JSON.stringify({ state, version: 0 }));
    }, OLD_SHAPE_STATE);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const path of ['/#/materials', '/#/builder/hw', '/#/learners', '/#/compliance', '/#/quality']) {
      await page.goto(path); await page.waitForTimeout(400);
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.locator('#root')).not.toBeEmpty();
    }

    expect(errors, errors.join('\n')).toEqual([]);
    await page.goto('/#/materials');
    await expect(page.getByTestId('material-row').first()).toContainText('SOP-HW-04');

    // the old exercise was silently upgraded to a real review status rather than crashing the page
    await page.goto('/#/builder/hw');
    await expect(page.getByTestId('task-row').first()).toHaveAttribute('data-review', 'draft');

    // compliance page reads the backfilled complianceIds without throwing
    await page.goto('/#/compliance');
    await expect(page.locator('[data-testid="matrix-regime"][data-regime="hotwork"]')).toBeVisible();
  });
});
