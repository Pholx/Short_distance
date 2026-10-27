import { escapeHtml, getEmoji } from './ui.js';

export function createMap(elementId) {
  const map = L.map(elementId, {
    zoomControl: false,
    minZoom: 2
  }).setView([20, 0], 2);

  map.getContainer().addEventListener('contextmenu', (e) => e.preventDefault());

  const glLayer = L.maplibreGL({
    style: 'https://tiles.openfreemap.org/styles/dark'
  }).addTo(map);

  map.attributionControl.addAttribution(
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
    '© <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> ' +
    '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
  );

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  let userMarker = null;
  const resultsLayer = L.layerGroup().addTo(map);
  let currentMarkers = [];

  function makeEmojiIcon(emoji) {
    return L.divIcon({
      className: '',
      html: `<div style="font-size:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.65));text-align:center;line-height:1;">${emoji}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  function setUser(lat, lon, zoom = 16, pan = true) {
    if (userMarker) userMarker.setLatLng([lat, lon]);
    else userMarker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.35);"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    }).addTo(map);

    if (pan) map.setView([lat, lon], zoom, { animate: false });
  }

  function clearResults() {
    resultsLayer.clearLayers();
    currentMarkers = [];
  }

  function addResults(places) {
    clearResults();
    const bounds = [];
    for (const place of places) {
      const emoji = getEmoji(place.category);
      const marker = L.marker([place.lat, place.lon], { icon: makeEmojiIcon(emoji) });
      marker.bindPopup(`<b>${escapeHtml(place.name)}</b><br>${place.distance.toFixed(0)} m`);
      marker.addTo(resultsLayer);
      currentMarkers.push({ marker, place });
      bounds.push([place.lat, place.lon]);
    }
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
  }

  function focusPlace(place) {
    const found = currentMarkers.find(m => m.place.id === place.id);
    if (found) {
      map.setView([place.lat, place.lon], 17);
      found.marker.openPopup();
    }
  }

  function once(event, cb) {
    if (event === 'idle') {
      const gl = glLayer.getMaplibreMap?.();
      if (!gl) { setTimeout(cb, 100); return; }
      let done = false;
      const finish = () => { if (!done) { done = true; cb(); } };
      setTimeout(() => {
        if (done) return;
        if (typeof gl.loaded === 'function' && gl.loaded()) { finish(); return; }
        try { gl.once('idle', finish); } catch { finish(); return; }
        setTimeout(finish, 2500);
      }, 100);
    } else {
      map.once(event, cb);
    }
  }

  const resizeObserver = new ResizeObserver(() => map.invalidateSize());
  resizeObserver.observe(map.getContainer());

  return {
    map,
    setUser,
    clearResults,
    addResults,
    focusPlace,
    once,
    invalidate: () => map.invalidateSize()
  };
}