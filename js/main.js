// main.js
import { ssxyz } from './.ssxyz.js';
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from './.playerUtils.js';
import { supabase } from './.supabase.js';



// Fetch players and render them
(async () => {
  const { data: players, error } = await supabase.from('players').select('*');
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
      const aHasAvatar = a.avatar || a.spritesheet;
      const bHasAvatar = b.avatar || b.spritesheet;
      return (aHasAvatar ? -1 : 1) - (bHasAvatar ? -1 : 1);
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
      btn.className = 'icon-md locationBtn';
      btn.onclick = () => map.flyTo(loc.coords, 6, {
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

      const popupHTML = `
        <div style="text-align:center; font-family: Ubuntu;">
          <h4>${loc.name}</h4>
          <img src="${loc.visual}" class="icon-lg" />
          <p>${loc.bio}</p>
          <button disabled style="opacity: 0.5;">🔒 Play</button>
        </div>
      `;

      marker.bindPopup(popupHTML);

      marker.on('click', () => {
        closeallpopups();
      });

    });
  });
