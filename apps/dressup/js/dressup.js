// /dressup/js/dressup.js

// ---- PHASE 1: player / hero setup + dynamic watermark ----

// grab URL params (allows private demo links)
const params = new URLSearchParams(window.location.search);
const qsHero     = params.get('hero');    // custom base hero image URL
const modeParam  = params.get('mode');    // "private" optional
const qsName     = params.get('pname');   // optional override for display name
const qsId       = params.get('pid');     // optional override for player id/tag
const isPrivateMode = (modeParam === 'private');

// read DOM refs we need early
function $(id){ return document.getElementById(id); }
const hero            = $('hero');
const badgeNameEl     = $('playerNameLabel');
const badgeIdEl       = $('playerIdLabel');
const animatedWMEl    = $('animatedWatermarkText');

// pull default hero from HTML attribute so it's always in sync
const htmlDefaultHero = hero ?
  (hero.getAttribute('data-default-hero') || './assets/munz-base-portrait.jpg')
  : './assets/munz-base-portrait.jpg';

// currentPlayer is the single source of truth for whose body we're editing
let currentPlayer = {
  name: qsName || "MUNZ",        // default label
  id:   qsId   || "001",         // default id/tag
  heroUrl: qsHero || htmlDefaultHero
};

// helper: update the visible badge
function updatePlayerBadge() {
  if (badgeNameEl) badgeNameEl.textContent = currentPlayer.name;
  if (badgeIdEl)   badgeIdEl.textContent   = "#" + currentPlayer.id;
}

// helper: watermark text logic (used for both on-screen animated text and later for save/download burn-in)
function getWatermarkText() {
  // feel free to customize tone here
  // this shows player + id so investors / brands feel it's "their" session
  return `ADD_Clothing_on_PLAYER_☂
Player-id: ${currentPlayer.name} #${currentPlayer.id}
(@isoMunzir)`;
}

// animated typing loop for the bottom-left watermark UI
function runWatermarkTyping() {
  if (!animatedWMEl) return;
  let i = 0;
  function typeAnim() {
    const fullText = getWatermarkText();
    if (i <= fullText.length) {
      // keep \n line breaks
      animatedWMEl.innerHTML = fullText.slice(0, i).replace(/\n/g, '<br>');
      i++;
    } else {
      // pause, then restart
      setTimeout(() => { i = 0; typeAnim(); }, 8800);
      return;
    }
    setTimeout(typeAnim, 38);
  }
  typeAnim();
}

// initialize hero div background from currentPlayer.heroUrl
function initHeroBackground() {
  if (!hero) return;
  const absUrl = toAbsoluteHttpUrl(currentPlayer.heroUrl);
  hero.style.backgroundImage = `url("${absUrl}")`;
  hero.setAttribute('data-person-url', absUrl);
}





// ---------- helpers ----------
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


// run initial UI sync now that helpers exist
updatePlayerBadge();
runWatermarkTyping();
initHeroBackground();





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
const thumbWrap = document.querySelector('.thumb-wrap');

let garmentPublicUrl = null;
let hasGeneratedOnce = false;

let historyStack = []; // stores previous hero URLs for "Step Back"
const btnUndo = $('btnUndo');
const btnSave = $('btnSave');


// helper: toggle empty placeholder state on the thumb
function updateThumbEmpty() {
  try {
    const hasSrc = garmentPreview.getAttribute && garmentPreview.getAttribute('src');
    if (thumbWrap) {
      if (!hasSrc) thumbWrap.classList.add('empty');
      else thumbWrap.classList.remove('empty');
    }
  } catch (e) { /* ignore */ }
}



