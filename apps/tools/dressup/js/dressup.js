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

const animatedWMEl    = $('animatedWatermarkText');// bottom-left typing watermark
const statusEl        = $('status');
const btnUpload       = $('btnUpload');
const btnGenerate     = $('btnGenerate');


const multiItemToggle    = $('multiItemToggle');
const multiItemLockLabel = $('multiItemLockLabel');
const multiSlotsContainer = $('multiSlots');

const styleTabEl  = $('styleTab');
const avatarTabEl = $('avatarTab');
const tabButtons  = document.querySelectorAll('.panel-tab');

const avatarGuestSection  = $('avatarGuestSection');
const avatarAuthedSection = $('avatarAuthedSection');
const avatarStatusEl      = $('avatarStatus');
const avatarCreateBtn     = $('btnCreateAvatar');
const avatarLoginBtn      = $('btnAvatarLoginPrompt');

const avatarUploadSlots   = document.querySelectorAll('.avatar-upload-slot');


const loginEmailInput  = $('dressupLoginEmail');
const loginPassInput   = $('dressupLoginPassword');
const dressupLoginBtn  = $('btnDressupLogin');
const loginStatusEl    = $('dressupLoginStatus');





const fileInput       = $('fileInput');
const garmentPreview  = $('garmentPreview');
const thumbWrap       = document.querySelector('.thumb-wrap');
const btnUndo         = $('btnUndo');
const btnSave         = $('btnSave');
const resetBtn        = $('btnResetHero');

// (removed) legacy skin dropdown refs (we only use Featured + My Skins now)


const mySkinActionsEl = $('mySkinActions');
const btnSetAsBase = $('btnSetAsBase');
const btnDiscardAvatar = $('btnDiscardAvatar');



const btnDressupLogout = $('btnDressupLogout');
const dressupLogoutStatus = $('dressupLogoutStatus');



// --- Auth dialog + HUD auth buttons ---
const authOpenBtn   = $('authOpenBtn');
const authLogoutBtn = $('authLogoutBtn');

const authDialog = document.getElementById('authDialog');
const authTabSignIn = document.getElementById('authTabSignIn');
const authTabSignUp = document.getElementById('authTabSignUp');
const authPanelSignIn = document.getElementById('authPanelSignIn');
const authPanelSignUp = document.getElementById('authPanelSignUp');

const authEmailIn = document.getElementById('authEmailIn');
const authPassIn  = document.getElementById('authPassIn');
const authBtnSignIn = document.getElementById('authBtnSignIn');

const authEmailUp = document.getElementById('authEmailUp');
const authPassUp  = document.getElementById('authPassUp');
const authBtnSignUp = document.getElementById('authBtnSignUp');

const authStatus = document.getElementById('authStatus');

const mySkinSelectEl = $('mySkinSelect');

let selectedSkin = { source: null, id: null }; // source: 'featured' | 'my'



let pendingAvatarUrl = null;     // holds newly generated avatar until user decides
let pendingAvatarBeforeUrl = null; // what hero was before previewing the avatar



// skin list for this player
let availableSkins = []; // { id, name, hero_url, is_default }


async function uploadGarmentToSupabase(file) {
  const sb = getSb();
  if (!sb) throw new Error('Supabase client not found');

  const uploaderId = currentUserId || 'anon';

  const safeName = (file.name || 'garment.png').replace(/\s+/g, '-');
  const path = `garments/${uploaderId}/${Date.now()}-${safeName}`;

  const upRes = await withTimeout(
    sb.storage.from('userassets').upload(path, file, { upsert: true }),
    20000,
    'storage upload timeout'
  );

  if (upRes.error) throw upRes.error;

  const { data: pub } = sb.storage.from('userassets').getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error('Public URL not returned');

  return { publicUrl: pub.publicUrl, path };
}


function getSb() {
  // DressUp client (created in sbClient.js)
  if (window.sb) return window.sb;

  // Fallback: if some other page already created a client and put it on window.supabase
  if (window.supabase?.from && window.supabase?.auth) return window.supabase;

  return null;
}



if (authLogoutBtn && !window.__dressupLogoutBound2) {
 authLogoutBtn.addEventListener('click', async () => {
  const sb = getSb();
  try {
    if (buyStatus) buyStatus.textContent = '';
    if (buyMenu) buyMenu.style.display = 'none';

    // Sign out
    await sb?.auth?.signOut();

    // Clear local UI state immediately
    resetDressupToGuestState();

    // Hard refresh so session + UI are guaranteed in sync
    window.location.reload();

  } catch (e) {
    console.error(e);
    if (buyStatus) buyStatus.textContent = 'Logout failed. Check console.';
  }
});


}


if (authDialog) {
  authDialog.addEventListener('cancel', (e) => {
    e.preventDefault(); // stop browser default
    closeAuthDialog();
  });
}




async function applyAuthState() {
  const sb = getSb();
  if (!sb?.auth) {
    currentUserId = null;
    supabaseReady = false;
    updateAuthDependentUI();
    return;
  }

  supabaseReady = true;

  try {
    const sessRes = await withTimeout(sb.auth.getSession(), 8000, 'auth.getSession timeout');

    const nextUserId = sessRes?.data?.session?.user?.id || null;
    const nextToken  = sessRes?.data?.session?.access_token || null;

    currentUserId = nextUserId;
    currentAccessToken = nextToken;

    console.log('[DressUp] applyAuthState currentUserId:', currentUserId);

    updateAuthDependentUI();
    if (currentUserId) await hydrateUserContext();

  } catch (e) {
    console.warn('[DressUp] applyAuthState failed:', e?.message || e);

    // ✅ DO NOT force logout on timeouts — keep whatever state we had
    // Just re-render UI based on currentUserId as-is.
    updateAuthDependentUI();
  }
}



