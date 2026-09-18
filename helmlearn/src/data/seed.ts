import type { Attempt, AuditEntry, Certificate, Enrollment, Exercise, Learner, Material, Widgets } from './types';
import { verificationCode } from '../engine/certificate';
import { MATERIAL_COMPLIANCE } from './compliance';
import { analyze } from '../engine/analyze';
import { generate } from '../engine/generate';
import { hashString, mulberry32 } from '../engine/rng';
import { ENG_TEXT, ERP_TEXT, HW_TEXT, LNG_TEXT, RIG_TEXT, WAH_TEXT } from './texts';

const DAY = 86_400_000;

function mat(p: Partial<Material> & Pick<Material, 'id' | 'name' | 'short' | 'ext' | 'kind' | 'category' | 'pages' | 'text'>): Material {
  return {
    status: 'queued', stage: null, pct: 0, error: null, structure: null, widgets: null, seed: 0, createdAt: Date.now() - 10 * DAY,
    langs: ['en'], missingTypes: [], source: 'local', note: null, complianceIds: MATERIAL_COMPLIANCE[p.id] || [], sourceUrl: null, ...p,
  };
}

const APPROVED = { reviewStatus: 'approved' as const, reviewedBy: 'Harbourline Safety Team', reviewedAt: Date.now() - 9 * DAY, reviewNote: null };

const HW_WIDGETS: Widgets = {
  qaCaption: 'Permit-to-work basics', audioCaption: 'Radio call from the fire watch', audioLen: '0:14',
  audioTranscript: 'Bay 3 fire watch to welding team — I am handing over to Faizal in five minutes, hold hot work until he confirms on channel 2.',
  qa: [['Who signs the permit?', 'Permit Issuer and Area Authority'], ['How long is a permit valid?', 'One shift only'], ['Clearance for flammables?', '11 m (35 ft)']],
  audio: ['Acknowledge and wait for confirmation', 'Start cutting — the call is informational', 'Ask the welder to relay the message'], audioCorrect: 0,
  cards: [['Fire watch', 'Stays 30 min after hot work ends'], ['Flash point', 'Lowest temperature vapour ignites'], ['Area Authority', 'Inspects and closes the permit']],
  fill: { pre: 'Clear flammables within', mid: 'and keep the fire watch', post: 'after hot work ends.', ans: ['11 m', '30 minutes'], tokens: ['11 m', '30 minutes', '5 m', 'one hour'] },
};
const ERP_WIDGETS: Widgets = {
  qaCaption: 'Alarms, muster and gas release', audioCaption: 'PA announcement — general alarm', audioLen: '0:11',
  audioTranscript: 'Attention all personnel — general alarm, general alarm. This is not a drill. Proceed to your muster stations with lifejacket and EEBD. Fire team to the tank deck.',
  qa: [['First action on the general alarm?', 'Stop work, make safe, go to your muster station'], ['H₂S alarm at 10 ppm means?', 'Leave upwind — no rescue without BA'], ['Man overboard — first thing to throw?', 'The nearest lifebuoy with light']],
  audio: ['Muster at Station B with lifejacket and EEBD', 'Continue work until the supervisor calls', 'Go to the gangway and leave the yard'], audioCorrect: 0,
  cards: [['Muster station', 'Where you report when the alarm sounds'], ['Upwind', 'The direction to move from a gas release'], ['EEBD', '15-minute emergency escape breathing device']],
  fill: { pre: 'On the general alarm, muster within', mid: 'and never re-enter a gas area without', post: '', ans: ['3 minutes', 'breathing apparatus'], tokens: ['3 minutes', 'breathing apparatus', '10 minutes', 'a dust mask'] },
};
const RIG_WIDGETS: Widgets = {
  qaCaption: 'Fundamentals every rigger re-checks', audioCaption: 'Banksman radio call during a lift', audioLen: '0:09',
  audioTranscript: 'Crane one, this is the banksman — stop, stop, stop. Person in the exclusion zone. Hold the load until I give the all-clear.',
  qa: [['Sling angle that halves capacity?', '120° between the legs'], ['Who can stop a lift?', 'Anyone who sees a hazard'], ['A tag line is used to…', 'Control rotation — never hold weight']],
  audio: ['Stop the lift and wait for a clear signal', 'Continue — the load is nearly landed', 'Lower faster to finish the call'], audioCorrect: 0,
  cards: [['SWL', 'Safe working load marked on the sling'], ['Banksman', 'The only person giving crane signals'], ['Shackle pin', 'Moused or secured before every lift']],
  fill: { pre: 'Inspect every sling for', mid: 'and never exceed the marked', post: '', ans: ['cuts and kinks', 'SWL'], tokens: ['cuts and kinks', 'SWL', 'paint marks', 'MBL'] },
};

