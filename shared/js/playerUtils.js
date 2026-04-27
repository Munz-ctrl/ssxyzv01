function createPlayerMarker(player) {
  if (!Array.isArray(player.coords) || player.coords.length !== 2) {
    console.warn('Invalid coords for player:', player.pid, player.coords);
    return null;
  }

  const pingHTML = `
    <div class="player-ping-container" data-player-id="${player.pid}">
      <div class="player-ping"></div>
      <div class="player-icon-pill" data-id="${player.pid}"></div>
    </div>`;

  const icon = L.divIcon({
    html: `<div class="interactive-marker">${pingHTML}</div>`,
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });

  const marker = L.marker(player.coords, { icon }).addTo(map);

  marker.on('click', () => {
    closeAllPopups();
    ssxyz.setAnyMarkerUnclickable(marker);
  });

  return marker;
}


function generatePopupHTML(player) {
  const fallback = '/shared/assets/fallbackIsoAvatar.webp';
  let avatarHTML = '';

  if (player.spritesheet) {
    avatarHTML = `<div class="player-main-avatar"><div class="sprite-anim" style="background-image:url('${player.spritesheet}');"></div></div>`;
  } else if (player.main) {
    avatarHTML = `<div class="player-main-avatar wide-avatar"><img src="${player.main}" /></div>`;
  } else if (player.avatar) {
    avatarHTML = `<div class="player-main-avatar"><img src="${player.avatar}" /></div>`;
  } else if (player.popupBg?.startsWith('http')) {
    avatarHTML = `<div class="player-main-avatar"><img src="${fallback}" class="fallback" /></div>`;
  }

  const featureIcons = [player.special, player.special2].map((img, i) => {
    const hasImage = img && img !== '';
    const url = player[`specialUrl${i + 1}`] || '#';
    return hasImage
      ? `<a href="${url}" target="_blank" class="feature-btn"><img src="${img}" /></a>`
      : `<div class="feature-btn placeholder-slot">+</div>`;
  }).join('');

  const missionText = Array.isArray(player.mission)
    ? player.mission.join('<br>')
    : player.mission || '';

  const editButton = ssxyz.activePlayer?.pid === player.pid
    ? `<a href="/edit-profile?id=${player.pid}"><button class="edit-btn">Edit Profile</button></a>`
    : player.contactUrl
      ? `<a href="${player.contactUrl}" target="_blank"><button class="contact-btn">Contact</button></a>`
      : `<a><button disabled>Locked</button></a>`;

  const exploreButton = player.exploreMap
    ? `<a><button class="map-btn">MAP</button></a>`
    : '';

  return `
  <div class="popup-wrapper">
    <div class="profile-id">P-ID: ${player.pid}</div>
    <div class="profile-name z-0">${player.name}</div>
    <div class="feature-row z-1">${featureIcons}</div>
    ${avatarHTML}
    <p class="mission-text z-3">${missionText}</p>
    <div class="profile-buttons-row">${editButton}${exploreButton}</div>
  </div>`;
}


function attachFlyToBehavior(button, marker, coords) {
  button.onclick = () => {
    document.querySelectorAll('.playerBtn').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    map.closePopup();
    map.flyTo(coords, 9, { animate: true, duration: 2.0 });
    ssxyz.setAnyMarkerUnclickable(marker);
    setTimeout(() => marker.openPopup(), 2200);
  };
}


function createPlayerButton(player) {
  const btn = document.createElement('img');
  btn.src = player.avatar || '/shared/assets/fallbackIsoAvatar.webp';
  btn.className = 'icon-md playerBtn';
  btn.title = player.pid;
  btn.alt = player.pid;
  return btn;
}

export { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton };
