// Demo source forms — fictional Harbourline Marine Services paperwork written against the real regime names.
// Every template in the seed is produced by running the real detection engine over these texts.

export interface SeedForm { id: string; file: string; ext: string; pages: number; name: string; manualMinutes: number; text: string }

export const SEED_FORMS: SeedForm[] = [
  {
    id: 'ihm', file: 'IHM_Supplier_Declaration_Rev3.pdf', ext: 'pdf', pages: 2, name: 'IHM Supplier Declaration of Conformity', manualMinutes: 55,
    text: `SUPPLIER'S DECLARATION OF CONFORMITY
Inventory of Hazardous Materials (IHM) · IMO Res. MEPC.269(68) · Hong Kong Convention
Form SDoC-01 Rev. 3

1. SUPPLIER
Company: Harbourline Marine Services Pte Ltd
Contact person: Rachel Tan, QA Manager
Contact email: qa@harbourline.example.sg

2. VESSEL AND WORK ORDER
Vessel name: MV Ocean Pioneer
IMO number: 9876543
Work order no.: WO-2418
Date of work: 17 Sep 2026

3. PRODUCT / MATERIAL SUPPLIED OR INSTALLED
Description: Anti-fouling coating renewal, hull sections 4-7
The coating was applied at Tuas yard berth 4 by a crew of 6 painters over 3 shifts; the product batch is AF-7731.
Hazardous material present (HKC Appendix 1 / 2): Yes

4. HAZARDOUS MATERIALS DECLARED (if applicable)
Material (HKC list): Lead (Pb)
Quantity: 12.5 kg
Location on board: Hull, sections 4-7
HKC threshold: 1,000 mg/kg (Table A)
The material above exceeds the HKC reporting threshold and must be recorded in Part I of the ship's Inventory of Hazardous Materials. A Material Declaration (MD) for the product is attached.

5. DECLARATION
The supplier declares that the information above is complete and accurate to the best of its knowledge, and that any material listed in Appendix 1 or 2 of the Hong Kong Convention has been declared so that the ship's Inventory of Hazardous Materials can be updated.
Authorised person: Rachel Tan, QA Manager
Signature: ______________________
Date: 17 Sep 2026`,
  },
  {
    id: 'shms', file: 'SHMS_Audit_Evidence_Pack.docx', ext: 'docx', pages: 4, name: 'SHMS Audit Evidence Pack', manualMinutes: 120,
    text: `SHMS AUDIT EVIDENCE PACK
Workplace Safety and Health (Safety and Health Management System) Regulations · Ministry of Manpower
Internal audit record for the shipyard SHMS

1. WORKPLACE
Company: Harbourline Marine Services Pte Ltd
Workplace: Tuas yard, Bay 3
Audit period: Q3 2026
Audit reference: SHMS-2026-Q3
Auditor: Mohd Rahman, WSH Officer

2. ELEMENTS AUDITED
Element: Risk management
Evidence attached: Yes
Number of records: 14
Element score: 92 %

3. NON-CONFORMITIES FOUND (if applicable)
Non-conformity no.: NC-07
Description: Hot work watch not recorded for two permits in August
Corrective action owner: Sean Lim, Yard Supervisor
Target close-out date: 30 Sep 2026

4. VERIFICATION
Reviewed by: Melissa Tan, HSE Admin
Approved by: Rachel Tan, QA Manager
Signature: ______________________
Date: 15 Sep 2026`,
  },
  {
    id: 'bizsafe', file: 'bizSAFE_Risk_Assessment_SWP.pdf', ext: 'pdf', pages: 3, name: 'bizSAFE Risk Assessment & SWP', manualMinutes: 40,
    text: `RISK ASSESSMENT AND SAFE WORK PROCEDURE
bizSAFE Level 3 · Workplace Safety and Health Council · RA reference format
Form RA-SWP-02

1. ACTIVITY
Company: Harbourline Marine Services Pte Ltd
Vessel name: MV Ocean Pioneer
Work order no.: WO-2415
Activity: Hot work — cutting and welding of deck plating
Location: Main deck, frame 42-48
Assessment date: 15 Sep 2026

2. HAZARD IDENTIFICATION
Hazard: Fire from sparks reaching flammable residue
Risk level: High
Control measures: Fire watch, gas-free certificate, spark containment blankets
Residual risk level: Medium

3. PERSONNEL
Assessor: Sean Lim, Yard Supervisor
Approved by: Rachel Tan, QA Manager
Signature: ______________________
Review date: 15 Sep 2027`,
  },
  {
    id: 'wsh', file: 'WSH_Incident_Report.pdf', ext: 'pdf', pages: 2, name: 'WSH Incident Report', manualMinutes: 35,
    text: `WORKPLACE INCIDENT REPORT
Workplace Safety and Health (Incident Reporting) Regulations · MOM iReport submission record
Form IR-01

1. INCIDENT
Company: Harbourline Marine Services Pte Ltd
Incident no.: INC-0092
Incident date: 14 Sep 2026
Location: Tuas yard, Bay 3
Incident class: Near miss
Description: Scaffold plank slipped while a fitter stepped across; no injury

2. PERSONS INVOLVED
Injured person: None
Injury sustained (Y/N): No

3. MEDICAL LEAVE (if applicable)
Days of medical leave: 0 days
Hospital: N/A

4. REPORTING
Reported by: Sean Lim, Yard Supervisor
Reviewed by: Melissa Tan, HSE Admin
Signature: ______________________
Report date: 14 Sep 2026`,
  },
  {
    id: 'ptw', file: 'Permit_to_Work_Hot_Work.pdf', ext: 'pdf', pages: 1, name: 'Permit-to-Work (Hot Work / Confined Space)', manualMinutes: 25,
    text: `PERMIT-TO-WORK
Workplace Safety and Health (Shipbuilding and Ship-repairing) Regulations · Permit-to-work system
Form PTW-01

1. PERMIT
Permit no.: PTW-HW-0311
Permit type: Hot work
Vessel name: Sea Falcon 7
IMO number: 9074729
Work order no.: WO-2409
Location: Tank 4, port side
Valid from: 10 Sep 2026
Valid to: 10 Sep 2026
Fire watch is posted by Kelvin Wong for 30 minutes after the last weld; nearest extinguisher station is E-14.

2. CONFINED SPACE ENTRY (if applicable)
Gas-free certificate no.: GFC-118
Oxygen reading: 20.9 %
Attendant: Kelvin Wong, Safety Coordinator

3. AUTHORISATION
Permit holder: Sean Lim, Yard Supervisor
Permit issuer: Rachel Tan, QA Manager
Signature: ______________________
Date: 10 Sep 2026`,
  },
  {
    id: 'tiw', file: 'TIW_Consignment_Note.pdf', ext: 'pdf', pages: 1, name: 'Toxic Industrial Waste Consignment Note', manualMinutes: 30,
    text: `TOXIC INDUSTRIAL WASTE CONSIGNMENT NOTE
Environmental Protection and Management Act · NEA e-Tracking of toxic industrial waste
Form TIW-CN

1. WASTE GENERATOR
Company: Harbourline Marine Services Pte Ltd
Site: Tuas yard
Consignment no.: CN-2026-0913
Collection date: 13 Sep 2026

2. WASTE
Waste type: Paint residue
Quantity: 640 kg
Packaging: 4 × 200 L steel drums
Licensed collector: Cleanline Environmental Pte Ltd
The drums were collected by vehicle SLA 4821 K under NEA licence TW-0937 and delivered to the Tuas South facility.

3. DECLARATION
Declared by: Mohd Rahman, WSH Officer
Signature: ______________________
Date: 13 Sep 2026`,
  },
  {
    id: 'esg', file: 'Supplier_ESG_Scope3_Response.docx', ext: 'docx', pages: 3, name: 'Supplier ESG / Scope 3 Data Response', manualMinutes: 180,
    text: `SUPPLIER ESG DATA RESPONSE
Customer climate questionnaire · SGX RegCo ISSB-aligned climate reporting · Scope 3 upstream data request
Form ESG-Q3

1. SUPPLIER
Company: Harbourline Marine Services Pte Ltd
Customer: Meridian Offshore Holdings Ltd
Reporting period: FY2025
Response date: 11 Sep 2026

2. EMISSIONS DATA
Scope 3 category: Cat 1 Purchased goods & services
Diesel consumed: 84,200 L
Electricity consumed: 312,500 kWh
Total emissions: 468 tCO2e

3. ASSURANCE (if applicable)
Third-party assurance obtained: No
Assurance provider: N/A

4. SIGN-OFF
Prepared by: Jasmine Ng, Finance
Approved by: Rachel Tan, QA Manager
Signature: ______________________
Date: 11 Sep 2026`,
  },
];