function hwExercises(): Exercise[] {
  const m = 'hw';
  return [
    { id: 'hw_h_mcq', materialId: m, type: 'mcq', level: 'all', title: 'Flammables clearance radius', sourceRef: 'SOP-HW-04 · step 3', stepIndex: 2, generated: false, ...APPROVED, i18n: {
      en: { type: 'mcq', data: { q: 'Before striking an arc, flammables must be cleared or shielded within what distance of the hot work?', opts: ['5 m', '11 m (35 ft)', '20 m', 'No fixed distance'], correct: 1, hint: 'SOP-HW-04 step 3 sets the distance. Think of the length of a 40-ft container.', ok: 'Correct — 11 m (35 ft), per SOP-HW-04 step 3.', no: 'Not quite. Step 3 requires 11 m (35 ft).' } },
      bm: { type: 'mcq', data: { q: 'Sebelum memulakan kerja panas, bahan mudah terbakar mesti dialihkan atau dilindungi dalam lingkungan berapa jauh?', opts: ['5 m', '11 m (35 kaki)', '20 m', 'Tiada jarak tetap'], correct: 1, hint: 'SOP-HW-04 langkah 3 menetapkan jarak ini — kira-kira panjang sebuah kontena 40 kaki.', ok: 'Betul — 11 m (35 kaki), mengikut SOP-HW-04 langkah 3.', no: 'Belum tepat. Langkah 3 memerlukan 11 m (35 kaki).' } },
      zh: { type: 'mcq', data: { q: '开始热工作业前，作业点周围多少距离内的易燃物必须清除或遮挡？', opts: ['5 米', '11 米（35 英尺）', '20 米', '没有固定距离'], correct: 1, hint: 'SOP-HW-04 第 3 步规定了该距离，大约相当于一个 40 英尺集装箱的长度。', ok: '正确 — 11 米（35 英尺），见 SOP-HW-04 第 3 步。', no: '不对。第 3 步要求 11 米（35 英尺）。' } },
    } },
    { id: 'hw_h_seq', materialId: m, type: 'seq', level: 'new', title: 'Order the hot work steps', sourceRef: 'SOP-HW-04 · steps 2–4', stepIndex: 1, generated: false, ...APPROVED, i18n: {
      en: { type: 'seq', data: { title: 'Put the hot work steps in order', items: ['Obtain the signed permit', 'Clear or shield flammables within 11 m', 'Post the fire watch', 'Start hot work'], hint: 'Tap the cards in the order you would do them.', ok: 'Right order. Permit, clear, fire watch, then start.', no: 'Not in order. The permit comes first and hot work starts last.' } },
      bm: { type: 'seq', data: { title: 'Susun langkah kerja panas mengikut urutan', items: ['Dapatkan permit yang ditandatangani', 'Alihkan atau lindungi bahan mudah terbakar dalam 11 m', 'Tempatkan pengawas api', 'Mulakan kerja panas'], hint: 'Ketik kad mengikut urutan yang anda akan lakukan.', ok: 'Urutan betul. Permit, alihkan, pengawas api, kemudian mula.', no: 'Urutan tidak betul. Permit dahulu dan kerja panas paling akhir.' } },
      zh: { type: 'seq', data: { title: '将热工作业步骤按顺序排列', items: ['取得已签署的许可证', '清除或遮挡 11 米内的易燃物', '安排看火人', '开始热工作业'], hint: '按你实际操作的顺序点击卡片。', ok: '顺序正确。许可证、清理、看火人，然后开始。', no: '顺序不对。许可证在最前，热工作业在最后。' } },
    } },
    { id: 'hw_h_scen', materialId: m, type: 'scen', level: 'all', title: 'Fire watch left for lunch', sourceRef: 'SOP-HW-04 · step 4', stepIndex: 3, generated: false, ...APPROVED, i18n: {
      en: { type: 'scen', data: { title: 'You arrive at Bay 3. The permit is signed, but the fire watch has left for lunch. What do you do?', opts: ['Start — the permit is valid', 'Wait until a fire watch is posted, then start', 'Ask a nearby welder to keep an eye on it'], correct: 1, ok: 'Right. No fire watch, no hot work — permit or not.', no: 'A signed permit does not replace the fire watch. Wait until one is posted.' } },
      bm: { type: 'scen', data: { title: 'Anda tiba di Bay 3. Permit sudah ditandatangani, tetapi pengawas api telah keluar makan tengah hari. Apa yang anda buat?', opts: ['Mula — permit masih sah', 'Tunggu sehingga pengawas api ditempatkan, kemudian mula', 'Minta pengimpal berdekatan mengawasi'], correct: 1, ok: 'Betul. Tiada pengawas api, tiada kerja panas — walaupun ada permit.', no: 'Permit yang ditandatangani tidak menggantikan pengawas api. Tunggu sehingga ada.' } },
      zh: { type: 'scen', data: { title: '你到达 3 号泊位。许可证已签署，但看火人去吃午饭了。你会怎么做？', opts: ['开始 — 许可证有效', '等看火人到岗后再开始', '请附近的焊工帮忙看着'], correct: 1, ok: '正确。没有看火人就不能热工作业 — 有许可证也一样。', no: '签署的许可证不能代替看火人。等看火人到岗。' } },
    } },
    { id: 'hw_h_audio', materialId: m, type: 'audio', level: 'all', title: 'Radio call: fire watch handover', sourceRef: 'SOP-HW-04 · step 4', stepIndex: 3, generated: false, ...APPROVED, i18n: {
      en: { type: 'audio', data: { title: 'Listen and answer', body: 'Play the radio call from the fire watch, then choose what you do.', hint: 'Listen for whether the fire watch is still at the location.', opts: ['Acknowledge and wait for confirmation', 'Start cutting — the call is informational', 'Ask the welder to relay the message'], correct: 0, ok: 'Right. The fire watch is leaving — no hot work until a replacement confirms on the radio.', no: 'Listen again: the fire watch says they are leaving. Nothing starts until a replacement confirms.', transcript: 'Bay 3 fire watch to welding team — I am handing over to Faizal in five minutes, hold hot work until he confirms on channel 2.' } },
      bm: { type: 'audio', data: { title: 'Dengar dan jawab', body: 'Mainkan panggilan radio daripada pengawas api, kemudian pilih tindakan anda.', hint: 'Dengar sama ada pengawas api masih berada di lokasi.', opts: ['Akui dan tunggu pengesahan', 'Mula memotong — panggilan itu hanya makluman', 'Minta pengimpal sampaikan mesej'], correct: 0, ok: 'Betul. Pengawas api akan pergi — tiada kerja panas sehingga pengganti mengesahkan di radio.', no: 'Dengar semula: pengawas api berkata dia akan pergi. Tiada apa yang bermula sehingga pengganti mengesahkan.', transcript: 'Pengawas api Bay 3 kepada pasukan kimpalan — saya serah tugas kepada Faizal dalam lima minit, tahan kerja panas sehingga dia sahkan di saluran 2.' } },
      zh: { type: 'audio', data: { title: '听录音并作答', body: '播放看火人的无线电呼叫，然后选择你的做法。', hint: '注意听看火人是否仍在现场。', opts: ['确认收到并等待确认', '开始切割 — 呼叫只是通知', '请焊工转达信息'], correct: 0, ok: '正确。看火人要离开 — 在接班人在无线电上确认前不得热工作业。', no: '再听一遍：看火人说他要离开。接班人确认前不能开始。', transcript: '3 号泊位看火人呼叫焊接组 — 我五分钟后交接给 Faizal，在他于 2 频道确认前暂停热工作业。' } },
    } },
    { id: 'hw_h_photo', materialId: m, type: 'photo', level: 'all', title: 'Photo: extinguisher with tag', sourceRef: 'SOP-HW-04 · step 4', stepIndex: 3, generated: false, ...APPROVED, i18n: {
      en: { type: 'photo', data: { title: 'Photo checkpoint', body: 'Take a photo of the fire extinguisher at your hot work location, with the inspection tag visible.', btn: 'Take photo', done: 'Photo captured — check passed: an image was received and is not a blank frame.', item: 'Fire extinguisher' } },
      bm: { type: 'photo', data: { title: 'Semakan foto', body: 'Ambil foto alat pemadam api di lokasi kerja panas anda, dengan tag pemeriksaan kelihatan.', btn: 'Ambil foto', done: 'Foto diambil — semakan lulus: imej diterima dan bukan bingkai kosong.', item: 'Alat pemadam api' } },
      zh: { type: 'photo', data: { title: '照片检查点', body: '拍摄你热工作业位置的灭火器照片，检查标签需清晰可见。', btn: '拍照', done: '照片已采集 — 检查通过：已收到图像且不是空白帧。', item: '灭火器' } },
    } },
    { id: 'hw_h_match', materialId: m, type: 'match', level: 'new', title: 'Fire watch terms', sourceRef: 'SOP-HW-04 · definitions', stepIndex: null, generated: false, ...APPROVED, i18n: {
      en: { type: 'match', data: { title: 'Match the term to its meaning', pairs: [['Fire watch', 'Stays 30 min after hot work ends'], ['Permit', 'Valid for one shift only'], ['Flash point', 'Lowest temperature the vapour ignites']], hint: 'Tap a term, then tap its meaning.', done: 'All three matched.' } },
      bm: { type: 'match', data: { title: 'Padankan istilah dengan maksudnya', pairs: [['Pengawas api', 'Kekal 30 minit selepas kerja panas tamat'], ['Permit', 'Sah untuk satu syif sahaja'], ['Takat kilat', 'Suhu terendah wap boleh menyala']], hint: 'Ketik istilah, kemudian ketik maksudnya.', done: 'Ketiga-tiganya dipadankan.' } },
      zh: { type: 'match', data: { title: '将术语与其含义配对', pairs: [['看火人', '热工作业结束后再留守 30 分钟'], ['许可证', '仅在一个班次内有效'], ['闪点', '蒸气可被点燃的最低温度']], hint: '先点术语，再点它的含义。', done: '三组全部配对成功。' } },
    } },
    { id: 'hw_h_sign', materialId: m, type: 'sign', level: 'exp', title: 'Supervisor: flammables cleared', sourceRef: 'SOP-HW-04 · steps 2–4', stepIndex: 2, generated: false, ...APPROVED, i18n: {
      en: { type: 'sign', data: { title: 'Supervisor sign-off', body: 'Your supervisor confirms each item on site.', items: ['Demonstrated the permit check', 'Cleared flammables to 11 m', 'Posted and briefed the fire watch'], pin: 'Supervisor PIN', ready: 'Ready for sign-off — enter the supervisor PIN.' } },
      bm: { type: 'sign', data: { title: 'Pengesahan penyelia', body: 'Penyelia anda mengesahkan setiap item di tapak.', items: ['Menunjukkan semakan permit', 'Mengalihkan bahan mudah terbakar sehingga 11 m', 'Menempatkan dan memberi taklimat kepada pengawas api'], pin: 'PIN penyelia', ready: 'Sedia untuk pengesahan — masukkan PIN penyelia.' } },
      zh: { type: 'sign', data: { title: '主管签核', body: '主管在现场逐项确认。', items: ['演示许可证检查', '清除 11 米内易燃物', '安排并向看火人交底'], pin: '主管 PIN', ready: '可以签核 — 请输入主管 PIN。' } },
    } },
    { id: 'hw_h_cards', materialId: m, type: 'cards', level: 'new', title: 'Flashcards: hot work terms', sourceRef: 'SOP-HW-04 · definitions', stepIndex: null, generated: false, ...APPROVED, i18n: {
      en: { type: 'cards', data: { title: 'Recall the meaning of each term', cards: HW_WIDGETS.cards, hint: 'Say the answer out loud before you flip the card.', done: 'All three terms recalled.' } },
      bm: { type: 'cards', data: { title: 'Ingat maksud setiap istilah', cards: [['Pengawas api', 'Kekal 30 minit selepas kerja panas tamat'], ['Takat kilat', 'Suhu terendah wap boleh menyala'], ['Pihak Berkuasa Kawasan', 'Memeriksa dan menutup permit']], hint: 'Sebut jawapan sebelum membalikkan kad.', done: 'Ketiga-tiga istilah diingati.' } },
      zh: { type: 'cards', data: { title: '回忆每个术语的含义', cards: [['看火人', '热工作业结束后再留守 30 分钟'], ['闪点', '蒸气可被点燃的最低温度'], ['区域负责人', '检查并关闭许可证']], hint: '翻卡前先说出答案。', done: '三个术语全部记住。' } },
    } },
    { id: 'hw_h_fill', materialId: m, type: 'fill', level: 'all', title: 'Fill the blanks: clearance and fire watch', sourceRef: 'SOP-HW-04 · steps 3–4', stepIndex: 2, generated: false, ...APPROVED, i18n: {
      en: { type: 'fill', data: { title: 'Complete the rule with the right figures', ...HW_WIDGETS.fill, hint: 'Both figures are in steps 3 and 4.', ok: 'Both correct — 11 m clearance, 30-minute fire watch.', no: 'Not quite. Step 3 says 11 m; step 4 says the fire watch stays 30 minutes.' } },
      bm: { type: 'fill', data: { title: 'Lengkapkan peraturan dengan angka yang betul', pre: 'Alihkan bahan mudah terbakar dalam', mid: 'dan kekalkan pengawas api', post: 'selepas kerja panas tamat.', ans: ['11 m', '30 minit'], tokens: ['11 m', '30 minit', '5 m', 'satu jam'], hint: 'Kedua-dua angka ada dalam langkah 3 dan 4.', ok: 'Kedua-duanya betul — 11 m, pengawas api 30 minit.', no: 'Belum tepat. Langkah 3: 11 m; langkah 4: pengawas api kekal 30 minit.' } },
      zh: { type: 'fill', data: { title: '用正确的数字补全规则', pre: '清除', mid: '内的易燃物，并在热工作业结束后让看火人留守', post: '。', ans: ['11 米', '30 分钟'], tokens: ['11 米', '30 分钟', '5 米', '一小时'], hint: '两个数字都在第 3 步和第 4 步。', ok: '都正确 — 11 米清理距离，看火人留守 30 分钟。', no: '不对。第 3 步是 11 米；第 4 步要求看火人留守 30 分钟。' } },
    } },
  ];
}

