const express = require('express');
const db = require('./db');

const router = express.Router();
const tries = new Map();

function limited(ip) {
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  tries.set(ip, list);
  return list.length > 10;
}

router.post('/api/my-application', (req, res) => {
  if (limited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন' });
  }
  const b = req.body || {};
  const code = typeof b.app_code === 'string' ? b.app_code.trim().toUpperCase() : '';
  const mobile = typeof b.mobile === 'string' ? b.mobile.trim() : '';

  const a = db.prepare('SELECT * FROM applications WHERE app_code = ? AND mobile = ?').get(code, mobile);
  if (!a) {
    return res.status(404).json({ ok: false, error: 'আইডি বা মোবাইল নম্বর সঠিক নয়' });
  }
  const docs = db.prepare('SELECT doc_type, status FROM documents WHERE application_id = ?').all(a.id);

  res.json({
    ok: true,
    app: {
      app_code: a.app_code,
      full_name: a.full_name,
      mobile: a.mobile,
      nid_masked: '**********' + a.nid.slice(-3),
      address: a.address,
      amount: a.amount,
      frequency: a.frequency,
      nominee_name: a.nominee_name,
      status: a.status,
      reject_reason: a.status === 'Rejected' ? a.reject_reason : null,
      created_at: a.created_at,
      balance: a.balance || 0,
    },
    docs: docs.map((d) => ({ doc_type: d.doc_type, status: d.status })),
  });
});

router.get('/api/chat/:code/:mobile', (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ? AND mobile = ?').get(req.params.code.toUpperCase(), req.params.mobile);
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const msgs = db.prepare('SELECT sender, text, created_at FROM messages WHERE application_id = ? ORDER BY id ASC').all(a.id);
  res.json({ ok: true, msgs });
});

router.post('/api/chat/:code/:mobile', (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ? AND mobile = ?').get(req.params.code.toUpperCase(), req.params.mobile);
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const text = String((req.body || {}).text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ ok: false, error: 'বার্তা লিখুন' });
  db.prepare("INSERT INTO messages (application_id, sender, text) VALUES (?, 'applicant', ?)").run(a.id, text);
  res.json({ ok: true });
});

module.exports = router;
