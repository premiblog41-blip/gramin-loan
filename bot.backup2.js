const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, {
  polling: { interval: 1000, autoStart: true, params: { timeout: 10 } },
  request: { timeout: 30000 },
});
const sessions = new Map();
const crypto = require('crypto');
const AMOUNTS = [5000, 10000, 15000, 20000, 30000, 40000, 50000];
const DEPOSITS = {5000:600, 10000:1200, 15000:1800, 20000:2200, 30000:2800, 40000:3500, 50000:5000};
const FREQS = ['Weekly', 'Monthly'];
function newCode() { return 'GL-' + String(crypto.randomInt(0, 100000000)).padStart(8, '0'); }
function mobileOk(m) { return /^01[3-9][0-9]{8}$/.test(m); }

const STATUS_BN = {'Pending':'অপেক্ষমাণ','Under Review':'পর্যালোচনায় আছে','Approved':'অনুমোদিত','Rejected':'বাতিল'};
const FREQ_BN = {Weekly:'সাপ্তাহিক',Monthly:'মাসিক'};
const DOC_BN = {applicant_photo:'আবেদনকারীর ছবি',applicant_nid:'আবেদনকারীর NID',nominee_nid:'নমিনির NID',passport_photo:'পাসপোর্ট ছবি'};

function mainMenu() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'নতুন আবেদন করুন', callback_data: 'new_apply' }],
        [{ text: 'আবেদনের অবস্থা দেখুন', callback_data: 'check_status' }],
      ],
    },
  };
}
function amountKeyboard() {
  return { reply_markup: { inline_keyboard: AMOUNTS.map((a) => [{ text: '৳' + a.toLocaleString('bn-BD') + ' (সঞ্চয় ৳' + DEPOSITS[a] + ')', callback_data: 'amt_' + a }]) } };
}
function freqKeyboard() {
  return { reply_markup: { inline_keyboard: [[{ text: 'সাপ্তাহিক', callback_data: 'freq_Weekly' }, { text: 'মাসিক', callback_data: 'freq_Monthly' }]] } };
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
    return;
  }

  if (q.data === 'new_apply') {
    sessions.set(chatId, { step: 'a_name', data: {} });
    bot.sendMessage(chatId, 'আপনার পূর্ণ নাম লিখুন:');
    return;
  }

  if (q.data.startsWith('amt_')) {
    const sess = sessions.get(chatId);
    if (!sess) return;
    sess.data.amount = Number(q.data.slice(4));
    sess.step = 'a_freq';
    bot.sendMessage(chatId, 'পরিশোধের ধরন বাছুন:', freqKeyboard());
    return;
  }

  if (q.data.startsWith('freq_')) {
    const sess = sessions.get(chatId);
    if (!sess) return;
    sess.data.frequency = q.data.slice(5);
    sess.step = 'a_nominee_name';
    bot.sendMessage(chatId, 'নমিনির নাম লিখুন:');
    return;
  }
});

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);
  if (!session) return;
  const text = msg.text.trim();

  if (session.step === 'a_name') {
    if (text.length < 2 || text.length > 100) { bot.sendMessage(chatId, 'নাম সঠিক নয়, আবার লিখুন:'); return; }
    session.data.full_name = text;
    session.step = 'a_mobile';
    bot.sendMessage(chatId, 'মোবাইল নম্বর লিখুন (01XXXXXXXXX):');
    return;
  }
  if (session.step === 'a_mobile') {
    if (!mobileOk(text)) { bot.sendMessage(chatId, 'মোবাইল নম্বর সঠিক নয়, আবার লিখুন:'); return; }
    session.data.mobile = text;
    session.step = 'a_nid';
    bot.sendMessage(chatId, 'NID নম্বর লিখুন (১০, ১৩ বা ১৭ অঙ্ক):');
    return;
  }
  if (session.step === 'a_nid') {
    if (!/^([0-9]{10}|[0-9]{13}|[0-9]{17})$/.test(text)) { bot.sendMessage(chatId, 'NID সঠিক নয়, আবার লিখুন:'); return; }
    session.data.nid = text;
    session.step = 'a_dob';
    bot.sendMessage(chatId, 'জন্ম তারিখ লিখুন (YYYY-MM-DD, যেমন 1995-05-20):');
    return;
  }
  if (session.step === 'a_dob') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || isNaN(Date.parse(text))) { bot.sendMessage(chatId, 'তারিখের ফরম্যাট সঠিক নয়, আবার লিখুন (YYYY-MM-DD):'); return; }
    const age = (Date.now() - Date.parse(text)) / (365.25*24*60*60*1000);
    if (age < 18) { bot.sendMessage(chatId, 'ন্যূনতম বয়স ১৮ বছর হতে হবে। আবার লিখুন বা /start দিন:'); return; }
    session.data.dob = text;
    session.step = 'a_address';
    bot.sendMessage(chatId, 'ঠিকানা লিখুন:');
    return;
  }
  if (session.step === 'a_address') {
    if (text.length < 5 || text.length > 300) { bot.sendMessage(chatId, 'ঠিকানা সঠিক নয়, আবার লিখুন:'); return; }
    session.data.address = text;
    session.step = 'a_amount';
    bot.sendMessage(chatId, 'ঋণের পরিমাণ বাছুন:', amountKeyboard());
    return;
  }
  if (session.step === 'a_nominee_name') {
    if (text.length < 2 || text.length > 100) { bot.sendMessage(chatId, 'নাম সঠিক নয়, আবার লিখুন:'); return; }
    session.data.nominee_name = text;
    session.step = 'a_nominee_mobile';
    bot.sendMessage(chatId, 'নমিনির মোবাইল নম্বর লিখুন:');
    return;
  }
  if (session.step === 'a_nominee_mobile') {
    if (!mobileOk(text)) { bot.sendMessage(chatId, 'মোবাইল নম্বর সঠিক নয়, আবার লিখুন:'); return; }
    session.data.nominee_mobile = text;
    session.step = 'a_nominee_relation';
    bot.sendMessage(chatId, 'নমিনির সাথে সম্পর্ক লিখুন:');
    return;
  }
  if (session.step === 'a_nominee_relation') {
    if (text.length < 2 || text.length > 50) { bot.sendMessage(chatId, 'সম্পর্ক সঠিক নয়, আবার লিখুন:'); return; }
    session.data.nominee_relation = text;
    const d = session.data;
    const sql = `INSERT INTO applications (app_code, full_name, mobile, nid, dob, address, amount, frequency, nominee_name, nominee_mobile, nominee_relation) VALUES (?,?,?,?,?,?,?,?,?,?,?)`;
    let code;
    for (let i = 0; i < 5; i++) {
      code = newCode();
      try {
        db.prepare(sql).run(code, d.full_name, d.mobile, d.nid, d.dob, d.address, d.amount, d.frequency, d.nominee_name, d.nominee_mobile, d.nominee_relation);
        break;
      } catch (e) { code = null; }
    }
    sessions.delete(chatId);
    if (!code) { bot.sendMessage(chatId, 'সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।', mainMenu()); return; }
    bot.sendMessage(chatId, 'আবেদন জমা হয়েছে।\nআপনার আবেদন আইডি: ' + code + '\nডকুমেন্ট আপলোড পরে যোগ হবে। আইডিটি লিখে রাখুন।', mainMenu());
    return;
  }

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