function openAuthDialog(defaultTab = 'signin') {
  if (!authDialog) return;

  // default tab
  const isUp = defaultTab === 'signup';
  if (authPanelSignIn) authPanelSignIn.style.display = isUp ? 'none' : 'block';
  if (authPanelSignUp) authPanelSignUp.style.display = isUp ? 'block' : 'none';

  if (authStatus) authStatus.textContent = '';

  try { authDialog.showModal(); }
  catch (_) { authDialog.removeAttribute('open'); authDialog.setAttribute('open', ''); }
}

function closeAuthDialog() {
  if (!authDialog) return;
  try { authDialog.close(); } catch (_) { authDialog.removeAttribute('open'); }
}



function setAuthStatus(msg) {
  if (authStatus) authStatus.textContent = msg || '';
}



if (authBtnSignIn) {
  authBtnSignIn.addEventListener('click', async () => {
    const sb = getSb();
    if (!sb?.auth) return setAuthStatus('Auth not ready.');

    const email = (authEmailIn?.value || '').trim();
    const password = (authPassIn?.value || '').trim();
    if (!email || !password) return setAuthStatus('Enter email + password.');

    authBtnSignIn.disabled = true;
    setAuthStatus('Signing in…');

    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data?.user) throw new Error(error?.message || 'sign_in_failed');

      closeAuthDialog();
      await applyAuthState(); // refresh UI + hydrate
    } catch (e) {
      setAuthStatus(`Sign in failed: ${e.message || e}`);
    } finally {
      authBtnSignIn.disabled = false;
    }
  });
}

if (authBtnSignUp) {
  authBtnSignUp.addEventListener('click', async () => {
    const sb = getSb();
    if (!sb?.auth) return setAuthStatus('Auth not ready.');

    const email = (authEmailUp?.value || '').trim();
    const password = (authPassUp?.value || '').trim();
    if (!email || !password) return setAuthStatus('Enter email + password.');

    authBtnSignUp.disabled = true;
    setAuthStatus('Creating account…');

    try {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      setAuthStatus('Account created. Check email if confirmation is required.');
      // flip back to sign-in panel
      if (authPanelSignUp) authPanelSignUp.style.display = 'none';
      if (authPanelSignIn) authPanelSignIn.style.display = 'block';
    } catch (e) {
      setAuthStatus(`Sign up failed: ${e.message || e}`);
    } finally {
      authBtnSignUp.disabled = false;
    }
  });
}



const authDialogCloseBtn = document.getElementById('authDialogClose');

if (authDialogCloseBtn && !window.__authDialogCloseBound) {
  window.__authDialogCloseBound = true;
  authDialogCloseBtn.addEventListener('click', () => closeAuthDialog());
}



function resetDressupToGuestState() {
  currentUserId = null;
  currentAccessToken = null;
  personalCredits = 0;
  pendingAvatarUrl = null;
  pendingAvatarBeforeUrl = null;

  // identity label fallback (don’t touch URL overrides)
  if (!qsId) signedInLabel = 'anonymousss';
  if (!qsName) currentPlayer.name = ''; // optional; remove if you want name to stay
  currentPid = null;

  updateAuthDependentUI();
  updateCreditUI();
}




