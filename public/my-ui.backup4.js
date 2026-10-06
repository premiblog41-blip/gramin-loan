const STATUS_BN = {'Pending':'অপেক্ষমাণ','Under Review':'পর্যালোচনায় আছে','Approved':'অনুমোদিত','Rejected':'বাতিল'};
const DOC_BN = {applicant_photo:'আবেদনকারীর ছবি',applicant_nid:'আবেদনকারীর NID-এর ছবি',nominee_nid:'নমিনির NID-এর ছবি',passport_photo:'পাসপোর্ট সাইজ ছবি'};
const FREQ_BN = {Weekly:'সাপ্তাহিক',Monthly:'মাসিক'};
const form = document.getElementById('lookup');
const msg = document.getElementById('msg');
const result = document.getElementById('result');
function line(parent, label, value) {
  const p = document.createElement('p');
  const b = document.createElement('b');
  b.textContent = label + ': ';
  p.append(b, document.createTextNode(value));
  parent.appendChild(p);
}
function showError(text) { msg.style.display='block'; msg.className='msg err'; msg.textContent=text; }
function render(j) {
  const a = j.app;
  const box = document.createElement('div');
  box.className = 'info';
  const badge = document.createElement('span');
  badge.className = 'badge ' + a.status.replace(' ', '');
  badge.textContent = STATUS_BN[a.status] || a.status;
  const top = document.createElement('p');
  top.append('আবেদনের অবস্থা: ', badge);
  box.appendChild(top);
  if (a.reject_reason) line(box, 'বাতিলের কারণ', a.reject_reason);
  line(box, 'আবেদন আইডি', a.app_code);
  line(box, 'নাম', a.full_name);
  line(box, 'মোবাইল', a.mobile);
  line(box, 'NID', a.nid_masked);
  line(box, 'ঠিকানা', a.address);
  line(box, 'ঋণের পরিমাণ', '৳' + a.amount.toLocaleString('bn-BD'));
  line(box, 'পরিশোধের ধরন', FREQ_BN[a.frequency] || a.frequency);
  line(box, 'নমিনি', a.nominee_name);
  line(box, 'জমার তারিখ', a.created_at.slice(0,10));
  line(box, 'মোট ব্যালেন্স', '৳' + (a.balance || 0).toLocaleString('bn-BD'));
  const dh = document.createElement('p');
  dh.innerHTML = '<b>ডকুমেন্টের অবস্থা:</b>';
  box.appendChild(dh);
  Object.keys(DOC_BN).forEach((type) => {
    const found = j.docs.find((d) => d.doc_type === type);
    line(box, DOC_BN[type], found ? '✅ পাওয়া গেছে' : '❌ জমা হয়নি');
  });
  result.appendChild(box);
  window.currentApp = { code: a.app_code, mobile: a.mobile };
  document.getElementById('depositBox').style.display = 'block';
  const badge = document.getElementById('balanceBadge');
  badge.textContent = '৳' + (a.balance || 0).toLocaleString('bn-BD');
  badge.style.display = 'inline-block';
  document.getElementById('chatBox').style.display = 'block';
  loadChat();
  if (window.chatTimer) clearInterval(window.chatTimer);
  window.chatTimer = setInterval(loadChat, 5000);
}

async function loadChat() {
  if (!window.currentApp) return;
  try {
    const r = await fetch('/api/chat/' + encodeURIComponent(window.currentApp.code) + '/' + encodeURIComponent(window.currentApp.mobile));
    const j = await r.json();
    if (!j.ok) return;
    const box = document.getElementById('chatMsgs');
    box.innerHTML = '';
    j.msgs.forEach((m) => {
      const d = document.createElement('div');
      d.className = 'chat-msg ' + m.sender;
      d.textContent = m.text;
      box.appendChild(d);
    });
    box.scrollTop = box.scrollHeight;
  } catch (e) {}
}

document.getElementById('chatSend').addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !window.currentApp) return;
  input.value = '';
  await fetch('/api/chat/' + encodeURIComponent(window.currentApp.code) + '/' + encodeURIComponent(window.currentApp.mobile), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
  });
  loadChat();
});

const depositForm = document.getElementById('depositForm');
const depositMsg = document.getElementById('depositMsg');
depositForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!window.currentApp) return;
  depositMsg.style.display = 'none';
  const fd = new FormData(depositForm);
  fd.append('mobile', window.currentApp.mobile);
  try {
    const r = await fetch('/api/deposit/' + encodeURIComponent(window.currentApp.code), { method: 'POST', body: fd });
    const j = await r.json();
    depositMsg.style.display = 'block';
    if (j.ok) {
      depositMsg.className = 'msg ok';
      depositMsg.textContent = 'জমা হয়েছে, এডমিন যাচাই করার পর ব্যালেন্সে যোগ হবে।';
      depositForm.reset();
    } else {
      depositMsg.className = 'msg err';
      depositMsg.textContent = j.error;
    }
  } catch (err) {
    depositMsg.style.display = 'block';
    depositMsg.className = 'msg err';
    depositMsg.textContent = 'সার্ভারে যোগাযোগ করা যায়নি';
  }
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.style.display = 'none';
  result.textContent = '';
  const data = Object.fromEntries(new FormData(form));
  try {
    const r = await fetch('/api/my-application', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const j = await r.json();
    if (!j.ok) return showError(j.error);
    render(j);
  } catch (err) { showError('সার্ভারে যোগাযোগ করা যায়নি'); }
});