function erpExercises(): Exercise[] {
  const m = 'erp';
  return [
    { id: 'erp_h_seq', materialId: m, type: 'seq', level: 'new', title: 'Order the general-alarm actions', sourceRef: 'ERP-03 · steps 1–4', stepIndex: 0, generated: false, ...APPROVED, i18n: {
      en: { type: 'seq', data: { title: 'Put the general-alarm actions in order', items: ['Stop work and make the area safe', 'Take your lifejacket and EEBD', 'Muster at your station', 'Report to the muster checker'], hint: 'Tap the cards in the order you would do them.', ok: 'Right order. Make safe, grab kit, muster, report.', no: 'Not in order. Making the area safe comes first; reporting to the checker is last.' } },
      bm: { type: 'seq', data: { title: 'Susun tindakan penggera am mengikut urutan', items: ['Hentikan kerja dan pastikan kawasan selamat', 'Ambil jaket keselamatan dan EEBD', 'Berkumpul di stesen anda', 'Lapor kepada penyemak stesen'], hint: 'Ketik kad mengikut urutan yang anda akan lakukan.', ok: 'Urutan betul. Selamatkan kawasan, ambil kelengkapan, berkumpul, lapor.', no: 'Urutan tidak betul. Menyelamatkan kawasan dahulu; lapor kepada penyemak paling akhir.' } },
      zh: { type: 'seq', data: { title: '将总警报下的行动按顺序排列', items: ['停止作业并使区域安全', '带上救生衣和 EEBD', '到集合站集合', '向集合点点名员报到'], hint: '按你实际操作的顺序点击卡片。', ok: '顺序正确。先使区域安全，取装备，集合，报到。', no: '顺序不对。先使区域安全；最后向点名员报到。' } },
    } },
    { id: 'erp_h_scen', materialId: m, type: 'scen', level: 'all', title: 'H₂S alarm with a colleague inside', sourceRef: 'ERP-03 · step 5', stepIndex: 4, generated: false, ...APPROVED, i18n: {
      en: { type: 'scen', data: { title: 'The H₂S monitor on the tank deck alarms at 12 ppm. Your colleague is still inside the space. What do you do?', opts: ['Go in and pull him out — every second counts', 'Move upwind, raise the alarm, and let the BA rescue team enter', 'Wait at the entrance and call his name'], correct: 1, ok: 'Right. A rescuer without breathing apparatus becomes the second casualty.', no: 'Never enter a gas area without BA. Raise the alarm and let the rescue team go in.' } },
      bm: { type: 'scen', data: { title: 'Monitor H₂S di dek tangki berbunyi pada 12 ppm. Rakan anda masih di dalam ruang itu. Apa yang anda buat?', opts: ['Masuk dan tarik dia keluar — setiap saat penting', 'Bergerak ke arah angin, bunyikan penggera, dan biar pasukan penyelamat BA masuk', 'Tunggu di pintu masuk dan panggil namanya'], correct: 1, ok: 'Betul. Penyelamat tanpa alat pernafasan menjadi mangsa kedua.', no: 'Jangan sekali-kali masuk kawasan gas tanpa BA. Bunyikan penggera dan biar pasukan penyelamat masuk.' } },
      zh: { type: 'scen', data: { title: '油舱甲板的 H₂S 监测仪在 12 ppm 报警。你的同事仍在舱内。你会怎么做？', opts: ['冲进去把他拉出来 — 分秒必争', '移到上风处，发出警报，让佩戴呼吸器的救援队进入', '在入口等待并呼喊他的名字'], correct: 1, ok: '正确。没有呼吸器的施救者会成为第二名伤员。', no: '绝不能在没有呼吸器的情况下进入气体区域。发出警报，让救援队进入。' } },
    } },
    { id: 'erp_h_audio', materialId: m, type: 'audio', level: 'all', title: 'PA: general alarm announcement', sourceRef: 'ERP-03 · steps 1–3', stepIndex: 2, generated: false, ...APPROVED, i18n: {
      en: { type: 'audio', data: { title: 'Listen and act', body: 'Play the PA announcement, then choose what you do.', hint: 'Listen for which alarm it is and where to muster.', opts: ['Muster at Station B with lifejacket and EEBD', 'Continue work until the supervisor calls', 'Go to the gangway and leave the yard'], correct: 0, ok: 'Right. General alarm — muster at Station B, kit on.', no: 'Listen again: it is the general alarm, not a drill stand-down. Muster at Station B.', transcript: 'Attention all personnel — general alarm, general alarm. This is not a drill. Proceed to your muster stations with lifejacket and EEBD. Fire team to the tank deck.' } },
      bm: { type: 'audio', data: { title: 'Dengar dan bertindak', body: 'Mainkan pengumuman PA, kemudian pilih tindakan anda.', hint: 'Dengar penggera apa dan di mana untuk berkumpul.', opts: ['Berkumpul di Stesen B dengan jaket keselamatan dan EEBD', 'Teruskan kerja sehingga penyelia memanggil', 'Pergi ke tangga kapal dan tinggalkan limbungan'], correct: 0, ok: 'Betul. Penggera am — berkumpul di Stesen B, kelengkapan dipakai.', no: 'Dengar semula: ini penggera am, bukan tamat latihan. Berkumpul di Stesen B.', transcript: 'Perhatian semua kakitangan — penggera am, penggera am. Ini bukan latihan. Pergi ke stesen berkumpul dengan jaket keselamatan dan EEBD. Pasukan bomba ke dek tangki.' } },
      zh: { type: 'audio', data: { title: '听录音并行动', body: '播放广播通知，然后选择你的做法。', hint: '注意听是哪种警报以及在哪里集合。', opts: ['带救生衣和 EEBD 到 B 集合站集合', '继续作业直到主管通知', '去舷梯离开船厂'], correct: 0, ok: '正确。总警报 — 到 B 集合站集合，穿戴装备。', no: '再听一遍：这是总警报，不是演习解除。到 B 集合站集合。', transcript: '全体人员注意 — 总警报，总警报。这不是演习。请携带救生衣和 EEBD 前往集合站。消防队前往油舱甲板。' } },
    } },
    { id: 'erp_h_cards', materialId: m, type: 'cards', level: 'new', title: 'Flashcards: alarm and muster terms', sourceRef: 'ERP-03 · definitions', stepIndex: null, generated: false, ...APPROVED, i18n: {
      en: { type: 'cards', data: { title: 'Recall the meaning of each term', cards: ERP_WIDGETS.cards, hint: 'Say the answer out loud before you flip the card.', done: 'All three terms recalled.' } },
      bm: { type: 'cards', data: { title: 'Ingat maksud setiap istilah', cards: [['Stesen berkumpul', 'Tempat anda melapor apabila penggera berbunyi'], ['Arah angin', 'Arah untuk bergerak dari pelepasan gas'], ['EEBD', 'Alat pernafasan kecemasan 15 minit']], hint: 'Sebut jawapan sebelum membalikkan kad.', done: 'Ketiga-tiga istilah diingati.' } },
      zh: { type: 'cards', data: { title: '回忆每个术语的含义', cards: [['集合站', '警报响起时的报到地点'], ['上风处', '气体泄漏时应移动的方向'], ['EEBD', '15 分钟应急逃生呼吸装置']], hint: '翻卡前先说出答案。', done: '三个术语全部记住。' } },
    } },
    { id: 'erp_h_fill', materialId: m, type: 'fill', level: 'all', title: 'Fill the blanks: muster time and gas re-entry', sourceRef: 'ERP-03 · steps 3 and 5', stepIndex: 2, generated: false, ...APPROVED, i18n: {
      en: { type: 'fill', data: { title: 'Complete the rule with the right words', ...ERP_WIDGETS.fill, hint: 'One is a time limit, the other is a piece of kit.', ok: 'Both correct — muster within 3 minutes, and never re-enter without breathing apparatus.', no: 'Not quite. Muster within 3 minutes; no re-entry without breathing apparatus.' } },
      bm: { type: 'fill', data: { title: 'Lengkapkan peraturan dengan perkataan yang betul', pre: 'Apabila penggera am berbunyi, berkumpul dalam', mid: 'dan jangan masuk semula ke kawasan gas tanpa', post: '', ans: ['3 minit', 'alat pernafasan'], tokens: ['3 minit', 'alat pernafasan', '10 minit', 'topeng habuk'], hint: 'Satu had masa, satu kelengkapan.', ok: 'Kedua-duanya betul — berkumpul dalam 3 minit, tiada kemasukan semula tanpa alat pernafasan.', no: 'Belum tepat. Berkumpul dalam 3 minit; jangan masuk semula tanpa alat pernafasan.' } },
      zh: { type: 'fill', data: { title: '用正确的词补全规则', pre: '总警报响起后，须在', mid: '内集合，并且没有', post: '绝不能重返气体区域。', ans: ['3 分钟', '呼吸器'], tokens: ['3 分钟', '呼吸器', '10 分钟', '防尘口罩'], hint: '一个是时间限制，一个是装备。', ok: '都正确 — 3 分钟内集合，没有呼吸器绝不重返。', no: '不对。3 分钟内集合；没有呼吸器不得重返。' } },
    } },
  ];
}

