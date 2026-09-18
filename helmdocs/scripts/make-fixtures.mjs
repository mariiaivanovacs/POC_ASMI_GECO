// Generates the e2e fixtures from the demo IHM form: a text form, a PDF with a real text layer,
// a "scanned" PDF that has no text layer, and a Word document. Run: npm run fixtures
import { writeFileSync, mkdirSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';

const dir = new URL('../tests/e2e/fixtures/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });

const text = `SUPPLIER'S DECLARATION OF CONFORMITY
Inventory of Hazardous Materials (IHM) - IMO Res. MEPC.269(68) - Hong Kong Convention
Form SDoC-01 Rev. 3

1. SUPPLIER
Company: Harbourline Marine Services Pte Ltd
Contact person: Rachel Tan, QA Manager

2. VESSEL AND WORK ORDER
Vessel name: Sea Falcon 7
IMO number: 9074729
Work order no.: WO-2433
Date of work: 18 Sep 2026

3. PRODUCT / MATERIAL SUPPLIED OR INSTALLED
Description: Replacement of gasket set, main engine unit 3
Hazardous material present (HKC Appendix 1 / 2): Yes

4. HAZARDOUS MATERIALS DECLARED (if applicable)
Material (HKC list): Asbestos
Quantity: 1.2 kg
Location on board: Engine room, main engine unit 3

5. DECLARATION
The supplier declares that the information above is complete and accurate to the best of its knowledge.
Authorised person: Rachel Tan, QA Manager
Signature: ______________________
Date: 18 Sep 2026`;

writeFileSync(dir + 'ihm-declaration.txt', text);

// PDF with a text layer
const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
let y = 60;
pdf.setFont('helvetica', 'normal');
for (const line of text.split('\n')) {
  pdf.setFontSize(/^[A-Z0-9 .'/()-]+$/.test(line) && line.length > 3 ? 12 : 10);
  pdf.text(line, 56, y);
  y += 16;
}
writeFileSync(dir + 'ihm-declaration.pdf', Buffer.from(pdf.output('arraybuffer')));

// "scanned" PDF — a page with a drawn rectangle and no text at all
const scan = new jsPDF({ unit: 'pt', format: 'a4' });
scan.setFillColor(235, 235, 230);
scan.rect(40, 40, 515, 760, 'F');
scan.setDrawColor(120);
for (let i = 0; i < 30; i++) scan.line(70, 90 + i * 22, 520, 90 + i * 22);
writeFileSync(dir + 'scanned.pdf', Buffer.from(scan.output('arraybuffer')));

// DOCX
const doc = new Document({ sections: [{ children: text.split('\n').map((l) => new Paragraph({ children: [new TextRun(l)] })) }] });
writeFileSync(dir + 'ihm-declaration.docx', await Packer.toBuffer(doc));

// a memo with nothing detectable
writeFileSync(dir + 'no-fields.txt', 'Toolbox talk notes\n\nReminded everyone about the new muster point and the tea-break roster.\nNo further business.\n');
console.log('fixtures written to', dir);
