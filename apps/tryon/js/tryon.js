// /apps/tryon/js/tryon.js

// tiny helper
function $(id){ return document.getElementById(id); }

// generic URL normalizer
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

// URL params (for future brand-specific overrides)
const params    = new URLSearchParams(window.location.search);
const qsHero    = params.get('hero');   // optional fallback hero
const qsName    = params.get('pname');  // brand name maybe
const qsId      = params.get('pid');    // brand id / tag
const qsSkin    = params.get('skin');   // collection name
const modeParam = params.get('mode');
const isPrivateMode = (modeParam === 'private');

// DOM refs
const hero            = $('hero');
const badgeNameEl     = $('playerNameLabel');
const badgeIdEl       = $('playerIdLabel');
const animatedWMEl    = $('animatedWatermarkText');
const statusEl        = $('status');
const btnUpload       = $('btnUpload');
const btnGenerate     = $('btnGenerate');
const fileInput       = $('fileInput');
const garmentPreview  = $('garmentPreview');
const thumbWrap       = document.querySelector('.thumb-wrap');
const btnUndo         = $('btnUndo');
const btnSave         = $('btnSave');
const resetBtn        = $('btnResetHero');
const skinSelectorEl  = $('skinSelector');
const skinSelectEl    = $('skinSelect');
const garmentGrid     = $('garmentGrid');

// credit HUD
const creditHUD          = $('creditHUD');
const communityBarText   = $('communityBarText');
const personalCreditPill = $('personalCreditPill');

// constants
const DEFAULT_HERO_IMG =
  hero?.getAttribute('data-default-hero') ||
  "/shared/assets/fallbackIsoAvatar.webp";

// DressUp cost logic (same as original)
const DRESSUP_COST_UNITS = 33;


// Cropping modal DOM refs
const cropModal     = $('cropModal');
const cropImage     = $('cropImage');
const cropConfirmBtn = $('cropConfirmBtn');
const cropCancelBtn  = $('cropCancelBtn');

// Cropper.js state
let cropper = null;
let pendingFileName = null;




// credit state
let communityCredits = 3 * DRESSUP_COST_UNITS;
let communityMax     = communityCredits;
let personalCredits  = 0;

// Supabase context
let currentUserId = null;
let supabaseReady = false;

// game / brand context
let currentPid = null;
let availableSkins = [];  // future: brand-specific “collections”

let currentPlayer = {
  name: qsName || "SUNSEX",
  id:   qsId   || "TRYON",
  heroUrl: qsHero || DEFAULT_HERO_IMG
};

let signedInLabel   = qsId || "anonymous";
let currentSkinName = qsSkin || "Fitting Room";

// state: garment & generation history
let garmentPublicUrl = null; // brand / collection item
let historyStack     = [];
let hasGeneratedOnce = false;

// ---------- helper: hero image ----------
function setHeroImage(url) {
  if (!hero) return;
  const fallback = hero.getAttribute('data-default-hero') || DEFAULT_HERO_IMG;
  const finalUrl = toAbsoluteHttpUrl(url || fallback);
  hero.style.backgroundImage = 'url("' + finalUrl + '")';
  hero.setAttribute('data-person-url', finalUrl);
}

// Initialize hero
(function initHeroOnce() {
  setHeroImage(currentPlayer.heroUrl);
})();

// badge
function updatePlayerBadge() {
  if (badgeNameEl) badgeNameEl.textContent = currentPlayer.name;
  if (badgeIdEl)   badgeIdEl.textContent   = "#" + currentPlayer.id;
}
updatePlayerBadge();

// watermark text
function getWatermarkText() {
  const line1 = "SUNSEX_FITTING_ROOM_☂";
  const line2 = `Signed in as: ${signedInLabel}`;
  const skinLabel = currentSkinName || "Default Collection";
  const line3 = `Collection: ${skinLabel}`;
  return `${line1}\n${line2}\n${line3}`;
}

// animate watermark
function runWatermarkTyping() {
  if (!animatedWMEl) return;
  let i = 0;
  function typeAnim() {
    const fullText = getWatermarkText();
    if (i <= fullText.length) {
      animatedWMEl.innerHTML = fullText.slice(0, i).replace(/\n/g, '<br>');
      i++;
    } else {
      setTimeout(() => { i = 0; typeAnim(); }, 8800);
      return;
    }
    setTimeout(typeAnim, 38);
  }
  typeAnim();
}
runWatermarkTyping();

