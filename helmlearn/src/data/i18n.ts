import type { Lang } from './types';

const STR = {
  en: {
    module: 'Yard Safety & Competency', taskOf: 'Task', retry: 'Try again', back: 'Back', next: 'Continue',
    newHire: 'New-hire path', fastTrack: 'Fast-track path', listen: 'Listen and answer', transcript: 'Transcript:',
    noTts: 'Audio playback is not available on this device — read the transcript instead.',
    takePhoto: 'Take photo', photoTitle: 'Photo checkpoint', pin: 'Supervisor PIN', signReady: 'Ready for sign-off — enter the supervisor PIN.',
    signWrong: 'PIN not recognised.', signed: 'Signed off by supervisor.', hint: 'Hint', matchHint: 'Tap a term, then tap its meaning.',
    seqHint: 'Tap the cards in the order you would do them.', allMatched: 'All matched.', enOnly: 'Generated content — English only (offline engine)',
    cat: { safety: 'Safety SOP', emergency: 'Emergency', technical: 'Technical', refresher: 'Refresher', advanced: 'Advanced' },
  },
  bm: {
    module: 'Keselamatan & Kompetensi Limbungan', taskOf: 'Tugasan', retry: 'Cuba lagi', back: 'Kembali', next: 'Teruskan',
    newHire: 'Laluan pekerja baharu', fastTrack: 'Laluan pantas', listen: 'Dengar dan jawab', transcript: 'Transkrip:',
    noTts: 'Main balik audio tidak tersedia pada peranti ini — baca transkrip.',
    takePhoto: 'Ambil foto', photoTitle: 'Semakan foto', pin: 'PIN penyelia', signReady: 'Sedia untuk pengesahan — masukkan PIN penyelia.',
    signWrong: 'PIN tidak dikenali.', signed: 'Disahkan oleh penyelia.', hint: 'Petunjuk', matchHint: 'Ketik istilah, kemudian ketik maksudnya.',
    seqHint: 'Ketik kad mengikut urutan yang anda akan lakukan.', allMatched: 'Semua dipadankan.', enOnly: 'Kandungan dijana — Bahasa Inggeris sahaja (enjin luar talian)',
    cat: { safety: 'SOP keselamatan', emergency: 'Kecemasan', technical: 'Teknikal', refresher: 'Ulang kaji', advanced: 'Lanjutan' },
  },
  zh: {
    module: '船厂安全与能力', taskOf: '任务', retry: '再试一次', back: '返回', next: '继续',
    newHire: '新员工路径', fastTrack: '快速路径', listen: '听录音并作答', transcript: '文字记录：',
    noTts: '此设备无法播放音频 — 请阅读文字记录。',
    takePhoto: '拍照', photoTitle: '照片检查点', pin: '主管 PIN', signReady: '可以签核 — 请输入主管 PIN。',
    signWrong: 'PIN 无法识别。', signed: '主管已签核。', hint: '提示', matchHint: '先点术语，再点它的含义。',
    seqHint: '按你实际操作的顺序点击卡片。', allMatched: '全部配对成功。', enOnly: '生成内容 — 仅英文（离线引擎）',
    cat: { safety: '安全 SOP', emergency: '应急', technical: '技术', refresher: '复训', advanced: '高级' },
  },
};

export type Strings = typeof STR.en;
export function t(lang: Lang): Strings { return (STR[lang] || STR.en) as Strings; }
export const LANGS: { k: Lang; label: string }[] = [{ k: 'en', label: 'English' }, { k: 'bm', label: 'Bahasa' }, { k: 'zh', label: '中文' }];
