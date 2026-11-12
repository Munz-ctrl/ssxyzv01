// ============================================================
// dressup-state.js  —  Central State Manager for DressUp
// Load this BEFORE dressup.js in your HTML.
// ============================================================
// Fixes:
//   1. Hero gets reset by hydrateUserContext after page load
//   2. onAuthStateChange (silent token refresh) wipes state
//   3. sessionStorage lost between tabs / next day
//   4. 20+ scattered let variables with no coordination
// ============================================================

(function () {

  const STORAGE_KEY = '__dressup_state_v1';
  const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ─────────────────────────────────────────────────────────
  // Default shape of the app state
  // ─────────────────────────────────────────────────────────
  const DEFAULT_STATE = {
    // Hero canvas
    heroUrl: null,            // currently displayed hero image URL
    heroIsGenerated: false,   // true once user has generated at least once
    historyStack: [],         // previous hero URLs for undo

    // Garment
    garmentUrl: null,         // uploaded garment URL

    // Identity (non-sensitive, display only)
    skinName: null,           // e.g. "Base", "My Skin"

    // Timestamp for TTL
    savedAt: null,
  };

  // ─────────────────────────────────────────────────────────
  // Load from localStorage (with TTL check)
  // ─────────────────────────────────────────────────────────
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.savedAt) return null;

      // Expire after TTL
      if (Date.now() - parsed.savedAt > STATE_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Save current state to localStorage
  // ─────────────────────────────────────────────────────────
  function saveToStorage(state) {
    try {
      const toSave = { ...state, savedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────
  // Clear persisted state (call on Reset or Logout)
  // ─────────────────────────────────────────────────────────
  function clearStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    // Also clean up the old sessionStorage keys from the legacy system
    try {
      sessionStorage.removeItem('__dressup_last_hero');
      sessionStorage.removeItem('__dressup_last_garment');
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────
  // The live state object (in-memory, single source of truth)
  // Initialized from storage, or defaults if nothing saved.
  // ─────────────────────────────────────────────────────────
  const _stored = loadFromStorage();
  const _state = Object.assign({}, DEFAULT_STATE, _stored || {});

  // ─────────────────────────────────────────────────────────
  // Public API — window.DressUpState
  // ─────────────────────────────────────────────────────────
  window.DressUpState = {

    // ── Getters ───────────────────────────────────────────

    getHeroUrl() {
      return _state.heroUrl;
    },

    isHeroGenerated() {
      return !!_state.heroIsGenerated;
    },

    getHistory() {
      return _state.historyStack || [];
    },

    getGarmentUrl() {
      return _state.garmentUrl;
    },

    getSkinName() {
      return _state.skinName;
    },

    // ── Hero mutations ────────────────────────────────────

    /**
     * Set hero image.
     * @param {string} url
     * @param {object} opts
     * @param {boolean} opts.isGenerated  - mark that user produced this via AI
     * @param {boolean} opts.pushHistory  - push previous URL onto undo stack first
     * @param {boolean} opts.fromHydration - true if called by auth/skin hydration
     */
    setHero(url, { isGenerated = false, pushHistory = false, fromHydration = false } = {}) {
      if (!url) return;

      // ── THE KEY GUARD ──────────────────────────────────────────────
      // If this is a background hydration call (from auth/skin loading),
      // and the user already has a generated result on screen,
      // silently ignore it. Never let background processes overwrite
      // something the user intentionally produced.
      if (fromHydration && _state.heroIsGenerated) {
        console.log('[DressUpState] setHero fromHydration blocked — user has generated result');
        return;
      }

      // Push current URL to undo stack if requested
      if (pushHistory && _state.heroUrl && _state.heroUrl !== url) {
        _state.historyStack = [...(_state.historyStack || []), _state.heroUrl];
        // Cap stack at 10
        if (_state.historyStack.length > 10) {
          _state.historyStack = _state.historyStack.slice(-10);
        }
      }

      _state.heroUrl = url;
      if (isGenerated) _state.heroIsGenerated = true;

      saveToStorage(_state);
    },

    /**
     * Undo last generation — pops history stack.
     * Returns the URL to restore, or null if empty.
     */
    undoHero() {
      const stack = _state.historyStack || [];
      if (!stack.length) return null;
      const prev = stack[stack.length - 1];
      _state.historyStack = stack.slice(0, -1);
      _state.heroUrl = prev;
      // If we've undone all generated results, clear the flag
      if (!_state.historyStack.length) {
        _state.heroIsGenerated = false;
      }
      saveToStorage(_state);
      return prev;
    },

    // ── Garment mutations ─────────────────────────────────

    setGarment(url) {
      _state.garmentUrl = url || null;
      saveToStorage(_state);
    },

    clearGarment() {
      _state.garmentUrl = null;
      saveToStorage(_state);
    },

    // ── Skin name ─────────────────────────────────────────

    setSkinName(name) {
      _state.skinName = name || null;
      saveToStorage(_state);
    },

    // ── Full reset (Reset button / logout) ────────────────

    reset() {
      _state.heroUrl = null;
      _state.heroIsGenerated = false;
      _state.historyStack = [];
      _state.garmentUrl = null;
      _state.skinName = null;
      _state.savedAt = null;
      clearStorage();
    },

    // ── Debug ─────────────────────────────────────────────

    _dump() {
      return { ..._state };
    },
  };

  console.log('[DressUpState] Ready. heroIsGenerated:', _state.heroIsGenerated, '| heroUrl:', _state.heroUrl?.slice(0, 60));

})();