function initHeroBackground() {
  if (!hero) return;
  const absUrl = toAbsoluteHttpUrl(currentPlayer.heroUrl);
  hero.style.backgroundImage = `url("${absUrl}")`;
  hero.setAttribute('data-person-url', absUrl);
}
initHeroBackground();

// ---------- skin selector (future) ----------
async function loadSkinsForPlayer(pid) {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb || !pid) {
    buildSkinSelector();
    return;
  }

  try {
    const { data, error } = await sb
      .from('dressup_skins')
      .select('id, name, hero_url, is_default')
      .eq('player_pid', pid)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    availableSkins = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('loadSkinsForPlayer failed:', err?.message || err);
    availableSkins = [];
  } finally {
    buildSkinSelector();
  }
}

function applySkinByKey(key) {
  if (key === '__base__') {
    currentSkinName = 'Default Collection';
    setHeroImage(currentPlayer.heroUrl);
    return;
  }
  const skin = availableSkins.find(s => s.id === key);
  if (!skin) return;
  currentSkinName = skin.name;
  setHeroImage(skin.hero_url);
}

function buildSkinSelector() {
  if (!skinSelectEl || !skinSelectorEl) return;

  skinSelectEl.innerHTML = '';

  const baseOpt = document.createElement('option');
  baseOpt.value = '__base__';
  baseOpt.textContent = 'Default';
  skinSelectEl.appendChild(baseOpt);

  let selectedKey = '__base__';

  availableSkins.forEach(skin => {
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = skin.name;
    skinSelectEl.appendChild(opt);
    if (skin.is_default && selectedKey === '__base__') {
      selectedKey = skin.id;
    }
  });

  if (qsSkin && availableSkins.length > 0) {
    const byName = availableSkins.find(s => s.name.toLowerCase() === qsSkin.toLowerCase());
    if (byName) selectedKey = byName.id;
  }

  skinSelectorEl.style.display = 'flex';
  skinSelectEl.value = selectedKey;
  applySkinByKey(selectedKey);

  updatePlayerBadge();
}

if (skinSelectEl) {
  skinSelectEl.addEventListener('change', (e) => {
    applySkinByKey(e.target.value);
  });
}

// ---------- Supabase auth + credits ----------
(async () => {
  try {
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) return;

    let { data: sess } = await sb.auth.getSession();
    if (!sess?.session?.user) {
      const { data: signInData, error } = await sb.auth.signInAnonymously();
      if (error) throw error;
      sess = { session: signInData.session };
    }

    const { data: userData } = await sb.auth.getUser();
    currentUserId = userData?.user?.id || null;
    supabaseReady = true;

    // tie watermark to player's PID if exists
    if (currentUserId) {
      try {
        const { data: playerRows, error: playerErr } = await sb
          .from('players')
          .select('pid, name')
          .eq('owner_id', currentUserId)
          .limit(1);

        if (!playerErr && playerRows && playerRows.length > 0) {
          const playerRow = playerRows[0];

          if (playerRow.pid) {
            currentPid = playerRow.pid;
            if (!qsId) {
              currentPlayer.id = playerRow.pid;
              signedInLabel   = playerRow.pid;
            }
          }
          if (playerRow.name && !qsName) {
            currentPlayer.name = playerRow.name;
          }
          updatePlayerBadge();
        }
      } catch (e) {
        console.warn('Failed to load player for try-on watermark:', e?.message || e);
      }
    }

    await loadSkinsForPlayer(currentPid || currentPlayer.id);
    await loadCreditsFromSupabase();

  } catch (e) {
    console.warn('Anon auth skipped/failed:', e?.message || e);
    supabaseReady = false;
    updateCreditUI();
  }
})();

async function loadCreditsFromSupabase() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb) { updateCreditUI(); return; }

  try {
    const { data: chestRow, error: chestErr } = await sb
      .from('dressup_chest')
      .select('*')
      .eq('id', 'community')
      .single();

    if (!chestErr && chestRow) {
      if (typeof chestRow.credits === 'number') {
        communityCredits = chestRow.credits;
      }
      if (typeof chestRow.max_credits === 'number') {
        communityMax = chestRow.max_credits;
      } else if (typeof chestRow.credits === 'number') {
        communityMax = chestRow.credits;
      }
    }

    if (currentUserId) {
      const { data: personalRow, error: personalErr } = await sb
        .from('dressup_personal_credits')
        .select('*')
        .eq('user_id', currentUserId)
        .single();

      if (!personalErr && personalRow && typeof personalRow.credits === 'number') {
        personalCredits = personalRow.credits;
      }
    }
  } catch (err) {
    console.warn('loadCreditsFromSupabase failed:', err?.message || err);
  } finally {
    updateCreditUI();
  }
}