async function saveCurrentHeroAsDefaultSkin({ name = 'My Default Skin' } = {}) {
  const sb = getSb();
  if (!sb || !currentUserId) throw new Error('Must be logged in to save a skin.');

  const heroUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
  if (!heroUrl) throw new Error('No hero image to save.');

  // download the current hero image
  const imgRes = await fetch(heroUrl, { mode: 'cors' });
  if (!imgRes.ok) throw new Error(`download_failed ${imgRes.status}`);
  const blob = await imgRes.blob();

  // upload to storage
  const ext = blob.type?.includes('jpeg') ? 'jpg' : 'png';
  const path = `skins/${currentUserId}/${Date.now()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from('userassets')
    .upload(path, blob, { contentType: blob.type || 'image/png', upsert: true });

  if (upErr) throw upErr;

  const { data: pub } = sb.storage.from('userassets').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error('public_url_missing');

  // does user already have a private default row?
  const { data: existing, error: exErr } = await sb
    .from('dressup_skins')
    .select('id')
    .eq('owner_id', currentUserId)
    .eq('visibility', 'private')
    .eq('is_default', true)
    .maybeSingle();

  if (exErr && exErr.code !== 'PGRST116') throw exErr; // ignore "no rows" style errors

  if (existing?.id) {
    // update existing base skin row
    const { error: upSkinErr } = await sb
      .from('dressup_skins')
      .update({ name, hero_url: publicUrl, is_default: true })
      .eq('id', existing.id);

    if (upSkinErr) throw upSkinErr;
  } else {
    // clear any accidental defaults then insert a new base row
    await sb
      .from('dressup_skins')
      .update({ is_default: false })
      .eq('owner_id', currentUserId)
      .eq('visibility', 'private')
      .eq('is_default', true);

    const { error: insErr } = await sb
      .from('dressup_skins')
      .insert({
        owner_id: currentUserId,
        name,
        hero_url: publicUrl,
        visibility: 'private',
        is_default: true
      });

    if (insErr) throw insErr;
  }

  // refresh local list + UI
  await loadSkinsForPlayer();

  // set selection to the new/updated base
  const def = availableSkins.find(s => s.is_default) || availableSkins[0];
  if (def) {
    selectedSkin = { source: 'my', id: def.id };
    setHeroImage(def.hero_url);
    currentSkinName = def.name || 'My Skin';
    renderMySkinsRow();
  }
}



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
  ? (hero.getAttribute('data-default-hero') || '/apps/tools/dressup/assets/manq.png')
  : '/apps/tools/dressup/assets/munz-base-portraitV2-1.png';


// credit HUD elements
// credit HUD elements
const creditHUD          = $('creditHUD');
const communityBarText   = $('communityBarText');
const personalCreditPill = $('personalCreditPill');

// --- Buy credits UI ---
const buyMenuToggle = $('buyMenuToggle');
const buyMenu       = $('buyMenu');
const buyCreditsBtn = $('buyCreditsBtn');
const buyStatus     = $('buyStatus');

let selectedPackId = 'pack_1';




const PACKS = {
  pack_1:  { label: '$1 (2 runs)',  credits: 100 },
  pack_5:  { label: '$5 (10 runs)', credits: 500 },
  pack_10: { label: '$10 (22 runs)', credits: 1100 },
  pack_20: { label: '$20 (45 runs)', credits: 2250 },
};

// ---------- pricing / cost (global credits) ----------
// We treat "credits" as global units (like cents). DressUp costs 33 units (~$0.33) per generation.
// 1 dollar donated ≈ 3 runs (2 community, 1 personal) → 3 * 33 = 99 units.
const DRESSUP_COST_UNITS = 50;

// ---------- credit state (global units) ----------
// These are fallback defaults; Supabase will overwrite them when available.

let communityCredits = 0;


let communityMax     = 300
let personalCredits  = 0;                       // backup pool for this user (used only when community is empty)

let garmentPublicUrl = null;

let isGenerating = false;


let hasGeneratedOnce = false;
let historyStack = []; // previous hero URLs for "Step Back"


// Supabase user context for personal credits
let currentUserId = null;
let supabaseReady = false;

let currentAccessToken = null;


// game context: which player + skin
let currentPid = null;        // player's PID if we find one for this user


// This object represents whoever is currently being dressed.
// Later the skin selector dropdown will just update this object.
let currentPlayer = {
  name: "Demo",   // default display name
  id: "",      // readable id/tag (acts like PID)
  heroUrl: null   // will be set below
};

// "Signed in" label for watermark (PID if we have one, otherwise "anonymous")
let signedInLabel = "anonymous";

// guard so the watermark typing loop only starts once
let watermarkLoopStarted = false;

// current skin label (e.g. "Base", "CVS Uniform")
let currentSkinName = null;


// which part of UI is using fileInput right now: "style" vs "avatar"
let currentUploadContext = 'style';
let activeAvatarSlot = 0;

// avatar slot URLs (for later Nano avatar pipeline)
const avatarSlots = [null, null, null, null, null];


// ---------- STYLE: multi-item garment state ----------

const MAX_GARMENTS = 6;
let multiModeEnabled = false;

// each slot holds { url, supabasePath } or null
let garmentSlots = new Array(MAX_GARMENTS).fill(null);
let activeGarmentSlot = 0;




let isAvatarGenerating = false;




function withTimeout(promise, ms = 15000, msg = 'Timed out') {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function startCreditCheckout() {
  try {
    if (!currentUserId || !currentAccessToken) {
      if (buyStatus) buyStatus.textContent = 'Log in first.';
      return;
    }

    if (buyStatus) buyStatus.textContent = 'Opening checkout...';

    const res = await fetch('/api/dressup/create-checkout-session', {

      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentAccessToken}`,
      },
      body: JSON.stringify({ packId: selectedPackId }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'checkout_failed');

    if (!body.url) throw new Error('missing_checkout_url');

    window.location.href = body.url;
  } catch (e) {
    console.error('checkout error:', e);
    if (buyStatus) buyStatus.textContent = `Checkout failed: ${e.message || e}`;
  }
}

function wireBuyMenu() {
  if (!buyMenuToggle || !buyMenu) return;

  buyMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = buyMenu.style.display !== 'none';
    buyMenu.style.display = isOpen ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    if (buyMenu) buyMenu.style.display = 'none';
  });

  buyMenu.addEventListener('click', (e) => {
    const packBtn = e.target.closest('.buy-pack');
    if (packBtn) {
      selectedPackId = packBtn.dataset.pack || 'pack_1';
      // optional visual highlight
      buyMenu.querySelectorAll('.buy-pack').forEach(b => b.classList.remove('active'));
      packBtn.classList.add('active');
      if (buyStatus) buyStatus.textContent = `${PACKS[selectedPackId]?.label || ''} selected`;
      return;
    }
  });

  if (buyCreditsBtn) {
    buyCreditsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startCreditCheckout();
    });
  }
}

// wire immediately (script runs after DOM in your page)
wireBuyMenu();


