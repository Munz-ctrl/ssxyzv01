// /js/ssxyz.js
import {
  createPlayerMarker,
  generatePopupHTML,
  attachFlyToBehavior,
  createPlayerButton
} from '/shared/js/playerUtils.js';
import { supabase } from '/shared/js/supabase.js';

export const ssxyz = {
  activePlayer: null,
  players: [],
  locations: [],

  selectedMarker: null,

  /**
   * Create a new player for the currently authenticated Supabase user.
   * Requires a valid auth session (no anonymous sign-in).
   */
  createNewPlayer: async function () {
    const pid       = document.getElementById('newPlayerID').value.trim();
    const name      = document.getElementById('newPlayerName').value.trim();
    const coordsRaw = document.getElementById('newPlayerCoords').value.trim();

    // Must have a logged-in Supabase user (email or other real auth)
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      alert("❌ You must be logged in to create a player.");
      console.error(userError);
      return;
    }

    const owner_id = userData.user.id;
    const email    = userData.user.email || null;

    if (!pid || !name || !coordsRaw) {
      alert("Please fill out all required fields.");
      return;
    }

    const coords = coordsRaw.split(',').map(Number);
    if (coords.length !== 2 || isNaN(coords[0]) || isNaN(coords[1])) {
      alert("Invalid coordinates.");
      return;
    }

        const player = {
      pid,
      name,
      coords,
      mission: [],
      special: "",
      special2: "",
      avatar: "",
      owner_id,
      auth_type: 'email',
      email: userData.user.email || null
    };


    // Set as active in the current session
    ssxyz.activePlayer = player;

    // Add marker to map
    const marker = createPlayerMarker(player);
    marker.bindPopup(generatePopupHTML(player));
    marker.options.player = player; // store player data on marker
    ssxyz.playerMarkers.push(marker);

    // Add to avatar row UI
    const playerAvatarRow = document.getElementById('playerAvatarRow');
    const btn = createPlayerButton(player);
    playerAvatarRow.appendChild(btn);

    attachFlyToBehavior(btn, marker, player.coords);

    closeAllPopups();

    // Persist to Supabase
    const { error: insertError } = await supabase.from('players').insert([player]);
    if (insertError) {
      alert("❌ Failed to save player");
      console.error(insertError);
      return;
    }

    alert(`✅ Player ${pid} created and linked to your account.`);
  },

  /**
   * Explicit logout: clears Supabase session and active player.
   */
  logout: async function () {
    // No more PID/PIN soft login – just clear Supabase session
    await supabase.auth.signOut();
    ssxyz.activePlayer = null;
    alert("👋 Logged out.");
    location.reload(); // Optional: refresh to clear UI
  },

  /**
   * Refresh all player popups using the latest data / active state.
   */
  updateAllPopups: function () {
    ssxyz.playerMarkers.forEach(marker => {
      const player = marker.options?.player;
      if (player) {
        marker.setPopupContent(generatePopupHTML(player));
      }
    });
  }
};

/**
 * Auto-login: based only on current Supabase auth user.
 * If the logged-in user owns a player, set that as active.
 */
ssxyz.autoLoginIfPossible = async function () {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user?.id) return;

  const userId = userData.user.id;

  // Look for a player linked via owner_id (email-auth or otherwise)
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('owner_id', userId)
    .single();

  if (player && !playerError) {
    ssxyz.activePlayer = player;
    ssxyz.updateAllPopups();
    console.log(`🔐 Auto-logged in as ${player.pid} via Supabase Auth`);
  }
  // No more localStorage / PIN soft login fallback
};

/**
 * Render the create-player panel (UI only).
 * Note: PIN field has been removed – players are bound to Supabase auth instead.
 */
ssxyz.renderCreatePlayerPanel = function (targetId = 'userPanelContent') {
  const container = document.getElementById(targetId);
  const coords = document.getElementById('newPlayerCoords')?.value || '';
  container.innerHTML = `
    <div class="tab-content">
      <input type="text" id="newPlayerID" placeholder="Player ID" />

      <span id="newPlayerCoordsText"
            style="display:inline-block; margin:6px 0; padding:4px 8px; background:#f5f5f5; border-radius:4px;">
        ${coords || 'Lat , Lang'}
      </span>

      <button onclick="ssxyz.createNewPlayerWithLocation()">Create and place</button>
    </div>
  `;
};

ssxyz.flyToPlayer = function (player, marker) {
  if (!player || !marker) return;

  map.flyTo(player.coords, 7, {
    animate: true,
    duration: 2.5
  });

  setTimeout(() => {
    marker.openPopup();
  }, 2700);
};