// Generated drafts on a module the safety team has already signed off (so the demo has fully
// reviewed modules, certificates and a real compliance picture — not just hw's pending drafts).
const REVIEWED_GENERATED = { reviewStatus: 'approved' as const, reviewedBy: 'Harbourline Safety Team', reviewedAt: Date.now() - 6 * DAY, reviewNote: null };

function withGenerated(m: Material, handwritten: Exercise[], reviewed = false): { material: Material; exercises: Exercise[] } {
  const structure = analyze(m.text!, m.short);
  const g = generate(m.id, structure, m.seed);
  const gen = g.exercises.filter((e) => !handwritten.some((h) => h.type === e.type && h.stepIndex === e.stepIndex)).map((e) => (reviewed ? { ...e, ...REVIEWED_GENERATED } : e));
  const exercises = [...handwritten, ...gen];
  const missing = g.missing.filter((t) => !exercises.some((e) => e.type === t));
  return { material: { ...m, status: 'processed', stage: 'ready', pct: 100, structure, missingTypes: missing }, exercises };
}

export function seedMaterials(): { materials: Material[]; exercises: Exercise[] } {
  const hw = withGenerated(mat({ id: 'hw', name: 'SOP-HW-04 Hot Work Permit Procedure', short: 'SOP-HW-04 Hot Work Permit', ext: 'pdf', kind: 'PDF document', category: 'safety', pages: 6, text: HW_TEXT, seed: 11, langs: ['en', 'bm', 'zh'], widgets: HW_WIDGETS, createdAt: Date.now() - 20 * DAY }), hwExercises());
  const erp = withGenerated(mat({ id: 'erp', name: 'ERP-03 Emergency Response — fire, H₂S release, man overboard', short: 'ERP-03 Emergency Response', ext: 'pdf', kind: 'PDF document', category: 'emergency', pages: 11, text: ERP_TEXT, seed: 23, langs: ['en', 'bm', 'zh'], widgets: ERP_WIDGETS, createdAt: Date.now() - 18 * DAY }), erpExercises(), true);
  const rig = withGenerated(mat({ id: 'rig', name: 'Basic rigging & lifting — annual refresher', short: 'Rigging & lifting refresher', ext: 'docx', kind: 'Word document', category: 'refresher', pages: 8, text: RIG_TEXT, seed: 37, widgets: RIG_WIDGETS, createdAt: Date.now() - 12 * DAY }), [], true);
  const eng = mat({ id: 'eng', name: 'Two-stroke engine overhaul manual — Ch. 4 Fuel injection', short: 'Engine overhaul manual Ch. 4', ext: 'pdf', kind: 'PDF document', category: 'technical', pages: 42, text: ENG_TEXT, seed: 41, createdAt: Date.now() - 2 * DAY });
  const wah = mat({ id: 'wah', name: 'Toolbox talk — Working at height on scaffolds', short: 'Working at height refresher', ext: 'pptx', kind: 'Slide deck', category: 'refresher', pages: 12, text: WAH_TEXT, seed: 53, createdAt: Date.now() - DAY });
  const lng = mat({ id: 'lng', name: 'LNG bunkering familiarisation — IGF Code & ESD systems', short: 'LNG bunkering (IGF Code)', ext: 'pdf', kind: 'PDF document', category: 'advanced', pages: 15, text: LNG_TEXT, seed: 67, createdAt: Date.now() - DAY / 2 });
  return {
    materials: [hw.material, erp.material, eng, wah, lng, rig.material],
    exercises: [...hw.exercises, ...erp.exercises, ...rig.exercises],
  };
}

