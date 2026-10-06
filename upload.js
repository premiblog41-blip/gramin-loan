const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DOC_TYPES = ['applicant_photo', 'applicant_nid', 'nominee_nid', 'passport_photo'];
const MAX_SIZE = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE, files: 1 },
});

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  if (buf.length > 8 && buf.subarray(0, 8).equals(png)) {
    return { mime: 'image/png', ext: 'png' };
  }
  return null;
}

router.post('/api/upload/:code/:type', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const big = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ ok: false, error: big ? 'ফাইল ২ MB এর বেশি হতে পারবে না' : 'ফাইল গ্রহণ করা যায়নি' });
    }
    const { code, type } = req.params;
    if (!DOC_TYPES.includes(type)) {
      return res.status(400).json({ ok: false, error: 'ডকুমেন্টের ধরন সঠিক নয়' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'ফাইল পাওয়া যায়নি' });
    }
    const app = db.prepare('SELECT id, status FROM applications WHERE app_code = ?').get(code);
    if (!app) return res.status(404).json({ ok: false, error: 'আবেদন পাওয়া যায়নি' });
    if (app.status !== 'Pending') {
      return res.status(403).json({ ok: false, error: 'এই আবেদনে এখন ফাইল যোগ করা যাবে না' });
    }
    const kind = detectType(req.file.buffer);
    if (!kind) {
      return res.status(400).json({ ok: false, error: 'শুধু JPG বা PNG ছবি দেওয়া যাবে' });
    }
    try {
      const stored = crypto.randomBytes(16).toString('hex') + '.' + kind.ext;
      fs.writeFileSync(path.join(UPLOAD_DIR, stored), req.file.buffer);
      const old = db.prepare('SELECT stored_name FROM documents WHERE application_id = ? AND doc_type = ?').get(app.id, type);
      db.prepare('INSERT OR REPLACE INTO documents (application_id, doc_type, stored_name, mime, size) VALUES (?,?,?,?,?)')
        .run(app.id, type, stored, kind.mime, req.file.size);
      if (old) fs.rmSync(path.join(UPLOAD_DIR, old.stored_name), { force: true });
      res.json({ ok: true, type });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'সার্ভারে সমস্যা হয়েছে' });
    }
  });
});

module.exports = router;
