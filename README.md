# Short distance 📍

https://pholx.github.io/Short_distance/

Find places nearby within a short distance. Uses OpenStreetMap data via Overpass API and renders a dark vector map with MapLibre GL & Leaflet.

## Features
- Search for attractions, activities, food, coffee & snacks, essentials, and facilities within a chosen radius (default 100 m).
- Smart ranking by distance, max 5 results per category.
- Tap a result to focus on the map; tap "Navigate" to open Google Maps with GPS directions.
- Works offline after first load (map tiles cached automatically).
- No API keys required.

## Categories
- **📸 Attractions** – temples, churches, historic sites, towers, lighthouses, viewpoints, museums
- **🎯 Activities** – parks, sports centres, cinemas, theatres, nightlife, zoos, theme parks
- **🍽️ Food** – restaurants, fast food, bars, pubs, delis, markets
- **☕ Coffee & Snacks** – cafés, ice cream, bakeries, pastry shops
- **🛒 Essentials** – pharmacies, banks, ATMs, supermarkets, convenience stores
- **🚻 Facilities** – toilets, drinking water, parking, fuel, EV charging

## Tech
- Leaflet + MapLibre GL + OpenFreeMap
- Overpass API (multiple fallback servers)
- Service Worker for offline caching
