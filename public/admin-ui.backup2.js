const loginBox = document.getElementById('loginBox');
const panel = document.getElementById('panel');
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
const listBox = document.getElementById('listBox');
const detailBox = document.getElementById('detailBox');

const STATUS_BN = {'Pending':'অপেক্ষমাণ','Under Review':'পর্যালোচনায়','Approved':'অনুমোদিত','Rejected':'বাতিল'};
const DOC_BN = {applicant_photo:'আবেদনকারীর ছবি',applicant_nid:'আবেদনকারীর NID',nominee_nid:'নমিনির NID',passport_photo:'পাসপোর্ট ছবি'};

async function checkLogin() {
  const r = await fetch('/api/admin/me');
  const j = await r.json();
  if (j.loggedIn) { loginBox.style.display='none'; panel.style.display='block'; loadList(); }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(loginForm));
  const r = await fetch('/api/admin/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const j = await r.json();
  if (j.ok) { loginBox.style.display='none'; panel.style.display='block'; loadList(); }
  else { loginMsg.style.display='block'; loginMsg.className='msg err'; loginMsg.textContent=j.error; }
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/admin/logout', {method:'POST'});
  location.reload();
});

async function loadList() {
  const r = await fetch('/api/admin/applications');
  const j = await r.json();
  if (!j.ok) return;
  let html = '<table><tr><th>আইডি</th><th>নাম</th><th>মোবাইল</th><th>পরিমাণ</th><th>অবস্থা</th></tr>';
  j.rows.forEach((a) => {
    html += `<tr onclick="openApp('${a.app_code}')"><td>${a.app_code}</td><td>${a.full_name}</td><td>${a.mobile}</td><td>৳${a.amount}</td><td>${STATUS_BN[a.status]||a.status}</td></tr>`;
  });
  html += '</table>';
  listBox.innerHTML = html;
}

async function openApp(code) {
  const r = await fetch('/api/admin/applications/' + encodeURIComponent(code));
  const j = await r.json();
  if (!j.ok) return alert(j.error);
  const a = j.app;
  let html = `<h3>${a.app_code} — ${a.full_name}</h3>`;
  html += `<p><b>মোবাইল:</b> ${a.mobile}</p>`;
  html += `<p><b>NID:</b> ${a.nid}</p>`;
  html += `<p><b>জন্ম তারিখ:</b> ${a.dob}</p>`;
  html += `<p><b>ঠিকানা:</b> ${a.address}</p>`;
  html += `<p><b>পরিমাণ:</b> ৳${a.amount} (${a.frequency})</p>`;
  html += `<p><b>নমিনি:</b> ${a.nominee_name}, ${a.nominee_mobile}, ${a.nominee_relation}</p>`;
  html += `<p><b>বর্তমান অবস্থা:</b> ${STATUS_BN[a.status]||a.status}</p>`;
  html += `<p><b>মোট ব্যালেন্স:</b> ৳${a.balance || 0}</p>`;
  html += '<p><b>সঞ্চয় জমার অনুরোধ:</b></p>';
  if (!j.deposits || j.deposits.length === 0) {
    html += '<p>কোনো অনুরোধ নেই।</p>';
  } else {
    j.deposits.forEach((d) => {
      const stBn = d.status === 'Pending' ? 'অপেক্ষমাণ' : d.status === 'Verified' ? 'যাচাইকৃত' : 'বাতিল';
      html += `<div style="border:1px solid #dbe4f3;border-radius:8px;padding:10px;margin-bottom:8px">
        <p><b>পরিমাণ:</b> ৳${d.amount} &nbsp; <b>অবস্থা:</b> ${stBn}</p>
        ${d.trx_id ? '<p><b>TrxID:</b> ' + d.trx_id + '</p>' : ''}
        ${d.screenshot_name ? '<a class="doc-link" target="_blank" href="/api/admin/deposit-screenshot/' + d.id + '">স্ক্রিনশট দেখুন</a>' : ''}
        ${d.status === 'Pending' ? '<div class="row-actions"><button class="btn-approve" onclick="verifyDeposit(' + d.id + ',\'' + a.app_code + '\')">যাচাই করুন (ব্যালেন্সে যোগ)</button><button class="btn-reject" onclick="rejectDeposit(' + d.id + ',\'' + a.app_code + '\')">বাতিল করুন</button></div>' : ''}
      </div>`;
    });
  }
  html += '<p><b>ডকুমেন্ট:</b></p>';
  Object.keys(DOC_BN).forEach((type) => {
    const has = j.docs.find((d) => d.doc_type === type);
    html += has ? `<a class="doc-link" target="_blank" href="/api/admin/doc/${a.app_code}/${type}">${DOC_BN[type]} দেখুন</a>` : `<p>${DOC_BN[type]}: জমা হয়নি</p>`;
  });
  html += `<div class="row-actions">
    <button class="btn-review" onclick="setStatus('${a.app_code}','Under Review')">পর্যালোচনায় নিন</button>
    <button class="btn-approve" onclick="setStatus('${a.app_code}','Approved')">অনুমোদন করুন</button>
    <button class="btn-reject" onclick="rejectApp('${a.app_code}')">বাতিল করুন</button>
  </div>`;
  detailBox.innerHTML = html;
  detailBox.style.display = 'block';
  detailBox.scrollIntoView();
}

async function setStatus(code, status, reason) {
  const r = await fetch(`/api/admin/applications/${code}/status`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({status, reject_reason: reason || null})
  });
  const j = await r.json();
  if (j.ok) { loadList(); openApp(code); } else alert(j.error);
}

function rejectApp(code) {
  const reason = prompt('বাতিলের কারণ লিখুন:');
  if (reason === null) return;
  setStatus(code, 'Rejected', reason);
}

async function verifyDeposit(id, code) {
  const r = await fetch('/api/admin/deposit/' + id + '/verify', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'verify' }) });
  const j = await r.json();
  if (j.ok) openApp(code); else alert(j.error || 'সমস্যা হয়েছে');
}
async function rejectDeposit(id, code) {
  const r = await fetch('/api/admin/deposit/' + id + '/verify', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'reject' }) });
  const j = await r.json();
  if (j.ok) openApp(code); else alert(j.error || 'সমস্যা হয়েছে');
}

checkLogin();
