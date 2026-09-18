import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, rest: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...rest,
});

export const Ic = {
  grid: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  file: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>,
  pen: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>,
  folder: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
  back: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M15 6l-6 6 6 6" /></svg>,
  search: ({ size = 16, ...r }: P) => <svg {...base(size, r)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  gear: ({ size = 17, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  upload: ({ size = 22, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>,
  download: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></svg>,
  spark: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.6, ...r })}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>,
  check: ({ size = 13, ...r }: P) => <svg {...base(size, { strokeWidth: 3, ...r })}><path d="M20 6L9 17l-5-5" /></svg>,
  x: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.6, ...r })}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>,
  arrow: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>,
  clock: ({ size = 24, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  trash: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>,
  refresh: ({ size = 14, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>,
  mail: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>,
  word: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M8 12l1.5 6 2-4 2 4 1.5-6" /></svg>,
  print: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></svg>,
  table: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M3 15h18" /><path d="M10 4v16" /></svg>,
  rule: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M4 7h16" /><path d="M4 12h10" /><path d="M4 17h7" /></svg>,
  alert: ({ size = 13, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M10.3 4.3L2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
  shield: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  flask: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M9 3h6" /><path d="M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" /></svg>,
  clipboard: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" /><path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" /><path d="M9 14l2 2 4-4" /></svg>,
  flame: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-5 1-9z" /></svg>,
  drum: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M4 7h16" /><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>,
  leaf: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M4 20c0-8 6-14 16-14-1 10-7 14-14 14" /><path d="M4 20l8-8" /></svg>,
  warn: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M10.3 4.3L2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>,
  ship: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><path d="M3 17l2 3h14l2-3" /><path d="M4 17l8-3 8 3" /><path d="M6 14V9h12v5" /><path d="M12 9V4" /><path d="M9 6h6" /></svg>,
  dots: ({ size = 14, ...r }: P) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...r}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  open: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>,
};

export const REGIME_ICON: Record<string, (p: P) => JSX.Element> = {
  'HKC / IHM': Ic.file, 'WSH SHMS': Ic.shield, bizSAFE: Ic.clipboard, 'WSH Incident': Ic.warn, PTW: Ic.flame, 'NEA TIW': Ic.drum, 'ESG / Scope 3': Ic.leaf,
};
export const REGIME_COLOR: Record<string, string> = {
  'HKC / IHM': '#5aa9f0', 'WSH SHMS': '#46d3c4', bizSAFE: '#4fd18b', 'WSH Incident': '#e34948', PTW: '#f2c14e', 'NEA TIW': '#8f7dff', 'ESG / Scope 3': '#7fe3ad', Unclassified: '#6f8683',
};
export function regimeIcon(short: string) { return REGIME_ICON[short] || Ic.file; }
export function regimeColor(short: string) { return REGIME_COLOR[short] || '#8a97ad'; }
