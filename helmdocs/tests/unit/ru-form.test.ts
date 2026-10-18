import { describe, expect, it } from 'vitest';
import { dateStyle, detectFields, formatDate, parseAnyDate } from '../../src/engine/fields';

// Same layout as a typical Russian job application (fictional organisation and people)
const BLANK = [
  'Директору ООО «Северный ветер»', '', 'Петрову Ивану Сергеевичу', '', '',
  'от __________________________', '', 'ИНН                                         ,', '', 'тел.: +7 (9___) ____-___-___', '', '',
  'Заявление', '', '',
  'Прошу принять меня на работу на должность инженера на 0,5 ставки ООО «Северный ветер» с __.11.2026. ', '',
  '_________________                                ______________________                   ____________________', '',
  '(дата)   (подпись)                    (расшифровка)',
].join('\n');
const FILLED = BLANK.replace('от __________________________', 'от _Сидоровой Ольги Павловны_____').replace('ИНН                                         ,', 'ИНН     770101234567        ,').replace('+7 (9___) ____-___-___', '+7 (912) 345-67-89').replace('__.11.2026', '01.11.2026');

const byLabel = (d: ReturnType<typeof detectFields>, l: string) => d.fields.find((f) => f.label === l);

describe('Russian application form', () => {
  it('finds blanks, the caption row and the signature spot on the blank form', () => {
    const d = detectFields(BLANK);
    expect(d.signatureBlocks).toBe(1);
    expect(byLabel(d, 'От кого (ФИО)')?.anchor).toMatch(/^_+$/);
    expect(byLabel(d, 'ИНН')?.anchorAfter).toBe('ИНН');
    expect(byLabel(d, 'ИНН')?.type).toBe('id');
    expect(byLabel(d, 'тел.')?.anchor).toBe('+7 (9___) ____-___-___');
    expect(byLabel(d, 'Дата начала')?.anchor).toBe('__.11.2026');
    const date = byLabel(d, 'Дата');
    expect(date?.type).toBe('date');
    expect(date?.anchorNth).toBe(0);
    const name = byLabel(d, 'Расшифровка подписи');
    expect(name?.role).toBe('signatory');
    expect(name?.anchorNth).toBe(2); // the 3rd blank of the row; the 2nd one is where the signature goes
  });

  it('reads the values of the filled-in form', () => {
    const d = detectFields(FILLED);
    expect(byLabel(d, 'От кого (ФИО)')?.sample).toBe('Сидоровой Ольги Павловны');
    expect(byLabel(d, 'ИНН')?.sample).toBe('770101234567');
    expect(byLabel(d, 'тел.')?.sample).toBe('+7 (912) 345-67-89');
    expect(byLabel(d, 'Дата начала')?.sample).toBe('01.11.2026');
  });

  it('writes dates the way the form does', () => {
    const d = detectFields(BLANK);
    const ts = new Date(2026, 10, 2).getTime();
    expect(formatDate(ts, dateStyle(byLabel(d, 'Дата')!))).toBe('02.11.2026');
    expect(formatDate(ts, 'ru')).toBe('2 ноября 2026 г.');
    expect(parseAnyDate('02.11.2026')).toBe(ts);
    expect(parseAnyDate('2 ноября 2026 г.')).toBe(ts);
    expect(parseAnyDate('2 Nov 2026')).toBe(ts);
  });

  it('a short capitalised label with a gap is not a heading', () => {
    const d = detectFields(BLANK);
    expect(d.sections.some((s) => /^ИНН/.test(s.heading))).toBe(false);
  });
});
