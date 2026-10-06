const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const router = express.Router();
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_HASH = bcrypt.hashSync(process.env.ADMIN_PASS || '', 10);
const STATUSES = ['Pending', 'Under Review', 'Approved', 'Rejected'];

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ ok: false, error: 'লগইন প্রয়োজন' });
}

router.post('/api/admin/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && bcrypt.compareSync(String(pass || ''), ADMIN_HASH)) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়' });
});

router.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/api/admin/me', (req, res) => {
  res.json({ ok: true, loggedIn: !!(req.session && req.session.isAdmin) });
});

router.get('/api/admin/applications', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, app_code, full_name, mobile, amount, frequency, status, created_at FROM applications ORDER BY id DESC').all();
  res.json({ ok: true, rows });
});

router.get('/api/admin/applications/:code', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT * FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const docs = db.prepare('SELECT doc_type, stored_name, mime, size FROM documents WHERE application_id = ?').all(a.id);
  const deposits = db.prepare('SELECT id, amount, trx_id, screenshot_name, status, created_at FROM deposits WHERE application_id = ? ORDER BY id DESC').all(a.id);
  res.json({ ok: true, app: a, docs, deposits });
});

router.get('/api/admin/deposit-screenshot/:id', requireAdmin, (req, res) => {
  const d = db.prepare('SELECT screenshot_name FROM deposits WHERE id = ?').get(req.params.id);
  if (!d || !d.screenshot_name) return res.status(404).end();
  const file = path.join(__dirname, 'uploads', d.screenshot_name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.sendFile(file);
});

router.post('/api/admin/deposit/:id/verify', requireAdmin, (req, res) => {
  const dep = db.prepare('SELECT * FROM deposits WHERE id = ?').get(req.params.id);
  if (!dep) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const { action } = req.body || {};
  if (action === 'verify') {
    if (dep.status === 'Verified') return res.json({ ok: true });
    db.prepare("UPDATE deposits SET status = 'Verified' WHERE id = ?").run(dep.id);
    db.prepare('UPDATE applications SET balance = balance + ? WHERE id = ?').run(dep.amount, dep.application_id);
  } else if (action === 'reject') {
    db.prepare("UPDATE deposits SET status = 'Failed' WHERE id = ?").run(dep.id);
  } else {
    return res.status(400).json({ ok: false, error: 'ভুল অ্যাকশন' });
  }
  res.json({ ok: true });
});

router.get('/api/admin/doc/:code/:type', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).end();
  const d = db.prepare('SELECT stored_name, mime FROM documents WHERE application_id = ? AND doc_type = ?').get(a.id, req.params.type);
  if (!d) return res.status(404).end();
  const file = path.join(__dirname, 'uploads', d.stored_name);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.type(d.mime).sendFile(file);
});

router.post('/api/admin/applications/:code/status', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const { status, reject_reason } = req.body || {};
  if (!STATUSES.includes(status)) return res.status(400).json({ ok: false, error: 'অবস্থা সঠিক নয়' });
  db.prepare('UPDATE applications SET status = ?, reject_reason = ? WHERE id = ?')
    .run(status, status === 'Rejected' ? String(reject_reason || '').slice(0, 500) : null, a.id);
  res.json({ ok: true });
});

router.get('/api/admin/chat/:code', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const msgs = db.prepare('SELECT sender, text, created_at FROM messages WHERE application_id = ? ORDER BY id ASC').all(a.id);
  res.json({ ok: true, msgs });
});

router.post('/api/admin/chat/:code', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  const text = String((req.body || {}).text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ ok: false, error: 'বার্তা লিখুন' });
  db.prepare("INSERT INTO messages (application_id, sender, text) VALUES (?, 'admin', ?)").run(a.id, text);
  res.json({ ok: true });
});

router.delete('/api/admin/applications/:code', requireAdmin, (req, res) => {
  const a = db.prepare('SELECT id FROM applications WHERE app_code = ?').get(req.params.code.toUpperCase());
  if (!a) return res.status(404).json({ ok: false, error: 'পাওয়া যায়নি' });
  if (!['Approved', 'Rejected'].includes(db.prepare('SELECT status FROM applications WHERE id = ?').get(a.id).status)) {
    return res.status(400).json({ ok: false, error: 'শুধু Approved বা Rejected আবেদন ডিলিট করা যাবে' });
  }
  const docs = db.prepare('SELECT stored_name FROM documents WHERE application_id = ?').all(a.id);
  const deps = db.prepare('SELECT screenshot_name FROM deposits WHERE application_id = ?').all(a.id);
  docs.forEach((d) => { try { fs.rmSync(path.join(__dirname, 'uploads', d.stored_name), { force: true }); } catch (e) {} });
  deps.forEach((d) => { if (d.screenshot_name) { try { fs.rmSync(path.join(__dirname, 'uploads', d.screenshot_name), { force: true }); } catch (e) {} } });
  db.prepare('DELETE FROM documents WHERE application_id = ?').run(a.id);
  db.prepare('DELETE FROM deposits WHERE application_id = ?').run(a.id);
  db.prepare('DELETE FROM messages WHERE application_id = ?').run(a.id);
  db.prepare('DELETE FROM applications WHERE id = ?').run(a.id);
  res.json({ ok: true });
});

module.exports = router;
