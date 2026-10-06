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
const DOC_ORDER = ['applicant_photo', 'applicant_nid', 'nominee_nid', 'passport_photo'];
const path = require('path');
const fs = require('fs');
const https = require('https');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  const png = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  if (buf.length > 8 && buf.subarray(0,8).equals(png)) return { mime: 'image/png', ext: 'png' };
  return null;
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function saveDoc(applicationId, type, buf) {
  const kind = detectType(buf);
  if (!kind) return { ok: false, error: 'শুধু JPG বা PNG ছবি দেওয়া যাবে' };
  if (buf.length > 2 * 1024 * 1024) return { ok: false, error: 'ফাইল ২ MB এর বেশি' };
  const stored = crypto.randomBytes(16).toString('hex') + '.' + kind.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
  const old = db.prepare('SELECT stored_name FROM documents WHERE application_id = ? AND doc_type = ?').get(applicationId, type);
  db.prepare('INSERT OR REPLACE INTO documents (application_id, doc_type, stored_name, mime, size) VALUES (?,?,?,?,?)').run(applicationId, type, stored, kind.mime, buf.length);
  if (old) fs.rmSync(path.join(UPLOAD_DIR, old.stored_name), { force: true });
  return { ok: true };
}

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
  const chatId = msg.chat.id;
  const session = sessions.get(chatId);

  if (session && session.step === 'upload' && msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    const fileLink = await bot.getFileLink(photo.file_id);
    const buf = await downloadBuffer(fileLink);
    const type = DOC_ORDER[session.docIdx];
    const result = await saveDoc(session.appId, type, buf);
    if (!result.ok) { bot.sendMessage(chatId, '❌ ' + result.error + '। আবার পাঠান:'); return; }
    bot.sendMessage(chatId, '✅ আপলোড হয়েছে: ' + DOC_BN[type]);
    session.docIdx++;
    if (session.docIdx < DOC_ORDER.length) {
      bot.sendMessage(chatId, DOC_BN[DOC_ORDER[session.docIdx]] + ' পাঠান:');
    } else {
      sessions.delete(chatId);
      bot.sendMessage(chatId, 'আপনার আবেদন ও সকল ডকুমেন্ট সফলভাবে জমা হয়েছে। আবেদন আইডি: ' + session.code, mainMenu());
    }
    return;
  }

  if (session && session.step === 'upload' && msg.text) {
    bot.sendMessage(chatId, 'অনুগ্রহ করে ছবি পাঠান (টেক্সট নয়):');
    return;
  }

  if (!msg.text || msg.text.startsWith('/')) return;
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
    bot.sendMessage(chatId, 'আবেদন জমা হয়েছে।\nআপনার আবেদন আইডি: ' + code + '\nএখন ডকুমেন্ট আপলোড করুন।');
    const appRow = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(code);
    sessions.set(chatId, { step: 'upload', appId: appRow.id, code, docIdx: 0 });
    bot.sendMessage(chatId, DOC_BN[DOC_ORDER[0]] + ' পাঠান (ছবি হিসেবে, ফাইল হিসেবে না):');
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