ssxyz.setAnyMarkerUnclickable = function (marker) {
  if (!marker) return;

  // Re-enable previous marker if different
  if (ssxyz.activeMapMarker && ssxyz.activeMapMarker !== marker) {
    const prev = ssxyz.activeMapMarker.getElement();
    if (prev) prev.style.pointerEvents = 'auto';
  }

  // Disable new marker
  const el = marker.getElement();
  if (el) {
    el.style.pointerEvents = 'none';
    ssxyz.activeMapMarker = marker;

    marker.once('popupclose', () => {
      el.style.pointerEvents = 'auto';
      ssxyz.activeMapMarker = null;
    });
  }
};

ssxyz.openLoginPanel = async function () {
  closeAllPopups();

  const container = document.getElementById('userPanelContent');

  container.innerHTML = ` 
    <div id="userPanelHeader" class="panel-header">
      <div class="login-tabs">
        <button id="loginTabBtn" class="tab-btn activtab">Login</button>
        <button id="createTabBtn" class="tab-btn" disabled style="opacity: 0.6; cursor: not-allowed;">
          Create Player <span style="font-size: 8px; font-weight: bold;">(Coming Soon)</span>
        </button>
      </div>

      <div id="searchWrapper" style="margin-right: 1vw; display: flex; align-items: center; justify-content: flex-end;">
        <label style="font-size: 9px;">select player:</label>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="display: inline-block; width: 14px; height: 14px;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
                 fill="#444" width="100%" height="100%">
              <path d="M10 2a8 8 0 105.293 14.293l5.707 5.707 1.414-1.414-5.707-5.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/>
            </svg>
          </span>
          <input id="playerSearchInput"
                 type="text"
                 placeholder="Search..."
                 style="max-width: 18vw; font-size: 10px; padding: 2px;" />
        </div>
      </div>
    </div>

    <div id="loginTabContent"
         style="display: flex; flex-wrap: nowrap; align-items: stretch; justify-content: space-around;">
      <!-- Avatar row -->
      <div id="searchAvatarRow" class="player-row"></div>

      <!-- Dynamic form content -->
      <div id="loginFieldsContainer" class="tab-content"></div>
    </div>

    <div id="createTabContent" class="tab-content"></div>
  `;

  const { data: players, error } = await supabase.from('players').select('*');

  if (!players || error) {
    alert("❌ Could not load players");
    console.error(error);
    return;
  }

  const input = document.getElementById('playerSearchInput');
  const row   = document.getElementById('searchAvatarRow');

  let selectedPlayer = null;

  function renderAvatarRow(query = '') {
    row.innerHTML = '';
    if (!query.trim()) return; // Don't render anything unless input exists

    const matches = players.filter(p =>
      (p.pid || '').toLowerCase().includes(query.toLowerCase())
    );

    matches.forEach(p => {
      const btn = createPlayerButton(p);
      btn.onclick = () => {
        selectedPlayer = p;
        window.selectedPlayerForLogin = p;

        document
          .querySelectorAll('.playerBtn')
          .forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        renderLoginFields(p);
      };
      row.appendChild(btn);
    });
  }

  input.addEventListener('input', () => {
    renderAvatarRow(input.value);
    document.getElementById('loginFieldsContainer').innerHTML = ''; // Clear when typing
  });

  // Tab switching
  document.getElementById('loginTabBtn').onclick = () => {
    input.value = null;
    document.getElementById('loginFieldsContainer').innerHTML = '';
    document.getElementById('loginTabContent').style.display = 'inline-block';
    document.getElementById('createTabContent').style.display = 'none';

    document.getElementById('loginTabBtn').classList.add('activtab');
    document.getElementById('createTabBtn').classList.remove('activtab');

    document.getElementById('searchWrapper').style.display = 'flex';
    document.getElementById('searchAvatarRow').style.display = 'inline-block';
  };

  document.getElementById('createTabBtn').onclick = () => {
    document.getElementById('loginFieldsContainer').innerHTML = '';
    input.value = null;
    ssxyz.renderCreatePlayerPanel('createTabContent');

    document.getElementById('loginTabContent').style.display = 'none';
    document.getElementById('createTabContent').style.display = 'block';
    document.getElementById('createTabBtn').classList.add('activtab');
    document.getElementById('loginTabBtn').classList.remove('activtab');

    document.getElementById('searchWrapper').style.display = 'none';
    document.getElementById('searchAvatarRow').style.display = 'none';
  };

  document.getElementById('userPanel').style.display = 'block';
  document.getElementById('userPanel').classList.add('activePanel');
};