// helper: mark slots visually
function refreshMultiSlotsUI() {
  if (!multiSlotsContainer) return;
  const slotEls = multiSlotsContainer.querySelectorAll('.multi-slot');
  slotEls.forEach((el) => {
    const idx = Number(el.dataset.index || 0);
    const slotData = garmentSlots[idx];
    el.classList.toggle('has-image', !!slotData);
    el.classList.toggle('active', idx === activeGarmentSlot);
    if (slotData && slotData.url) {
      el.style.backgroundImage = `url("${slotData.url}")`;
    } else {
      el.style.backgroundImage = 'none';
    }
  });
}

// ---------- AVATAR: public presets ----------

// ---------- AVATAR: public presets loaded from Supabase ----------
let publicFeaturedSkins = []; // { id, name, hero_url, skin_key, sort_order }

async function loadPublicFeaturedSkins() {
  const sb = getSb();
  publicFeaturedSkins = [];

  try {
    if (!sb) throw new Error('Supabase client not found');

    const { data, error } = await sb
      .from('dressup_skins')
      .select('id, name, hero_url, sort_order, created_at, visibility')
      .in('visibility', ['featured', 'public'])
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    publicFeaturedSkins = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('loadPublicFeaturedSkins failed:', e?.message || e);
    publicFeaturedSkins = [];
  }

  renderAvatarPublicRow();
  return publicFeaturedSkins;
}




function renderAvatarPublicRow() {
  const row = document.getElementById('featuredSkinsRow');
  if (!row) return;

  row.innerHTML = '';

  const skins = publicFeaturedSkins.length
    ? publicFeaturedSkins
    : [{ id: '__fallback__', name: 'Base', hero_url: DEFAULT_HERO_IMG, skin_key: 'base' }];

  skins.forEach((skin, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-pill';
    btn.dataset.skinId = skin.id;
    btn.textContent = skin.name || 'Skin';

    btn.addEventListener('click', () => {
      selectFeaturedSkin(skin, btn);
    });

    row.appendChild(btn);

    // Auto-select first on initial render
    // Auto-select only if nothing has been selected yet
if (idx === 0 && !selectedSkin.source) {
  setTimeout(() => selectFeaturedSkin(skin, btn), 0);
}

  });
}

function selectFeaturedSkin(skin, btnEl) {
  clearFeaturedSelectionUI();
  selectSkinUnified({ source: 'featured', skin, btnEl });
}






// chose default hero image
// Base "template" hero (composition anchor for avatar creation + default for new users)
const DEFAULT_HERO_IMG = hero
  ? (hero.getAttribute('data-default-hero') || "/apps/tools/dressup/assets/manq.png")
  : "/apps/tools/dressup/assets/manq.png";

// const DEFAULT_HERO_IMG = "/apps/tools/dressup/assets/munz-base-portraitnomaditemselected2.png";


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
  currentSkinName = "@Munzir_here";
}

// Choose hero image: ?hero=... wins, otherwise default
if (qsHero) {
  currentPlayer.heroUrl = qsHero;
} else {
  currentPlayer.heroUrl = DEFAULT_HERO_IMG;
}


// Open auth dialog from HUD or Avatar guest button
if (authOpenBtn && !window.__authOpenBound) {
  window.__authOpenBound = true;
  authOpenBtn.addEventListener('click', () => openAuthDialog('signin'));
}

if (avatarLoginBtn && !window.__avatarAuthOpenBound) {
  window.__avatarAuthOpenBound = true;
  avatarLoginBtn.addEventListener('click', () => openAuthDialog('signin'));
}

// Tabs
if (authTabSignIn) authTabSignIn.addEventListener('click', () => openAuthDialog('signin'));
if (authTabSignUp) authTabSignUp.addEventListener('click', () => openAuthDialog('signup'));











// Load skins for this player from Supabase (if available)
// (removed) legacy dropdown skin system
// We now use:
// - loadPublicFeaturedSkins() for Featured/Public
// - loadSkinsForPlayer() for logged-in user's private skins

async function loadSkinsForPlayer() {
  const sb = getSb();

  // Not logged in → clear MY SKINS dropdown
  if (!sb || !currentUserId) {
    availableSkins = [];
    if (mySkinSelectEl) {
      mySkinSelectEl.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Log in to use My Skins';
      mySkinSelectEl.appendChild(opt);
      mySkinSelectEl.disabled = true;
    }
    return;
  }

  try {
    const { data, error } = await sb
      .from('dressup_skins')
      .select('id, name, hero_url, is_default, created_at')
      .eq('owner_id', currentUserId)
      .eq('visibility', 'private')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    availableSkins = Array.isArray(data) ? data : [];
    renderMySkinsRow();

  } catch (err) {
    console.warn('loadSkinsForPlayer failed:', err?.message || err);
    availableSkins = [];
  }

  renderMySkinsRow();
}



function renderMySkinsRow() {
  const row = document.getElementById('mySkinsRow');
  if (!row) return;

  row.innerHTML = '';

  if (!currentUserId) {
    row.innerHTML = '<div style="opacity:.7;font-size:12px;">Log in to use My Skins</div>';
    return;
  }

  if (!availableSkins.length) {
    row.innerHTML = '<div style="opacity:.7;font-size:12px;">No saved skins yet</div>';
    return;
  }

  availableSkins.forEach((skin) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-pill';
    btn.textContent = skin.name || 'My Skin';

    btn.addEventListener('click', () => {
      clearMySkinsSelectionUI();
      selectSkinUnified({ source: 'my', skin, btnEl: btn });
    });

    row.appendChild(btn);

    // highlight if it matches current selection
    if (selectedSkin.source === 'my' && selectedSkin.id === skin.id) {
      btn.classList.add('avatar-pill-active');
    }
  });
}




