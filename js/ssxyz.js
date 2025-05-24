// /js/ssxyz.js
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from '/js/playerUtils.js';
import { supabase } from '/js/supabase.js';

export const ssxyz = {
  activePlayer: null,
  players: [],
  locations: [],

  createNewPlayer: async function () {
    const pid = document.getElementById('newPlayerID').value.trim();
    const name = document.getElementById('newPlayerName').value.trim();
    const pin = document.getElementById('newPlayerPin').value.trim();
    const coordsRaw = document.getElementById('newPlayerCoords').value.trim();


    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      alert("❌ Supabase anonymous login failed");
      return;
    }


    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user?.id) {
      alert("❌ Failed to retrieve user ID");
      return;
    }
    const owner_id = userData.user.id;


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
      pid, name, pin, coords,
      mission: [],
      special: "",
      special2: "",
      avatar: "",

      owner_id
    };


    ssxyz.activePlayer = player;

    const marker = createPlayerMarker(player);
    marker.bindPopup(generatePopupHTML(player));
    marker.options.player = player; // 🔐 store player data in marker
    ssxyz.playerMarkers.push(marker); // ✅ this is the fix!


    const playerAvatarRow = document.getElementById('playerAvatarRow');
    const btn = createPlayerButton(player);
    playerAvatarRow.appendChild(btn);

    attachFlyToBehavior(btn, marker, player.coords);

    closeAllPopups();




    const { error: insertError } = await supabase.from('players').insert([player]);
    if (insertError) {
      alert("❌ Failed to save player");
      console.error(insertError);
      return;
    }


    alert(`✅ Player ${pid} created and logged in.`);
  },

  getCurrentLocation: function () {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        document.getElementById('newPlayerCoords').value = `${lat},${lng}`;
        alert(`📍 Found you at: ${lat}, ${lng}`);
      },
      error => {
        alert("⚠️ Could not get your location.");
        console.error(error);
      }
    );
  },

  uploadImage: async function (file, path) {
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (error) {
      console.error('Upload failed:', error);
      alert('⚠️ Upload failed');
      return null;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    return urlData.publicUrl;
  },

  handleLogin: async function () {
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      alert("⚠️ Supabase login failed");
      console.error(authError);
      return;
    }



    const selectedId = document.getElementById('loginPlayerSelect').value;
    const enteredPin = document.getElementById('loginPin').value;



    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('pid', selectedId)
      .single();

    if (!player) {
      alert("❌ Player not found.");
      return;
    }

    if (player.pin && player.pin !== enteredPin) {
      alert("❌ Incorrect PIN.");
      return;
    }

    ssxyz.activePlayer = player;
    ssxyz.updateAllPopups();

    localStorage.setItem('playerPid', player.pid);
    localStorage.setItem('playerPin', player.pin);



    alert(`✅ Logged in as ${player.pid}`);
    closeAllPopups();
  },





  autoLoginIfPossible: async function () {
    const pid = localStorage.getItem('playerPid');
    const pin = localStorage.getItem('playerPin');
    if (!pid || !pin) return;

    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      console.warn("Anonymous login failed:", authError);
      return;
    }

    const { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('pid', pid)
      .single();

    if (error || !player || player.pin !== pin) {
      console.warn("Auto-login failed (PIN mismatch or player missing)");
      return;
    }

    ssxyz.activePlayer = player;
    ssxyz.updateAllPopups();
    console.log(`🔑 Auto-logged in as ${player.pid}`);
  },

  logout: async function () {
    localStorage.removeItem('playerPid');
    localStorage.removeItem('playerPin');
    await supabase.auth.signOut();
    ssxyz.activePlayer = null;
    alert("👋 Logged out.");
    location.reload(); // Optional: refresh to clear UI
  },

  updateAllPopups: function () {
    ssxyz.playerMarkers.forEach(marker => {
      const player = marker.options?.player;
      if (player) {
        marker.setPopupContent(generatePopupHTML(player));
      }
    });
  },



  renderCreatePlayerPanel: function () {
    const container = document.getElementById('userPanelContent');
    container.innerHTML = `
      <h3>Create New Player</h3>
      <input type="text" id="newPlayerID" placeholder="Player ID" />
      <input type="text" id="newPlayerName" placeholder="Name" />
      <input type="password" id="newPlayerPin" placeholder="Security Pin" />
      <input type="text" id="newPlayerCoords" placeholder="Lat,Lng" />
      <button onclick="ssxyz.getCurrentLocation()">📍 Use My Location</button>
      <div style="margin-top: 10px;">
        <button onclick="ssxyz.createNewPlayer()">Create</button>
      </div>
    `;
  }
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


