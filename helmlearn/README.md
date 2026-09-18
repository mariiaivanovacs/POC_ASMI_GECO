# HelmLearn — Gen-AI Digital Training System (working POC)

A runnable version of the three POC screens: **Materials → Task builder → Learners**. Everything is wired:
uploads are really parsed, exercises are really generated (offline, rule-based engine), every task type is playable,
and every KPI/chart is computed from recorded attempts — play a task in the builder and the Learners page moves.

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest: engine (analyze/generate) + stats
npm run e2e:install  # once: downloads Chromium for Playwright
npm run e2e          # Playwright: drives the real UI (upload → process → play → publish → learners → CSV)
```

Data lives in the browser (`localStorage`). **Settings (gear icon) → Reset demo data** restores the seed.

## Generation providers

- **Offline engine** (default) — rule-based, runs in the browser, English only. No key, no network.
- **DeepSeek AI** — Settings → *DeepSeek AI* → paste the API key → *Test*. Processing then sends the document to
  `deepseek-chat` with a strict JSON schema and gets back all seven task types plus the Materials-page widgets, in
  English, Bahasa Melayu and 中文 (toggle in Settings). Any failure (bad key, rate limit, malformed JSON) falls back to
  the offline engine and says so on the material. The browser talks to `/api/deepseek`, which the Vite dev server
  proxies to `https://api.deepseek.com` (see `vite.config.ts`); `vite preview` does the same. For any other hosting put
  an equivalent reverse proxy in front. The key is stored only in this browser.

## What the engine does (`src/engine/`)

| step | file | what happens |
|---|---|---|
| reading | `extract.ts` | PDF (pdf.js text layer), Word (mammoth), PowerPoint (slide XML via jszip), .txt/.md. Errors are named: unsupported type, empty file, scanned PDF without text, > 200 pages, corrupt file. |
| extracting | `analyze.ts` | title, sentences, numbered/imperative **steps**, **hazards** and **PPE** (marine-safety lexicon), **numeric facts** (number + unit + sentence), **terms** (`Term: definition` lines, else glossary). |
| drafting | `generate.ts` | 7 task types from that structure — multiple choice (number blanked, distractors scaled), sequence (real step order), scenario (hazard sentence → the matching step), audio (supervisor briefing read by the browser's speech synthesis), photo checkpoint (real capture + blank-frame check), match terms, supervisor sign-off (PIN from Settings, default `1234`). Deterministic per material seed; types with no source in the text are reported as missing, never faked. |
| stages | `pipeline.ts` | progress is per real stage (page read, structure, per-type drafting), not a timer. |

Generated content is **English only**; the seeded Hot Work and Emergency Response materials carry hand-written EN / Bahasa / 中文 tasks so the language toggle has real content to show.

## Live numbers (`src/store/stats.ts`)

Progress, quiz average, participation, practical, AI score, flags, weekly hours, quiz trend and cohort KPIs are all selectors over `attempts` + `enrollments`. Nothing is stored pre-computed. **Play as ▸ learner** in the builder records attempts for that learner; **Publish module** enrols departments.

**Retention & alerts.** Each learner × module carries a forgetting curve `R(t) = 2^(−t / halfLife)` from the last passed task; the half-life grows 1.6× per pass (5 → 60 days), so repeated practice decays slower. A module is *due* below 60 %. The Learners page shows a **Retention & mistake forecast**: which module the learner forgets soonest, which needs repeating most often, predicted mistakes per 10 tasks today vs in 30 days (`1 − R(t)·(1 − fail rate)`, fail rate from the learner's own history, else the cohort), a 30-day multi-module curve with floor crossings, and per module retention at +7/+14/+30 days, weakest task types, repeat interval, certificate expiry and *Schedule refresher*. The cohort can be viewed as a **table, a bar chart (progress + quiz) or 14-day progress lines** and, for the cohort in view, the **Learning health & alerts** panel: open alerts ordered by severity (overdue / due this week / inactive / low quiz / certificate expiring) with actions, fail rate by task type, and the most-missed tasks linking back to the builder.

## Celebration effect (`src/fx/celebrate.ts`)

Correct answers throw a burst of confetti plates and gems — a transparent Three.js overlay (orthographic camera in pixel space, `BoxGeometry` / `IcosahedronGeometry` / `TetrahedronGeometry` pieces with gravity, spin and fade). It fires on a correct match, a solved fill-the-blank, a correct audio answer, "Got it" on a flashcard, and every passed task in the phone preview. Without WebGL it falls back to CSS particles; under `prefers-reduced-motion` it stays silent. A `helmlearn:celebrate` window event accompanies every burst (used by the e2e tests).

## Layout

```
src/
  engine/      extract · analyze · generate · llm (DeepSeek) · pipeline · tts · rng
  data/        types · seed (6 materials, 10 learners, 14 days of activity) · texts · i18n
  store/       useStore (zustand + localStorage) · stats
  components/  charts · exercises (7 players + 4 widgets) · Health (retention forecast, alerts, error analysis) · ui
  pages/       Materials · TaskBuilder · Learners
tests/
  unit/        analyze · generate · llm · stats
  e2e/         materials · builder · learners · deepseek (API mocked) · parsers · smoke  (+ fixtures: .txt, .pdf, .docx)
```
