// /apps/dressup/js/dressup.js

// ---------- tiny DOM helper ----------
function $(id){ return document.getElementById(id); }

// ---------- generic URL normalizer (used everywhere) ----------
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

// ---------- PHASE 1: player / hero setup + dynamic watermark ----------

// read URL params so this page can behave like a "private link"
const params      = new URLSearchParams(window.location.search);
const qsHero      = params.get('hero');    // custom base hero image URL
const modeParam   = params.get('mode');    // "private" optional, not used yet
const qsName      = params.get('pname');   // optional override for display name
const qsId        = params.get('pid');     // optional override for player id/tag
const isPrivateMode = (modeParam === 'private'); // not enforced visually yet

// grab DOM refs we need early
const hero            = $('hero');                 // main portrait div
const badgeNameEl     = $('playerNameLabel');      // "MUNZ"
const badgeIdEl       = $('playerIdLabel');        // "#001"
const animatedWMEl    = $('animatedWatermarkText');// bottom-left typing watermark
const statusEl        = $('status');
const btnUpload       = $('btnUpload');
const btnGenerate     = $('btnGenerate');
const fileInput       = $('fileInput');
const garmentPreview  = $('garmentPreview');
const thumbWrap       = document.querySelector('.thumb-wrap');
const btnUndo         = $('btnUndo');
const btnSave         = $('btnSave');
const resetBtn        = $('btnResetHero');

// read the default hero (Munz) from the HTML itself, so code and markup stay in sync
const htmlDefaultHero = hero
  ? (hero.getAttribute('data-default-hero') || '/apps/dressup/assets/munz-base-portrait.png')
  : '/apps/dressup/assets/munz-base-portrait.png';

// single source of truth for "who is being dressed"
let currentPlayer = {
  name: qsName || "MUNZ",  // default label
  id:   qsId   || "001",   // default tag
  heroUrl: qsHero || htmlDefaultHero // base portrait
};

// update the badge in the top-left ("MUNZ #001")
function updatePlayerBadge() {
  if (badgeNameEl) badgeNameEl.textContent = currentPlayer.name;
  if (badgeIdEl)   badgeIdEl.textContent   = "#" + currentPlayer.id;
}

// build the text we use for watermarking (UI and later for burned-in downloads)
function getWatermarkText() {
  // You can rewrite this any time. It's already using player name + id.
  return `ADD_Clothing_on_PLAYER_☂
Player-id: ${currentPlayer.name} #${currentPlayer.id}
(@isoMunzir)`;
}

// animate that watermark text in the bottom-left footer
function runWatermarkTyping() {
  if (!animatedWMEl) return;
  let i = 0;
  function typeAnim() {
    const fullText = getWatermarkText();
    if (i <= fullText.length) {
      // support line breaks
      animatedWMEl.innerHTML = fullText.slice(0, i).replace(/\n/g, '<br>');
      i++;
    } else {
      // pause then restart the typing loop
      setTimeout(() => { i = 0; typeAnim(); }, 8800);
      return;
    }
    setTimeout(typeAnim, 38);
  }
  typeAnim();
}

// put the correct hero image into the UI and tag it on the element for later use
function initHeroBackground() {
  if (!hero) return;
  const absUrl = toAbsoluteHttpUrl(currentPlayer.heroUrl);
  hero.style.backgroundImage = `url("${absUrl}")`;
  hero.setAttribute('data-person-url', absUrl);
}

// do the initial sync
updatePlayerBadge();
runWatermarkTyping();
initHeroBackground();


// ---------- Supabase anon auth (keeps folders per user) ----------
(async () => {
  try {
    const sb = window.supabase;
    if (!sb) return;
    const { data: sess } = await sb.auth.getSession();
    if (!sess?.session?.user) {
      await sb.auth.signInAnonymously();
    }
  } catch (e) {
    console.warn('Anon auth skipped/failed:', e?.message || e);
  }
})();


// ---------- local state for generation flow ----------
let garmentPublicUrl = null;
let hasGeneratedOnce = false;
let historyStack = []; // previous hero URLs for "Step Back"


// helper: toggle empty placeholder look on garment preview thumb
function updateThumbEmpty() {
  try {
    const hasSrc = garmentPreview.getAttribute && garmentPreview.getAttribute('src');
    if (thumbWrap) {
      if (!hasSrc) thumbWrap.classList.add('empty');
      else thumbWrap.classList.remove('empty');
    }
  } catch (e) {
    /* ignore */
  }
}

