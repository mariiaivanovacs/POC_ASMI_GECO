export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

const LANG_MAP: Record<string, string> = { en: 'en-GB', bm: 'ms-MY', zh: 'zh-CN' };

export function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!ttsAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  const target = LANG_MAP[lang] || lang;
  return voices.find((v) => v.lang === target) || voices.find((v) => v.lang.startsWith(target.slice(0, 2))) || voices[0] || null;
}

export function speak(text: string, lang: string, onEnd?: () => void): SpeechSynthesisUtterance | null {
  if (!ttsAvailable()) { onEnd?.(); return null; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(lang);
  if (v) u.voice = v;
  u.lang = LANG_MAP[lang] || lang;
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  if (ttsAvailable()) window.speechSynthesis.cancel();
}

export function estimateSeconds(text: string): number {
  return Math.max(3, Math.round(text.split(/\s+/).length / 2.6));
}
