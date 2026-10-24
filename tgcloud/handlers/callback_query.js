import { api } from 'sdk';
import {
  load, save, ROLES, GROUPS, PRESETS, makePreset, summary,
  modeKeyboard, presetKeyboard, confirmKeyboard, categoryKeyboard,
  roleKeyboard, boxKeyboard, turnText, startDistribution,
} from '../lib/mafia.js';

// Final-screen controls: the list is never shown until the moderator taps Show.
const finalKeyboard = visible => ({ inline_keyboard: [
  [{ text: visible ? '🙈 مخفی کردن لیست نقش‌ها' : '🔐 نمایش لیست نقش‌ها', callback_data: visible ? 'hide' : 'show' }],
  [{ text: '🔄 شروع بازی جدید', callback_data: 'restart:ask' }],
] });

const confirmRestartKeyboard = () => ({ inline_keyboard: [
  [{ text: '✅ بله، بازی جدید', callback_data: 'restart:yes' }],
  [{ text: '❌ انصراف', callback_data: 'restart:no' }],
] });

const freshGame = () => ({ step: 'players', total: 0, seats: [], roles: [], cards: [], picks: [] });

function roleList(game) {
  return '📋 لیست کامل برای گرداننده:\n\n' + game.seats.map((name, seat) => {
    const box = game.picks[seat];
    return `🪑 ${seat + 1}. ${name} — ${ROLES[game.cards[box]].name} (جعبه ${box + 1})`;
  }).join('\n');
}

