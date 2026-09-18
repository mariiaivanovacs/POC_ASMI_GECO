import { describe, expect, it } from 'vitest';
import { seedActivity, seedLearners, seedMaterials } from '../../src/data/seed';
import { REGIMES, regimeById } from '../../src/data/compliance';
import { canIssueCertificate, cohortComplianceCoverage, complianceCoverage, reviewCoverage, type Ctx } from '../../src/store/stats';
import { buildCertificatePdf, verificationCode } from '../../src/engine/certificate';
import { toXapiStatements } from '../../src/engine/xapi';

function ctx(extra: Partial<Ctx> = {}): Ctx {
  const { materials, exercises } = seedMaterials();
  const { attempts, enrollments } = seedActivity(exercises);
  return { learners: seedLearners(), materials, exercises, attempts, enrollments, certificates: [], now: Date.now(), ...extra };
}

describe('compliance reference data', () => {
  it('every regime has the fields the UI relies on', () => {
    for (const r of REGIMES) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.authority).toBeTruthy();
      expect(r.renewalMonths).toBeGreaterThan(0);
    }
    expect(regimeById('hotwork')?.name).toContain('Hot Work');
    expect(regimeById('nope')).toBeUndefined();
  });

  it('seed materials are tagged to a regime consistent with their content', () => {
    const c = ctx();
    const hw = c.materials.find((m) => m.id === 'hw')!;
    const rig = c.materials.find((m) => m.id === 'rig')!;
    expect(hw.complianceIds).toContain('hotwork');
    expect(rig.complianceIds).toEqual(expect.arrayContaining(['cranes', 'bizsafe']));
  });
});

describe('review coverage and certificate eligibility', () => {
  it('hand-written seed exercises are pre-approved, generated ones start as draft', () => {
    const c = ctx();
    const handwritten = c.exercises.find((e) => e.id === 'hw_h_mcq')!;
    expect(handwritten.reviewStatus).toBe('approved');
    expect(handwritten.reviewedBy).toBeTruthy();
    const generated = c.exercises.find((e) => e.materialId === 'hw' && e.generated)!;
    expect(generated.reviewStatus).toBe('draft');
  });

  it('reviewCoverage counts approved/draft/rejected correctly', () => {
    const c = ctx();
    const cov = reviewCoverage(c, 'hw');
    expect(cov.total).toBe(c.exercises.filter((e) => e.materialId === 'hw').length);
    expect(cov.approved + cov.draft + cov.rejected).toBe(cov.total);
    expect(cov.approved).toBeGreaterThanOrEqual(7); // the 7 hand-written tasks
  });

  it('a certificate cannot be issued while any task is still draft, even at 100% progress', () => {
    const c = ctx();
    // l5 is 100% complete on hw per the seed activity, but hw has generated draft tasks on top of the approved ones
    expect(canIssueCertificate(c, 'l5', 'hw')).toBe(false);
    const approvedAll = { ...c, exercises: c.exercises.map((e) => (e.materialId === 'hw' ? { ...e, reviewStatus: 'approved' as const } : e)) };
    expect(canIssueCertificate(approvedAll, 'l5', 'hw')).toBe(true);
  });

  it('a certificate cannot be issued below 100% progress even if everything is approved', () => {
    const c = ctx();
    const approvedAll = { ...c, exercises: c.exercises.map((e) => (e.materialId === 'hw' ? { ...e, reviewStatus: 'approved' as const } : e)) };
    expect(canIssueCertificate(approvedAll, 'l1', 'hw')).toBe(false); // l1 is only partially through hw
  });
});