if (mySkinSelectEl && !window.__mySkinSelectBound) {
  window.__mySkinSelectBound = true;
  mySkinSelectEl.addEventListener('change', (e) => {
    applyMySkinById(e.target.value);
  });
}



function clearFeaturedSelectionUI() {
  document.querySelectorAll('#featuredSkinsRow .avatar-pill')
    .forEach(b => b.classList.remove('avatar-pill-active'));
}

function clearMySkinsSelectionUI() {
  document.querySelectorAll('#mySkinsRow .avatar-pill')
    .forEach(b => b.classList.remove('avatar-pill-active'));
}

function selectSkinUnified({ source, skin, btnEl }) {
  // clear the other group so only ONE selection exists total
  if (source === 'featured') clearMySkinsSelectionUI();
  if (source === 'my') clearFeaturedSelectionUI();

  if (btnEl) btnEl.classList.add('avatar-pill-active');

  setHeroImage(skin.hero_url || DEFAULT_HERO_IMG);
  currentSkinName = skin.name || (source === 'featured' ? 'Featured' : 'My Skin');

  selectedSkin = { source, id: skin.id || null };
}





  // If ?skin=Name is present, override selection by name
  



// Utility: text used both by animated UI watermark and the saved-image watermark
function getWatermarkText() {
  const line1 = "[ SUNSEX.XYZ/mannequin ] ☂☂☂ ";
  const line2 = "[ v1.01 ] ";
  const displayName = currentPlayer?.name || "Guest";
  const displayId   = signedInLabel || "guest";
  const line3 = `user: ${displayName} (${displayId})`;
  const skinLabel = currentSkinName || "Base";
  const line4 = `Skin: ${skinLabel}`;
  return `${line1}\n${line2}\n${line3}\n${line4}`;
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

initHeroBackground();








// start the watermark loop immediately with whatever info we have
// (Supabase auth below can update the labels; the loop will pick them up)
// runWatermarkTyping();




async function hydrateUserContext() {
  const sb = getSb();
  if (!sb || !currentUserId) return;

  // reset flags
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

        if (!qsId) {
          currentPlayer.id = playerRow.pid;
          signedInLabel = playerRow.pid;
        }
      }

      if (playerRow.name && !qsName) {
        currentPlayer.name = playerRow.name;
      }

      
    }
  } catch (e) {
    console.warn('Failed to load player for dressup watermark:', e?.message || e);
  }

  if (!playerLoadedForUser && !qsId) {
    const shortId = String(currentUserId).slice(0, 6);
    signedInLabel = `user-${shortId}`;
  }

  // If no player record exists for this auth user, create a stable pseudo PID
if (!currentPid) {
  currentPid = `u_${String(currentUserId).slice(0, 6)}`;
  currentPlayer.id = currentPid;
  signedInLabel = currentPid;
}

// Load skins + credits
await loadSkinsForPlayer();

const def = availableSkins.find(s => s.is_default) || availableSkins[0];
if (def && def.hero_url) {
  // pretend we clicked it (but without needing a DOM btn)
  clearFeaturedSelectionUI();
  setHeroImage(def.hero_url);
  currentSkinName = def.name || 'My Skin';
  selectedSkin = { source: 'my', id: def.id };
  // refresh pills highlight after state update
  renderMySkinsRow();
}



await loadCreditsFromSupabase();

if (new URLSearchParams(location.search).get("success") === "1") {
  setTimeout(() => loadCreditsFromSupabase(), 1200);
}


  // watermark loop already running; it will pick up new text automatically
}


// ---------- Supabase session bootstrapkk + reactive BRkkUH auth ----------
(async () => {
  try {
    const sb = getSb();
    if (!sb?.auth) {
      updateCreditUI();
      updateAuthDependentUI();

      loadPublicFeaturedSkins();
      runWatermarkTyping();
      return;
    }

    // initial apply
    await applyAuthState();

    await loadCreditsFromSupabase();

    setInterval(() => loadCreditsFromSupabase(), 60_000);


    // react to future sign-in / sign-out without reloading
    if (!window.__dressupAuthBound) {
      window.__dressupAuthBound = true;
      sb.auth.onAuthStateChange(async () => {
        await applyAuthState();
        // keep watermark in sync (loop is guarded)
        await loadCreditsFromSupabase();


        runWatermarkTyping();
      });
    }
    loadPublicFeaturedSkins();
    runWatermarkTyping();
  } catch (e) {
    console.warn('Supabase bootstrap failed:', e?.message || e);
    supabaseReady = false;
    updateCreditUI();
    updateAuthDependentUI();
    runWatermarkTyping();
  }
})();



// Load community + personal credits from Supabase (if tables exist)
async function loadCreditsFromSupabase() {
  const sb = getSb();
  if (!sb) {
    updateCreditUI();
    return;
  }

  try {
    // COMMUNITY CHEST
    // COMMUNITY CHEST
    // COMMUNITY CHEST
    const { data, error } = await sb.rpc('dressup_get_chest');
    if (!error && data) {
      communityCredits = Number(data.credits ?? data.community_credits ?? 0);
      communityMax     = Number(data.max_credits ?? data.community_max ?? 0);
    
      if (!Number.isFinite(communityCredits)) communityCredits = 0;
      if (!Number.isFinite(communityMax)) communityMax = 0;
    }
    


    // PERSONAL CREDITS (per Supabase user)
    if (currentUserId) {
      const { data: personalRow, error: personalErr } = await sb
        .from('dressup_personal_credits')
        .select('*')
        .eq('user_id', currentUserId)
        .maybeSingle(); // ✅ prevents 406 spam when no row exists

      if (!personalErr && personalRow && typeof personalRow.credits === 'number') {
        personalCredits = personalRow.credits;
      } else if (!personalErr && !personalRow) {
        // // Optional: auto-create row so future reads are clean
        // await sb.from('dressup_personal_credits').insert({
        //   user_id: currentUserId,
        //   credits: 0
        // });
        personalCredits = 0;
      }
    }
  } catch (err) {
    console.warn('loadCreditsFromSupabase failed:', err?.message || err);
  } finally {
    updateCreditUI();
  }
}





// ---------- local state for generation flow ----------


function updateAuthDependentUI() {
  const loggedIn = !!currentUserId;

  if (buyMenuToggle) buyMenuToggle.style.display = loggedIn ? 'inline-block' : 'none';
  if (authLogoutBtn) authLogoutBtn.style.display = loggedIn ? 'inline-block' : 'none';
  if (authOpenBtn)   authOpenBtn.style.display   = loggedIn ? 'none' : 'inline-block';
  if (!loggedIn && buyMenu) buyMenu.style.display = 'none';

  if (multiItemToggle) multiItemToggle.disabled = !loggedIn;
  if (multiItemLockLabel) {
    multiItemLockLabel.textContent = loggedIn ? 'Multi-item enabled' : 'Log in to unlock';
  }

  if (avatarGuestSection && avatarAuthedSection) {
    avatarGuestSection.style.display  = loggedIn ? 'none' : 'block';
    avatarAuthedSection.style.display = loggedIn ? 'block' : 'none';
  }

  console.log('[DressUp] UI auth flip', { currentUserId, loggedIn });
}





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

    communityBarText.textContent = `[${filled}${empty}] ${communityRuns}   ◙ left`;
  }

  // personal pill: always show, even at +0
// personal pill: text-based like community bar
// personal pill (JS only updates text + state class; styling lives in CSS)
if (personalCreditPill) {
  const personalRuns = Math.floor(personalCredits / DRESSUP_COST_UNITS);
  personalCreditPill.textContent = `+${personalRuns} ◙ RUNS`;
  personalCreditPill.classList.toggle('has-credits', personalRuns > 0);
}


  // enable/disable Generate based on runs + garment
  if (btnGenerate) {
    const noRuns = (communityRuns <= 0 && personalRuns <= 0);
    const noGarment = !garmentPublicUrl;
    btnGenerate.disabled = noRuns || noGarment;
  }
}


// spend logic: community first, then personal




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






// if (skinSelectEl) {
//   skinSelectEl.addEventListener('change', (e) => {
//     applySkinByKey(e.target.value);
//   });
// }



try {
  const params = new URLSearchParams(window.location.search);
  if (params.get("success") === "1") {
    // refresh credit HUD after returning from Stripe
    await loadCreditsFromSupabase?.();
    // optional: clean URL
    params.delete("success");
    const newUrl = window.location.pathname + (params.toString() ? `?${params}` : "");
    window.history.replaceState({}, "", newUrl);
  }
} catch (_) {}


// ---------- Upload flow ----------

if (btnUpload && fileInput) {
  btnUpload.addEventListener('click', () => {
    currentUploadContext = 'style';
    activeGarmentSlot = 0; // main slot
    fileInput.click();
  });
}


if (fileInput) {
  fileInput.addEventListener('change', async (evt) => {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;

    if (currentUploadContext === 'avatar') {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    avatarSlots[activeAvatarSlot] = { url: dataUrl, file, uploadedUrl: null }; // reset uploadedUrl if file changed
    const slotEl = Array.from(avatarUploadSlots || []).find(
      el => Number(el.dataset.index || 0) === activeAvatarSlot
    );
    if (slotEl) {
      slotEl.classList.add('has-image');
      slotEl.style.backgroundImage = `url("${dataUrl}")`;
    }
  };
  reader.readAsDataURL(file);
  avatarStatusEl.textContent = '';
  fileInput.value = ''; // ✅ important
  return;
}


    // default: STYLE / garment upload (existing logic)
    try {
      statusEl.textContent = 'Uploading garment…';
      const { publicUrl } = await withTimeout(
  uploadGarmentToSupabase(file),
  20000,
  'Upload timed out (check Storage bucket/policies or network)'
);


      garmentPreview.src = publicUrl;
      thumbWrap.classList.remove('empty');
      btnGenerate.disabled = false;

      // main single-garment URL (keeps DressUp working)
      garmentPublicUrl = publicUrl;

      // multi-slot bookkeeping if enabled
      if (multiModeEnabled) {
        garmentSlots[activeGarmentSlot] = { url: publicUrl };
        refreshMultiSlotsUI();
      }

      statusEl.textContent = 'Garment ready.';
    } catch (err) {
  console.error(err);
  statusEl.textContent = 'Upload failed: ' + (err?.message || err);
} finally {

      fileInput.value = '';
    }
  });
}





