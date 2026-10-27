import * as ui from './ui.js';
import { searchNearby } from './nearby.js';
import { createMap } from './map.js';

const $ = id => document.getElementById(id);
const el = {
  mapOverlay: $('map-overlay'),
  coord: $('coord-display'),
  radiusInput: $('radius-input'),
  searchAllBtn: $('btn-search-all'),
  categoryBtns: document.querySelectorAll('.cat-btn'),
  resultsContainer: $('results-container'),
  loading: $('loading'),
  status: $('status')
};

const CATEGORY_ORDER = ['attraction', 'activity', 'food', 'coffee', 'essentials', 'facilities'];
const CATEGORY_NAMES = {
  attraction: 'Attractions',
  activity: 'Activities',
  food: 'Food',
  coffee: 'Coffee & Snacks',
  essentials: 'Essentials',
  facilities: 'Facilities'
};

const RADIUS_KEY = 'short-distance:radius';
const DEFAULT_RADIUS = 100;

let mapHandle = null;
let currentLat = null, currentLon = null;
let activeCategory = null;   // null = ingen aktiv, 'all' = Short distance, annars kategori
let isSearching = false;

// Online/Offline
function updateOnlineStatus() {
  const dot = $('status-dot');
  const label = $('status-label');
  if (!dot || !label) return;
  if (navigator.onLine) {
    dot.className = 'w-2 h-2 rounded-full bg-emerald-500';
    label.textContent = 'Online';
  } else {
    dot.className = 'w-2 h-2 rounded-full bg-orange-500';
    label.textContent = 'Offline';
  }
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW reg fail', e));
}

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('btn-install')?.classList.remove('hidden');
});
$('btn-install')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btn-install')?.classList.add('hidden');
});

// --- Radie: spara & återställ ---
function loadRadius() {
  try {
    const v = parseInt(localStorage.getItem(RADIUS_KEY), 10);
    if (!isNaN(v) && v >= 10 && v <= 1000) {
      el.radiusInput.value = v;
      return;
    }
  } catch {}
  el.radiusInput.value = DEFAULT_RADIUS;
}
function saveRadius(v) {
  try { localStorage.setItem(RADIUS_KEY, String(v)); } catch {}
}
el.radiusInput.addEventListener('change', () => {
  const v = parseInt(el.radiusInput.value, 10);
  if (!isNaN(v) && v >= 10 && v <= 1000) saveRadius(v);
});
loadRadius();

