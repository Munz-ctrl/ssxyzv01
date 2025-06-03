// /js/playerUtils.js



function createPlayerMarker(player) {

  console.log('Creating marker for player:', player);

  if (!Array.isArray(player.coords) || player.coords.length !== 2) {
    console.warn('⛔ Invalid coords for player:', player.pid, player.coords);
    return null;
  }

  const pingHTML = `
    <div class="player-ping-container" data-player-id="${player.pid}">
      <div class="player-ping"></div>
      <div class="player-icon-pill" data-id="${player.pid}">
        <span class="pill-name">${player.pid}</span>
      </div>
    </div>
  `;

  const iconWithPing = L.divIcon({
    html: `<div class="interactive-marker">${pingHTML}</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  const marker = L.marker(player.coords, { icon: iconWithPing }).addTo(map); // ✅ save it into "marker"

 marker.on('click', () => {
   closeAllPopups();

   // Disable clicks on the selected player's marker
   const markerEl = marker.getElement();
   if (markerEl) markerEl.style.pointerEvents = 'none';

  // Re-enable after popup closes
  marker.on('popupclose', () => {
    if (markerEl) markerEl.style.pointerEvents = 'auto';
  });

 

});


  return marker; // ✅ return AFTER setting up everything
}


function generatePopupHTML(player) {
  let avatarHTML = "";
  const fallback = '/assets/fallbackIsoAvatar.webp';

 


  if (player.spritesheet) {
    avatarHTML = `
    <div class="player-main-avatar">
      <div class="sprite-anim" style="background-image: url('${player.spritesheet}');"></div>
    </div>
  `;
  } else if (player.main) {
    avatarHTML = `
    <div class="player-main-avatar wide-avatar">
      <img src="${player.main}" />
    </div>
  `;
  } else if (player.avatar) {
    avatarHTML = `
    <div class="player-main-avatar">
      <img src="${player.avatar}" />
    </div>
  `;
  } else {
    avatarHTML = `
    <div class="player-main-avatar">
      <img src="${fallback}" class="fallback" />
    </div>
  `;
  }

 const popupBgStyle = player.popupBg ? `style="background:${player.popupBg};"` : '';

  const featureIcons = [player.special, player.special2].map((img, i) => {
    const hasImage = img && img !== "";
    const url = player[`specialUrl${i + 1}`] || "#";
    return hasImage
      ? `<a href="${url}" target="_blank" class="feature-btn"><img src="${img}" /></a>`
      : `<div class="feature-btn placeholder-slot">+</div>`;
  }).join("");

  const missionText = Array.isArray(player.mission)
    ? player.mission.join('<br>')
    : player.mission || '';

  const missionHTML = `<p class="mission-text z-3">${missionText}</p>`;

  // const popupWrapperClass = player.main ? 'popup-wide' : '';


  const editButton = ssxyz.activePlayer?.pid === player.pid
    ? `<a href="edit-profile.html?id=${player.pid}"><button class="edit-btn">Edit Profile</button></a>`
    : player.contactUrl
      ? `<a href="${player.contactUrl}" target="_blank"><button class="contact-btn">Contact</button></a>`
      : `<a><button disabled>Locked</button></a>`;

  const exploreButton = player.exploreMap
    ? `<a><button class="map-btn">MAP</button></a>`
    : "";

  const popupContent = `
  <div class="popup-wrapper">
    <div class="profile-id">P-ID: ${player.pid}</div>
    <div class="profile-name z-0">${player.name}</div>
    <div class="feature-row z-1">${featureIcons}</div>
    ${avatarHTML}
    ${missionHTML}
    <div class="profile-buttons-row">
      ${editButton}
      ${exploreButton}
    </div>
  </div>
`;

// Instead of using inline background, return content only
return popupContent;
  



}


function attachFlyToBehavior(button, marker, coords) {
  button.onclick = () => {
    // Remove "selected" from all player buttons
    document.querySelectorAll('.playerBtn').forEach(btn => btn.classList.remove('selected'));

    // Add "selected" to this button
    button.classList.add('selected');

    map.closePopup();

    map.flyTo(coords, 9, {
      animate: true,
      duration: 2.5
    });

    setTimeout(() => {
      marker.openPopup();
    }, 2700);
  };
}


function createPlayerButton(player) {
  const btn = document.createElement('img');
  btn.src = player.avatar || '/assets/fallbackIsoAvatar.webp';
  btn.className = 'icon-md playerBtn';
  btn.title = player.pid;
  btn.alt = player.pid;
  return btn;
}

// Export for inclusion via <script type="module">
export { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton };
