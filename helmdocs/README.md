# HelmDocs — Document Assembly Software (working POC)

The second POC for Singapore marine / offshore SMEs (ASMI members), built to the IMDA **Document Assembly Software**
pre-approval category. Three screens: **Templates → Assemble → Library**. Everything runs offline in the browser:
uploaded forms are really parsed, fields are really detected, the document really rebuilds as you type, conditional
sections really come and go, and PDF / Word / HTML / CSV / XLSX / TSV / XML exports are real files.

Demo tenant: *Harbourline Marine Services Pte Ltd* (fictional). Vessels *MV Ocean Pioneer* and *Sea Falcon 7*, the
*Tuas yard* — all demo data, labelled as such in the UI.

## Run

```bash
npm install
npm run dev          # http://localhost:5174
npm test             # Vitest: engine (fields / template / assemble / export / data / signature / reminders / search) + stats — 81 tests
npm run e2e:install  # once: downloads Chromium for Playwright
npm run e2e          # Playwright drives the real UI — 30 tests (upload → detect → toggle → assemble → conditional
                     # section → real PDF/DOCX/HTML downloads → review → email → library stats → assistant → CSV/XLSX/TSV/XML)
npm run build        # tsc + vite build
npm run fixtures     # regenerates tests/e2e/fixtures (txt / pdf with text layer / scanned pdf / docx / no-fields memo)
```

Data lives in the browser (`localStorage`, key `helmdocs-v1`). **Settings (gear) → Reset demo data** restores the seed.
No server, no API key, no network calls at runtime.

## IMDA requirement mapping (Legal › Document Assembly Software)

| FR | Requirement | Where it is demonstrated | Test |
|---|---|---|---|
| FR-01 | Cloud / multi-device access | Static web app (Vite build), any browser, no install; HashRouter deep links | `smoke.spec.ts` |
| FR-02 | Template management — create, store, organise dynamic templates and clauses | **Templates**: saved-template strip, rename / retype / delete fields, conditional clause markers, delete template | `templates.spec.ts` |
| FR-03 | Automatic document generation from templates + user inputs | **Assemble**: form generated from the template's fields; document rebuilds live; **attached data** (CSV / TSV) → sum / average / count / min / max of a column inserted into number fields (Σ) | `assemble.spec.ts`, `features.spec.ts`, `data.test.ts` |
| FR-04 | Transform existing documents / forms into dynamic templates | **Templates**: drop a PDF / DOCX / TXT / MD → fields detected → *Static form ↔ Dynamic template* toggle → *Save as template*; **select any text** in the document to add a missed field; signature block identified with who signs and the signing date; ◀ ▶ card switcher | `templates.spec.ts`, `features.spec.ts` |
| FR-05 | User-defined conditional logic including / excluding sections | **Assemble**: `Section 4 included when haz_material_present = Yes` — toggle inserts / removes the whole section, rule read-out card explains why | `assemble.spec.ts`, `assemble.test.ts` |
| FR-06 | Export in PDF, Word or HTML + email / print delivery | **Assemble**: Export PDF (jsPDF), Word (.docx), HTML, Print…, Email (mailto with summary → Sent) | `assemble.spec.ts`, `export.test.ts` |
| FR-07 | Dashboards with ≥ 4 charts + interactive filtering | **Library**: documents per day, by regime, minutes per week vs manual, status donut — all respond to template-card and status filters | `library.spec.ts`, `stats.test.ts` |
| FR-08 | Business data extraction in CSV, XLSX, XML, TSV | **Library**: *Export CSV / XLSX* menu → CSV, XLSX (OOXML via jszip), TSV, XML of the filtered rows | `library.spec.ts`, `export.test.ts` |
| FR-09/10 | PDPA, VA/PT (conditional) | Not in scope for an offline POC — no personal data leaves the browser | — |

Small `FR-xx` chips in each screen's breadcrumb point at the requirement being shown.

## Signatures and the seal

**My signatures** (Settings, or the *Sign* button on a document): draw on a pad, upload a scan (near-white pixels made
transparent), or type a name in a handwriting face. Each is stored as a transparent PNG in this browser, owned by one
authorised signatory, one marked default.

**Signing a document** places the image on the signature line of the preview, the PDF (jsPDF `addImage`), the Word file
(docx `ImageRun`) and the HTML — and stores a **seal**: `SHA-256(template id + every included line of the assembled
document + signer + time)`. The seal is re-verified on every render and on every export:

- valid → image shown / embedded, footer reads *Signed by … on … · SHA-256 …*, the pre-submission check passes;
- one character changed after signing → seal broken: image withheld everywhere, footer reads *UNSIGNED COPY*, the check
  fails, the button turns into *Re-sign*.

This is an **integrity seal, not a certificate signature**: it proves the copy you are looking at is the one that was
signed, but anyone with the file could re-create both image and hash. Where a legally binding e-signature is needed
(MOM submissions, class certificates), the hash is what a signing provider would countersign with the signer's
certificate — that is the *signing_certificate* slot in the data model, left empty in this POC.

## Compliance reminders and versions

The assistant on the Library screen carries a **compliance calendar** under its search: the next three months (or all),
one card per unsent document with the due date, an urgency icon (overdue · today · this week · on track), the file
name, the regime rule that sets the deadline, the fields still missing (the same mandatory check as the pre-submission
card, plus *Not signed* / *Needs review*), an **estimate of hours left** (the rule's full effort × the missing share,
plus review / sign / send overheads), and **Open** / **Versions** buttons.