// --- Aktiv kategori-markering ---
function setActiveCategory(cat) {
  activeCategory = cat;
  el.categoryBtns.forEach(btn => {
    const active = btn.dataset.category === cat;
    btn.classList.toggle('bg-blue-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('border-blue-500', active);
    btn.classList.toggle('bg-gray-800', !active);
    btn.classList.toggle('text-gray-400', !active);
    btn.classList.toggle('border-gray-700', !active);
  });
  // "Short distance"-knappen markeras när allt söks
  el.searchAllBtn.classList.toggle('ring-2', cat === 'all');
  el.searchAllBtn.classList.toggle('ring-blue-400', cat === 'all');
}

// --- Lås alla sök-knappar under pågående sökning ---
function setSearching(searching) {
  isSearching = searching;
  el.searchAllBtn.disabled = searching;
  el.categoryBtns.forEach(btn => (btn.disabled = searching));
  el.searchAllBtn.classList.toggle('opacity-50', searching);
  el.searchAllBtn.classList.toggle('cursor-not-allowed', searching);
  el.categoryBtns.forEach(btn => {
    btn.classList.toggle('opacity-50', searching);
    btn.classList.toggle('cursor-not-allowed', searching);
  });
}

// Boot
window.addEventListener('load', () => {
  mapHandle = createMap('map');
  mapHandle.once('idle', () => el.mapOverlay.classList.add('hidden'));
  setTimeout(() => el.mapOverlay.classList.add('hidden'), 2500);
  updateLocation();
});

function updateLocation() {
  if (!mapHandle) return;
  el.coord.innerText = 'Searching...';

  if (!('geolocation' in navigator)) {
    el.coord.innerText = 'GPS not supported';
    ui.showToast('GPS not supported in this browser.', 'error');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      currentLat = pos.coords.latitude;
      currentLon = pos.coords.longitude;
      el.coord.innerText = `${currentLat.toFixed(5)}, ${currentLon.toFixed(5)}`;
      mapHandle.setUser(currentLat, currentLon);
    },
    err => {
      console.warn(err);
      el.coord.innerText = 'GPS unavailable';
      ui.showToast('No GPS. Please enable location services.', 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

async function performSearch(category) {
  if (isSearching) return;
  if (currentLat == null) {
    ui.showToast('Waiting for GPS. Please try again.', 'error');
    return;
  }

  const radius = parseInt(el.radiusInput.value, 10) || DEFAULT_RADIUS;
  if (radius < 10 || radius > 1000) {
    ui.showToast('Radius must be between 10 and 1000 meters.', 'error');
    return;
  }
  saveRadius(radius);

  setActiveCategory(category);
  setSearching(true);
  el.loading.classList.remove('hidden');
  el.resultsContainer.innerHTML = '';
  el.status.innerText = 'Searching...';

  // Om Overpass är långsamt (>5s) – visa en lugnande text
  const slowTimer = setTimeout(() => {
    el.status.innerText = 'Still searching... (Overpass can take a few seconds)';
  }, 5000);

  try {
    const results = await searchNearby(currentLat, currentLon, radius, category);
    clearTimeout(slowTimer);
    renderResults(results, radius, category);
    el.status.innerText = '';
  } catch (err) {
    clearTimeout(slowTimer);
    if (err.name === 'AbortError') return; // avbruten av ny sökning – tyst
    console.error(err);
    ui.showToast('Search failed. Please try again.', 'error');
    el.status.innerText = 'Search failed.';
  } finally {
    el.loading.classList.add('hidden');
    setSearching(false);
  }
}

function renderResults(results, radius, searchCategory) {
  el.resultsContainer.innerHTML = '';
  let hasResults = false;

  for (const cat of CATEGORY_ORDER) {
    const places = results[cat];
    if (!places || places.length === 0) continue;
    hasResults = true;

    const section = document.createElement('div');
    section.className = 'mb-6';
    section.innerHTML = `<h2 class="text-lg font-bold text-gray-200 mb-2 flex items-center gap-2">
      <span>${ui.getEmoji(cat)}</span> ${CATEGORY_NAMES[cat]}
    </h2>`;

    const list = document.createElement('div');
    list.className = 'space-y-2';

    for (const place of places) {
      const item = document.createElement('div');
      item.className = 'bg-gray-800 rounded-xl p-3 border border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-700 transition-colors';
      item.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="text-xl bg-gray-900 p-1.5 rounded-lg shrink-0">${ui.getEmoji(cat)}</div>
          <div class="min-w-0">
            <h3 class="text-gray-100 font-bold text-sm leading-tight truncate">${ui.escapeHtml(place.name)}</h3>
            <p class="text-[10px] text-gray-400">${place.distance.toFixed(0)} m away</p>
          </div>
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}" target="_blank" rel="noopener" class="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0" onclick="event.stopPropagation()">
          Navigate
        </a>
      `;
      item.addEventListener('click', () => mapHandle.focusPlace(place));
      list.appendChild(item);
    }

    section.appendChild(list);
    el.resultsContainer.appendChild(section);
  }

  if (!hasResults) {
    // Kategorispecifikt meddelande
    const label = searchCategory === 'all'
      ? ''
      : ` ${CATEGORY_NAMES[searchCategory].toLowerCase()}`;
    el.resultsContainer.innerHTML = `<div class="text-center py-8 text-gray-400">
      <p>No${label} places found within ${radius} meters.</p>
      <p class="text-sm mt-1">Try increasing the radius.</p>
    </div>`;
  }

  const allPlaces = Object.values(results).flat();
  mapHandle.addResults(allPlaces);
}

// Event listeners
el.searchAllBtn.addEventListener('click', () => performSearch('all'));
el.categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => performSearch(btn.dataset.category));
});
$('btn-refresh').addEventListener('click', updateLocation);