// ---------- Generate flow ----------
btnGenerate.addEventListener('click', async () => {
  if (isGenerating) return;
  isGenerating = true;

  // must have a garment
  if (!garmentPublicUrl) {
    statusEl.textContent = 'Upload a garment first.';
    updateCreditUI();
    isGenerating = false;
    return;
  }


// server will validate + spend credits
updateCreditUI();


  btnGenerate.disabled = true;
if (btnUpload) btnUpload.disabled = true;

  statusEl.textContent = 'Generating… this can take a few seconds.';

  try {
    const personUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
   


const sb = getSb();

let accessToken = null;
try {
  const sess = await sb?.auth?.getSession?.();
  accessToken = sess?.data?.session?.access_token || null;
} catch (_) {}

const payload = {
  mode: 'style',
  personUrl,
  garmentUrl: toAbsoluteHttpUrl(garmentPublicUrl),
  prompt: 'Dress the model hero or mannequin in the hero image with the garment or outfit in the uploaded image. ignore any people in the uploaded image. Keep rest of hero image unchanged, isometric portrait, and photoreallism. blend and harmonize new garments to the original natural lighting'
};


const res = await fetch('/api/dressup/generate', {

  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  },
  body: JSON.stringify(payload)
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  statusEl.textContent = 'Generation failed: ' + (body.details || body.error || res.statusText);
  throw new Error(body.error || 'generate_failed');
}

// ✅ server returns finalUrl + updated credits
const finalUrl = body.finalUrl || body.outputUrl;
if (!finalUrl) throw new Error('No output URL returned');

// update credits from server truth
if (body.credits) {
  communityCredits = body.credits.communityCredits ?? communityCredits;
  communityMax     = body.credits.communityMax ?? communityMax;
  personalCredits  = body.credits.personalCredits ?? personalCredits;
  updateCreditUI();
}



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
    isGenerating = false;
    if (btnUpload) btnUpload.disabled = false;
    // let updateCreditUI decide if Generate should be enabled
    updateCreditUI();
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

    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(pad, h - stripHeight - pad, Math.round(w * 0.7), stripHeight);

    // 4) Draw watermark text lines (using the same generator as the UI)
    const wmText = getWatermarkText();
    const lines = wmText.split('\n');

    const fontSize = Math.max(16, Math.round(h * 0.022)); // scale with image
    const lineHeight = Math.round(fontSize * 1.2);

    ctx.font = `${fontSize}px  Consolas, "Liberation Mono", "Courier New", monospace`;
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



// ---------- Tab switching (STYLE / AVATAR) ----------

if (tabButtons && tabButtons.length) {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.toggle('active', b === btn));

      if (styleTabEl) {
        styleTabEl.classList.toggle('active', target === 'style');
      }
      if (avatarTabEl) {
        avatarTabEl.classList.toggle('active', target === 'avatar');
      }
    });
  });
}

// ---------- Multi-item UI events ----------

if (multiItemToggle) {
  multiItemToggle.addEventListener('change', () => {
    multiModeEnabled = !!multiItemToggle.checked;
    if (multiSlotsContainer) {
      multiSlotsContainer.hidden = !multiModeEnabled;
    }
    refreshMultiSlotsUI();
  });
}

if (multiSlotsContainer) {
  multiSlotsContainer.addEventListener('click', (evt) => {
    const slot = evt.target.closest('.multi-slot');
    if (!slot) return;
    const idx = Number(slot.dataset.index || 0);
    activeGarmentSlot = idx;
    refreshMultiSlotsUI();

    // reuse the same file input as the main upload
    if (fileInput) {
      // mark this upload as "garment"
      currentUploadContext = 'garment';
      fileInput.click();
    }
  });
}

// ---------- Avatar tab events ----------






if (avatarUploadSlots && avatarUploadSlots.length) {
  avatarUploadSlots.forEach(slot => {
    slot.addEventListener('click', () => {
      if (!currentUserId) {
        avatarStatusEl.textContent = 'Log in to upload photos.';
        return;
      }
      currentUploadContext = 'avatar';
      activeAvatarSlot = Number(slot.dataset.index || 0);
      if (fileInput) fileInput.click();
    });
  });
}