async function syncCommunityCredits() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb) return;
  try {
    const payload = { id: 'community', credits: communityCredits, max_credits: communityMax };
    const { error } = await sb.from('dressup_chest').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.warn('syncCommunityCredits failed:', err?.message || err);
  }
}

async function syncPersonalCredits() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb || !currentUserId) return;
  try {
    const payload = { user_id: currentUserId, credits: personalCredits };
    const { error } = await sb.from('dressup_personal_credits').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;
  } catch (err) {
    console.warn('syncPersonalCredits failed:', err?.message || err);
  }
}

// ---------- credit HUD ----------
function updateCreditUI() {
  if (!creditHUD) return;

  if (communityCredits < 0) communityCredits = 0;
  if (personalCredits  < 0) personalCredits  = 0;

  const communityRuns = Math.floor(communityCredits / DRESSUP_COST_UNITS);
  const personalRuns  = Math.floor(personalCredits  / DRESSUP_COST_UNITS);

  if (communityBarText) {
    const SLOTS = 10;
    const maxRunsFromMaxCredits = communityMax > 0
      ? Math.floor(communityMax / DRESSUP_COST_UNITS)
      : 0;
    const runsMax = Math.max(communityRuns, maxRunsFromMaxCredits);
    const filledSlots = runsMax > 0
      ? Math.max(0, Math.min(SLOTS, Math.round((communityRuns / runsMax) * SLOTS)))
      : 0;
    const emptySlots = Math.max(0, SLOTS - filledSlots);
    const filled = '█'.repeat(filledSlots);
    const empty  = '░'.repeat(emptySlots);
    communityBarText.textContent = `[${filled}${empty}] ${communityRuns} left`;
  }

  if (personalCreditPill) {
    const personalRuns = Math.floor(personalCredits / DRESSUP_COST_UNITS);
    personalCreditPill.textContent = `+${personalRuns} credits`;
    personalCreditPill.style.display = 'inline-flex';
    personalCreditPill.style.fontFamily =
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    personalCreditPill.style.fontSize = '7px';
    personalCreditPill.style.textTransform = 'none';
    personalCreditPill.style.letterSpacing = '0.02em';
    personalCreditPill.style.background = 'none';
    personalCreditPill.style.border = 'none';
    personalCreditPill.style.padding = '0';
    personalCreditPill.style.marginRight = '4px';
    personalCreditPill.style.fontWeight = '600';
    personalCreditPill.style.color = personalRuns > 0 ? '#2af78d' : '#ffffff';
  }

  if (btnGenerate) {
    const communityRunsLeft = Math.floor(communityCredits / DRESSUP_COST_UNITS);
    const personalRunsLeft  = Math.floor(personalCredits  / DRESSUP_COST_UNITS);
    const noRuns   = (communityRunsLeft <= 0 && personalRunsLeft <= 0);
    const noGarment = !garmentPublicUrl;
    const noPerson  = !hero?.getAttribute('data-person-url');
    btnGenerate.disabled = noRuns || noGarment || noPerson;
  }
}
updateCreditUI();

function spendOneCreditIfAvailable() {
  let spent = false;
  if (communityCredits >= DRESSUP_COST_UNITS) {
    communityCredits -= DRESSUP_COST_UNITS;
    spent = true;
    syncCommunityCredits().catch(() => {});
  } else if (personalCredits >= DRESSUP_COST_UNITS) {
    personalCredits -= DRESSUP_COST_UNITS;
    spent = true;
    syncPersonalCredits().catch(() => {});
  }
  return spent;
}

// thumb empty state = no garment selected
function updateThumbEmpty() {
  try {
    const hasSrc = garmentPreview.getAttribute && garmentPreview.getAttribute('src');
    if (thumbWrap) {
      if (!hasSrc) thumbWrap.classList.add('empty');
      else thumbWrap.classList.remove('empty');
    }
  } catch (_) {}
}
updateThumbEmpty();

// ---------- garment grid from suitcaseItems.json ----------
async function loadGarments() {
  try {
    const res = await fetch('/shared/data/suitcaseItems.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();

    if (!Array.isArray(items)) return;
    garmentGrid.innerHTML = '';

    items.forEach(item => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.empty = 'false';

      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';

      slot.appendChild(img);
      slot.title = item.name;

      slot.addEventListener('click', () => {
        document
          .querySelectorAll('#garmentGrid .slot')
          .forEach(s => s.classList.remove('selected'));
        slot.classList.add('selected');

        garmentPublicUrl = toAbsoluteHttpUrl(item.overlayImage || item.image);
        garmentPreview.src = garmentPublicUrl;
        updateThumbEmpty();
        updateCreditUI();
      });

      garmentGrid.appendChild(slot);
    });
  } catch (err) {
    console.warn('Failed to load garments:', err?.message || err);
  }
}
if (garmentGrid) loadGarments();

