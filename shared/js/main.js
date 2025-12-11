// main.js
import { ssxyz } from '/shared/js/ssxyz.js';
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from '/shared/js/playerUtils.js';
import { supabase } from '/shared/js/supabase.js';



// Fetch players and render them
(async () => {
  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .order('id', { ascending: true });

  console.log("Loaded players from Supabase:", players);

  if (!players || error) {
    console.error('❌ Failed to load players:', error);
    return;
  }

  ssxyz.players = players;
  const avatarRow = document.getElementById('playerAvatarRow');
  ssxyz.playerMarkers = [];

  players
    .sort((a, b) => {
      const isFallback = val => !val || val.includes('fallbackIsoAvatar.webp');
      const aHasCustomAvatar = !isFallback(a.avatar) || a.spritesheet;
      const bHasCustomAvatar = !isFallback(b.avatar) || b.spritesheet;
      return (bHasCustomAvatar ? 1 : 0) - (aHasCustomAvatar ? 1 : 0);
    })

    .forEach(player => {
      console.log('Rendering player:', player);

      const marker = createPlayerMarker(player);
      if (!marker) return; // Skip broken players

      marker.bindPopup(generatePopupHTML(player), {
        className: `popup-${player.pid}`
      });





      if (player.popupBg) {
        const styleTag = document.createElement('style');
        styleTag.innerHTML = `
  .popup-${player.pid} .leaflet-popup-content-wrapper {
    background: ${player.popupBg.startsWith('http') ? `url(${player.popupBg}?t=${Date.now()})` : player.popupBg} no-repeat center center / cover !important;
  }
`;

        document.head.appendChild(styleTag);
      }




      marker.options.player = player;
      ssxyz.playerMarkers.push(marker);
      const btn = createPlayerButton(player);
      avatarRow.appendChild(btn);
      attachFlyToBehavior(btn, marker, player.coords);
    });
})();


fetch('/shared/data/locations.json')
  .then(res => res.json())
  .then(locations => {
    const locationsPanel = document.getElementById('locationsPanel');

    locations.forEach(loc => {
      // UI Button in location slider
      const btn = document.createElement('img');
      btn.src = loc.visual;
      btn.className = 'icon-sm locationBtn';


      btn.onclick = () => map.flyTo(loc.coords, 10, {
        animate: true,
        duration: 1.5
      });
      locationsPanel.appendChild(btn);

      // Map marker
      const icon = L.divIcon({
        html: `<div class="interactive-marker"><img src="${loc.visual}" style="width: 40px;" /></div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker(loc.coords, {
        icon,
        pane: 'locationsPane'
      }).addTo(map);

      const secondPreview = loc.preview2
        ? `<div class="location-preview-secondary"><img src="${loc.preview2}" /></div>`
        : "";

      const popupHTML = `
              <div class="location-popup ${loc.preview2 ? 'with-preview2' : ''}">
                <div class="location-header">
                  <img src="${loc.visual}" class="location-thumbnail" />
                  <div class="location-text">
                    <div class="profile-name">${loc.name}</div>
                    <div class="location-bio">${loc.bio}</div>
                  </div>
                </div>
                ${secondPreview}
                <button disabled class="location-play-btn">Play (locked)</button>
              </div>
            `;



      marker.bindPopup(popupHTML);

      if (loc.popupBg) {
  const className = `popup-loc-${loc.id}`;
  marker.bindPopup(popupHTML, { className });

  const style = document.createElement('style');
  style.innerHTML = `
    .${className} .leaflet-popup-content-wrapper {
      background: ${
        loc.popupBg.startsWith('http') || loc.popupBg.startsWith('/')
          ? `url(${loc.popupBg}) no-repeat center center / cover`
          : loc.popupBg
      } !important;
    }
  `;
  document.head.appendChild(style);
} else {
  marker.bindPopup(popupHTML);
}


      
    marker.on('click', () => {
  closeAllPopups();
  ssxyz.setAnyMarkerUnclickable(marker);
});








    });
  });

// Responsive Popup Resizing
function adjustPopupSizes() {
  const isPortrait = window.innerHeight > window.innerWidth;

  document.querySelectorAll('.leaflet-popup-content-wrapper').forEach(wrapper => {
    if (isPortrait) {
      // wrapper.style.width = '80vw';
      wrapper.style.maxWidth = '50vw';
    } else {
      // wrapper.style.width = '40vw';
      // wrapper.style.maxWidth = '60vw';
    }
  });

  if (window.map && window.map._popup) {
    const latlng = window.map._popup.getLatLng();
    window.map.panTo(latlng);
  }
}

window.addEventListener('resize', () => {
  adjustPopupSizes();
});
