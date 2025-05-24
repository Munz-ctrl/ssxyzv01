// main.js
import { ssxyz } from '/js/ssxyz.js';
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from '/js/playerUtils.js';
import { supabase } from '/js/supabase.js';



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

      marker.bindPopup(generatePopupHTML(player));
      marker.options.player = player;
      ssxyz.playerMarkers.push(marker);
      const btn = createPlayerButton(player);
      avatarRow.appendChild(btn);
      attachFlyToBehavior(btn, marker, player.coords);
    });
})();


fetch('data/locations.json')
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

      marker.on('click', () => {
        closeallpopups();
      });

    });
  });
