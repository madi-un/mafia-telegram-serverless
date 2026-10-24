import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { games } from '../schema.js';

// Role names only: the bot distributes roles; the moderator runs the game.
// Some roles belong to different Persian Mafia scenarios.
export const GROUPS = [
  { id: 'citizen', title: '🟢 شهروندان' },
  { id: 'mafia', title: '🔴 مافیا' },
  { id: 'neutral', title: '🟡 مستقل' },
];

export const ROLES = [
  { name: 'شهروند عادی', group: 'citizen' },
  { name: 'دکتر', group: 'citizen' },
  { name: 'کارآگاه', group: 'citizen' },
  { name: 'جان‌سخت', group: 'citizen' },
  { name: 'حرفه‌ای', group: 'citizen' },
  { name: 'اسنایپر', group: 'citizen' },
  { name: 'روان‌پزشک', group: 'citizen' },
  { name: 'شهردار', group: 'citizen' },
  { name: 'قاضی', group: 'citizen' },
  { name: 'کشیش', group: 'citizen' },
  { name: 'کابوی', group: 'citizen' },
  { name: 'ساقی', group: 'citizen' },
  { name: 'محافظ', group: 'citizen' },
  { name: 'تفنگدار', group: 'citizen' },
  { name: 'خبرنگار', group: 'citizen' },
  { name: 'بازپرس', group: 'citizen' },
  { name: 'کلانتر', group: 'citizen' },
  { name: 'فراماسون', group: 'citizen' },
  { name: 'زره‌پوش', group: 'citizen' },
  { name: 'آهنگر', group: 'citizen' },

  { name: 'مافیا (ساده)', group: 'mafia' },
  { name: 'پدرخوانده', group: 'mafia' },
  { name: 'دکتر لکتر', group: 'mafia' },
  { name: 'تروریست', group: 'mafia' },
  { name: 'ناتاشا', group: 'mafia' },
  { name: 'مذاکره‌کننده', group: 'mafia' },
  { name: 'افسونگر', group: 'mafia' },
  { name: 'وکیل', group: 'mafia' },
  { name: 'خرابکار', group: 'mafia' },
  { name: 'ناتو', group: 'mafia' },
  { name: 'یاکوزا', group: 'mafia' },
  { name: 'معشوقه', group: 'mafia' },
  { name: 'دزد', group: 'mafia' },
  { name: 'مرد قوی', group: 'mafia' },

  { name: 'جوکر', group: 'neutral' },
  { name: 'کیلر', group: 'neutral' },
  { name: 'گرگ‌نما', group: 'neutral' },
  { name: 'بازمانده', group: 'neutral' },
  { name: 'جلاد', group: 'neutral' },
  { name: 'نوستراداموس', group: 'neutral' },
];

export const PRESETS = [
  { id: 'classic', title: '🎲 کلاسیک ساده' },
  { id: 'advanced', title: '🕵️ کلاسیک نقش‌دار' },
  { id: 'nights', title: '🌙 شب‌های مافیا (پیشنهادی)' },
];

const roleId = name => ROLES.findIndex(role => role.name === name);

// Presets adapt to the number of players (5–30). These are SUGGESTED
// distributions, not a claim that every scenario uses this exact ruleset.
export function makePreset(total, presetId) {
  if (!Number.isInteger(total) || total < 5 || total > 30 || !PRESETS.some(p => p.id === presetId)) {
    return null;
  }

  const mafiaCount = Math.floor(total / 3);
  const citizenCount = total - mafiaCount;
  const mafia = [];
  const citizens = [];

  // Add each special role at most once and only if slots remain.
  const add = (list, max, name) => {
    if (list.length < max) list.push(roleId(name));
  };
  add(mafia, mafiaCount, 'پدرخوانده');
  if (presetId === 'nights') add(mafia, mafiaCount, 'دکتر لکتر');
  while (mafia.length < mafiaCount) mafia.push(roleId('مافیا (ساده)'));

  add(citizens, citizenCount, 'دکتر');
  add(citizens, citizenCount, 'کارآگاه');
  if (presetId !== 'classic') {
    add(citizens, citizenCount, 'جان‌سخت');
    add(citizens, citizenCount, 'حرفه‌ای');
  }
  if (presetId === 'nights') {
    add(citizens, citizenCount, 'روان‌پزشک');
    add(citizens, citizenCount, 'شهردار');
  }
  while (citizens.length < citizenCount) citizens.push(roleId('شهروند عادی'));

  return [...mafia, ...citizens];
}