// ---------- Upload flow: USER PHOTO (PERSON) ----------
btnUpload.addEventListener('click', () => fileInput.click());

// ---------- Upload flow: USER PHOTO (PERSON) WITH 9:16 CROP POPUP ----------
fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (!files || !files[0]) return;
  const file = files[0];

  // Reset any previous cropper
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }

  // Show modal
  if (cropModal) {
    cropModal.classList.remove('crop-hidden');
    cropModal.classList.add('crop-visible');
  }

  // Show selected image inside modal <img>
  const objectUrl = URL.createObjectURL(file);
  pendingFileName = file.name || 'photo';

  cropImage.onload = () => {
    // Init Cropper with fixed 9:16 aspect ratio
    if (cropper) {
      cropper.destroy();
    }
    cropper = new Cropper(cropImage, {
      aspectRatio: 9 / 16,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      background: false,
      movable: true,
      zoomable: true,
      scalable: false,
      rotatable: false
    });
  };
  cropImage.src = objectUrl;

  statusEl.textContent = 'Adjust your crop, then confirm.';
});

// Confirm crop → upload cropped PNG to Supabase, set hero
if (cropConfirmBtn) {
  cropConfirmBtn.addEventListener('click', async () => {
    if (!cropper) {
      // no image loaded
      if (cropModal) {
        cropModal.classList.add('crop-hidden');
        cropModal.classList.remove('crop-visible');
      }
      return;
    }

    try {
      statusEl.textContent = 'Uploading cropped photo…';

      // Get cropped canvas 9:16
      const canvas = cropper.getCroppedCanvas({
        width: 1080,
        height: 1920,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
      });

      const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
      if (!sb) throw new Error('Supabase client not found');

      canvas.toBlob(async (blob) => {
        if (!blob) {
          statusEl.textContent = 'Crop failed.';
          return;
        }

        const ext = 'png';
        const safeName = pendingFileName || 'photo';
        const path = 'tryon/person/' + Date.now() + '-' + safeName.replace(/\.[^.]+$/, '') + '.' + ext;

        const uploadRes = await sb.storage
          .from('userassets')
          .upload(path, blob, {
            upsert: true,
            contentType: 'image/png'
          });

        if (uploadRes.error) {
          console.error('Supabase upload error:', uploadRes.error);
          statusEl.textContent = 'Upload failed.';
          return;
        }

        const pub = await sb.storage.from('userassets').getPublicUrl(path);
        const personUrl = pub.data.publicUrl;

        // Apply as hero image
        setHeroImage(personUrl);

        statusEl.textContent = 'Photo ready. Now pick a garment from the grid.';
        updateCreditUI();

        // Close modal
        if (cropModal) {
          cropModal.classList.add('crop-hidden');
          cropModal.classList.remove('crop-visible');
        }

        // Cleanup
        cropper.destroy();
        cropper = null;
        pendingFileName = null;
        cropImage.src = '';
        fileInput.value = ''; // reset input so same file can be chosen again later
      }, 'image/png', 0.95);

    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Upload failed: ' + (err.message || err);

      if (cropModal) {
        cropModal.classList.add('crop-hidden');
        cropModal.classList.remove('crop-visible');
      }
      if (cropper) {
        cropper.destroy();
        cropper = null;
      }
    }
  });
}

// Cancel crop → close modal, reset input
if (cropCancelBtn) {
  cropCancelBtn.addEventListener('click', () => {
    if (cropModal) {
      cropModal.classList.add('crop-hidden');
      cropModal.classList.remove('crop-visible');
    }
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    pendingFileName = null;
    cropImage.src = '';
    fileInput.value = '';
    statusEl.textContent = 'Upload cancelled.';
  });
}

// Still trigger file input when clicking Upload button
btnUpload.addEventListener('click', () => fileInput.click());


