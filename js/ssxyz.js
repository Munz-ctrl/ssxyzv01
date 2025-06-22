// /js/ssxyz.js
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from '/js/playerUtils.js';
import { supabase } from '/js/supabase.js';

export const ssxyz = {
  activePlayer: null,
  players: [],
  locations: [],

  selectedMarker: null,


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

  // getCurrentLocation: function () {
  //   if (!navigator.geolocation) {
  //     alert("Geolocation is not supported by your browser.");
  //     return;
  //   }

  //   navigator.geolocation.getCurrentPosition(
  //     position => {
  //       const lat = position.coords.latitude.toFixed(5);
  //       const lng = position.coords.longitude.toFixed(5);
  //       document.getElementById('newPlayerCoords').value = `${lat},${lng}`;
  //       alert(`📍 Found you at: ${lat}, ${lng}`);
  //     },
  //     error => {
  //       alert("⚠️ Could not get your location.");
  //       console.error(error);
  //     }
  //   );
  // },





  handleLogin: async function () {
    const { error: authError } = await supabase.auth.signInAnonymously();
    if (authError) {
      alert("⚠️ Supabase login failed");
      console.error(authError);
      return;
    }



    const selectedId = document.getElementById('loginPlayerInput').value;

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

    ssxyz.updateUserPanelAfterLogin();

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




};


ssxyz.autoLoginIfPossible = async function () {
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user?.id) return;

  const userId = userData.user.id;

  // First, try to find a linked authenticated player
  let { data: player, error: playerError } = await supabase
    .from('players')
    .select('*')
    .eq('owner_id', userId)
    .single();

  if (player) {
    ssxyz.activePlayer = player;
    ssxyz.updateAllPopups();
    console.log(`🔐 Auto-logged in as ${player.pid} via Supabase Auth`);
    return;
  }

  // Fallback: soft login from localStorage
  const pid = localStorage.getItem('playerPid');
  const pin = localStorage.getItem('playerPin');
  if (!pid || !pin) return;

  const { data: softPlayer, error: softError } = await supabase
    .from('players')
    .select('*')
    .eq('pid', pid)
    .single();

  if (softPlayer && softPlayer.pin === pin) {
    ssxyz.activePlayer = softPlayer;
    ssxyz.updateAllPopups();
    console.log(`🔑 Auto-logged in via soft login: ${softPlayer.pid}`);
  }
};