// initialize thumb placeholder state
updateThumbEmpty();

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
  updateThumbEmpty();
  // previously slotted uploaded garments; slotting removed
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

    // Try to identify user for per-user foldering; fall back to 'anon'
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    let uploaderId = 'anon';
    try {
      if (sb?.auth?.getUser) {
        const { data } = await sb.auth.getUser();
        if (data?.user?.id) uploaderId = data.user.id;
      }
    } catch (_) {}

    // Call your existing API (unchanged)
    const payload = {
      model: 'google/nano-banana',
      personUrl,
      garmentUrl: garmentPublicUrl,
      prompt: 'Dress the person image with the uploaded garment. Keep identity, isometric portrait, photoreal, clean seams, natural lighting.'
    };

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

    // 1) Replicate (or API) output URL
    const outputUrl = body.outputUrl || body.image || body.output;
    if (!outputUrl) throw new Error('No output URL returned');

    // 2) Try to save the generated image into Supabase Storage (client-side)
    let savedPublicUrl = null;
    try {
      if (!sb?.storage) throw new Error('Supabase client not found on window');

      // Fetch the image as a Blob from the public Replicate URL
      const imgRes = await fetch(outputUrl, { mode: 'cors' });
      if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
      const blob = await imgRes.blob();

      const ext = (blob.type && blob.type.includes('png')) ? 'png' :
                  (blob.type && blob.type.includes('jpeg')) ? 'jpg' : 'png';
      const key = `generated/${uploaderId}/${Date.now()}.${ext}`;

      // Upload to your existing bucket "userassets"
      const { error: upErr } = await sb.storage
        .from('userassets')
        .upload(key, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });
      if (upErr) throw upErr;

      // Get a public URL to use on the site
      const { data: pub } = sb.storage.from('userassets').getPublicUrl(key);
      savedPublicUrl = pub?.publicUrl || null;
      console.log('Saved to Supabase:', savedPublicUrl);
    } catch (saveErr) {
      console.warn('⚠️ Client-side save to Supabase failed; using Replicate URL:', saveErr?.message || saveErr);
    }

    // 3) Use the saved URL if available, else fall back to Replicate URL
    // 3) Use the saved URL if available, else fall back to Replicate URL
const finalUrl = savedPublicUrl || outputUrl;

// Push current hero into history BEFORE swapping
const currentUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
if (currentUrl && currentUrl !== finalUrl) {
  historyStack.push(currentUrl);
}

// Update hero
hero.style.transition = 'filter .18s ease, opacity .18s ease';
hero.style.opacity = '0.85';
setTimeout(() => {
  hero.style.backgroundImage = `url("${finalUrl}")`;
  hero.setAttribute('data-person-url', finalUrl);
  hero.style.opacity = '1';
}, 180);

statusEl.textContent = 'Done.';

// Reveal secondary buttons after first generation
if (!hasGeneratedOnce) {
  hasGeneratedOnce = true;
}
if (btnUndo) btnUndo.style.display = historyStack.length ? 'inline-block' : 'none';
if (btnSave) btnSave.style.display = 'inline-block';
const resetBtn = document.getElementById('btnResetHero');
if (resetBtn) resetBtn.style.display = 'inline-block';


  } catch (err) {
    console.error(err);
    if (!statusEl.textContent.startsWith('Generation failed'))
      statusEl.textContent = 'Generation failed: ' + (err.message || err);
  } finally {
    btnGenerate.disabled = false;
  }
});


// Reset hero to default (and clear history)
const resetBtn = document.getElementById('btnResetHero');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const fallback = hero.getAttribute('data-default-hero');
    const url = toAbsoluteHttpUrl(fallback);

    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = 'url("' + url + '")';
      hero.setAttribute('data-person-url', url);
      hero.style.opacity = '1';
    }, 180);

    // clear garment preview image (optional)
    garmentPreview.removeAttribute('src');

    // clear history and hide thin sub-actions
    historyStack = [];
    if (btnUndo) btnUndo.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';
    resetBtn.style.display = 'none';
    hasGeneratedOnce = false;

    updateThumbEmpty();
  });
}



// ---------- Step Back (undo one generation) ----------
if (btnUndo) {
  btnUndo.addEventListener('click', () => {
    if (!historyStack.length) return;

    const previousUrl = historyStack.pop();
    const nowUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));

    // swap to previous
    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${previousUrl}")`;
      hero.setAttribute('data-person-url', previousUrl);
      hero.style.opacity = '1';
    }, 180);

    // If you want a strict single-step behavior (no redo), do nothing else.
    // If you wanted toggle behavior, you could push nowUrl back into history here.

    // Update button visibility
    if (btnUndo) btnUndo.style.display = historyStack.length ? 'inline-block' : 'none';
  });
}

// ---------- Save (download current hero image) ----------
async function downloadCurrentHero() {
  const url = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
  if (!url) return;

  const filename = `munz-dressup-${Date.now()}.png`;

  try {
    // Try to fetch and force a download via Blob (works even if CORS allows GET)
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    a.remove();
  } catch (e) {
    // Fallback: open in a new tab (user can save manually)
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = filename; // browsers may ignore download attr cross-origin
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

if (btnSave) {
  btnSave.addEventListener('click', downloadCurrentHero);
}



// slotting and reset logic removed
