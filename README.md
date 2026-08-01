# Nearby Finder Pro 🗺️

A premium, production-ready, client-side web application designed to help users look up locations globally, inspect them on an interactive map, and launch targeted nearby category overlays on Google Maps.

Inspired by premium visual interfaces like Apple, Stripe, Linear, and Framer, the app uses modern vanilla HTML5, CSS3, and ES2023 JavaScript with glassmorphic cards, aurora gradient backdrops, floating blurred visual blobs, and customized controls.

## ✨ Premium Features

- **Geographical Search**: Supports lookup of ZIP codes, Postal codes, and City names worldwide using the free, open **OpenStreetMap Nominatim API**.
- **Interactive Leaflet Map**: Small, highly responsive map featuring markers, coordinates, and custom popups. Theme styles (dark/light) adjust automatically.
- **Bento Category Grid**: Clickable cards representing 37 common categories (restaurants, hotels, hospitals, cafes, supermarkets, parks, transit systems, etc.) with custom hover states, glow animations, and arrow cues.
- **Google Maps Integration**: Dynamically compiles safe nearby search query links to avoid privacy leaks, scraping, or heavy API platform usage, opening in separate tabs.
- **SaaS Search Anything Panel**: A direct lookup console with dynamic quick-search buttons for popular brands and categories.
- **Durable Client Persistence**: Stores up to 10 recent searches and allows users to save dynamic, persistent "favorite" locations using `LocalStorage`.
- **Theme Manager**: Gorgeous, dark-mode-first aesthetic with a seamless toggle to high-contrast light mode.
- **Copy & Share Actions**: Fast click actions to copy coordinates, address, or produce shareable link queries (e.g., `?search=90210&country=US`) that render automatically on destination loads.

## 🛠️ Technology Stack

- **Markup**: HTML5 (structured, semantic elements with unique target IDs)
- **Styling**: CSS3 (with extensive Custom Properties, fluid transitions, animations, and bento layouts)
- **Scripting**: Vanilla JavaScript (ES2023 ES modules, fully modularized)
- **Integrations**:
  - OpenStreetMap Nominatim API (Geographical metadata)
  - LeafletJS (Map renderer)
  - Lucide Icons (Premium vector icons)
  - Google Fonts (Inter, Outfit, JetBrains Mono)

## 📁 File Structure

- `index.html`: Main layout structure, CDNs, bento containers, form layers.
- `style.css`: Comprehensive custom styles, layout grids, skeletons, toasts, keyframes.
- `script.js`: State manager, search timeout control, localStorage syncing, Leaflet controllers.
- `countries.js`: ES module housing ~200 world countries mapped by standard ISO codes.
- `README.md`: System overview and architecture guide.

---
Created with precision as a high-fidelity SaaS prototype. Everything is fully client-side and runs instantly on load.