Deadline rules live in Settings and are editable: *N days after a date field on the form* (IHM 7 days after work,
WSH incident 10 days after the incident, TIW 7 days after collection, PTW at valid-to, bizSAFE at assessment date) or
*quarter end* / *month end* (SHMS, ESG). The defaults are sensible internal deadlines, not legal advice.

Every document keeps **versions**: a snapshot when it is created, marked reviewed, signed, sent or restored. The
Versions modal shows each checkpoint with who / when, the fields that changed since the previous one, and *Restore*
(the current values become a new version and the document returns to Draft).

## Sample data

`samples/` holds four files that match the demo templates (also downloadable from the *Attached data* card):
`drum-log-WO-2418.csv` (TIW quantity), `fuel-invoices-FY2025.csv` (ESG diesel / electricity), `gas-readings-tank4.tsv`
(PTW oxygen minimum), `shms-audit-records-Q3.csv` (SHMS record count / average score).

## What the engine does (`src/engine/`)

| step | file | what happens |
|---|---|---|
| reading | `extract.ts` | PDF (pdf.js text layer), Word (mammoth), .txt / .md. Named errors: unsupported type, empty file, **scanned PDF without a text layer** (no OCR offline), corrupt, > 100 pages. |
| detecting | `fields.ts` | Line-based parser: numbered / ALL-CAPS headings → sections; `Label: value` lines → fields with a type inferred from the value (**IMO number with the 7-digit check-digit**, dates, work-order / permit / incident codes, quantities with units, Yes/No, marine lexicon lists — HKC Appendix 1/2 materials, permit types, TIW waste types, incident classes…); bare IMO / WO / date patterns inside prose; signature lines; **conditional sections** = a section after a Yes/No field whose heading says *(if applicable)* / *if yes* or shares a keyword with that field; regime matched from the text (HKC/IHM, WSH SHMS, bizSAFE, WSH Incident, PTW, NEA TIW, ESG/Scope 3). Confidence is rule-based, never typed per form. |
| templating | `template.ts` | Fields become `{{merge_keys}}`; rename moves the key everywhere (including rules and existing documents), delete restores the literal text, retype sets options; `addFieldFromSelection` turns a highlighted run of prose into a field (refused inside an existing field); `signatureFields` names the signatory and signing date of every signature block. |
| assembling | `assemble.ts` | Fills values, evaluates every rule (`included / omitted because …`), runs the **pre-submission check**: mandatory fields in included sections, IMO checksum, signatory on the authorised list (Settings), quantities inside every included conditional section, regime recognised. `missingMandatory()` gates export. |
| data | `data.ts` | CSV / TSV / semicolon tables → columns; `aggregate(column, sum|avg|count|min|max)` keeps a unit when every row agrees ("12.5 kg"), ignores date-like cells; a bound field is recalculated when the attachment changes and unlinked when typed over. |
| sealing | `signature.ts` | Synchronous SHA-256, `makeSeal` / `verifySeal` (valid · broken · none), canvas helpers for drawn / uploaded / typed signatures. |
| exporting | `export.ts` | PDF (jsPDF), DOCX (docx), HTML, `mailto:` with the summary, CSV / TSV / XML / XLSX serialisers. |
| finding | `search.ts` | Keyword scoring over vessel / file / template / regime / status / author / values with aliases (`pending` → draft + reviewed, `declaration` → IHM…); status words are constraints; every hit says what matched. |

The **seven seed templates are produced by running this engine over the demo forms** (`src/data/forms.ts`) at seed
time — the detection log numbers ("15 fields, 1 conditional section, 1 signature block") are computed, not typed.

## Live numbers (`src/store/stats.ts`)

Every stat, card and chart is a selector over the stored documents: generated / sent / pending in the last 30 days,
average minutes per document (time from opening a document to its last edit) against the template's **manual
baseline** (a demo assumption per template — 25 to 180 minutes), hours saved, per-template counts, documents per day,
by regime, minutes per week, status split. Assemble a document and the Library moves.

**Status flow.** Draft → *Mark reviewed* (human, recorded with the reviewer name) → Sent (Email, or the status select in
the Library). Nothing becomes *Sent* without the reviewed step; editing a reviewed document returns it to Draft; sent
documents are locked.

## Edge cases designed in

Unsupported / empty file · scanned PDF with no text layer · a form with no detectable fields (cannot be saved, says why)
· invalid IMO checksum (hint + check fails) · missing mandatory field (export, review and print blocked with the field
named) · deleting a template that has documents (documents keep a snapshot, flagged *template deleted*) · reload
mid-processing (upload is marked failed with a reason, never spins) · `localStorage` unavailable (in-memory fallback +
banner) · assistant search with no results.

## Not real in this POC

No OCR (scanned forms are refused with a reason). Email is a `mailto:` hand-off, not SMTP. The signature seal is a hash,
not a PKI signature (see above). The manual-minutes baseline
is an assumption per template. Detection is a deterministic rule engine, not a model — the "AI" cards report exactly
what the rules found.

## Look

The mockup palette: `#0c1517` ground, `#142225` cards, teal `#46d3c4` and violet `#8f7dff` accents, Sora / Manrope /
IBM Plex Mono. The paper document stays light so it reads as the printed form.

## Layout

```
src/
  engine/      extract · fields · template · assemble · export · search · rng
  data/        types · forms (7 demo source forms) · seed (templates via the engine + 22 documents)
  store/       useStore (zustand + localStorage) · stats
  components/  Paper (static / dynamic / live document) · Signatures · Reminders (calendar + versions) · charts · ui
  pages/       Templates · Assemble · Library
tests/
  unit/        fields · template · assemble · export · stats (+ search)
  e2e/         templates · assemble · library · smoke (+ fixtures generated by scripts/make-fixtures.mjs)
```
