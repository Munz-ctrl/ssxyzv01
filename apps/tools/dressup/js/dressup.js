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

// Parse URL params so we can override hero image, mode, player and skin
const params    = new URLSearchParams(window.location.search);
const qsHero    = params.get('hero');   // custom hero img url
const qsName    = params.get('pname');  // optional override for display name
const qsId      = params.get('pid');    // optional override for player id/tag
const qsSkin    = params.get('skin');   // optional override for skin label
const modeParam = params.get('mode');   // "private" or null

// We'll keep this now but not actually change UI on private mode yet
const isPrivateMode = (modeParam === 'private');


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

const skinSelectorEl = $('skinSelector');
const skinSelectEl   = $('skinSelect');

// skin list for this player
let availableSkins = []; // { id, name, hero_url, is_default }

// helper: set hero image + data-person-url consistently
function setHeroImage(url) {
  if (!hero) return;
  const fallback = hero.getAttribute('data-default-hero') || DEFAULT_HERO_IMG;
  const finalUrl = toAbsoluteHttpUrl(url || fallback);
  hero.style.backgroundImage = 'url("' + finalUrl + '")';
  hero.setAttribute('data-person-url', finalUrl);
}


// read the default hero (Munz) from the HTML itself, so code and markup stay in sync
const htmlDefaultHero = hero
  ? (hero.getAttribute('data-default-hero') || '/apps/tools/dressup/assets/munz-base-portraitV2-1.png')
  : '/apps/tools/dressup/assets/munz-base-portraitV2-1.png';


// credit HUD elements
// credit HUD elements
const creditHUD          = $('creditHUD');
const communityBarText   = $('communityBarText');
const personalCreditPill = $('personalCreditPill');


// ---------- pricing / cost (global credits) ----------
// We treat "credits" as global units (like cents). DressUp costs 33 units (~$0.33) per generation.
// 1 dollar donated ≈ 3 runs (2 community, 1 personal) → 3 * 33 = 99 units.
const DRESSUP_COST_UNITS = 33;

// ---------- credit state (global units) ----------
// These are fallback defaults; Supabase will overwrite them when available.
let communityCredits = 5 * DRESSUP_COST_UNITS;  // e.g. 5 runs in the chest
let communityMax     = communityCredits;
let personalCredits  = 0;                       // backup pool for this user (used only when community is empty)


// Supabase user context for personal credits
let currentUserId = null;
let supabaseReady = false;

// game context: which player + skin
let currentPid = null;        // player's PID if we find one for this user


// This object represents whoever is currently being dressed.
// Later the skin selector dropdown will just update this object.
let currentPlayer = {
  name: "MUNZ",   // default display name
  id: "001",      // readable id/tag (acts like PID)
  heroUrl: null   // will be set below
};

// "Signed in" label for watermark (PID if we have one, otherwise "anonymous")
let signedInLabel = "anonymous";

// guard so the watermark typing loop only starts once
let watermarkLoopStarted = false;

// current skin label (e.g. "Base", "CVS Uniform")
let currentSkinName = null;


// chose default hero image
const DEFAULT_HERO_IMG = "/apps/tools/dressup/assets/munz-base-portraitV2-1.png"; // update if needed

// apply URL overrides
if (qsName) currentPlayer.name = qsName;
if (qsId)   currentPlayer.id   = qsId;

// signed-in label: if a pid is explicitly provided, use it
if (qsId) {
  signedInLabel = qsId;
}

// initial skin label: explicit ?skin=... wins, otherwise use player name or "Base"
if (qsSkin) {
  currentSkinName = qsSkin;
} else {
  currentSkinName = "@isoMunzir";
}

// Choose hero image: ?hero=... wins, otherwise default
if (qsHero) {
  currentPlayer.heroUrl = qsHero;
} else {
  currentPlayer.heroUrl = DEFAULT_HERO_IMG;
}


