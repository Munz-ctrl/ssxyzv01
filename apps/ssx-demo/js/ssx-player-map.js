// apps/ssx-demo/js/ssx-player-map.js
import { supabase } from '/shared/js/supabase.js';

const DEMO_PLAYER_PID = 'MUNZ';

let map;

/**
 * Initialize Leaflet map with same tile style as global map.
 */
function initMap() {
  map = L.map('playerMap', {
    center: [0, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 11,
    zoomSnap: 0.222,
    maxBounds: [
      [-85, -170],
      [85, 190]
    ],
    maxBoundsViscosity: 1.0
  });

  const darkTiles = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 11,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
    }
  );

  const lightTiles = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 11,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
    }
  );

  // For player map, default to light tiles
  lightTiles.addTo(map);

    const coordEl = document.getElementById('pmCoordReadout');
  if (coordEl) {
    map.on('mousemove', (e) => {
      const { lat, lng } = e.latlng;
      coordEl.textContent = `lat ${lat.toFixed(4)}, lng ${lng.toFixed(4)}`;
    });
  }

}

/**
 * Fetch the player row for a given pid.
 */
async function fetchPlayer(pid) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('pid', pid)
    .single();

  if (error) {
    console.error('Error loading player', error);
    return null;
  }
  return data;
}

/**
 * Fetch all memories for a given player pid.
 */
async function fetchMemories(pid) {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('player_pid', pid);

  if (error) {
    console.error('Error loading memories', error);
    return [];
  }
  return data || [];
}

/**
 * Fetch all locations for a list of ids.
 */
async function fetchLocationsByIds(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .in('id', ids);

  if (error) {
    console.error('Error loading locations', error);
    return [];
  }
  return data || [];
}

/**
 * Render markers for memories on the map.
 */
function renderMemoriesOnMap(memories, locationsById) {
  const bounds = L.latLngBounds([]);

  memories.forEach((mem) => {
    const loc = locationsById[mem.location_id];
    if (!loc) return;

    const coords = [loc.lat, loc.lng];

    const preview =
      loc.preview_url ||
      loc.visual_url ||
      '/shared/assets/locations/placeholder_loc2.png';

    const icon = L.divIcon({
      className: 'pm-loc-icon',
      html: `<img src="${preview}" alt="${loc.name || loc.id}">`,
      iconSize: [70, 70],
      iconAnchor: [35, 60]
    });

    const marker = L.marker(coords, { icon }).addTo(map);

    const popupHtml = `
      <div class="pm-popup">
        <div class="pm-popup-title">${loc.name || loc.id}</div>
        <div class="pm-popup-sub">${loc.bio || ''}</div>
        ${
          mem.content
            ? `<div class="pm-popup-content">${mem.content}</div>`
            : ''
        }
      </div>
    `;

    marker.bindPopup(popupHtml, {
      closeButton: false,
      offset: [0, -8]
    });

    bounds.extend(coords);
  });

  if (bounds.isValid()) {
    map.fitBounds(bounds, { padding: [60, 60] });
  }
}

/**
 * Update header UI with player data.
 */
function updateHeader(player) {
  const nameEl = document.getElementById('pmPlayerName');
  const subEl = document.getElementById('pmHeaderSub');

  if (player?.name) {
    nameEl.textContent = player.name;
  }

  if (player?.demo_player) {
    subEl.textContent =
      'demo player · personal locations & memories';
  } else {
    subEl.textContent =
      `logged-in player · personal locations & memories`;
  }
}

/**
 * Main bootstrap.
 */
async function bootstrap() {
  initMap();

  const playerPid = DEMO_PLAYER_PID;

  const player = await fetchPlayer(playerPid);
  updateHeader(player);

  const memories = await fetchMemories(playerPid);

  // Collect location ids from memories
  const locationIds = [
    ...new Set(
      memories
        .map((m) => m.location_id)
        .filter((id) => typeof id === 'string' && id.length > 0)
    )
  ];

  const locations = await fetchLocationsByIds(locationIds);
  const locationsById = {};
  locations.forEach((loc) => {
    locationsById[loc.id] = loc;
  });

  renderMemoriesOnMap(memories, locationsById);

  // Player pin: use home_lat/home_lng if available
  if (player && typeof player.home_lat === 'number' && typeof player.home_lng === 'number') {
    const pinCoords = [player.home_lat, player.home_lng];

    const playerIcon = L.divIcon({
      className: '',
      html: `
        <div class="pm-player-pin">
          <img src="/shared/assets/fallbackIsoAvatar.webp" alt="${player.name || player.pid}">
        </div>
      `,
      iconSize: [52, 52],
      iconAnchor: [26, 46]
    });

    const pinMarker = L.marker(pinCoords, { icon: playerIcon }).addTo(map);
    pinMarker.bindPopup(
      `<div class="pm-popup">
        <div class="pm-popup-title">${player.name || player.pid}</div>
        <div class="pm-popup-sub">current home position</div>
      </div>`,
      { closeButton: false, offset: [0, -8] }
    );

    // If there are no memories yet, center on player pin
    if (!memories.length) {
      map.setView(pinCoords, 5);
    }
  }
}


bootstrap().catch((err) => {
  console.error('Error bootstrapping player map', err);
});
