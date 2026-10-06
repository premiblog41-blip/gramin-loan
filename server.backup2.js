const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const AMOUNTS = [5000, 10000, 15000, 20000, 30000, 40000, 50000];
const FREQS = ['Weekly', 'Monthly'];

function newCode() {
  const n = crypto.randomInt(0, 100000000);
  return 'GL-' + String(n).padStart(8, '0');
}

app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS n FROM applications').get();
  res.json({ ok: true, applications: row.n });
});

app.post('/api/apply', (req, res) => {
  const b = req.body || {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  const mobileOk = (m) => /^01[3-9][0-9]{8}$/.test(m);

  const d = {
    full_name: s(b.full_name),
    mobile: s(b.mobile),
    nid: s(b.nid),
    dob: s(b.dob),
    address: s(b.address),
    amount: Number(b.amount),
    frequency: s(b.frequency),
    nominee_name: s(b.nominee_name),
    nominee_mobile: s(b.nominee_mobile),
    nominee_relation: s(b.nominee_relation),
  };

  const errors = [];
  if (d.full_name.length < 2 || d.full_name.length > 100) errors.push('নাম সঠিক নয়');
  if (!mobileOk(d.mobile)) errors.push('মোবাইল নম্বর সঠিক নয়');
  if (!/^([0-9]{10}|[0-9]{13}|[0-9]{17})$/.test(d.nid)) errors.push('NID নম্বর সঠিক নয়');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dob) || isNaN(Date.parse(d.dob))) errors.push('জন্ম তারিখ সঠিক নয়');
  if (d.address.length < 5 || d.address.length > 300) errors.push('ঠিকানা সঠিক নয়');
  if (!AMOUNTS.includes(d.amount)) errors.push('ঋণের পরিমাণ সঠিক নয়');
  if (!FREQS.includes(d.frequency)) errors.push('পরিশোধের ধরন সঠিক নয়');
  if (d.nominee_name.length < 2 || d.nominee_name.length > 100) errors.push('নমিনির নাম সঠিক নয়');
  if (!mobileOk(d.nominee_mobile)) errors.push('নমিনির মোবাইল সঠিক নয়');
  if (d.nominee_relation.length < 2 || d.nominee_relation.length > 50) errors.push('সম্পর্ক সঠিক নয়');

  if (errors.length) return res.status(400).json({ ok: false, errors });

  const sql = `INSERT INTO applications
    (app_code, full_name, mobile, nid, dob, address, amount, frequency,
     nominee_name, nominee_mobile, nominee_relation)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      db.prepare(sql).run(code, d.full_name, d.mobile, d.nid, d.dob, d.address,
        d.amount, d.frequency, d.nominee_name, d.nominee_mobile, d.nominee_relation);
      return res.json({ ok: true, app_code: code });
    } catch (e) {
      if (!String(e.message).includes('UNIQUE')) {
        return res.status(500).json({ ok: false, errors: ['সার্ভারে সমস্যা হয়েছে'] });
      }
    }
  }
  res.status(500).json({ ok: false, errors: ['আবার চেষ্টা করুন'] });
});

app.listen(PORT, () => {
  console.log('Server চলছে: http://localhost:' + PORT);
});