ssxyz.renderCreatePlayerPanel = function (targetId = 'userPanelContent') {
  const container = document.getElementById(targetId);
  const coords = document.getElementById('newPlayerCoords')?.value || '';
  container.innerHTML = `
    <div class="tab-content">
      <input type="text" id="newPlayerID" placeholder="Player ID" />
    
      <input type="password" id="newPlayerPin" placeholder="Security Pin" />

      <span id="newPlayerCoordsText" style="display:inline-block; margin:6px 0; padding:4px 8px; background:#f5f5f5; border-radius:4px;">
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


ssxyz.setMarkerUnclickable = function(marker) {
  if (!marker) return;

  // Re-enable any previously disabled marker
  if (ssxyz.selectedMarker && ssxyz.selectedMarker !== marker) {
    const prevEl = ssxyz.selectedMarker.getElement();
    if (prevEl) prevEl.style.pointerEvents = 'auto';
  }

  const el = marker.getElement();
  if (el) {
    el.style.pointerEvents = 'none';
    ssxyz.selectedMarker = marker;

    // Reset interactivity on popup close
    marker.once('popupclose', () => {
      el.style.pointerEvents = 'auto';
      ssxyz.selectedMarker = null;
    });
  }
};






ssxyz.openLoginPanel = async function () {

  closeAllPopups();

  const container = document.getElementById('userPanelContent');
  
  
  container.innerHTML = ` 
  <div class="login-tabs" style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 0 6px;">
  <div style="display: flex; gap: 2px;">
    <button id="loginTabBtn" class="tab-btn activtab">Login</button>
    <button id="createTabBtn" class="tab-btn">Create</button>
  </div>

  <div id="searchWrapper" style="display: flex; align-items: center; gap: 6px;">
    <label style="font-size: 9px;">Log in to:</label>
    <div style="display: flex; align-items: center; gap: 4px;">
      <span style="display: inline-block; width: 14px; height: 14px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#444" width="100%" height="100%">
          <path d="M10 2a8 8 0 105.293 14.293l5.707 5.707 1.414-1.414-5.707-5.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/>
        </svg>
      </span>
      <input id="playerSearchInput" type="text" placeholder="Search..." style="max-width: 18vw; font-size: 10px; padding: 2px;" />
    </div>
  </div>
</div>

<!-- Avatar row -->
<div id="searchAvatarRow" class="tab-content player-row" style="gap: 6px; padding: 4px 0; max-height: 7vh;"></div>

<!-- Dynamic form content -->
<div id="loginFieldsContainer" class="tab-content"></div>
<div id="createTabContent" class="tab-content"></div>

  
  `;
  
  

//   <div class="login-tabs">
//     <button id="loginTabBtn" class="tab-btn activtab">Login</button>
//     <button id="createTabBtn" class="tab-btn">Create New Player</button>
//   </div>

//   <div id="loginTabContent" class="tab-content" style="flex-wrap: nowrap; align-items: center; justify-content: start; gap: 4px; padding: 4px;">

//   <span style="font-size: 9px; white-space: nowrap;">Choose player to log in:</span>

//   <div class="coord-row" style="flex: 1; gap: 6px;">
//     <div style="display: flex; align-items: center; gap: 4px;">
//      <span style="display: inline-block; width: 14px; height: 14px; margin-right: 4px;">
//   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#444" width="100%" height="100%">
//     <path d="M10 2a8 8 0 105.293 14.293l5.707 5.707 1.414-1.414-5.707-5.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z"/>
//   </svg>
// </span>

//       <input id="playerSearchInput" type="text" placeholder=" Search Player ID..." style="max-width: 15vw; font-size: 10px; padding: 2px;" />
//     </div>

//     <div id="searchAvatarRow" class="player-row" style="max-width: 45vw; overflow-x: auto; gap: 4px;"></div>
//   </div>

// </div>



//   <div id="loginFieldsContainer" class="tab-content"></div>
//   <div id="createTabContent" class="tab-content"></div>
// `;

  
//   <div id="loginTabContent" class="tab-content" style="flex-direction: row; align-items: center; justify-content: center; gap: 4px;">
//   <p>Choose a player to log-in </p>
//   <input id="playerSearchInput" type="text" placeholder=" Search player's ID..." style="max-width: 10vw; padding: 4px;" />
//   <div id="searchAvatarRow" class="player-row" style="max-width: 30vw; overflow-x: auto;"></div>
// </div>
  
  // container.innerHTML = `
  //   <div class="login-tabs">
  //     <button id="loginTabBtn" class="tab-btn activtab">Login</button>
  //     <button id="createTabBtn" class="tab-btn">Create New Player</button>
  //   </div>
  //   <div id="loginTabContent" class="tab-content" style="justify-self: center; ">

  //      <input list="playerList" id="loginPlayerInput" placeholder="Player ID" style="justify-content: center; " />
  //      <datalist id="playerList"></datalist>
  //   </div>
  //     <div id="loginFieldsContainer" class="tab-content"></div>
  //   </div>
    
  //   <div id="createTabContent" class="tab-content"></div>
  // `;
  

 const { data: players, error } = await supabase.from('players').select('*');

  if (!players || error) {
    alert("❌ Could not load players");
    return;
  }


  //new data search box code //

  const input = document.getElementById('playerSearchInput');
  const row = document.getElementById('searchAvatarRow');

let selectedPlayer = null;

function renderAvatarRow(query = '') {
  row.innerHTML = '';
  if (!query.trim()) return; // Don't render anything unless input exists

  const matches = players.filter(p => p.pid.toLowerCase().includes(query.toLowerCase()));
  matches.forEach(p => {
    const btn = createPlayerButton(p);
    btn.onclick = () => {
      selectedPlayer = p;
      document.querySelectorAll('.playerBtn').forEach(b => b.classList.remove('selected'));
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

// Initial render
// renderAvatarRow('');





  // 



 
  // const datalist = document.getElementById('playerList');

  // players.forEach(p => {
  //   const option = document.createElement('option');
  //   option.value = p.pid;
  //   datalist.appendChild(option);
  // });

  // input.addEventListener('input', () => {
  //   const selected = players.find(p => p.pid === input.value);
  //   renderLoginFields(selected);
  // });


  // Tab switching
  document.getElementById('loginTabBtn').onclick = () => {
    input.value = null; // Clear selected player
    document.getElementById('loginFieldsContainer').innerHTML = '';
    document.getElementById('loginTabContent').style.display = 'block';
    document.getElementById('createTabContent').style.display = 'none';
    document.getElementById('loginTabBtn').classList.add('activtab');
    document.getElementById('createTabBtn').classList.remove('activtab');


    document.getElementById('searchWrapper').style.display = 'flex';
    document.getElementById('searchAvatarRow').style.display = 'flex';

   loginTabBtn.classList.add('activtab');
   createTabBtn.classList.remove('activtab');



  };

  document.getElementById('createTabBtn').onclick = () => {


    
    document.getElementById('searchWrapper').style.display = 'none';
    document.getElementById('searchAvatarRow').style.display = 'none';
    // Hide login fields when switching to Create tab
    document.getElementById('loginFieldsContainer').innerHTML = '';
    input.value = null; // Clear selected player
    ssxyz.renderCreatePlayerPanel('createTabContent');
    document.getElementById('loginTabContent').style.display = 'none';
    document.getElementById('createTabContent').style.display = 'block';
    document.getElementById('createTabBtn').classList.add('activtab');
    document.getElementById('loginTabBtn').classList.remove('activtab');



     createTabBtn.classList.add('activtab');
     loginTabBtn.classList.remove('activtab');
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
    await ssxyz.createNewPlayer(); // run the existing creation
  } catch (err) {
    console.warn("Location not found, player not created.");
  }
};


ssxyz.upgradeToEmail = async function () {
  const email = prompt("Enter your email:");
  const password = prompt("Create a password:");

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  // ❗ Sign up instead of updateUser
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert("❌ Sign up failed: " + error.message);
    console.error(error);
    return;
  }

  const userId = data?.user?.id;

  // ❗ If email confirmation is required, userId may be null
  if (!userId) {
    alert("✅ Confirmation email sent! Please confirm your email before logging in.");
    return;
  }

  // Link the new email-auth user to the existing player
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
  const bucket = uploaderId ? 'userassets' : 'avatars'; // ✅ dynamic support
  const path = uploaderId ? `userassets/${uploaderId}/${filename}` : filename;

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
      <input id="loginEmail" type="email" placeholder="Email" style="width:100%; margin: 6px 0;" />
      <input id="loginPassword" type="password" placeholder="Password" style="width:100%; margin: 6px 0;" />
      <button  style="width:100%;" onclick="ssxyz.handleEmailLogin()">Login</button>
    </div>
  `;
  } else if (player.auth_type === 'anon') {
    container.innerHTML = `
    <div class="tab-content">
      <p>un-authenticated Player: enter pin</p>
      <input id="loginPin" type="password" placeholder="Security Pin" style="width:100%;" />
      <button style="width:100%;"  onclick="ssxyz.handleLogin()">Login</button>
    </div>
  `;
  }
}

//<p>*make sure you authenticate your player with an email for player longevity, security, and additional features</p>

ssxyz.updateUserPanelAfterLogin = function () {
  const container = document.getElementById('userPanelContent');
  const player = ssxyz.activePlayer;
  if (!player) return;

  const authLabel = player.auth_type === 'email' ? "Email Authenticated" : "Soft Login";

  container.innerHTML = `
  <div class="tab-content">
    
    <p> PID: <b>${player.pid}</b> <small style="opacity: 0.6; font-size: 6px;">(${authLabel})</small></p>
    <p>Welcome, <b>${player.name}</b>!</p>
    <button onclick="ssxyz.flyToPlayer(player, ssxyz.playerMarkers.find(m => m.options.player?.pid === player.pid))">Fly To Player</button><br><br>
    <button onclick="ssxyz.upgradeToEmail()"> Authenticate</button><br><br>
    <button onclick="ssxyz.logout()"> Log Out </button>
  </div>
  `;
};

ssxyz.disableInteractionForActiveMarker = function(activePid) {
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
ssxyz.autoLoginIfPossible(); // 🧠 Auto-login from localStorage