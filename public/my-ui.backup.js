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
  const dh = document.createElement('p');
  dh.innerHTML = '<b>ডকুমেন্টের অবস্থা:</b>';
  box.appendChild(dh);
  Object.keys(DOC_BN).forEach((type) => {
    const found = j.docs.find((d) => d.doc_type === type);
    line(box, DOC_BN[type], found ? '✅ পাওয়া গেছে' : '❌ জমা হয়নি');
  });
  result.appendChild(box);
}
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