export function summary(roles) {
  const counts = new Map();
  for (const id of roles) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts].map(([id, count]) => `• ${ROLES[id].name}: ${count}`).join('\n');
}

export async function load(chatId) {
  const row = await db.select().from(games).where(eq(games.chatId, chatId)).get();
  return row?.state ?? null;
}

export async function save(chatId, state) {
  await db.insert(games).values({ chatId, state })
    .onConflictDoUpdate({ target: games.chatId, set: { state } }).run();
}

export function modeKeyboard() {
  return { inline_keyboard: [
    [{ text: '🎲 مافیای آماده', callback_data: 'mode:ready' }],
    [{ text: '⚙️ مافیای دلخواه', callback_data: 'mode:custom' }],
  ] };
}

export function presetKeyboard() {
  return { inline_keyboard: [
    ...PRESETS.map(p => [{ text: p.title, callback_data: `preset:${p.id}` }]),
    [{ text: '⬅️ بازگشت', callback_data: 'mode:back' }],
  ] };
}

export function confirmKeyboard() {
  return { inline_keyboard: [
    [{ text: '✅ تأیید و شروع تقسیم نقش', callback_data: 'preset:confirm' }],
    [{ text: '🔄 انتخاب سناریوی دیگر', callback_data: 'preset:back' }],
    [{ text: '⚙️ تنظیم دستی نقش‌ها', callback_data: 'mode:custom' }],
  ] };
}

export function categoryKeyboard() {
  return { inline_keyboard: GROUPS.map(g => [
    { text: g.title, callback_data: `group:${g.id}` },
  ]) };
}

export function roleKeyboard(game, group) {
  const buttons = ROLES.map((role, index) => ({ role, index }))
    .filter(item => item.role.group === group)
    .map(({ role, index }) => ({
      text: `${role.name} (${game.roles.filter(id => id === index).length})`,
      callback_data: `role:${index}`,
    }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: '⬅️ بازگشت به دسته‌ها', callback_data: 'back' }]);
  return { inline_keyboard: rows };
}

// picks[0] is the box chosen by seat 1, picks[1] by seat 2, etc.
export function boxKeyboard(game) {
  // All unopened boxes look identical; callback_data still identifies each box.
  const buttons = game.cards
    .map((_, index) => ({ index, text: '🎁', callback_data: `box:${index}` }))
    .filter(button => !game.picks.includes(button.index));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 3) rows.push(buttons.slice(i, i + 3).map(({ text, callback_data }) => ({ text, callback_data })));
  return { inline_keyboard: rows };
}

export function turnText(game) {
  const seat = game.picks.length;
  return `🎁 نوبت صندلی ${seat + 1}: ${game.seats[seat]}\n\nگوشی را به این بازیکن بدهید تا یکی از جعبه‌های باقی‌مانده را انتخاب کند.`;
}

export async function startDistribution(chatId, game) {
  game.cards = shuffle([...game.roles]);
  game.picks = [];
  game.step = 'boxes';
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: turnText(game),
    reply_markup: boxKeyboard(game),
  });
  game.boardId = sent.message_id;
  await save(chatId, game);
}

// Accept Western (3), Persian (۳) and Arabic (٣) numerals.
export function readNumber(text) {
  const digits = text
    .replace(/[۰-۹]/g, digit => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
    .replace(/[٠-٩]/g, digit => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
  return /^[0-9]+$/.test(digits) && digits.length <= 3 ? Number(digits) : NaN;
}

export function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