ssxyz.openLoginPanel = async function () {
  closeAllPopups();

  const container = document.getElementById('userPanelContent');
  container.innerHTML = `
    <div class="login-tabs">
      <button id="loginTabBtn" class="tab-btn active">Login</button>
      <button id="createTabBtn" class="tab-btn">Create New Player</button>
    </div>
    <div id="loginTabContent" class="tab-content">
      <label for="loginPlayerSelect">select your player:</label>
      <select id="loginPlayerSelect" style="width: 100%; margin: 6px 0;">
        <option disabled selected>Player ID</option>
      </select>
      <div id="loginFieldsContainer"></div>
    </div>
    <div id="createTabContent" class="tab-content" style="display:none;"></div>
  `;

  const { data: players, error } = await supabase.from('players').select('pid, auth_type, email');

  if (!players || error) {
    alert("❌ Could not load players");
    return;
  }

  const select = document.getElementById('loginPlayerSelect');
  select.innerHTML += players.map(p => `<option value="${p.pid}">${p.pid}</option>`).join('');

  select.addEventListener('change', () => {
    const selected = players.find(p => p.pid === select.value);
    renderLoginFields(selected);
  });

  // Tab switching
  document.getElementById('loginTabBtn').onclick = () => {
    document.getElementById('loginTabContent').style.display = 'block';
    document.getElementById('createTabContent').style.display = 'none';
    document.getElementById('loginTabBtn').classList.add('active');
    document.getElementById('createTabBtn').classList.remove('active');
  };

  document.getElementById('createTabBtn').onclick = () => {
    ssxyz.renderCreatePlayerPanel('createTabContent');
    document.getElementById('loginTabContent').style.display = 'none';
    document.getElementById('createTabContent').style.display = 'block';
    document.getElementById('createTabBtn').classList.add('active');
    document.getElementById('loginTabBtn').classList.remove('active');
  };

  document.getElementById('userPanel').style.display = 'block';
  document.getElementById('userPanel').classList.add('activePanel');
};




ssxyz.handleEmailLogin = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) {
    alert("Please enter email and password.");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data?.user?.id) {
    alert("❌ Login failed: " + error.message);
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
    return;
  }

  ssxyz.activePlayer = player;
  ssxyz.updateAllPopups();
  closeAllPopups();
  alert(`✅ Logged in as ${player.pid}`);
};







ssxyz.upgradeToEmail = async function () {

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user?.id) {
    alert("❌ You must be logged in first.");
    return;
  }


  const email = prompt("Enter your email:");
  const password = prompt("Create a password:");

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  const { error: loginError } = await supabase.auth.signInAnonymously();
  if (loginError) {
    alert("❌ Supabase login failed");
    return;
  }


  const { data, error } = await supabase.auth.updateUser({
    email,
    password
  });

  if (error) {
    alert("❌ Failed to upgrade account: " + error.message);
    console.error(error);
    return;
  }

  // ✅ Step 2: update your player record with their email + auth_type
  const { error: updateError } = await supabase
    .from('players')
    .update({ auth_type: 'email', email })
    .eq('pid', ssxyz.activePlayer?.pid);

  if (updateError) {
    console.error("Failed to update player record:", updateError);
    alert("⚠️ Email linked, but player info was not updated.");
    return;
  }

  alert("✅ Account upgraded successfully! You’re now protected by email login.");
};


function renderLoginFields(player) {
  const container = document.getElementById('loginFieldsContainer');
  if (!player) return container.innerHTML = '';

  if (player.auth_type === 'email') {
    container.innerHTML = `
      <p>Authenticated Player: sign in using email</p>
      <input id="loginEmail" type="email" placeholder="Email" style="width:100%; margin: 6px 0;" />
      <input id="loginPassword" type="password" placeholder="Password" style="width:100%; margin: 6px 0;" />
      <button style="width:100%;" onclick="ssxyz.handleEmailLogin()">Login</button>
    `;
  } else {
    container.innerHTML = `
      <p>un-authenticated Player: enter pin</p>
      <input id="loginPin" type="password" placeholder="Security Pin" style="width:100%; margin: 6px 0;" />
      <p style="font-size:10px;">*make sure you authenticate your player with an email for longevity and secureity</p>
      <button style="width:100%;" onclick="ssxyz.handleLogin()">Login</button>
    `;
  }
}


window.ssxyz = ssxyz;
ssxyz.autoLoginIfPossible(); // 🧠 Auto-login from localStorage