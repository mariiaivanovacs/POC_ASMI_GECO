export type FieldType = 'text' | 'number' | 'id' | 'date' | 'yesno' | 'list';
export type DocStatus = 'draft' | 'reviewed' | 'sent';
export type UploadStatus = 'queued' | 'processing' | 'detected' | 'failed';
export type Stage = 'reading' | 'detecting' | 'templating' | 'ready';
export type ExportKind = 'pdf' | 'docx' | 'email' | 'html';

export type Role = 'vessel' | 'imo' | 'workorder' | 'date' | 'quantity' | 'material' | 'company' | 'signatory' | 'yesno' | 'other';

export interface Field {
  key: string;
  role: Role;
  label: string;
  type: FieldType;
  confidence: number; // 0..100
  required: boolean;
  sample: string; // value seen in the uploaded form
  options?: string[]; // for list / yesno
  source: string; // the line the field was detected on
  manual?: boolean; // added by a person from a text selection
}

export interface Rule { field: string; op: 'eq' | 'neq' | 'notEmpty'; value: string }

export interface Table { cols: string[]; rows: string[][] }

export type Line = { kind: 'pair'; key: string } | { kind: 'text'; text: string /* may contain {{key}} placeholders */ };

export interface Section {
  id: string;
  heading: string;
  title: boolean; // the document's title block
  lines: Line[];
  table: Table | null;
  rule: Rule | null;
  signature: boolean;
}

export interface DetectionLog {
  pages: number;
  fieldsFound: number;
  conditionalSections: number;
  signatureBlocks: number;
  regime: string;
  ms: number;
}

export interface Template {
  id: string;
  name: string;
  regime: string;
  regimeShort: string;
  ext: string;
  pages: number;
  sourceText: string;
  fields: Field[];
  sections: Section[];
  detection: DetectionLog;
  manualMinutes: number; // demo baseline: minutes to draft this form by hand
  createdAt: number;
  seeded: boolean;
}

/** A data file attached to a document (CSV / TSV); its columns feed calculated fields. */
export interface Attachment { id: string; name: string; cols: string[]; rows: string[][]; addedAt: number }
export type AggFn = 'sum' | 'avg' | 'count' | 'min' | 'max';
/** A field whose value is calculated from an attachment column. */
export interface Binding { key: string; attachmentId: string; column: string; fn: AggFn }

export interface Doc {
  id: string;
  templateId: string;
  templateName: string; // snapshot — survives template deletion
  regimeShort: string;
  name: string; // file name
  values: Record<string, string>;
  status: DocStatus;
  createdAt: number;
  reviewedAt: number | null;
  sentAt: number | null;
  minutes: number; // time spent assembling (open → last edit)
  manualMinutes: number; // snapshot of the template's manual baseline
  lastEditAt: number;
  by: string;
  vessel: string;
  exports: ExportKind[];
  attachments: Attachment[];
  bindings: Binding[];
  signature: Seal | null;
  versions: Version[];
  seeded: boolean;
}

export interface Upload {
  id: string;
  fileName: string;
  ext: string;
  kind: string;
  status: UploadStatus;
  stage: Stage | null;
  pct: number;
  error: string | null;
  text: string | null;
  pages: number;
  detection: DetectionLog | null;
  fields: Field[];
  sections: Section[];
  regime: string;
  regimeShort: string;
  createdAt: number;
}

/** A stored handwritten signature: transparent PNG as a data URL, owned by one signatory. */
export interface Signature { id: string; owner: string; kind: 'draw' | 'upload' | 'type'; png: string; isDefault: boolean; createdAt: number }

/** The seal a signed document carries: who signed, when, which image, and the SHA-256 of exactly what was signed. */
export interface Seal { signatureId: string; png: string; signer: string; signedAt: string; hash: string }

/** A snapshot of a document at a checkpoint (created, reviewed, signed, sent, restored). */
export interface Version { n: number; at: number; status: DocStatus; by: string; note: string; values: Record<string, string> }

/** When a document of a regime is due: N days after a date field on the form, or at the end of the quarter / month it was started in. */
export interface DeadlineRule { regimeShort: string; basis: 'field' | 'quarter-end' | 'month-end'; field: string; days: number; text: string; estHours: number }

export interface Settings {
  signatories: string[];
  reviewer: string;
  signatures: Signature[];
  deadlines: DeadlineRule[];
}
