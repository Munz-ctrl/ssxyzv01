// /dressup/js/dressup.js

// ---------- helpers ----------
function $(id){ return document.getElementById(id); }

function toAbsoluteHttpUrl(maybeUrl) {
  if (!maybeUrl) return '';
  let s = String(maybeUrl).trim()
    .replace(/^url\((.*)\)$/i, '$1')
    .replace(/^['"]|['"]$/g, '');
  if (!/^https?:\/\//i.test(s)) {
    s = new URL(s, window.location.origin).href;
  }
  return s;
}

// ---------- anon auth (ok for testing) ----------
(async () => {
  try {
    const sb = window.supabase;
    if (!sb) return;
    const { data: sess } = await sb.auth.getSession();
    if (!sess?.session?.user) await sb.auth.signInAnonymously();
  } catch (e) {
    console.warn('Anon auth skipped/failed:', e?.message || e);
  }
})();

// ---------- elements ----------
const statusEl = $('status');
const hero = $('hero');
const btnUpload = $('btnUpload');
const btnGenerate = $('btnGenerate');
const fileInput = $('fileInput');
const garmentPreview = $('garmentPreview');

let garmentPublicUrl = null;
let hasGeneratedOnce = false;

// ---------- init hero once (ABSOLUTE URL) ----------
(function initHeroOnce() {
  const params = new URLSearchParams(window.location.search);
  const qsHero = params.get('hero');
  const fallback = hero.getAttribute('data-default-hero') || './assets/munz-base-portrait.jpg'; // ensure this file exists
  const url = toAbsoluteHttpUrl(qsHero || fallback);
  hero.style.backgroundImage = 'url("' + url + '")';
  hero.setAttribute('data-person-url', url);
})();

// ---------- upload flow ----------
btnUpload.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || !files[0]) return;
  const file = files[0];

  try {
    statusEl.textContent = 'Uploading garment…';

    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) throw new Error('Supabase client not found');

    const path = 'garments/' + Date.now() + '-' + file.name;
    const uploadRes = await sb.storage.from('userassets').upload(path, file, { upsert: true });
    if (uploadRes.error) {
      console.error('Supabase upload error:', uploadRes.error);
      throw uploadRes.error;
    }

    const pub = await sb.storage.from('userassets').getPublicUrl(path);
    garmentPublicUrl = pub.data.publicUrl;

    garmentPreview.src = garmentPublicUrl;
    btnGenerate.disabled = false;
    statusEl.textContent = 'Garment ready. Hit “Generate on Munz”.';
    slotGarment(garmentPublicUrl);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Upload failed: ' + (err.message || err);
  }
});

// ---------- generate ----------
btnGenerate.addEventListener('click', async () => {
  if (!garmentPublicUrl) return;

  btnGenerate.disabled = true;
  statusEl.textContent = 'Generating… this can take a few seconds.';

  try {
    const personUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));

    const payload = {
      model: 'google/nano-banana',
      personUrl,
      garmentUrl: garmentPublicUrl,
      prompt: 'Dress the person image with the uploaded garment. Keep identity, isometric portrait, photoreal, clean seams, natural lighting.'
    };
    console.log('POST /api/generate', payload);

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Generate error:', body);
      statusEl.textContent = 'Generation failed: ' + (body.details || body.error || res.statusText);
      throw new Error('Try-on API error');
    }

    const outputUrl = body.outputUrl || body.image || body.output;
    if (!outputUrl) throw new Error('No output URL returned');

    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${outputUrl}")`;
      hero.setAttribute('data-person-url', outputUrl);
      hero.style.opacity = '1';
    }, 180);

    statusEl.textContent = 'Done.';
    // after generation put the generated image into a slot
    slotGarment(outputUrl);
    // show reset button after first successful generation
    if (!hasGeneratedOnce) {
      hasGeneratedOnce = true;
      const resetBtn = document.getElementById('btnResetHero');
      if (resetBtn) resetBtn.style.display = 'inline-block';
    }
  } catch (err) {
    console.error(err);
    if (!statusEl.textContent.startsWith('Generation failed'))
      statusEl.textContent = 'Generation failed: ' + (err.message || err);
  } finally {
    btnGenerate.disabled = false;
  }
});

// Slotting: find first empty slot and place the image
function slotGarment(imageUrl) {
  if (!imageUrl) return;
  const slots = document.querySelectorAll('.slot');
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.getAttribute('data-empty') === 'true') {
      s.style.backgroundImage = `url('${imageUrl}')`;
      s.style.backgroundSize = 'contain';
      s.style.backgroundRepeat = 'no-repeat';
      s.style.backgroundPosition = 'center';
      s.removeAttribute('data-empty');
      return;
    }
  }
  // if no empty slot, replace the first slot
  const first = slots[0];
  if (first) {
    first.style.backgroundImage = `url('${imageUrl}')`;
    first.style.backgroundSize = 'contain';
    first.style.backgroundRepeat = 'no-repeat';
    first.style.backgroundPosition = 'center';
    first.removeAttribute('data-empty');
  }
}

// Reset hero to default
const resetBtn = document.getElementById('btnResetHero');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const fallback = hero.getAttribute('data-default-hero');
    const url = toAbsoluteHttpUrl(fallback);
    hero.style.backgroundImage = 'url("' + url + '")';
    hero.setAttribute('data-person-url', url);
    // clear slots and garmentPreview
    document.querySelectorAll('.slot').forEach(s => {
      s.style.backgroundImage = '';
      s.setAttribute('data-empty', 'true');
    });
    garmentPreview.src = '/shared/assets/suitcase/holy_tank.png';
    resetBtn.style.display = 'none';
    hasGeneratedOnce = false;
  });
}
