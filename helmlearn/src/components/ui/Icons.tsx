import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, rest: P) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...rest,
});

export const Ic = {
  grid: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  file: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M4 4h12l4 4v12H4z" /><path d="M16 4v4h4" /><path d="M8 13h8" /><path d="M8 17h5" /></svg>,
  tasks: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 10l2 2 4-4" /><path d="M8 16h8" /></svg>,
  users: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14c2 .8 3 2.6 3 6" /></svg>,
  calendar: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" /></svg>,
  logout: ({ size = 18, ...r }: P) => <svg {...base(size, r)}><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>,
  back: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M15 6l-6 6 6 6" /></svg>,
  search: ({ size = 16, ...r }: P) => <svg {...base(size, r)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
  bell: ({ size = 17, ...r }: P) => <svg {...base(size, r)}><path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
  gear: ({ size = 17, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  cap: ({ size = 20, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M12 4l9 4-9 4-9-4z" /><path d="M6 10v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /><path d="M21 8v5" /></svg>,
  upload: ({ size = 22, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></svg>,
  download: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></svg>,
  spark: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.6, ...r })}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>,
  check: ({ size = 13, ...r }: P) => <svg {...base(size, { strokeWidth: 3, ...r })}><path d="M20 6L9 17l-5-5" /></svg>,
  x: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.6, ...r })}><path d="M6 6l12 12" /><path d="M18 6L6 18" /></svg>,
  arrow: ({ size = 16, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>,
  clock: ({ size = 24, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  play: ({ size = 18, ...r }: P) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...r}><path d="M8 5v14l11-7z" /></svg>,
  pause: ({ size = 18, ...r }: P) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...r}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>,
  camera: ({ size = 44, ...r }: P) => <svg {...base(size, { strokeWidth: 1.6, ...r })}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  trash: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>,
  refresh: ({ size = 14, ...r }: P) => <svg {...base(size, { strokeWidth: 2.2, ...r })}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></svg>,
  dots: ({ size = 14, ...r }: P) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...r}><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  building: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-5h6v5" /></svg>,
  person: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  globe: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" /></svg>,
  link: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><path d="M9 15l6-6" /><path d="M11 7l1-1a4 4 0 0 1 5.7 5.7l-1 1" /><path d="M13 17l-1 1a4 4 0 0 1-5.7-5.7l1-1" /></svg>,
  badge: ({ size = 15, ...r }: P) => <svg {...base(size, r)}><circle cx="12" cy="9" r="5" /><path d="M8.5 13.5L7 21l5-2 5 2-1.5-7.5" /></svg>,
  active: ({ size = 11, ...r }: P) => <svg {...base(size, { strokeWidth: 2.8, ...r })}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>,
  // task types
  mcq: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>,
  seq: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 6h4M4 12h4M4 18h4M12 6h8M12 12h8M12 18h8" /></svg>,
  scen: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18" /><path d="M9 9l3 12" /><path d="M15 9l-3 12" /></svg>,
  audio: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></svg>,
  photo: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><path d="M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" /></svg>,
  match: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 7h6M4 17h6M14 7h6M14 17h6M10 7l4 10M10 17l4-10" /></svg>,
  sign: ({ size = 14, ...r }: P) => <svg {...base(size, r)}><path d="M4 20h16" /><path d="M6 16l6-1 8-8-5-5-8 8z" /></svg>,
  cards: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><rect x="3" y="6" width="14" height="12" rx="2" /><path d="M7 4h14v12" /></svg>,
  lines: ({ size = 12, ...r }: P) => <svg {...base(size, { strokeWidth: 2.4, ...r })}><path d="M4 12h16" /><path d="M4 6h16" /><path d="M4 18h10" /></svg>,
  flame: ({ size = 20, ...r }: P) => <svg {...base(size, r)}><path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 0 2 1 3 2 3 0-3-1-5 1-9z" /></svg>,
  siren: ({ size = 20, ...r }: P) => <svg {...base(size, r)}><path d="M5 21h14" /><path d="M7 21v-8a5 5 0 0 1 10 0v8" /><path d="M12 3v2" /><path d="M4.5 7l1.5 1" /><path d="M19.5 7L18 8" /></svg>,
  wrench: ({ size = 20, ...r }: P) => <svg {...base(size, r)}><path d="M14.7 6.3a4 4 0 0 0 5 5L14 17l-3-3 5.7-5.7z" /><path d="M11 14l-6.5 6.5a1.5 1.5 0 0 1-2-2L9 12" /></svg>,
  hook: ({ size = 20, ...r }: P) => <svg {...base(size, r)}><path d="M12 3v6" /><path d="M8 9h8" /><path d="M12 9v5a4 4 0 0 1-8 0" /></svg>,
  tank: ({ size = 20, ...r }: P) => <svg {...base(size, r)}><path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M9 8V5h6v3" /><path d="M12 12v4" /></svg>,
};

export const TYPE_ICON: Record<string, (p: P) => JSX.Element> = { mcq: Ic.mcq, seq: Ic.seq, scen: Ic.scen, audio: Ic.audio, photo: Ic.photo, match: Ic.match, sign: Ic.sign, cards: Ic.cards, fill: Ic.lines };
export const TYPE_LABEL: Record<string, string> = { mcq: 'Multiple choice', seq: 'Sequence', scen: 'Scenario', audio: 'Audio', photo: 'Photo check', match: 'Match terms', sign: 'Sign-off', cards: 'Flashcards', fill: 'Fill the blank' };
export const CAT_ICON: Record<string, (p: P) => JSX.Element> = { safety: Ic.flame, emergency: Ic.siren, technical: Ic.wrench, refresher: Ic.hook, advanced: Ic.tank };
export const CAT_COLOR: Record<string, string> = { safety: '#2c4a7c', emergency: '#e0554f', technical: '#3b82f6', refresher: '#2fb673', advanced: '#6b3fd6' };