export function seedLearners(): Learner[] {
  return [
    { id: 'l1', name: 'Arjun Pillai', code: 'HL-2026-014', joined: 'Mar 2026', role: 'Welder', dept: 'Hull & coating', level: 'new', lang: 'Tamil', sup: 'K. Wong', avatar: { bg: '#dbe8ff', skin: '#b97a56', hat: '#f6c945', shirt: '#2c4a7c' } },
    { id: 'l2', name: 'Mohd Faizal Rahim', code: 'HL-2024-031', joined: 'Sep 2024', role: 'Fire watch', dept: 'Hull & coating', level: 'exp', lang: 'Bahasa Melayu', sup: 'K. Wong', avatar: { bg: '#e3f6ec', skin: '#c58a5f', hat: '#ffffff', shirt: '#3b82f6' } },
    { id: 'l3', name: 'Rafiqul Islam', code: 'HL-2026-022', joined: 'Jun 2026', role: 'Scaffolder', dept: 'Scaffolding', level: 'new', lang: 'Bangla', sup: 'S. Lim', avatar: { bg: '#fdf1dc', skin: '#8d5a3c', hat: '#f6c945', shirt: '#2c4a7c' } },
    { id: 'l4', name: 'Chen Wei', code: 'HL-2023-008', joined: 'Jan 2023', role: 'Fitter', dept: 'Engine', level: 'exp', lang: '中文', sup: 'R. Shankar', avatar: { bg: '#dbe8ff', skin: '#f1c9a5', hat: '#3b82f6', shirt: '#5c6b85' } },
    { id: 'l5', name: 'Nurul Aisyah', code: 'HL-2022-003', joined: 'Feb 2022', role: 'Safety coordinator', dept: 'HSE', level: 'exp', lang: 'English', sup: 'M. Tan', avatar: { bg: '#f3e8ff', skin: '#e8b892', hat: '#ffffff', shirt: '#2fb673' } },
    { id: 'l6', name: 'Suresh Kumar', code: 'HL-2026-019', joined: 'May 2026', role: 'Rigger', dept: 'Scaffolding', level: 'new', lang: 'Tamil', sup: 'S. Lim', avatar: { bg: '#e3f6ec', skin: '#a56a45', hat: '#f6c945', shirt: '#2c4a7c' } },
    { id: 'l7', name: 'Md Hasan', code: 'HL-2026-027', joined: 'Aug 2026', role: 'Blaster / painter', dept: 'Hull & coating', level: 'new', lang: 'Bangla', sup: 'K. Wong', avatar: { bg: '#fce6e5', skin: '#8d5a3c', hat: '#f6c945', shirt: '#3b82f6' } },
    { id: 'l8', name: 'Lim Jun Hao', code: 'HL-2024-012', joined: 'Apr 2024', role: 'Electrician', dept: 'Electrical', level: 'exp', lang: 'English', sup: 'J. Ng', avatar: { bg: '#dbe8ff', skin: '#f1c9a5', hat: '#3b82f6', shirt: '#2c4a7c' } },
    { id: 'l9', name: 'Ravi Shankar', code: 'HL-2021-005', joined: 'Nov 2021', role: 'Pipe fitter', dept: 'Engine', level: 'exp', lang: 'Tamil', sup: 'M. Tan', avatar: { bg: '#fdf1dc', skin: '#a56a45', hat: '#ffffff', shirt: '#5c6b85' } },
    { id: 'l10', name: 'Aung Ko', code: 'HL-2026-016', joined: 'Apr 2026', role: 'Welder', dept: 'Hull & coating', level: 'new', lang: 'Burmese', sup: 'K. Wong', avatar: { bg: '#e3f6ec', skin: '#c58a5f', hat: '#f6c945', shirt: '#2c4a7c' } },
  ];
}