// Load skins for this player from Supabase (if available)
async function loadSkinsForPlayer(pid) {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb || !pid) {
    buildSkinSelector(); // still build "Base" only
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

// Apply a specific skin by id or "__base__"
function applySkinByKey(key) {
  if (key === '__base__') {
    currentSkinName = 'Base';
    setHeroImage(currentPlayer.heroUrl);
    return;
  }

  const skin = availableSkins.find(s => s.id === key);
  if (!skin) return;

  currentSkinName = skin.name;
  setHeroImage(skin.hero_url);
}

// Build the dropdown options + choose initial selection
function buildSkinSelector() {
  if (!skinSelectEl || !skinSelectorEl) return;

  skinSelectEl.innerHTML = '';

  // Always have a Base option
  const baseOpt = document.createElement('option');
  baseOpt.value = '__base__';
  baseOpt.textContent = 'Base';
  skinSelectEl.appendChild(baseOpt);

  let selectedKey = '__base__';

  // Add any skins from Supabase
  availableSkins.forEach(skin => {
    const opt = document.createElement('option');
    opt.value = skin.id;
    opt.textContent = skin.name;
    skinSelectEl.appendChild(opt);

    if (skin.is_default && selectedKey === '__base__') {
      selectedKey = skin.id;
    }
  });

  // If ?skin=Name is present, override selection by name
  if (qsSkin && availableSkins.length > 0) {
    const byName = availableSkins.find(s => s.name.toLowerCase() === qsSkin.toLowerCase());
    if (byName) selectedKey = byName.id;
  }

  // Show selector only if we have at least 1 option (Base always counts)
  skinSelectorEl.style.display = 'flex';
  skinSelectEl.value = selectedKey;
  applySkinByKey(selectedKey);

  // keep badge + watermark in sync
  updatePlayerBadge();
}



// Utility: update the little badge in the corner so it matches currentPlayer
function updatePlayerBadge() {
  const nameEl = document.getElementById("playerNameLabel");
  const idEl   = document.getElementById("playerIdLabel");

  if (nameEl) nameEl.textContent = currentPlayer.name;
  if (idEl)   idEl.textContent   = "#" + currentPlayer.id;
}

// Utility: text used both by animated UI watermark and the saved-image watermark
function getWatermarkText() {
  const line1 = "SUNSEX_STYLIST_☂";
  const line2 = `Signed in as: ${signedInLabel}`;
  const skinLabel = currentSkinName || currentPlayer.name || "base";
  const line3 = `Styling: ${skinLabel}`;
  return `${line1}\n${line2}\n${line3}`;
}




// ---------- init hero once (ABSOLUTE URL) ----------
(function initHeroOnce() {
  setHeroImage(currentPlayer.heroUrl);
})();


function runWatermarkTyping() {
  if (!animatedWMEl) return;

  // prevent multiple overlapping loops
  if (watermarkLoopStarted) return;
  watermarkLoopStarted = true;

  let i = 0;
  let lastText = ''; // track the text we're typing to detect changes

  function typeAnim() {
    const fullText = getWatermarkText();

    // if text changed (e.g., player loaded), reset
    if (fullText !== lastText) {
      lastText = fullText;
      i = 0;
    }

    if (i <= fullText.length) {
      // support line breaks
      animatedWMEl.innerHTML = fullText.slice(0, i).replace(/\n/g, '<br>');
      i++;
      setTimeout(typeAnim, 38);
    } else {
      // pause then restart the typing loop
      setTimeout(() => {
        i = 0;
        typeAnim();
      }, 8800);
    }
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

/// do the initial sync (badge + hero)
updatePlayerBadge();
initHeroBackground();

// start the watermark loop immediately with whatever info we have
// (Supabase auth below can update the labels; the loop will pick them up)
// runWatermarkTyping();



// ---------- Supabase anon auth + load persisted credits ----------
(async () => {
  try {
    const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) {
      // No Supabase at all → just run with local defaults + "anonymous"
      updateCreditUI();
      runWatermarkTyping();
      return;
    }

    // Get current session (must have been created via real login)
    const { data: sess } = await sb.auth.getSession();
    const user = sess?.session?.user || null;
    if (!user) {
      // Not logged in → just show default credits + watermark
      updateCreditUI();
      runWatermarkTyping();
      return;
    }

    currentUserId = user.id;
    supabaseReady = true;

    // Try to load this user's player (1 PID per user) for watermark + skins
    if (currentUserId) {
      let playerLoadedForUser = false;

      try {
        const { data: playerRows, error: playerErr } = await sb
          .from('players')
          .select('pid, name')
          .eq('owner_id', currentUserId)
          .limit(1);

        if (!playerErr && playerRows && playerRows.length > 0) {
          playerLoadedForUser = true;
          const playerRow = playerRows[0];

          if (playerRow.pid) {
            currentPid = playerRow.pid;

            // if no explicit ?pid= override, adopt the player's pid
            if (!qsId) {
              currentPlayer.id = playerRow.pid;
              signedInLabel    = playerRow.pid;
            }
          }

          // if no explicit ?pname= override, adopt the player's name
          if (playerRow.name && !qsName) {
            currentPlayer.name = playerRow.name;
          }

          updatePlayerBadge();
        }
      } catch (e) {
        console.warn('Failed to load player for dressup watermark:', e?.message || e);
      }

      // If user is signed in but has no player yet, show a short anon label
      if (!playerLoadedForUser && !qsId) {
        const shortId = String(currentUserId).slice(0, 6);
        signedInLabel = `user-${shortId}`;
      }
    }

    // Load skins for this player (prefer Supabase pid, else currentPlayer.id)
    await loadSkinsForPlayer(currentPid || currentPlayer.id);

    // Load credits for this user + global chest
    await loadCreditsFromSupabase();

    // Now that we know as much as possible about the user, start the watermark loop
    runWatermarkTyping();

  } catch (e) {
    console.warn('Anon auth skipped/failed:', e?.message || e);
    supabaseReady = false;
    // fall back to local defaults
    updateCreditUI();
    runWatermarkTyping();
  }
})();

runWatermarkTyping();

// Load community + personal credits from Supabase (if tables exist)
async function loadCreditsFromSupabase() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb) {
    updateCreditUI();
    return;
  }

  try {
    // COMMUNITY CHEST
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

    // PERSONAL CREDITS (per Supabase user)
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

// Write current communityCredits back to Supabase
async function syncCommunityCredits() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb) return;

  try {
    const payload = {
      id: 'community',
      credits: communityCredits,
      max_credits: communityMax
    };

    const { error } = await sb
      .from('dressup_chest')
      .upsert(payload, { onConflict: 'id' });

    if (error) throw error;
  } catch (err) {
    console.warn('syncCommunityCredits failed:', err?.message || err);
  }
}

