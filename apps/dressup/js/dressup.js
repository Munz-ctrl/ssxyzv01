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
const qsHero      = params.get('hero');     // optional: base hero override
const qsName      = params.get('pname');    // display name override
const qsId        = params.get('pid');      // display id/tag override

// mode choices:
// "dress"  = add clothing to current hero (original behavior)
// "avatar" = build a new player avatar using a user photo
const modeParam   = params.get('mode') || 'dress';
const isAvatarMode = (modeParam === 'avatar');

// (kept for later if you need private links)
const isPrivateMode = (params.get('private') === '1');


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


// change panel wording at runtime
(function configurePanelForMode(){
  // panel-instruction block in HTML
  const instrEl = document.querySelector('.panel-instruction');
  const captionEl = document.querySelector('.panel-caption');

  if (isAvatarMode) {
    // player creation mode
    if (instrEl) {
      instrEl.innerHTML =
        '>Upload a clear photo of the NEW PLAYER. Face+upper body visible. ' +
        'We will restage them in the Sunsex avatar scene.';
    }
    if (btnUpload)   btnUpload.textContent   = 'Upload Person';
    if (btnGenerate) btnGenerate.textContent = 'Generate Avatar';
    if (captionEl)   captionEl.textContent   = 'PERSON INPUT';
  } else {
    // normal dress mode
    if (instrEl) {
      instrEl.innerHTML =
        '>make sure to <strong><u>crop the image </u></strong> to 1 Garment<br>' +
        'Style Player 1 garment at a time.';
    }
    if (btnUpload)   btnUpload.textContent   = 'Upload Garment';
    if (btnGenerate) btnGenerate.textContent = 'Generate on Munz';
    // captionEl can stay "CURRENT" from HTML or you can set it
  }
})();




// read the default hero (Munz) from the HTML itself, so code and markup stay in sync
const htmlDefaultHero = hero
  ? (hero.getAttribute('data-default-hero') || '/apps/dressup/assets/munz-base-portrait.png')
  : '/apps/dressup/assets/munz-base-portrait.png';


// This is the "scene template" the model should mimic (angle, framing, lighting).
// It's the same base avatar image style we want to clone for new players.
// If you don't want to use the template scene injection, set this to null.
const BASE_TEMPLATE_URL = "/apps/dressup/assets/munz-base-portrait.png";






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
let personPublicUrlForAvatar = null; // <-- NEW
let hasGeneratedOnce = false;
let historyStack = [];



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
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) throw new Error('Supabase client not found');

    // pick upload folder name depending on mode, just for organization
    const folder = isAvatarMode ? 'people' : 'garments';
    const path = folder + '/' + Date.now() + '-' + file.name;

    statusEl.textContent = isAvatarMode
      ? 'Uploading player photo…'
      : 'Uploading garment…';

    const uploadRes = await sb.storage.from('userassets').upload(path, file, { upsert: true });
    if (uploadRes.error) {
      console.error('Supabase upload error:', uploadRes.error);
      throw uploadRes.error;
    }

    const pub = await sb.storage.from('userassets').getPublicUrl(path);
    const publicUrl = pub.data.publicUrl;

    // show whatever was uploaded in the square preview box
    garmentPreview.src = publicUrl;
    updateThumbEmpty();

    // store correctly for later
    if (isAvatarMode) {
      personPublicUrlForAvatar = publicUrl;
      garmentPublicUrl = null;
    } else {
      garmentPublicUrl = publicUrl;
      // personPublicUrlForAvatar stays unchanged
    }

    btnGenerate.disabled = false;
    statusEl.textContent = isAvatarMode
      ? 'Player photo ready. Hit “Generate Avatar”.'
      : 'Garment ready. Hit “Generate on Munz”.';

  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Upload failed: ' + (err.message || err);
  }
});



// ---------- Generate flow ----------
btnGenerate.addEventListener('click', async () => {

  // figure out what we're sending
  // - avatar mode needs: templateUrl + person photo
  // - dress mode needs:  currentHero as personUrl + garmentUrl
  let personUrl;
  let garmentUrlToSend = null;

  if (isAvatarMode) {
    // new avatar creation
    if (!personPublicUrlForAvatar) {
      statusEl.textContent = 'Please upload a clear player photo first.';
      return;
    }
    personUrl = toAbsoluteHttpUrl(personPublicUrlForAvatar);
  } else {
    // clothing swap mode
    if (!garmentPublicUrl) {
      statusEl.textContent = 'Please upload a garment first.';
      return;
    }
    // person is whatever hero currently is
    personUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
    garmentUrlToSend = garmentPublicUrl;
  }

  btnGenerate.disabled = true;
  statusEl.textContent = isAvatarMode
    ? 'Generating avatar…'
    : 'Generating outfit…';

  try {
    // identify current supabase user (for saving output)
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    let uploaderId = 'anon';
    try {
      if (sb?.auth?.getUser) {
        const { data } = await sb.auth.getUser();
        if (data?.user?.id) uploaderId = data.user.id;
      }
    } catch (_) {}

    // unified smart prompt (scene = first ref, subject = second, garment = third)
    const unifiedPrompt =
      'Use the first reference image as the scene template for camera angle, framing, lighting, and background. ' +
      'Recreate the subject from the second image with the same identity, body shape, and pose. ' +
      'If a third image is provided, apply that garment naturally (clean fit, realistic seams, consistent lighting). ' +
      'Keep everything photoreal, 9:16 portrait, same distance and proportions as the template.';

    // Build request body
    const payload = {
      model: 'google/nano-banana',
      mode: isAvatarMode ? 'avatar' : 'dress',
      templateUrl: BASE_TEMPLATE_URL || null,
      personUrl,
      garmentUrl: garmentUrlToSend || null,
      prompt: unifiedPrompt
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

    const outputUrl = body.outputUrl || body.image || body.output;
    if (!outputUrl) throw new Error('No output URL returned');

    // download the output and upload to Supabase like before
    let savedPublicUrl = null;
    try {
      if (!sb?.storage) throw new Error('Supabase client not found on window');
      const imgRes = await fetch(outputUrl, { mode: 'cors' });
      if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
      const blob = await imgRes.blob();

      const ext =
        (blob.type && blob.type.includes('png'))  ? 'png' :
        (blob.type && blob.type.includes('jpeg')) ? 'jpg' : 'png';

      // different folder depending on mode, just for organization
      const key = (isAvatarMode ? 'generated_avatar/' : 'generated_outfit/')
        + uploaderId + '/' + Date.now() + '.' + ext;

      const { error: upErr } = await sb.storage
        .from('userassets')
        .upload(key, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });
      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from('userassets').getPublicUrl(key);
      savedPublicUrl = pub?.publicUrl || null;
      console.log('Saved to Supabase:', savedPublicUrl);
    } catch (saveErr) {
      console.warn('⚠️ Save to Supabase failed; using Replicate URL:', saveErr?.message || saveErr);
    }

    const finalUrl = savedPublicUrl || outputUrl;

    // push undo stack, then swap hero img
    const currentUrlBeforeSwap = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
    if (currentUrlBeforeSwap && currentUrlBeforeSwap !== finalUrl) {
      historyStack.push(currentUrlBeforeSwap);
    }

    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${finalUrl}")`;
      hero.setAttribute('data-person-url', finalUrl);
      hero.style.opacity = '1';
    }, 180);

    statusEl.textContent = 'Done.';

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


// Trial link : https://sunsex.xyz/apps/dressup/dressup.html?hero=/apps/dressup/assets/O-base-portrait.png&pname=O&pid=O01&mode=private 