describe('compliance coverage', () => {
  it('not-covered when no certificate has been issued yet, even if enrolled', () => {
    const c = ctx();
    const [row] = complianceCoverage(c, 'l5', ['hotwork']);
    expect(row.status).toBe('not-covered');
  });

  it('moves to compliant / expiring / expired based on certificate expiry', () => {
    const c = ctx();
    const now = c.now;
    const compliant = { ...c, certificates: [{ id: 'c1', learnerId: 'l5', materialId: 'hw', issuedAt: now - 10, expiresAt: now + 400 * 86_400_000, code: 'X', issuedBy: 'T' }] };
    expect(complianceCoverage(compliant, 'l5', ['hotwork'])[0].status).toBe('compliant');
    const expiring = { ...c, certificates: [{ id: 'c2', learnerId: 'l5', materialId: 'hw', issuedAt: now - 10, expiresAt: now + 5 * 86_400_000, code: 'X', issuedBy: 'T' }] };
    expect(complianceCoverage(expiring, 'l5', ['hotwork'])[0].status).toBe('expiring');
    const expired = { ...c, certificates: [{ id: 'c3', learnerId: 'l5', materialId: 'hw', issuedAt: now - 500 * 86_400_000, expiresAt: now - 5, code: 'X', issuedBy: 'T' }] };
    expect(complianceCoverage(expired, 'l5', ['hotwork'])[0].status).toBe('expired');
  });

  it('cohortComplianceCoverage only counts learners the regime actually applies to', () => {
    const c = ctx();
    const cov = cohortComplianceCoverage(c, c.learners.map((l) => l.id), 'igf');
    expect(cov.applicable).toBe(0); // no seeded learner is enrolled in the LNG/IGF module
    const hotwork = cohortComplianceCoverage(c, c.learners.map((l) => l.id), 'hotwork');
    expect(hotwork.applicable).toBeGreaterThan(0);
    expect(hotwork.applicable).toBe(hotwork.compliant + hotwork.expiring + hotwork.expired + hotwork.notCovered);
  });
});

describe('certificate PDF and verification code', () => {
  it('produces a deterministic, distinguishing verification code', () => {
    const t = 1700000000000;
    const a = verificationCode('l5', 'hw', t);
    const b = verificationCode('l5', 'hw', t);
    const c2 = verificationCode('l5', 'erp', t);
    expect(a).toBe(b);
    expect(a).not.toBe(c2);
    expect(a).toMatch(/^HL-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it('builds a real, non-trivial PDF file', async () => {
    const ctxData = ctx();
    const learner = ctxData.learners.find((l) => l.id === 'l5')!;
    const material = ctxData.materials.find((m) => m.id === 'hw')!;
    const cert = { id: 'c1', learnerId: learner.id, materialId: material.id, issuedAt: Date.now(), expiresAt: Date.now() + 1000, code: 'HL-TEST-0001', issuedBy: 'Test Reviewer' };
    const bytes = await buildCertificatePdf({ learner, material, cert, regimes: material.complianceIds.map(regimeById).filter((r): r is NonNullable<typeof r> => !!r), score: 90 });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])).toBe('%PDF-');
  });
});

describe('xAPI export', () => {
  it('produces one structurally valid statement per recorded attempt', () => {
    const c = ctx();
    const statements = toXapiStatements(c, ['l5']);
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s.actor.mbox).toMatch(/^mailto:l5@/);
      expect(['http://adlnet.gov/expapi/verbs/passed', 'http://adlnet.gov/expapi/verbs/failed']).toContain(s.verb.id);
      expect(s.result.score.scaled).toBeGreaterThanOrEqual(0);
      expect(s.result.score.scaled).toBeLessThanOrEqual(1);
      expect(() => new Date(s.timestamp).toISOString()).not.toThrow();
    }
    expect(toXapiStatements(c, ['does-not-exist'])).toEqual([]);
  });
});

describe('certificate text safety', () => {
  it('builds the PDF for a module name with a subscript and dashes instead of throwing', async () => {
    const { pdfSafe } = await import('../../src/engine/certificate');
    expect(pdfSafe('ERP-03 Emergency Response — fire, H₂S release')).toBe('ERP-03 Emergency Response - fire, H2S release');
    const ctxData = ctx();
    const learner = ctxData.learners.find((l) => l.id === 'l5')!;
    const material = ctxData.materials.find((m) => m.id === 'erp')!;
    const cert = { id: 'c1', learnerId: learner.id, materialId: material.id, issuedAt: Date.now(), expiresAt: Date.now() + 1000, code: 'HL-TEST-0002', issuedBy: 'Harbourline Safety Team — HSE' };
    const bytes = await buildCertificatePdf({ learner, material, cert, regimes: material.complianceIds.map(regimeById).filter((r): r is NonNullable<typeof r> => !!r), score: 88 });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