// ---------- Generate flow ----------
btnGenerate.addEventListener('click', async () => {
  const personUrl = toAbsoluteHttpUrl(hero?.getAttribute('data-person-url'));
  if (!personUrl) {
    statusEl.textContent = 'Upload your photo first.';
    updateCreditUI();
    return;
  }

  if (!garmentPublicUrl) {
    statusEl.textContent = 'Pick a garment from the collection.';
    updateCreditUI();
    return;
  }

  if (!spendOneCreditIfAvailable()) {
    statusEl.textContent = 'No credits available.';
    updateCreditUI();
    return;
  }

  updateCreditUI();
  btnGenerate.disabled = true;
  statusEl.textContent = 'Generating your try-on…';

  try {
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    let uploaderId = 'anon';
    try {
      if (sb?.auth?.getUser) {
        const { data } = await sb.auth.getUser();
        if (data?.user?.id) uploaderId = data.user.id;
      }
    } catch (_) {}

    const payload = {
      model: 'google/nano-banana',
      personUrl,
      garmentUrl: garmentPublicUrl,
      prompt: 'Dress the uploaded person image with the selected garment. Keep identity, pose and lighting natural; clean seams. Preserve background and any existing clothing not covered by the new garment.'
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

    // save generated result to Supabase
    let savedPublicUrl = null;
    try {
      if (!sb?.storage) throw new Error('Supabase client not found on window');

      const imgRes = await fetch(outputUrl, { mode: 'cors' });
      if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
      const blob = await imgRes.blob();

      const ext = (blob.type && blob.type.includes('png')) ? 'png' :
                  (blob.type && blob.type.includes('jpeg')) ? 'jpg' : 'png';
      const key = `generated/tryon/${uploaderId}/${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from('userassets')
        .upload(key, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });
      if (upErr) throw upErr;

      const { data: pub } = sb.storage.from('userassets').getPublicUrl(key);
      savedPublicUrl = pub?.publicUrl || null;
    } catch (saveErr) {
      console.warn('⚠️ Save to Supabase failed; using Replicate URL:', saveErr?.message || saveErr);
    }

    const finalUrl = savedPublicUrl || outputUrl;

    const currentUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
    if (currentUrl && currentUrl !== finalUrl) {
      historyStack.push(currentUrl);
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

// ---------- Reset hero ----------
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    const url = toAbsoluteHttpUrl(DEFAULT_HERO_IMG);
    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = 'url("' + url + '")';
      hero.setAttribute('data-person-url', url);
      hero.style.opacity = '1';
    }, 180);

    // clear garment selection
    garmentPreview.removeAttribute('src');
    garmentPublicUrl = null;
    document.querySelectorAll('#garmentGrid .slot').forEach(s => s.classList.remove('selected'));

    historyStack = [];
    if (btnUndo) btnUndo.style.display = 'none';
    if (btnSave) btnSave.style.display = 'none';
    if (resetBtn) resetBtn.style.display = 'none';
    hasGeneratedOnce = false;

    updateThumbEmpty();
    updateCreditUI();
  });
}

// ---------- Undo ----------
if (btnUndo) {
  btnUndo.addEventListener('click', () => {
    if (!historyStack.length) return;

    const previousUrl = historyStack.pop();
    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${previousUrl}")`;
      hero.setAttribute('data-person-url', previousUrl);
      hero.style.opacity = '1';
    }, 180);

    if (btnUndo) btnUndo.style.display = historyStack.length ? 'inline-block' : 'none';
  });
}

// ---------- image loader for download ----------
function loadImageWithCors(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- Download with watermark ----------
async function downloadCurrentHero() {
  const url = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
  if (!url) return;

  const filename = `${currentPlayer.name}-${currentPlayer.id}-tryon-${Date.now()}.png`;
  const canvas = $('downloadCanvas');

  if (!canvas) {
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
    return;
  }

  try {
    const img = await loadImageWithCors(url);
    const w = img.naturalWidth || img.width || 1080;
    const h = img.naturalHeight || img.height || 1920;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const pad = Math.round(h * 0.03);
    const stripHeight = Math.round(h * 0.12);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(pad, h - stripHeight - pad, Math.round(w * 0.7), stripHeight);

    const wmText = getWatermarkText();
    const lines = wmText.split('\n');

    const fontSize = Math.max(16, Math.round(h * 0.022));
    const lineHeight = Math.round(fontSize * 1.2);

    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    const baseX = pad * 1.5;
    let baseY = h - pad - 6;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      ctx.fillText(line, baseX, baseY);
      baseY -= lineHeight;
    }

    canvas.toBlob(blob => {
      if (!blob) throw new Error('Canvas export failed');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 'image/png', 0.95);

  } catch (err) {
    console.warn('Watermarked download failed, falling back to raw image:', err);
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
}

if (btnSave) {
  btnSave.addEventListener('click', downloadCurrentHero);
}

// end