interface Profile { progress: number; quiz: number; lastActiveDays: number; modules: string[]; enrolledDays: number; stale?: Record<string, [number, number]> }

const PROFILES: Record<string, Profile> = {
  l1: { progress: 0.64, quiz: 78, lastActiveDays: 0, modules: ['hw', 'erp'], enrolledDays: 10 },
  l2: { progress: 0.92, quiz: 88, lastActiveDays: 0, modules: ['hw', 'erp', 'rig'], enrolledDays: 16 },
  l3: { progress: 0.35, quiz: 58, lastActiveDays: 3, modules: ['hw', 'rig'], enrolledDays: 45, stale: { rig: [26, 40] } },
  l4: { progress: 1.0, quiz: 91, lastActiveDays: 1, modules: ['hw', 'erp', 'rig'], enrolledDays: 30 },
  l5: { progress: 1.0, quiz: 96, lastActiveDays: 0, modules: ['hw', 'erp', 'rig'], enrolledDays: 30 },
  l6: { progress: 0.48, quiz: 66, lastActiveDays: 1, modules: ['hw', 'rig'], enrolledDays: 32, stale: { rig: [14, 30] } },
  l7: { progress: 0.22, quiz: 0, lastActiveDays: 6, modules: ['hw'], enrolledDays: 9 },
  l8: { progress: 0.8, quiz: 84, lastActiveDays: 0, modules: ['hw', 'erp'], enrolledDays: 8 },
  l9: { progress: 0.71, quiz: 73, lastActiveDays: 2, modules: ['hw', 'erp', 'rig'], enrolledDays: 30, stale: { erp: [18, 28] } },
  l10: { progress: 0.55, quiz: 81, lastActiveDays: 0, modules: ['hw', 'erp'], enrolledDays: 6 },
};

