// Sample data files a user can download from the Attached-data card and drop straight back in.
export interface Sample { name: string; about: string; text: string; suggest: string }

export const SAMPLES: Sample[] = [
  {
    name: 'drum-log-WO-2418.csv', about: 'TIW consignment · 6 drums of paint residue and spent solvent', suggest: 'Quantity ← sum of quantity_kg',
    text: 'drum,waste_type,quantity_kg,packaging,collected\nD-01,Paint residue,190 kg,200 L steel drum,13 Sep 2026\nD-02,Paint residue,205 kg,200 L steel drum,13 Sep 2026\nD-03,Paint residue,185 kg,200 L steel drum,13 Sep 2026\nD-04,Spent solvent,60 kg,200 L steel drum,13 Sep 2026\nD-05,Spent solvent,72 kg,200 L steel drum,14 Sep 2026\nD-06,Oily rags,38 kg,120 L drum,14 Sep 2026\n',
  },
  {
    name: 'fuel-invoices-FY2025.csv', about: 'ESG / Scope 3 · 12 monthly diesel and electricity invoices', suggest: 'Diesel consumed ← sum of diesel_litres · Electricity ← sum of electricity_kwh',
    text: 'invoice,month,diesel_litres,electricity_kwh,amount_sgd\nINV-25-0108,Jan 2025,7100 L,26800 kWh,"S$ 12,340"\nINV-25-0221,Feb 2025,6650 L,25100 kWh,"S$ 11,590"\nINV-25-0317,Mar 2025,7300 L,27400 kWh,"S$ 12,710"\nINV-25-0412,Apr 2025,6900 L,26200 kWh,"S$ 12,020"\nINV-25-0509,May 2025,7250 L,26900 kWh,"S$ 12,600"\nINV-25-0614,Jun 2025,7050 L,25600 kWh,"S$ 12,180"\nINV-25-0711,Jul 2025,7400 L,27100 kWh,"S$ 12,880"\nINV-25-0815,Aug 2025,6800 L,25900 kWh,"S$ 11,930"\nINV-25-0910,Sep 2025,7000 L,25300 kWh,"S$ 12,060"\nINV-25-1013,Oct 2025,7150 L,26000 kWh,"S$ 12,420"\nINV-25-1108,Nov 2025,6700 L,24800 kWh,"S$ 11,650"\nINV-25-1212,Dec 2025,6900 L,25400 kWh,"S$ 12,010"\n',
  },
  {
    name: 'gas-readings-tank4.tsv', about: 'Permit-to-Work · confined-space gas tests every 2 h', suggest: 'Oxygen reading ← minimum of oxygen_pct',
    text: 'time\toxygen_pct\tlel_pct\th2s_ppm\ttester\n06:00\t20.9 %\t0 %\t0 ppm\tK. Wong\n08:00\t20.8 %\t0 %\t0 ppm\tK. Wong\n10:00\t20.7 %\t1 %\t0 ppm\tK. Wong\n12:00\t20.9 %\t0 %\t0 ppm\tS. Lim\n14:00\t20.8 %\t0 %\t0 ppm\tS. Lim\n',
  },
  {
    name: 'shms-audit-records-Q3.csv', about: 'SHMS evidence pack · 14 records checked in the audit', suggest: 'Number of records ← count of record · Element score ← average of score_pct',
    text: 'record,element,score_pct,finding\nRA-2026-031,Risk management,100 %,Conforms\nRA-2026-032,Risk management,100 %,Conforms\nRA-2026-033,Risk management,80 %,Minor gap\nPTW-HW-0301,Risk management,100 %,Conforms\nPTW-HW-0303,Risk management,60 %,Fire watch not recorded\nPTW-HW-0306,Risk management,60 %,Fire watch not recorded\nPTW-HW-0308,Risk management,100 %,Conforms\nTBT-0912,Risk management,100 %,Conforms\nTBT-0919,Risk management,100 %,Conforms\nINSP-0904,Risk management,100 %,Conforms\nINSP-0911,Risk management,90 %,Observation\nINSP-0918,Risk management,100 %,Conforms\nTRN-0902,Risk management,100 %,Conforms\nTRN-0916,Risk management,100 %,Conforms\n',
  },
];
