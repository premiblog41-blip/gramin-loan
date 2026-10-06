const fs = require('fs');
const f = 'public/admin-ui.js';
let s = fs.readFileSync(f, 'utf8');
const old = `  html += \`<div class="row-actions">
    <button class="btn-review" onclick="setStatus('\${a.app_code}','Under Review')">পর্যালোচনায় নিন</button>
    <button class="btn-approve" onclick="setStatus('\${a.app_code}','Approved')">অনুমোদন করুন</button>
    <button class="btn-reject" onclick="rejectApp('\${a.app_code}')">বাতিল করুন</button>
  </div>\`;`;
const neu = `  html += \`<div class="row-actions">
    <button class="btn-review" onclick="setStatus('\${a.app_code}','Under Review')">পর্যালোচনায় নিন</button>
    <button class="btn-approve" onclick="setStatus('\${a.app_code}','Approved')">অনুমোদন করুন</button>
    <button class="btn-reject" onclick="rejectApp('\${a.app_code}')">বাতিল করুন</button>
    \${['Approved','Rejected'].includes(a.status) ? '<button class="btn-reject" onclick="deleteApp(\\'' + a.app_code + '\\')">আবেদন ডিলিট করুন</button>' : ''}
  </div>\`;`;
if (!s.includes(old)) { console.log('A-NOT-FOUND'); process.exit(1); }
s = s.replace(old, neu);

const oldEnd = `checkLogin();`;
const neuEnd = `async function deleteApp(code) {
  if (!confirm('আপনি কি নিশ্চিত? এই আবেদন, এর সব ডকুমেন্ট ও তথ্য স্থায়ীভাবে মুছে যাবে, এটা ফেরত আনা যাবে না।')) return;
  const r = await fetch('/api/admin/applications/' + encodeURIComponent(code), { method: 'DELETE' });
  const j = await r.json();
  if (j.ok) {
    alert('আবেদন ডিলিট হয়েছে।');
    detailBox.style.display = 'none';
    document.getElementById('adminChatBox').style.display = 'none';
    loadList();
  } else {
    alert(j.error || 'সমস্যা হয়েছে');
  }
}

checkLogin();`;
if (!s.includes(oldEnd)) { console.log('B-NOT-FOUND'); process.exit(1); }
s = s.replace(oldEnd, neuEnd);

fs.writeFileSync(f, s);
console.log('DONE');
