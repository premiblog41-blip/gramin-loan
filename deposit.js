const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
  const png = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
  if (buf.length > 8 && buf.subarray(0,8).equals(png)) return { mime: 'image/png', ext: 'png' };
  return null;
}

// আবেদনকারী TrxID/স্ক্রিনশট জমা দেবে
router.post('/api/deposit/:code', (req, res) => {
  upload.single('screenshot')(req, res, (err) => {
    if (err) return res.status(400).json({ ok: false, error: 'ফাইল সমস্যা (২ MB এর বেশি?)' });

    const code = req.params.code.trim().toUpperCase();
    const mobile = (req.body.mobile || '').trim();
    const amount = Number(req.body.amount);
    const trx_id = (req.body.trx_id || '').trim();

    const a = db.prepare('SELECT id FROM applications WHERE app_code = ? AND mobile = ?').get(code, mobile);
    if (!a) return res.status(404).json({ ok: false, error: 'আইডি বা মোবাইল নম্বর সঠিক নয়' });
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000000) return res.status(400).json({ ok: false, error: 'পরিমাণ সঠিক নয়' });
    if (!trx_id && !req.file) return res.status(400).json({ ok: false, error: 'Transaction ID অথবা স্ক্রিনশট দিন' });

    let stored = null;
    if (req.file) {
      const kind = detectType(req.file.buffer);
      if (!kind) return res.status(400).json({ ok: false, error: 'শুধু JPG বা PNG ছবি দেওয়া যাবে' });
      stored = crypto.randomBytes(16).toString('hex') + '.' + kind.ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);
    }

    db.prepare('INSERT INTO deposits (application_id, amount, trx_id, screenshot_name) VALUES (?,?,?,?)')
      .run(a.id, amount, trx_id || null, stored);
    res.json({ ok: true });
  });
});

module.exports = router;
