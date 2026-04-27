import { ssxyz } from '/shared/js/ssxyz.js';
import { createPlayerMarker, generatePopupHTML, attachFlyToBehavior, createPlayerButton } from '/shared/js/playerUtils.js';
import { supabase } from '/shared/js/supabase.js';

// Load and render all public players
(async () => {
  const { data: players, error } = await supabase
    .from('players')
    .select('*')
    .eq('is_public', true)
    .order('id', { ascending: true });

  if (!players || error) {
    console.error('Failed to load players:', error);
    return;
  }

  ssxyz.players = players;
  ssxyz.playerMarkers = [];

  const avatarRow = document.getElementById('playerAvatarRow');

  // Players with custom avatars/spritesheets first
  [...players]
    .sort((a, b) => {
      const hasCustom = p => p.spritesheet || (p.avatar && !p.avatar.includes('fallbackIsoAvatar'));
      return (hasCustom(b) ? 1 : 0) - (hasCustom(a) ? 1 : 0);
    })
    .forEach(player => {
      const marker = createPlayerMarker(player);
      if (!marker) return;

      marker.bindPopup(generatePopupHTML(player), { className: `popup-${player.pid}` });
      marker.options.player = player;
      ssxyz.playerMarkers.push(marker);

      if (player.popupBg) {
        const style = document.createElement('style');
        style.innerHTML = `.popup-${player.pid} .leaflet-popup-content-wrapper {
          background: ${player.popupBg.startsWith('http') ? `url(${player.popupBg}?t=${Date.now()}) no-repeat center center / cover` : player.popupBg} !important;
        }`;
        document.head.appendChild(style);
      }

      const btn = createPlayerButton(player);
      avatarRow.appendChild(btn);
      attachFlyToBehavior(btn, marker, player.coords);
    });
})();


// Load locations from JSON
fetch('/shared/data/locations.json')
  .then(res => res.json())
  .then(locations => {
    const locationsPanel = document.getElementById('locationsPanel');

    locations.forEach(loc => {
      // Panel button
      const btn = document.createElement('img');
      btn.src = loc.visual;
      btn.className = 'icon-sm locationBtn';
      btn.onclick = () => map.flyTo(loc.coords, 10, { animate: true, duration: 1.5 });
      locationsPanel.appendChild(btn);

      // Map marker
      const icon = L.divIcon({
        html: `<div class="interactive-marker"><img src="${loc.visual}" style="width:40px;" /></div>`,
        className: '',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker(loc.coords, { icon, pane: 'locationsPane' }).addTo(map);

      const secondPreview = loc.preview2
        ? `<div class="location-preview-secondary"><img src="${loc.preview2}" /></div>`
        : '';

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
        </div>`;

      if (loc.popupBg) {
        const cls = `popup-loc-${loc.id}`;
        marker.bindPopup(popupHTML, { className: cls });
        const style = document.createElement('style');
        style.innerHTML = `.${cls} .leaflet-popup-content-wrapper {
          background: url(${loc.popupBg}) no-repeat center center / cover !important;
        }`;
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


window.addEventListener('resize', () => {
  const isPortrait = window.innerHeight > window.innerWidth;
  document.querySelectorAll('.leaflet-popup-content-wrapper').forEach(wrapper => {
    wrapper.style.maxWidth = isPortrait ? '50vw' : '';
  });
});