// Write current personalCredits back to Supabase
async function syncPersonalCredits() {
  const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  if (!sb || !currentUserId) return;

  try {
    const payload = {
      user_id: currentUserId,
      credits: personalCredits
    };

    const { error } = await sb
      .from('dressup_personal_credits')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (err) {
    console.warn('syncPersonalCredits failed:', err?.message || err);
  }
}






// ---------- local state for generation flow ----------
let garmentPublicUrl = null;
let hasGeneratedOnce = false;
let historyStack = []; // previous hero URLs for "Step Back"

// keep the HUD in sync with internal credit state
function updateCreditUI() {
  if (!creditHUD) return;

  // clamp to safe values
  if (communityCredits < 0) communityCredits = 0;
  if (personalCredits < 0) personalCredits = 0;

  // compute how many DressUp generations are available from each pool
  const communityRuns = Math.floor(communityCredits / DRESSUP_COST_UNITS);
  const personalRuns  = Math.floor(personalCredits / DRESSUP_COST_UNITS);

  // community ASCII bar: based on runs left vs a max runs value
  if (communityBarText) {
    const SLOTS = 10; // number of blocks inside the brackets

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

  // personal pill: always show, even at +0
// personal pill: text-based like community bar
if (personalCreditPill) {
  const personalRuns = Math.floor(personalCredits / DRESSUP_COST_UNITS);
  personalCreditPill.textContent = `+${personalRuns} credits`;

  // Match the community text font and color scheme
  personalCreditPill.style.display = 'inline-flex';
  personalCreditPill.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  personalCreditPill.style.fontSize = '7px';
  personalCreditPill.style.textTransform = 'none';
  personalCreditPill.style.letterSpacing = '0.02em';
  personalCreditPill.style.background = 'none';
  personalCreditPill.style.border = 'none';
  personalCreditPill.style.padding = '0';
  personalCreditPill.style.marginRight = '4px';
  personalCreditPill.style.fontWeight = '600';

  // color logic: white if 0, green if >0
  personalCreditPill.style.color = personalRuns > 0 ? '#2af78d' : '#ffffff';
}

  // enable/disable Generate based on runs + garment
  if (btnGenerate) {
    const noRuns = (communityRuns <= 0 && personalRuns <= 0);
    const noGarment = !garmentPublicUrl;
    btnGenerate.disabled = noRuns || noGarment;
  }
}


// spend logic: community first, then personal
function spendOneCreditIfAvailable() {
  let spent = false;

  // try to spend from the community chest first
  if (communityCredits >= DRESSUP_COST_UNITS) {
    communityCredits -= DRESSUP_COST_UNITS;
    spent = true;
    // fire-and-forget sync; errors just log to console
    syncCommunityCredits().catch(() => {});
  } else if (personalCredits >= DRESSUP_COST_UNITS) {
    // fall back to personal wallet if community is empty
    personalCredits -= DRESSUP_COST_UNITS;
    spent = true;
    syncPersonalCredits().catch(() => {});
  }

  return spent;
}



// run once at load so the HUD isn't empty
updateCreditUI();

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






if (skinSelectEl) {
  skinSelectEl.addEventListener('change', (e) => {
    applySkinByKey(e.target.value);
  });
}



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
  // must have a garment
  if (!garmentPublicUrl) {
    statusEl.textContent = 'Upload a garment first.';
    updateCreditUI();
    return;
  }

  // must have credits somewhere
  if (!spendOneCreditIfAvailable()) {
    statusEl.textContent = 'No credits available.';
    updateCreditUI();
    return;
  }

  // reflect the spent credit immediately in the HUD
  updateCreditUI();

  btnGenerate.disabled = true;
  statusEl.textContent = 'Generating… this can take a few seconds.';

  try {
    const personUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
    // ... keep the rest of your existing logic here (Supabase, fetch /api/generate, etc.)


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



// helper: load image with CORS so we can draw to canvas
function loadImageWithCors(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // works for Supabase/public URLs if CORS is set
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}





// ---------- Save (download current hero image with text watermark) ----------
async function downloadCurrentHero() {
  const url = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
  if (!url) return;

  const filename = `${currentPlayer.name}-${currentPlayer.id}-${Date.now()}.png`;
  const canvas = $('downloadCanvas');

  // if somehow canvas is missing, fall back to raw download
  if (!canvas) {
    console.warn('downloadCanvas missing; falling back to direct download');
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
    // 1) Load the current hero image
    const img = await loadImageWithCors(url);

    const w = img.naturalWidth || img.width || 1080;
    const h = img.naturalHeight || img.height || 1920;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // 2) Draw the base hero image
    ctx.drawImage(img, 0, 0, w, h);

    // 3) Draw a soft dark strip at the bottom for legibility
    const pad = Math.round(h * 0.03);         // padding from edges
    const stripHeight = Math.round(h * 0.12); // height of the dark band

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(pad, h - stripHeight - pad, Math.round(w * 0.7), stripHeight);

    // 4) Draw watermark text lines (using the same generator as the UI)
    const wmText = getWatermarkText();
    const lines = wmText.split('\n');

    const fontSize = Math.max(16, Math.round(h * 0.022)); // scale with image
    const lineHeight = Math.round(fontSize * 1.2);

    ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;

    const baseX = pad * 1.5;
    let baseY = h - pad - 6;

    // draw from bottom line up so they sit nicely in the band
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      ctx.fillText(line, baseX, baseY);
      baseY -= lineHeight;
    }

    // 5) Export canvas as PNG and trigger download
    canvas.toBlob(blob => {
      if (!blob) {
        throw new Error('Canvas export failed');
      }
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
    // Fallback: raw download if CORS or canvas fails
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






// (end)


// Trial link : https://sunsex.xyz/apps/tools/dressup/dressup.html?hero=/apps/tools/dressup/assets/O-base-portrait.png&pname=O&pid=O01&mode=private 