// Every task has its own difficulty, so pass rates differ per task the way they do on a real
// crew: a couple of AI drafts are genuinely hard (bad distractors), most sit in the normal band.
function difficultyOf(e: Exercise): number {
  const h = Math.abs(hashString(e.id));
  if (e.generated && h % 6 === 0) return -38;
  if (e.generated && h % 6 === 1) return -18;
  return (h % 17) - 10;
}

export function seedActivity(exercises: Exercise[], now = Date.now()): { attempts: Attempt[]; enrollments: Enrollment[] } {
  const rand = mulberry32(2026);
  const attempts: Attempt[] = [];
  const enrollments: Enrollment[] = [];
  const dayStart = (d: number) => { const x = new Date(now - d * DAY); x.setHours(8, 0, 0, 0); return x.getTime(); };
  for (const [learnerId, p] of Object.entries(PROFILES)) {
    for (const materialId of p.modules) {
      enrollments.push({ learnerId, materialId, at: now - p.enrolledDays * DAY });
      const exs = exercises.filter((e) => e.materialId === materialId);
      const take = Math.round(exs.length * p.progress);
      exs.slice(0, take).forEach((e, i) => {
        const quizType = ['mcq', 'scen', 'audio', 'match', 'seq', 'cards', 'fill'].includes(e.type);
        const hard = e.type === 'scen' || e.type === 'seq';
        const noise = (rand() - 0.5) * (hard ? 40 : 24) - (hard ? 9 : 0);
        const score = p.quiz === 0 ? 0 : Math.max(20, Math.min(100, Math.round(p.quiz + noise + difficultyOf(e))));
        const passed = quizType ? score >= 60 : rand() > 0.12;
        const win = p.stale?.[materialId];
        const day = win ? win[0] + Math.floor(rand() * (win[1] - win[0] + 1)) : (i === 0 && materialId === p.modules[0] ? p.lastActiveDays : p.lastActiveDays + Math.floor(rand() * Math.max(1, 13 - p.lastActiveDays)));
        const at = Math.min(now - 3_600_000, dayStart(Math.min(45, day)) + Math.floor(rand() * 9) * 3_600_000 + i * 60_000);
        if (p.quiz === 0 && (i > 1 || quizType)) return;
        const seconds = 60 + Math.floor(rand() * 240) + (difficultyOf(e) < -30 ? 90 : 0);
        attempts.push({ id: 'a_' + learnerId + '_' + e.id, learnerId, materialId, exerciseId: e.id, type: e.type, score: quizType ? score : (passed ? 100 : 0), passed, seconds, at });
        // Learners who finished the module failed some tasks first and came back to pass them.
        if (!passed && p.progress >= 1) attempts.push({ id: 'a_' + learnerId + '_' + e.id + '_retry', learnerId, materialId, exerciseId: e.id, type: e.type, score: Math.max(60, Math.min(100, score + 35)), passed: true, seconds: 45 + Math.floor(rand() * 120), at: Math.min(now - 1_800_000, at + 3 * 3_600_000) });
      });
    }
  }
  return { attempts, enrollments };
}