ssxyz.handleEmailLogin = async function () {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) {
    alert("Please enter email and password.");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data?.user?.id) {
    alert("❌ Login failed: " + (error?.message || 'Unknown error'));
    console.error(error);
    return;
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('email', email)
    .eq('auth_type', 'email')
    .single();

  if (!player || playerError) {
    alert("❌ No player linked to this email.");
    console.error(playerError);
    return;
  }

  ssxyz.activePlayer = player;
  ssxyz.updateAllPopups();
  closeAllPopups();
  alert(`✅ Logged in as ${player.pid}`);

  ssxyz.updateUserPanelAfterLogin();
};

ssxyz.getCoordsAsync = function () {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return reject("Unsupported");
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        resolve(`${lat},${lng}`);
      },
      error => {
        alert("⚠️ Could not get your location.");
        console.error(error);
        reject(error);
      }
    );
  });
};

ssxyz.createNewPlayerWithLocation = async function () {
  try {
    const coords = await ssxyz.getCoordsAsync();
    document.getElementById('newPlayerCoords').value = coords;
    await ssxyz.createNewPlayer();
  } catch (err) {
    console.warn("Location not found, player not created.", err);
  }
};

ssxyz.upgradeToEmail = async function () {
  const email    = prompt("Enter your email:");
  const password = prompt("Create a password:");

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert("❌ Sign up failed: " + error.message);
    console.error(error);
    return;
  }

  const userId = data?.user?.id;

  if (!userId) {
    alert("✅ Confirmation email sent! Please confirm your email before logging in.");
    return;
  }

  const { error: updateError } = await supabase
    .from('players')
    .update({
      auth_type: 'email',
      email: email,
      owner_id: userId
    })
    .eq('pid', ssxyz.activePlayer?.pid);

  if (updateError) {
    alert("⚠️ Email linked, but player update failed.");
    console.error(updateError);
  } else {
    alert("✅ Account upgraded successfully! You’re now protected by email login.");
  }
};

ssxyz.uploadImage = async function (file, filename, uploaderId = "") {
  const bucket = uploaderId ? 'userassets' : 'avatars';
  const path   = uploaderId ? `userassets/${uploaderId}/${filename}` : filename;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });

  if (error) {
    console.error('Upload failed:', error);
    alert('⚠️ Upload failed');
    return null;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
};

function renderLoginFields(player) {
  const container = document.getElementById('loginFieldsContainer');
  if (!player) {
    container.innerHTML = '';
    return;
  }

  if (player.auth_type === 'email') {
    container.innerHTML = `
      <div class="tab-content">
        <p>Authenticated Player: sign in using email</p>
        <input id="loginEmail"
               type="email"
               placeholder="Email"
               style="width:100%; margin: 6px 0;" />
        <input id="loginPassword"
               type="password"
               placeholder="Password"
               style="width:100%; margin: 6px 0;" />
        <button style="width:100%;" onclick="ssxyz.handleEmailLogin()">Login</button>
      </div>
    `;
  } else {
    // Legacy / unlinked player – no PIN login anymore
    container.innerHTML = `
      <div class="tab-content">
        <p>This player is not email-linked yet.</p>
        <p style="font-size: 10px; opacity: 0.7;">
          If this is you CONTACT US.
        </p>
      </div>
    `;
  }
}

ssxyz.updateUserPanelAfterLogin = function () {
  const container = document.getElementById('userPanelContent');
  const player    = ssxyz.activePlayer;
  if (!player) return;

  const authLabel = player.auth_type === 'email'
    ? "Email Authenticated"
    : "Unlinked";

  container.innerHTML = `
    <div class="tab-content">
      <p>PID: <b>${player.pid}</b>
        <small style="opacity: 0.6; font-size: 6px;">(${authLabel})</small>
      </p>
      <p>Welcome, <b>${player.name}</b>!</p>
      <button onclick="ssxyz.flyToPlayer(ssxyz.activePlayer,
        ssxyz.playerMarkers.find(m => m.options.player?.pid === ssxyz.activePlayer.pid))">
        Fly To Player
      </button><br><br>
      <button onclick="ssxyz.upgradeToEmail()">Authenticate</button><br><br>
      <button onclick="ssxyz.logout()">Log Out</button>
    </div>
  `;
};

ssxyz.disableInteractionForActiveMarker = function (activePid) {
  ssxyz.playerMarkers.forEach(marker => {
    const el = marker.getElement();
    if (!el) return;
    if (marker.options.player?.pid === activePid) {
      el.style.pointerEvents = 'none';
    } else {
      el.style.pointerEvents = 'auto';
    }
  });
};

window.ssxyz = ssxyz;
ssxyz.autoLoginIfPossible(); // 🧠 Auto-login via Supabase session (no PID/PIN)
