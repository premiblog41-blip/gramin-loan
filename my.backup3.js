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

module.exports = router;