export function seedAudit(materials: Material[], exercises: Exercise[], certificates: Certificate[] = [], learners: Learner[] = []): AuditEntry[] {
  const out: AuditEntry[] = [];
  let n = 0;
  const processed = materials.filter((m) => m.status === 'processed').sort((a, b) => a.createdAt - b.createdAt);
  for (const m of processed) {
    const count = exercises.filter((e) => e.materialId === m.id).length;
    out.push({ id: 'seed_log_' + n++, at: m.createdAt + 60_000, actor: 'System', role: 'System', action: 'material_processed', targetType: 'material', targetId: m.id, detail: count + ' exercises drafted (' + m.source + ') from ' + m.short });
  }
  const approved = exercises.filter((e) => e.reviewStatus === 'approved' && e.reviewedAt).sort((a, b) => (a.reviewedAt || 0) - (b.reviewedAt || 0));
  for (const e of approved) {
    out.push({ id: 'seed_log_' + n++, at: e.reviewedAt!, actor: e.reviewedBy || 'Harbourline Safety Team', role: 'HSE Manager', action: 'exercise_approved', targetType: 'exercise', targetId: e.id, detail: 'Approved "' + e.title + '"' });
  }
  for (const c of certificates) {
    const l = learners.find((x) => x.id === c.learnerId);
    const m = materials.find((x) => x.id === c.materialId);
    out.push({ id: 'seed_log_' + n++, at: c.issuedAt, actor: c.issuedBy, role: 'HSE Manager', action: 'certificate_issued', targetType: 'certificate', targetId: c.id, detail: 'Issued to ' + (l?.name || c.learnerId) + ' for ' + (m?.short || c.materialId) + ' · ' + c.code });
  }
  return out.sort((a, b) => a.at - b.at);
}

// Certificates the safety team issued before today, in every state the compliance view has to show:
// valid, expiring inside 30 days, and expired (a renewal that is overdue).
export function seedCertificates(now = Date.now()): Certificate[] {
  const issue = (learnerId: string, materialId: string, daysAgo: number, months: number): Certificate => {
    const issuedAt = now - daysAgo * DAY;
    return { id: 'cert_seed_' + learnerId + '_' + materialId, learnerId, materialId, issuedAt, expiresAt: issuedAt + months * 30 * DAY, code: verificationCode(learnerId, materialId, issuedAt), issuedBy: 'Harbourline Safety Team' };
  };
  return [
    issue('l4', 'erp', 120, 12),   // Chen Wei — valid for another ~8 months
    issue('l5', 'erp', 342, 12),   // Nurul Aisyah — expires in ~18 days
    issue('l5', 'rig', 45, 36),    // Nurul Aisyah — renewed recently
    issue('l9', 'erp', 400, 12),   // Ravi Shankar — expired 40 days ago, currently re-taking the module
    issue('l2', 'rig', 30, 36),    // Mohd Faizal — certified on the rigging refresher
  ];
}
