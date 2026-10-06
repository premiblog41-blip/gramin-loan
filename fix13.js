const fs = require('fs');
const f = 'server.js';
let s = fs.readFileSync(f, 'utf8');
const old = `app.use(require('./admin'));`;
const neu = `app.use(require('./admin'));
app.use(require('./deposit'));`;
if (!s.includes(old)) { console.log('NOT FOUND'); process.exit(1); }
s = s.replace(old, neu);
fs.writeFileSync(f, s);
console.log('DONE');