if (avatarCreateBtn) {
  avatarCreateBtn.addEventListener('click', async () => {
    if (!currentUserId) {
      avatarStatusEl.textContent = 'Log in to create your own avatar.';
      return;
    }

    if (isAvatarGenerating) return;
    isAvatarGenerating = true;
    avatarCreateBtn.disabled = true;

    const sb = getSb();

    try {
      // 1) collect selected avatar photos
      const filled = avatarSlots.filter(slot => slot && slot.file);
      if (!filled.length) {
        avatarStatusEl.textContent = 'Upload at least 1–3 clear photos of yourself.';
        return;
      }

      if (!sb?.storage) {
        avatarStatusEl.textContent = 'Supabase client not ready (storage missing).';
        console.error('[DressUp] getSb() returned:', sb);
        return;
      }

      avatarStatusEl.textContent = 'Uploading photos…';

      const uploadedUrls = [];

      // 2) upload photos (with timeout) + reuse cached uploadedUrl so you can re-run without refresh
      for (let i = 0; i < avatarSlots.length; i++) {
        const slot = avatarSlots[i];
        if (!slot || !slot.file) continue;

        // ✅ reuse if already uploaded in this session
        if (slot.uploadedUrl) {
          uploadedUrls.push(slot.uploadedUrl);
          continue;
        }

        const file = slot.file;
        const safeName = (file.name || `photo-${i}.jpg`).replace(/\s+/g, '-');
        const path = `avatars/${currentUserId}/${Date.now()}-${i}-${safeName}`;

        const uploadRes = await withTimeout(
          sb.storage.from('userassets').upload(path, file, { upsert: true }),
          25000,
          'Avatar photo upload timed out'
        );

        if (uploadRes.error) {
          console.error('Supabase avatar upload error:', uploadRes.error);
          throw uploadRes.error;
        }

        const pub = sb.storage.from('userassets').getPublicUrl(path);
        const publicUrl = pub?.data?.publicUrl || pub?.publicUrl;

        if (!publicUrl) throw new Error('Public URL not returned for avatar upload');

        slot.uploadedUrl = publicUrl; // ✅ cache
        uploadedUrls.push(publicUrl);
      }

      if (!uploadedUrls.length) {
        avatarStatusEl.textContent = 'Photo upload failed, try again.';
        return;
      }

      avatarStatusEl.textContent = 'Generating avatar…';

      const primaryUrl = uploadedUrls[0];
      const extraRefs = uploadedUrls.slice(1);

      // Use mannequin base as template
      const templateUrl = "/apps/tools/dressup/assets/manq.png";

      const payload = {
        mode: 'avatar',
        personUrl: primaryUrl,
        extraRefs,
        avatarTemplateUrl: templateUrl,
        prompt:
          'Replace the mannequin in the template image with the person and outfit from the uploaded photos. Keep the camera, zoom, perspective, scene, and subject placement EXACTLY the same as in the template mannequin image. Do NOT enlarge the person, place them standing in the same place as where the mannequin was. Disregard the red clothing of the mannequin. Keep background unchanged.  Preserve and harmonize lighting Photorealistic skin and face identity of the; use outfit details from the uploaded photos.'
      };

      console.log('[Avatar → /api/dressup/generate]', payload);

      let accessToken = null;
      try {
        const sess = await sb?.auth?.getSession?.();
        accessToken = sess?.data?.session?.access_token || null;
      } catch (_) {}

      const res = await withTimeout(
        fetch('/api/dressup/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify(payload)
        }),
        90000,
        'Avatar generation timed out'
      );

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Avatar generate error:', body);
        avatarStatusEl.textContent =
          'Avatar generation failed: ' + (body.details || body.error || res.statusText);
        return;
      }

      const outputUrl = body.finalUrl || body.outputUrl || body.image || body.output;
      if (!outputUrl) {
        avatarStatusEl.textContent = 'No avatar image returned.';
        return;
      }

      console.log('[DressUp] /api/generate status', res.status, body);

      pendingAvatarBeforeUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url'));
      pendingAvatarUrl = outputUrl;

      setHeroImage(outputUrl);

      avatarStatusEl.textContent = 'Avatar ready. Set as Base or Discard.';
      currentSkinName = 'Unsaved Avatar';

      if (mySkinActionsEl) mySkinActionsEl.style.display = 'grid';

      // Wire actions once (guard)
      if (!window.__avatarSaveBound) {
        window.__avatarSaveBound = true;

        if (btnSetAsBase) {
          btnSetAsBase.addEventListener('click', async () => {
            if (!pendingAvatarUrl) return;
            try {
              btnSetAsBase.disabled = true;
              avatarStatusEl.textContent = 'Saving as your base skin…';

              await withTimeout(
                saveCurrentHeroAsDefaultSkin({ name: 'My Default Skin' }),
                25000,
                'Save took too long (check Supabase / RLS / network)'
              );

              avatarStatusEl.textContent = 'Saved as your base skin.';
              pendingAvatarUrl = null;
              if (mySkinActionsEl) mySkinActionsEl.style.display = 'none';
            } catch (e) {
              console.warn('Save failed:', e?.message || e);
              avatarStatusEl.textContent = 'Save failed (check console / RLS).';
            } finally {
              btnSetAsBase.disabled = false;
            }
          });
        }

        if (btnDiscardAvatar) {
          btnDiscardAvatar.addEventListener('click', () => {
            pendingAvatarUrl = null;
            setHeroImage(pendingAvatarBeforeUrl || DEFAULT_HERO_IMG);
            pendingAvatarBeforeUrl = null;

            avatarStatusEl.textContent = 'Discarded.';
            if (mySkinActionsEl) mySkinActionsEl.style.display = 'none';
          });
        }
      }

    } catch (err) {
      console.error(err);
      avatarStatusEl.textContent = 'Error creating avatar: ' + (err.message || err);
    } finally {
      // ✅ Always unlock so you can generate again without refreshing
      isAvatarGenerating = false;
      avatarCreateBtn.disabled = false;
    }
  });
}





// (end)


// Trial link : https://sunsex.xyz/apps/tools/dressup/dressup.html?hero=/apps/tools/dressup/assets/O-base-portrait.png&pname=O&pid=O01&mode=private 