export default async function (query) {
  await api.answerCallbackQuery({ callback_query_id: query.id });
  if (!query.message?.chat || query.message.chat.type !== 'private') return;

  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const action = query.data || '';
  const game = await load(chatId);
  if (!game) return;

  async function show(text, reply_markup = { inline_keyboard: [] }) {
    await api.editMessageText({ chat_id: chatId, message_id: messageId, text, reply_markup });
  }

  // A /mafia command during a game gets a separate confirmation message.
  // Ignore any old confirmation messages from previous requests.
  if (messageId === game.restartPromptId && (action === 'restart:yes' || action === 'restart:no')) {
    if (action === 'restart:no') {
      delete game.restartPromptId;
      await save(chatId, game);
      await show('✅ بازی قبلی حفظ شد. می‌توانی آن را ادامه بدهی.');
      return;
    }

    // Conceal the previous board (especially if its role list was visible).
    if (game.boardId && game.boardId !== messageId) {
      await api.editMessageText({
        chat_id: chatId, message_id: game.boardId,
        text: '🔒 بازی قبلی بسته شد.', reply_markup: { inline_keyboard: [] },
      });
    }
    await show('🎭 بازی جدید شروع شد!\n\nچند نفر می‌خواهند مافیا بازی کنند؟ (۲ تا ۳۰ نفر)');
    await save(chatId, freshGame());
    return;
  }

  // Setup buttons work only on the current setup message (not old menus).
  if (messageId === game.menuId) {
    if (action === 'mode:back' && game.step === 'preset') {
      game.step = 'mode';
      await save(chatId, game);
      await show('🎭 روش تقسیم نقش را انتخاب کن.', modeKeyboard());
      return;
    }

    if (action === 'mode:ready' && game.step === 'mode') {
      if (game.total < 5) {
        await show('🎲 ترکیب‌های آماده برای ۵ تا ۳۰ نفر هستند. برای کمتر از ۵ نفر، «دلخواه» را انتخاب کن.', modeKeyboard());
        return;
      }
      game.step = 'preset';
      await save(chatId, game);
      await show('🎲 یک ترکیب آماده انتخاب کن.\nاین ترکیب‌ها پیشنهادی هستند و با تعداد بازیکنان تنظیم می‌شوند.', presetKeyboard());
      return;
    }

    // Can switch from the preview to manual before starting distribution.
    if (action === 'mode:custom' && ['mode', 'preset', 'confirm'].includes(game.step)) {
      game.roles = [];
      delete game.preset;
      game.step = 'choose';
      await save(chatId, game);
      await show(`⚙️ نقش‌ها را از دسته‌های زیر انتخاب کن.\nتعداد باقی‌مانده: ${game.total}`, categoryKeyboard());
      return;
    }

    if (action === 'preset:back' && game.step === 'confirm') {
      game.step = 'preset';
      game.roles = [];
      delete game.preset;
      await save(chatId, game);
      await show('🎲 یک ترکیب آماده انتخاب کن.', presetKeyboard());
      return;
    }

    if (action.startsWith('preset:') && game.step === 'preset') {
      const id = action.slice(7);
      const preset = PRESETS.find(p => p.id === id);
      if (!preset) return;
      const roles = makePreset(game.total, id);
      if (!roles) return;
      game.roles = roles;
      game.preset = id;
      game.step = 'confirm';
      await save(chatId, game);
      await show(`🎲 ${preset.title}\n👥 ${game.total} بازیکن\n\n${summary(roles)}\n\n✅ اگر این نقش‌ها مناسب‌اند، تقسیم نقش را شروع کن.\nنقش‌ها پس از تأیید به‌صورت تصادفی در جعبه‌ها قرار می‌گیرند.`, confirmKeyboard());
      return;
    }

    if (action === 'preset:confirm' && game.step === 'confirm') {
      // Hide the full deck preview before handing the phone to players.
      await show('✅ نقش‌ها انتخاب شدند و جعبه‌ها آماده‌اند.\n📱 گوشی را به نفر صندلی ۱ بدهید.');
      await startDistribution(chatId, game);
      return;
    }

    // Original custom-role picker.
    if (game.step === 'choose') {
      const remaining = game.total - game.roles.length;
      if (action === 'back') {
        await show(`🎭 یک دسته نقش انتخاب کن.\nتعداد باقی‌مانده: ${remaining}`, categoryKeyboard());
        return;
      }
      if (action.startsWith('group:')) {
        const group = action.slice(6);
        const category = GROUPS.find(g => g.id === group);
        if (!category) return;
        await show(`${category.title}\nیک نقش انتخاب کن.\nتعداد باقی‌مانده: ${remaining}`, roleKeyboard(game, group));
        return;
      }
      if (action.startsWith('role:')) {
        const index = Number(action.slice(5));
        if (!Number.isInteger(index) || index < 0 || index >= ROLES.length) return;
        game.step = 'count';
        game.pending = index;
        await save(chatId, game);
        await show(`🎭 نقش «${ROLES[index].name}»\nچند نفر این نقش را داشته باشند؟\n(۱ تا ${remaining} نفر)\n\nتعداد را به صورت پیام بفرست.`);
        return;
      }
    }
  }

  // Ignore outdated buttons from older turns or earlier games.
  if (messageId !== game.boardId) return;

  // Starting again from the finished game always requires confirmation.
  if (action === 'restart:ask' && ['finished', 'shown'].includes(game.step)) {
    game.restartFrom = game.step;
    game.step = 'restart_confirm';
    await save(chatId, game);
    await show('⚠️ آیا مطمئنی می‌خواهی بازی جدید شروع کنی؟\n\nاطلاعات بازی فعلی جایگزین می‌شود و دیگر در دسترس نخواهد بود.', confirmRestartKeyboard());
    return;
  }

  if (game.step === 'restart_confirm' && action === 'restart:no') {
    game.step = game.restartFrom === 'shown' ? 'shown' : 'finished';
    delete game.restartFrom;
    await save(chatId, game);
    if (game.step === 'shown') {
      await show(roleList(game), finalKeyboard(true));
    } else {
      await show('🔒 لیست نقش‌ها مخفی شد.\n\n📱 برای دیدن دوباره، دکمه زیر را بزنید.', finalKeyboard(false));
    }
    return;
  }

  if (game.step === 'restart_confirm' && action === 'restart:yes') {
    await show('🎭 بازی جدید شروع شد!\n\nچند نفر می‌خواهند مافیا بازی کنند؟ (۲ تا ۳۰ نفر)');
    await save(chatId, freshGame());
    return;
  }

  if (action.startsWith('box:') && game.step === 'boxes') {
    const index = Number(action.slice(4));
    if (!Number.isInteger(index) || index < 0 || index >= game.cards.length || game.picks.includes(index)) return;
    game.step = 'reveal';
    game.selected = index;
    await save(chatId, game);
    await show(
      `🎴 ${game.seats[game.picks.length]} | صندلی ${game.picks.length + 1}\n\nنقش شما: ${ROLES[game.cards[index]].name}\n\nبعد از حفظ کردن نقش، دکمه زیر را بزن.`,
      { inline_keyboard: [[{ text: '✅ متوجه شدم', callback_data: 'ok' }]] },
    );
    return;
  }

  if (action === 'ok' && game.step === 'reveal') {
    game.picks.push(game.selected);
    delete game.selected;
    const finished = game.picks.length === game.total;
    game.step = finished ? 'finished' : 'boxes';
    await save(chatId, game);

    if (finished) {
      await show('✅ همه بازیکنان نقش خود را دیدند.\n\n📱 گوشی را به گرداننده بدهید.\nلیست نقش‌ها هنوز مخفی است.', finalKeyboard(false));
    } else {
      await show(`✅ نقش نفر قبل مخفی شد.\n\n${turnText(game)}`, boxKeyboard(game));
    }
    return;
  }

  if (action === 'show' && game.step === 'finished') {
    game.step = 'shown';
    await save(chatId, game);
    await show(roleList(game), finalKeyboard(true));
    return;
  }

  if (action === 'hide' && game.step === 'shown') {
    game.step = 'finished';
    await save(chatId, game);
    await show('🔒 لیست نقش‌ها مخفی شد.\n\n📱 برای دیدن دوباره، دکمه زیر را بزنید.', finalKeyboard(false));
    return;
  }
}
