import { api } from 'sdk';
import { load, save, modeKeyboard, categoryKeyboard, startDistribution, shuffle, readNumber } from '../lib/mafia.js';

export default async function (message) {
  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  if (message.chat.type !== 'private') {
    if (text.startsWith('/mafia')) {
      await api.sendMessage({ chat_id: chatId, text: 'برای حفظ نقش‌ها، بازی را در چت خصوصی ربات شروع کنید.' });
    }
    return;
  }

  if (text === '/mafia' || text === 'شروع مافیا') {
    const current = await load(chatId);
    if (current && current.step !== 'players') {
      const sent = await api.sendMessage({
        chat_id: chatId,
        text: '⚠️ آیا مطمئنی می‌خواهی بازی جدید شروع کنی؟\n\nاطلاعات بازی فعلی جایگزین می‌شود و دیگر در دسترس نخواهد بود.',
        reply_markup: { inline_keyboard: [
          [{ text: '✅ بله، بازی جدید', callback_data: 'restart:yes' }],
          [{ text: '❌ انصراف', callback_data: 'restart:no' }],
        ] },
      });
      current.restartPromptId = sent.message_id;
      await save(chatId, current);
      return;
    }
    await save(chatId, { step: 'players', total: 0, seats: [], roles: [], cards: [], picks: [] });
    await api.sendMessage({ chat_id: chatId, text: '🎭 چند نفر می‌خواهند مافیا بازی کنند؟ (۲ تا ۳۰ نفر)' });
    return;
  }

  if (text === '/start') {
    await api.sendMessage({ chat_id: chatId, text: 'سلام! برای تقسیم نقش‌های مافیا دستور /mafia را بفرست.' });
    return;
  }

  const game = await load(chatId);
  if (!game) return;

  if (game.step === 'players') {
    const n = readNumber(text);
    if (!Number.isInteger(n) || n < 2 || n > 30) {
      await api.sendMessage({ chat_id: chatId, text: 'لطفاً یک عدد بین ۲ تا ۳۰ بفرست.' });
      return;
    }
    game.total = n;
    game.step = 'names';
    await save(chatId, game);
    await api.sendMessage({
      chat_id: chatId,
      text: `✍️ نام ${n} بازیکن را در یک پیام بنویس.\nهر اسم باید در یک خط جدا باشد.\n\nمثال:\nعلی\nسارا\nرضا`,
    });
    return;
  }

  if (game.step === 'names') {
    const names = text.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
    if (names.length !== game.total) {
      await api.sendMessage({
        chat_id: chatId,
        text: `❌ ${names.length} اسم دریافت شد، اما تعداد بازیکنان ${game.total} نفر است.\nلطفاً تمام ${game.total} اسم را دوباره، هر کدام در یک خط، بفرست.`,
      });
      return;
    }
    if (names.some(name => name.length > 40)) {
      await api.sendMessage({ chat_id: chatId, text: '❌ هر اسم باید حداکثر ۴۰ کاراکتر باشد. لیست را دوباره بفرست.' });
      return;
    }
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) {
      await api.sendMessage({ chat_id: chatId, text: '❌ نام تکراری وجود دارد. برای افراد هم‌نام از اسم متمایز استفاده کن (مثلاً علی ۱ و علی ۲).' });
      return;
    }

    game.seats = shuffle(names);
    game.step = 'mode';
    await save(chatId, game);
    await api.sendMessage({
      chat_id: chatId,
      text: `🪑 شماره صندلی‌ها به‌صورت تصادفی تعیین شد:\n\n${game.seats.map((name, i) => `صندلی ${i + 1}: ${name}`).join('\n')}`,
    });
    const sent = await api.sendMessage({
      chat_id: chatId,
      text: '🎭 چگونه می‌خواهی نقش‌ها را انتخاب کنی؟\n\n🎲 آماده: سناریو را انتخاب کن، تعداد نقش‌ها خودکار تنظیم می‌شود.\n⚙️ دلخواه: نقش و تعداد هر نقش را خودت انتخاب کن.',
      reply_markup: modeKeyboard(),
    });
    game.menuId = sent.message_id;
    await save(chatId, game);
    return;
  }

  if (game.step === 'count') {
    const n = readNumber(text);
    const remaining = game.total - game.roles.length;
    if (!Number.isInteger(n) || n < 1 || n > remaining) {
      await api.sendMessage({ chat_id: chatId, text: `لطفاً یک عدد بین ۱ تا ${remaining} بفرست.` });
      return;
    }
    game.roles.push(...Array(n).fill(game.pending));
    delete game.pending;

    if (game.roles.length < game.total) {
      game.step = 'choose';
      await save(chatId, game);
      const sent = await api.sendMessage({
        chat_id: chatId,
        text: `✅ ثبت شد. ${game.total - game.roles.length} نقش باقی مانده. دسته نقش بعدی را انتخاب کن.`,
        reply_markup: categoryKeyboard(),
      });
      game.menuId = sent.message_id;
      await save(chatId, game);
    } else {
      await startDistribution(chatId, game);
    }
    return;
  }

  if (['mode', 'preset', 'confirm', 'choose'].includes(game.step)) {
    await api.sendMessage({ chat_id: chatId, text: 'لطفاً از دکمه‌های زیر پیام برای انتخاب نقش‌ها استفاده کن.' });
  }
}
