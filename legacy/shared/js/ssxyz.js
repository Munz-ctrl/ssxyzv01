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
  playerMarkers: [],
  selectedMarker: null,
  activeMapMarker: null,

  logout: async function () {
    await supabase.auth.signOut();
    ssxyz.activePlayer = null;
    location.reload();
  },

  updateAllPopups: function () {
    ssxyz.playerMarkers.forEach(marker => {
      const player = marker.options?.player;
      if (player) marker.setPopupContent(generatePopupHTML(player));
    });
  }
};


ssxyz.autoLoginIfPossible = async function () {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.id) return;

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('owner_id', userData.user.id)
    .maybeSingle();

  if (!player) return;

  ssxyz.activePlayer = player;
  ssxyz.updateAllPopups();
  console.log('Auto-logged in as', player.pid);
};


ssxyz.flyToPlayer = function (player, marker) {
  if (!player || !marker) return;
  map.flyTo(player.coords, 7, { animate: true, duration: 2.5 });
  setTimeout(() => marker.openPopup(), 2700);
};


ssxyz.setAnyMarkerUnclickable = function (marker) {
  if (!marker) return;
  if (ssxyz.activeMapMarker && ssxyz.activeMapMarker !== marker) {
    const prev = ssxyz.activeMapMarker.getElement();
    if (prev) prev.style.pointerEvents = 'auto';
  }
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
        <button id="createTabBtn" class="tab-btn" disabled style="opacity:0.5;cursor:not-allowed;">
          Create Player <span style="font-size:8px;">(Coming Soon)</span>
        </button>
      </div>
      <div id="searchWrapper" style="margin-right:1vw;display:flex;align-items:center;justify-content:flex-end;">
        <label style="font-size:9px;">select player:</label>
        <div style="display:flex;align-items:center;gap:4px;">
          <input id="playerSearchInput" type="text" placeholder="Search..."
                 style="max-width:18vw;font-size:10px;padding:2px;" />
        </div>
      </div>
    </div>
    <div id="loginTabContent" style="display:flex;flex-wrap:nowrap;align-items:stretch;justify-content:space-around;">
      <div id="searchAvatarRow" class="player-row"></div>
      <div id="loginFieldsContainer" class="tab-content"></div>
    </div>
    <div id="createTabContent" class="tab-content"></div>`;

  // Only load public players in the login search
  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .eq('is_public', true);

  if (!players || error) {
    document.getElementById('loginFieldsContainer').innerHTML = '<p>Could not load players.</p>';
    return;
  }

  const input = document.getElementById('playerSearchInput');
  const row   = document.getElementById('searchAvatarRow');

  function renderAvatarRow(query = '') {
    row.innerHTML = '';
    if (!query.trim()) return;
    players
      .filter(p => (p.pid || '').toLowerCase().includes(query.toLowerCase()))
      .forEach(p => {
        const btn = createPlayerButton(p);
        btn.onclick = () => {
          document.querySelectorAll('.playerBtn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          renderLoginFields(p);
        };
        row.appendChild(btn);
      });
  }

  input.addEventListener('input', () => {
    renderAvatarRow(input.value);
    document.getElementById('loginFieldsContainer').innerHTML = '';
  });

  document.getElementById('userPanel').style.display = 'block';
  document.getElementById('userPanel').classList.add('activePanel');
};


ssxyz.handleEmailLogin = async function () {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) {
    alert('Please enter email and password.');
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user?.id) {
    alert('Login failed: ' + (error?.message || 'Unknown error'));
    return;
  }

  // Find player by owner_id (preferred) or email fallback
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('owner_id', data.user.id)
    .maybeSingle();

  if (!player) {
    alert('No player linked to this account yet.');
    return;
  }

  ssxyz.activePlayer = player;
  ssxyz.updateAllPopups();
  closeAllPopups();
  ssxyz.updateUserPanelAfterLogin();
};


ssxyz.updateUserPanelAfterLogin = function () {
  const container = document.getElementById('userPanelContent');
  const player = ssxyz.activePlayer;
  if (!player) return;

  container.innerHTML = `
    <div class="tab-content">
      <p>PID: <b>${player.pid}</b></p>
      <p>Welcome, <b>${player.name}</b>!</p>
      <button onclick="ssxyz.flyToPlayer(ssxyz.activePlayer, ssxyz.playerMarkers.find(m => m.options.player?.pid === ssxyz.activePlayer.pid))">Fly To Me</button><br><br>
      <button onclick="ssxyz.logout()">Log Out</button>
    </div>`;

  document.getElementById('userPanel').style.display = 'block';
  document.getElementById('userPanel').classList.add('activePanel');
};


function renderLoginFields(player) {
  const container = document.getElementById('loginFieldsContainer');
  if (!player) { container.innerHTML = ''; return; }

  if (player.auth_type === 'email') {
    container.innerHTML = `
      <div class="tab-content">
        <p style="font-size:11px;">Sign in with email</p>
        <input id="loginEmail" type="email" placeholder="Email" style="width:100%;margin:6px 0;" />
        <input id="loginPassword" type="password" placeholder="Password" style="width:100%;margin:6px 0;" />
        <button style="width:100%;" onclick="ssxyz.handleEmailLogin()">Login</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="tab-content">
        <p style="font-size:11px;">This player is not email-linked.</p>
        <p style="font-size:10px;opacity:0.7;">If this is you, contact us.</p>
      </div>`;
  }
}


window.ssxyz = ssxyz;
ssxyz.autoLoginIfPossible();