// set initial preview state
updateThumbEmpty();


// ---------- Upload flow ----------
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
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Upload failed: ' + (err.message || err);
  }
});


// ---------- Generate flow ----------
btnGenerate.addEventListener('click', async () => {
  if (!garmentPublicUrl) return;

  btnGenerate.disabled = true;
  statusEl.textContent = 'Generating… this can take a few seconds.';

  try {
    const personUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));

    // Identify user for per-user foldering; fall back to 'anon'
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    let uploaderId = 'anon';
    try {
      if (sb?.auth?.getUser) {
        const { data } = await sb.auth.getUser();
        if (data?.user?.id) uploaderId = data.user.id;
      }
    } catch (_) {}

    // Hit our serverless function /api/generate
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

    // Replicate (or API) output URL
    const outputUrl = body.outputUrl || body.image || body.output;
    if (!outputUrl) throw new Error('No output URL returned');

    // Try to save the generated image into Supabase Storage (client-side)
    let savedPublicUrl = null;
    try {
      if (!sb?.storage) throw new Error('Supabase client not found on window');

      // download result
      const imgRes = await fetch(outputUrl, { mode: 'cors' });
      if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
      const blob = await imgRes.blob();

      const ext = (blob.type && blob.type.includes('png')) ? 'png' :
                  (blob.type && blob.type.includes('jpeg')) ? 'jpg' : 'png';
      const key = `generated/${uploaderId}/${Date.now()}.${ext}`;

      // upload to Supabase
      const { error: upErr } = await sb.storage
        .from('userassets')
        .upload(key, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });
      if (upErr) throw upErr;

      // get a public URL from Supabase
      const { data: pub } = sb.storage.from('userassets').getPublicUrl(key);
      savedPublicUrl = pub?.publicUrl || null;
      console.log('Saved to Supabase:', savedPublicUrl);
    } catch (saveErr) {
      console.warn('⚠️ Save to Supabase failed; using Replicate URL:', saveErr?.message || saveErr);
    }

    // prefer Supabase copy if we got one
    const finalUrl = savedPublicUrl || outputUrl;

    // push current hero into undo history BEFORE swapping
    const currentUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
    if (currentUrl && currentUrl !== finalUrl) {
      historyStack.push(currentUrl);
    }

    // swap hero image with a tiny fade
    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${finalUrl}")`;
      hero.setAttribute('data-person-url', finalUrl);
      hero.style.opacity = '1';
    }, 180);

    statusEl.textContent = 'Done.';

    // first-time reveal of undo / save / reset
    if (!hasGeneratedOnce) {
      hasGeneratedOnce = true;
    }
    if (btnUndo) btnUndo.style.display = historyStack.length ? 'inline-block' : 'none';
    if (btnSave) btnSave.style.display = 'inline-block';
    if (resetBtn) resetBtn.style.display = 'inline-block';

  } catch (err) {
    console.error(err);
    if (!statusEl.textContent.startsWith('Generation failed')) {
      statusEl.textContent = 'Generation failed: ' + (err.message || err);
    }
  } finally {
    btnGenerate.disabled = false;
  }
});


// ---------- Reset hero to original ----------
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

    // clear garment preview
    garmentPreview.removeAttribute('src');

    // clear undo history + hide thin actions
    historyStack = [];
    if (btnUndo) btnUndo.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
    hasGeneratedOnce = false;

    updateThumbEmpty();
  });
}


// ---------- Step Back (undo last generation) ----------
if (btnUndo) {
  btnUndo.addEventListener('click', () => {
    if (!historyStack.length) return;

    const previousUrl = historyStack.pop();
    const nowUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));

    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${previousUrl}")`;
      hero.setAttribute('data-person-url', previousUrl);
      hero.style.opacity = '1';
    }, 180);

    // (We are not doing redo logic right now)

    if (btnUndo) btnUndo.style.display = historyStack.length ? 'inline-block' : 'none';
  });
}


// ---------- Save (download current hero image) ----------
// NOTE: Phase 3 we'll burn in watermark text using <canvas id="downloadCanvas">
// For now we just download the image as-is.
async function downloadCurrentHero() {
  const url = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
  if (!url) return;

  // filename can also include player info if you want:
  const filename = `${currentPlayer.name}-${currentPlayer.id}-${Date.now()}.png`;

  try {
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
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

if (btnSave) {
  btnSave.addEventListener('click', downloadCurrentHero);
}

// (end)
