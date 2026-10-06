const DOCS = [
  ['applicant_photo', 'আবেদনকারীর ছবি'],
  ['applicant_nid', 'আবেদনকারীর NID-এর ছবি'],
  ['nominee_nid', 'নমিনির NID-এর ছবি'],
  ['passport_photo', 'পাসপোর্ট সাইজ ছবি'],
];

function showUploads(code) {
  const box = document.createElement('div');
  box.className = 'uploads';
  box.innerHTML = '<h2>ডকুমেন্ট আপলোড</h2><p class="hint">শুধু JPG বা PNG, সর্বোচ্চ ২ MB।</p>';

  DOCS.forEach(([type, label]) => {
    const row = document.createElement('div');
    row.className = 'up-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png';
    const status = document.createElement('p');
    status.className = 'hint';

    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      if (!['image/jpeg', 'image/png'].includes(f.type)) {
        status.textContent = '❌ শুধু JPG বা PNG দিন';
        return;
      }
      if (f.size > 2 * 1024 * 1024) {
        status.textContent = '❌ ফাইল ২ MB এর বেশি';
        return;
      }
      status.textContent = 'আপলোড হচ্ছে...';
      const fd = new FormData();
      fd.append('file', f);
      try {
        const r = await fetch('/api/upload/' + encodeURIComponent(code) + '/' + type, {
          method: 'POST',
          body: fd
        });
        const j = await r.json();
        status.textContent = j.ok ? '✅ আপলোড হয়েছে' : '❌ ' + j.error;
      } catch (e) {
        status.textContent = '❌ সার্ভারে যোগাযোগ করা যায়নি';
      }
    });

    row.append(lab, input, status);
    box.appendChild(row);
  });

  document.querySelector('section.section').appendChild(box);
}
