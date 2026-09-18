export type Lang = 'en' | 'bm' | 'zh';
export type Category = 'safety' | 'emergency' | 'technical' | 'refresher' | 'advanced';
export type MaterialStatus = 'queued' | 'processing' | 'processed' | 'failed';
export type Stage = 'reading' | 'extracting' | 'drafting' | 'audio' | 'ready';
export type ExType = 'mcq' | 'seq' | 'scen' | 'audio' | 'photo' | 'match' | 'sign' | 'cards' | 'fill';
export type Level = 'all' | 'new' | 'exp';
export type LearnerLevel = 'new' | 'exp';

export interface Fact { value: number; unit: string; sentence: string; raw: string }
export interface Term { term: string; def: string }
export interface Hazard { name: string; sentence: string }

export interface Structure {
  title: string;
  sentences: string[];
  steps: string[];
  hazards: Hazard[];
  ppe: string[];
  facts: Fact[];
  terms: Term[];
}

export interface McqPayload { q: string; opts: string[]; correct: number; hint: string; ok: string; no: string }
export interface SeqPayload { title: string; items: string[]; hint: string; ok: string; no: string }
export interface ScenPayload { title: string; opts: string[]; correct: number; ok: string; no: string }
export interface AudioPayload { title: string; body: string; hint: string; opts: string[]; correct: number; ok: string; no: string; transcript: string }
export interface PhotoPayload { title: string; body: string; btn: string; done: string; item: string }
export interface MatchPayload { title: string; pairs: [string, string][]; hint: string; done: string }
export interface SignPayload { title: string; body: string; items: string[]; pin: string; ready: string }
export interface CardsPayload { title: string; cards: [string, string][]; hint: string; done: string }
export interface FillPayload { title: string; pre: string; mid: string; post: string; ans: [string, string]; tokens: string[]; hint: string; ok: string; no: string }

export type Payload =
  | { type: 'mcq'; data: McqPayload }
  | { type: 'seq'; data: SeqPayload }
  | { type: 'scen'; data: ScenPayload }
  | { type: 'audio'; data: AudioPayload }
  | { type: 'photo'; data: PhotoPayload }
  | { type: 'match'; data: MatchPayload }
  | { type: 'sign'; data: SignPayload }
  | { type: 'cards'; data: CardsPayload }
  | { type: 'fill'; data: FillPayload };

export interface Exercise {
  id: string;
  materialId: string;
  type: ExType;
  level: Level;
  title: string;
  sourceRef: string;
  stepIndex: number | null;
  i18n: Partial<Record<Lang, Payload>> & { en: Payload };
  generated: boolean;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
}

export interface Widgets {
  qaCaption: string;
  qa: [string, string][];
  audioCaption: string;
  audioLen: string;
  audioTranscript: string;
  audio: string[];
  audioCorrect: number;
  cards: [string, string][];
  fill: { pre: string; mid: string; post: string; ans: [string, string]; tokens: string[] };
}

export interface Material {
  id: string;
  name: string;
  short: string;
  ext: string;
  kind: string;
  category: Category;
  pages: number;
  status: MaterialStatus;
  stage: Stage | null;
  pct: number;
  error: string | null;
  text: string | null;
  structure: Structure | null;
  widgets: Widgets | null;
  seed: number;
  createdAt: number;
  langs: Lang[];
  missingTypes: ExType[];
  source: 'local' | 'deepseek';
  note: string | null;
  complianceIds: string[];
  sourceUrl: string | null;
}

export interface Avatar { bg: string; skin: string; hat: string; shirt: string }

export interface Learner {
  id: string;
  name: string;
  code: string;
  joined: string;
  role: string;
  dept: string;
  level: LearnerLevel;
  lang: string;
  sup: string;
  avatar: Avatar;
}

export interface Attempt {
  id: string;
  learnerId: string;
  materialId: string;
  exerciseId: string;
  type: ExType;
  score: number;
  passed: boolean;
  seconds: number;
  at: number;
}

export interface Enrollment { learnerId: string; materialId: string; at: number }

export interface ComplianceRegime {
  id: string;
  name: string;
  authority: string;
  summary: string;
  evidence: string;
  renewalMonths: number;
  renewalNote: string;
}

export type AuditAction = 'material_processed' | 'exercise_approved' | 'exercise_rejected' | 'exercise_edited' | 'module_published' | 'certificate_issued' | 'learner_enrolled' | 'reminder_sent';
export type AuditTarget = 'material' | 'exercise' | 'module' | 'certificate' | 'learner';
export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  role: ReviewerRole | 'System';
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  detail: string;
}

export interface Certificate {
  id: string;
  learnerId: string;
  materialId: string;
  issuedAt: number;
  expiresAt: number;
  code: string;
  issuedBy: string;
}

export type ReviewStatus = 'draft' | 'approved' | 'rejected';
export type ReviewerRole = 'Trainer' | 'HSE Manager' | 'Supervisor' | 'Auditor';
export type Provider = 'local' | 'deepseek';
export interface Settings { pin: string; lang: Lang; playAs: string; provider: Provider; apiKey: string; translate: boolean; reviewerName: string; reviewerRole: ReviewerRole }
export interface Refresher { learnerId: string; materialId: string; at: number; due: number }
export interface Reminder { learnerId: string; materialId: string; at: number; via: string }
