const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

const STATUS_BN = {'Pending':'অপেক্ষমাণ','Under Review':'পর্যালোচনায় আছে','Approved':'অনুমোদিত','Rejected':'বাতিল'};
const FREQ_BN = {Weekly:'সাপ্তাহিক',Monthly:'মাসিক'};
const DOC_BN = {applicant_photo:'আবেদনকারীর ছবি',applicant_nid:'আবেদনকারীর NID',nominee_nid:'নমিনির NID',passport_photo:'পাসপোর্ট ছবি'};

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'আবেদনের অবস্থা দেখুন', callback_data: 'check_status' }],
      ],
    },
  };
}

bot.onText(/\/start/, (msg) => {
  sessions.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id,
    'স্বাগতম গ্রামিন লোন বটে।\nনিচে থেকে একটা অপশন বাছুন:',
    mainMenu());
});

bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  await bot.answerCallbackQuery(q.id);

  if (q.data === 'check_status') {
    sessions.set(chatId, { step: 'await_code' });
    bot.sendMessage(chatId, 'আপনার আবেদন আইডি লিখুন (যেমন GL-12345678):');
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;

  if (session.step === 'await_code') {
    session.code = msg.text.trim().toUpperCase();
    session.step = 'await_mobile';
    bot.sendMessage(chatId, 'এবার আবেদনের মোবাইল নম্বর লিখুন:');
    return;
  }

  if (session.step === 'await_mobile') {
    const mobile = msg.text.trim();
    const a = db.prepare('SELECT * FROM applications WHERE app_code = ? AND mobile = ?').get(session.code, mobile);
    sessions.delete(chatId);
    if (!a) {
      bot.sendMessage(chatId, 'আইডি বা মোবাইল নম্বর সঠিক নয়।', mainMenu());
      return;
    }
    const docs = db.prepare('SELECT doc_type FROM documents WHERE application_id = ?').all(a.id);
    let text = `আবেদন আইডি: ${a.app_code}\nনাম: ${a.full_name}\nঅবস্থা: ${STATUS_BN[a.status] || a.status}\nপরিমাণ: ৳${a.amount} (${FREQ_BN[a.frequency] || a.frequency})\n`;
    if (a.status === 'Rejected' && a.reject_reason) text += `বাতিলের কারণ: ${a.reject_reason}\n`;
    text += '\nডকুমেন্ট:\n';
    Object.keys(DOC_BN).forEach((type) => {
      const has = docs.find((d) => d.doc_type === type);
      text += `${DOC_BN[type]}: ${has ? '✅' : '❌'}\n`;
    });
    bot.sendMessage(chatId, text, mainMenu());
  }
});

console.log('Telegram bot চালু হয়েছে');
module.exports = bot;
