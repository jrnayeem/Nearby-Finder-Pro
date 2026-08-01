// script.js - Premium client-side logic for Nearby Finder Pro
import { countries } from './countries.js';

// ==========================================================================
// 1. App State & Constants
// ==========================================================================

const STATE = {
  currentLocation: {
    name: "Washington, D.C.",
    city: "Washington",
    state: "District of Columbia",
    district: "N/A",
    postalCode: "20500",
    country: "United States",
    countryCode: "US",
    lat: 38.8977,
    lon: -77.0365,
    formattedAddress: "White House, 1600, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States"
  },
  selectedCountry: { name: "United States", code: "US" },
  favorites: [],
  recents: [],
  map: null,
  marker: null,
  theme: "dark",
  usedMobileNumbers: new Set(),
  currentGeneratedMobileNumbers: []
};

const NOMINATIM_TIMEOUT_MS = 8000;

// ==========================================================================
// 2. DOM Elements Selection
// ==========================================================================

const els = {
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  utcClock: document.getElementById('utc-clock'),
  
  // Search inputs & dropdown
  searchForm: document.getElementById('location-search-form'),
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  countryDropdownTrigger: document.getElementById('country-dropdown-trigger'),
  countryDropdownPanel: document.getElementById('country-dropdown-panel'),
  countrySearchInput: document.getElementById('country-search-input'),
  countryList: document.getElementById('country-list'),
  selectedCountryFlag: document.getElementById('selected-country-flag'),
  selectedCountryName: document.getElementById('selected-country-name'),
  exampleChips: document.querySelectorAll('.example-chip'),
  
  // Results panel
  skeletonLoader: document.getElementById('skeleton-loader'),
  locationDetailsContent: document.getElementById('location-details-content'),
  locationBadgePostal: document.getElementById('location-badge-postal'),
  locationNameDisplay: document.getElementById('location-name-display'),
  locationHierarchyDisplay: document.getElementById('location-hierarchy-display'),
  favoriteToggleBtn: document.getElementById('favorite-toggle-btn'),
  
  // Meta values
  valCity: document.getElementById('val-city'),
  valState: document.getElementById('val-state'),
  valPostal: document.getElementById('val-postal'),
  valCountry: document.getElementById('val-country'),
  valLat: document.getElementById('val-lat'),
  valLong: document.getElementById('val-long'),
  
  // Action buttons
  actionBtnGmaps: document.getElementById('action-btn-gmaps'),
  actionBtnOsm: document.getElementById('action-btn-osm'),
  actionBtnCopyAddress: document.getElementById('action-btn-copy-address'),
  actionBtnCopyCoords: document.getElementById('action-btn-copy-coords'),
  actionBtnShare: document.getElementById('action-btn-share'),
  
  // Sidebar lists
  favoritesList: document.getElementById('favorites-list'),
  favoritesCount: document.getElementById('favorites-count'),
  recentsList: document.getElementById('recents-list'),
  clearRecentsBtn: document.getElementById('clear-recents-btn'),
  
  // Custom search
  customSearchForm: document.getElementById('custom-search-form'),
  customSearchInput: document.getElementById('custom-search-input'),
  quickChips: document.querySelectorAll('.quick-chip-btn'),
  
  // Toast notifications
  toastNotification: document.getElementById('toast-notification'),
  toastErrorText: document.getElementById('toast-error-text'),
  closeToastBtn: document.getElementById('close-toast-btn'),
  
  // Map overlays
  mapLoading: document.getElementById('map-loading'),
  
  // Category cards bento grid
  categoriesGrid: document.getElementById('categories-grid-container'),

  // Mobile Generator
  copyAllMobileBtn: document.getElementById('copy-all-mobile-btn'),
  mobileNumbersList: document.getElementById('mobile-numbers-list'),
  mobileGenCountryBadge: document.getElementById('mobile-gen-country-badge')
};

// ==========================================================================
// 3. Helper Functions
// ==========================================================================

// Utility flag emoji generator from ISO 2-letter country code
function getFlagEmoji(countryCode) {
  if (!countryCode) return "📍";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch (e) {
    return "📍";
  }
}

// Format UTC time for the live clock
function updateLiveClock() {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  if (els.utcClock) {
    els.utcClock.textContent = `UTC ${hours}:${minutes}`;
  }
}

// Standard copy to clipboard utility with UI status feedback
async function copyToClipboard(text, buttonEl, successText = "Copied!") {
  const originalHTML = buttonEl.innerHTML;
  try {
    await navigator.clipboard.writeText(text);
    buttonEl.innerHTML = `<i data-lucide="check" class="action-icon"></i> <span>${successText}</span>`;
    lucide.createIcons();
    buttonEl.classList.add('text-primary');
    setTimeout(() => {
      buttonEl.innerHTML = originalHTML;
      buttonEl.classList.remove('text-primary');
      lucide.createIcons();
    }, 2000);
  } catch (err) {
    console.error("Clipboard copy failed: ", err);
  }
}

// Trigger error message toast notification
function showToast(message) {
  if (!els.toastNotification) return;
  els.toastErrorText.textContent = message;
  els.toastNotification.classList.remove('hidden');
  
  // Auto-dismiss after 6 seconds
  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    hideToast();
  }, 6000);
}

function hideToast() {
  if (els.toastNotification) {
    els.toastNotification.classList.add('hidden');
  }
}

// Generate URL encoding helper for nearby search query
function getGoogleMapsSearchUrl(query) {
  const loc = STATE.currentLocation;
  // Generate a beautiful searchable query combining user category/place with address components
  let locationParts = [];
  
  if (loc.city && loc.city !== "N/A") {
    locationParts.push(loc.city);
  }
  
  if (loc.district && loc.district !== "N/A") {
    locationParts.push(loc.district);
  } else if (loc.state && loc.state !== "N/A") {
    locationParts.push(loc.state);
  }
  
  if (loc.country && loc.country !== "N/A") {
    locationParts.push(loc.country);
  }
  
  if (locationParts.length === 0) {
    locationParts.push(loc.name);
  }
  
  const nearText = locationParts.join(', ');
  const fullSearchString = `${query} near ${nearText}`;
  return `https://www.google.com/maps/search/${encodeURIComponent(fullSearchString)}/@${loc.lat},${loc.lon},14z`;
}

// ==========================================================================
// 4. Custom Country Dropdown Engine
// ==========================================================================

function initCountryDropdown() {
  // Populate country list
  renderCountryDropdownList(countries);

  // Toggle dropdown open
  els.countryDropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = els.countryDropdownTrigger.parentElement.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
      els.countryDropdownTrigger.parentElement.classList.add('open');
      els.countrySearchInput.focus();
    }
  });

  // Filter countries on input
  els.countrySearchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = countries.filter(c => c.name.toLowerCase().includes(term));
    renderCountryDropdownList(filtered);
  });

  // Close dropdown on click outside
  document.addEventListener('click', () => {
    closeAllDropdowns();
  });

  // Prevent dropdown panel closing when clicking search input
  els.countryDropdownPanel.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

function renderCountryDropdownList(countryArray) {
  els.countryList.innerHTML = '';
  if (countryArray.length === 0) {
    els.countryList.innerHTML = '<li class="dropdown-item text-muted">No countries found</li>';
    return;
  }

  countryArray.forEach(country => {
    const li = document.createElement('li');
    li.className = 'dropdown-item';
    if (STATE.selectedCountry.code === country.code) {
      li.classList.add('selected');
    }
    const flag = getFlagEmoji(country.code);
    li.innerHTML = `<span>${flag}</span> <span class="country-name-text">${country.name}</span>`;
    
    li.addEventListener('click', () => {
      selectCountry(country);
      closeAllDropdowns();
    });
    els.countryList.appendChild(li);
  });
}

function selectCountry(country) {
  STATE.selectedCountry = country;
  els.selectedCountryFlag.textContent = getFlagEmoji(country.code);
  els.selectedCountryName.textContent = country.name;
  
  // Update selection in list elements
  const items = els.countryList.querySelectorAll('.dropdown-item');
  items.forEach(item => {
    const nameText = item.querySelector('.country-name-text');
    if (nameText && nameText.textContent === country.name) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

function closeAllDropdowns() {
  const dropdowns = document.querySelectorAll('.custom-dropdown');
  dropdowns.forEach(d => d.classList.remove('open'));
}

// ==========================================================================
// 5. Leaflet Map Initialization & Management
// ==========================================================================

function initLeafletMap() {
  const loc = STATE.currentLocation;
  
  // Create map instance
  STATE.map = L.map('leaflet-map', {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([loc.lat, loc.lon], 13);

  // Load OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(STATE.map);

  // Add marker
  const popupContent = `
    <div class="leaflet-popup-text-bold">${loc.city || loc.name}</div>
    <div class="leaflet-popup-text-coords">${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
  `;
  
  STATE.marker = L.marker([loc.lat, loc.lon]).addTo(STATE.map)
    .bindPopup(popupContent)
    .openPopup();
}

function updateLeafletMapView() {
  const loc = STATE.currentLocation;
  if (!STATE.map) {
    initLeafletMap();
    return;
  }

  els.mapLoading.classList.remove('hidden');
  
  // Pan and Zoom
  STATE.map.setView([loc.lat, loc.lon], 14, {
    animate: true,
    duration: 1.0
  });

  // Update marker & popup
  STATE.marker.setLatLng([loc.lat, loc.lon]);
  
  const popupContent = `
    <div class="leaflet-popup-text-bold">${loc.city || loc.name}</div>
    <div class="leaflet-popup-text-coords">${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}</div>
    <div class="leaflet-popup-text-coords">${loc.country}</div>
  `;
  STATE.marker.getPopup().setContent(popupContent);
  STATE.marker.openPopup();

  setTimeout(() => {
    els.mapLoading.classList.add('hidden');
    // Ensure Leaflet recalculates bounds properly
    STATE.map.invalidateSize();
  }, 400);
}

// ==========================================================================
// 6. Nominatim Geo-Lookup Engine
// ==========================================================================

// Smart Location Parser helper function
function parseNominatimLocation(item, queryString) {
  const addr = item.address || {};
  
  // 1. Extract the most meaningful locality using priority list
  const localityFields = [
    'city',
    'town',
    'municipality',
    'suburb',
    'city_district',
    'borough',
    'village',
    'hamlet',
    'locality'
  ];
  
  let locality = null;
  for (const field of localityFields) {
    if (addr[field] && String(addr[field]).trim() !== "") {
      locality = String(addr[field]).trim();
      break;
    }
  }
  
  // 2. Extract district from county or district
  let district = null;
  if (addr.district && String(addr.district).trim() !== "") {
    district = String(addr.district).trim();
  } else if (addr.county && String(addr.county).trim() !== "") {
    district = String(addr.county).trim();
  }
  
  // 3. Extract state from state or state_district or region or province
  let state = null;
  if (addr.state && String(addr.state).trim() !== "") {
    state = String(addr.state).trim();
  } else if (addr.state_district && String(addr.state_district).trim() !== "") {
    state = String(addr.state_district).trim();
  } else if (addr.region && String(addr.region).trim() !== "") {
    state = String(addr.region).trim();
  } else if (addr.province && String(addr.province).trim() !== "") {
    state = String(addr.province).trim();
  }
  
  // 4. If city (locality) is still unavailable, parse the display_name string and extract the first meaningful populated place.
  if (!locality && item.display_name) {
    const parts = item.display_name.split(',').map(p => p.trim());
    const countryName = addr.country || parts[parts.length - 1];
    
    for (const part of parts) {
      const cleanPart = part.trim();
      if (!cleanPart) continue;
      
      // Skip pure numbers (e.g. street numbers/house numbers)
      if (/^\d+$/.test(cleanPart)) continue;
      
      // Skip postcodes (e.g. "90210", "SW1A 1AA")
      if (/^\d{3,10}$/.test(cleanPart)) continue;
      if (/^[A-Z0-9]{3,5}\s?[A-Z0-9]{3,5}$/i.test(cleanPart)) continue;
      
      // Skip country name
      if (countryName && cleanPart.toLowerCase() === countryName.toLowerCase()) continue;
      
      // Skip state/region names
      if (state && cleanPart.toLowerCase() === state.toLowerCase()) continue;
      
      // Skip district/county names
      if (district && cleanPart.toLowerCase() === district.toLowerCase()) continue;
      
      // Skip parts containing street indicators
      const streetRegex = /\b(street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|highway|hwy|square|sq|place|pl|terrace|ter|parkway|pkwy|building|bldg|floor|fl|suite|ste|room|rm|apartment|apt|no|nr|route|rt)\b/i;
      if (streetRegex.test(cleanPart)) continue;
      
      // Skip parts that are just number ranges or contain coordinates
      if (/^[\d-\s/]+$/.test(cleanPart)) continue;
      
      // If we made it past these filters, this is our best populated place candidate!
      locality = cleanPart;
      break;
    }
    
    // As an ultimate fallback if everything got filtered out, take the first segment
    if (!locality && parts.length > 0) {
      locality = parts[0];
    }
  }
  
  return {
    locality: locality || "N/A",
    district: district || "N/A",
    state: state || "N/A"
  };
}

function countriesMatch(code1, code2) {
  if (!code1 || !code2) return true;
  let c1 = code1.toLowerCase().trim();
  let c2 = code2.toLowerCase().trim();
  if (c1 === 'uk') c1 = 'gb';
  if (c2 === 'uk') c2 = 'gb';
  return c1 === c2;
}

function isExactPostcodeMatch(itemPostcode, query, displayName) {
  if (!itemPostcode) {
    if (!displayName) return false;
    const cleanQ = String(query).replace(/[\s-]/g, "").toLowerCase();
    const parts = displayName.split(',').map(p => p.replace(/[\s-]/g, "").toLowerCase().trim());
    return parts.some(p => p === cleanQ);
  }
  const cleanPost = String(itemPostcode).replace(/[\s-]/g, "").toLowerCase();
  const cleanQ = String(query).replace(/[\s-]/g, "").toLowerCase();
  if (cleanPost === cleanQ) return true;
  if (cleanPost.length > cleanQ.length && cleanQ.length >= 4 && cleanPost.startsWith(cleanQ)) {
    return true;
  }
  if (cleanQ.length > cleanPost.length && cleanPost.length >= 4 && cleanQ.startsWith(cleanPost)) {
    return true;
  }
  return false;
}

function isProbablyPostalCode(str) {
  const clean = str.trim();
  if (!clean) return false;
  if (!/\d/.test(clean)) return false;
  if (clean.length > 12) return false;
  return /^[a-zA-Z0-9\s-]+$/.test(clean);
}

function normalizeLocationName(name) {
  if (!name) return "";
  let n = name.trim();
  // Map various forms of "Chapinawabganj" or "Chapinawbganj" to "Chapai Nawabganj"
  if (/Chapinawb/i.test(n) || /Chapinawab/i.test(n)) {
    return "Chapai Nawabganj";
  }
  return n;
}

async function clientSidePostalLookup(countryCodeVal, queryString, countryName) {
  const countryCode = countryCodeVal.trim().toUpperCase();
  const normalizedCode = queryString.trim().toUpperCase().replace(/[\s-]/g, "");

  const COUNTRY_NAME_MAP = {
    US: "United States",
    GB: "United Kingdom",
    UK: "United Kingdom",
    PL: "Poland",
    DE: "Germany",
    FR: "France",
    AT: "Austria",
    NL: "Netherlands",
    BE: "Belgium",
    IT: "Italy",
    ES: "Spain",
    SE: "Sweden",
    CA: "Canada",
    AU: "Australia",
    BD: "Bangladesh",
    NZ: "New Zealand",
    IN: "India",
    CH: "Switzerland",
    IE: "Ireland",
    DK: "Denmark",
    NO: "Norway",
    FI: "Finland",
    MX: "Mexico",
    ZA: "South Africa",
    BR: "Brazil",
  };

  // A. postcodes.io (For UK/GB)
  if (countryCode === "GB" || countryCode === "UK") {
    try {
      const apiRes = await fetch(
        `https://api.postcodes.io/postcodes/${encodeURIComponent(normalizedCode)}`
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data && data.result) {
          const r = data.result;
          return {
            latitude: parseFloat(r.latitude),
            longitude: parseFloat(r.longitude),
            postalCode: r.postcode,
            city: r.admin_district || r.parish || "London",
            state: r.region || r.european_electoral_region || "England",
            district: r.admin_ward || "N/A",
            country: "United Kingdom",
            countryCode: "GB"
          };
        }
      }
    } catch (e) {
      console.warn("Client-side postcodes.io lookup failed:", e);
    }
  }

  // B. zippopotam.us (For supported list of countries)
  const zippoSupported = [
    "US", "CA", "MX", "PR", "FR", "DE", "AT", "CH", "LI", "LU", "BE", "NL", "IT", "ES", "PT",
    "IE", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "RU", "TR", "GR", "IN", "BD",
    "LK", "PK", "AU", "NZ", "ZA", "BR", "AR", "CO", "CL", "PE", "VE"
  ];
  if (zippoSupported.includes(countryCode)) {
    try {
      let zipQuery = normalizedCode;
      // Format Poland postcode
      if (countryCode === "PL" && /^\d{5}$/.test(normalizedCode)) {
        zipQuery = normalizedCode.substring(0, 2) + "-" + normalizedCode.substring(2);
      }
      const apiRes = await fetch(
        `https://api.zippopotam.us/${countryCode.toLowerCase()}/${encodeURIComponent(zipQuery)}`
      );
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data && data.places && data.places.length > 0) {
          const place = data.places[0];
          const resolvedCountry = data.country || COUNTRY_NAME_MAP[countryCode] || countryName || countryCode;
          return {
            latitude: parseFloat(place.latitude),
            longitude: parseFloat(place.longitude),
            postalCode: data["post code"] || zipQuery,
            city: place["place name"],
            state: place["state"] || "N/A",
            district: "N/A",
            country: resolvedCountry,
            countryCode: countryCode
          };
        }
      }
    } catch (e) {
      console.warn("Client-side zippopotam.us lookup failed:", e);
    }
  }

  // C. GeoNames-postal-code exact match via OpenDataSoft
  try {
    let queryParts = [`postal_code = "${queryString.trim().toUpperCase()}"`, `postal_code = "${normalizedCode}"`];
    if (/^\d{5}$/.test(normalizedCode)) {
      const withDash = normalizedCode.substring(0, 2) + "-" + normalizedCode.substring(2);
      queryParts.push(`postal_code = "${withDash}"`);
    }
    queryParts = [...new Set(queryParts)];
    const whereClause = `(${queryParts.join(" or ")}) and country_code = "${countryCode}"`;
    const apiRes = await fetch(
      `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/geonames-postal-code/records?where=${encodeURIComponent(whereClause)}&limit=1`
    );
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && data.results && data.results.length > 0) {
        const record = data.results[0];
        const resolvedCountry = COUNTRY_NAME_MAP[countryCode] || record.country_code || countryName || countryCode;
        return {
          latitude: parseFloat(record.latitude),
          longitude: parseFloat(record.longitude),
          postalCode: record.postal_code,
          city: record.place_name || "N/A",
          state: record.admin_name1 || "N/A",
          district: record.admin_name2 || "N/A",
          country: resolvedCountry,
          countryCode: countryCode
        };
      }
    }
  } catch (e) {
    console.warn("Client-side OpenDataSoft geonames-postal-code lookup failed:", e);
  }

  // D. Nominatim OpenStreetMap search fallback (Universal, supports any postal code globally)
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(queryString.trim())}&countrycodes=${encodeURIComponent(countryCode)}&format=json&addressdetails=1&limit=1`;
    const apiRes = await fetch(osmUrl, {
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'NearbyFinderPro/1.0 (m.jrnayeem@gmail.com)'
      }
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data && Array.isArray(data) && data.length > 0) {
        const record = data[0];
        const addr = record.address || {};
        const resolvedCountry = COUNTRY_NAME_MAP[countryCode] || addr.country || countryName || countryCode;
        
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.hamlet || addr.county || "N/A";
        const state = addr.state || "N/A";
        const district = addr.state_district || addr.district || addr.county || "N/A";

        return {
          latitude: parseFloat(record.lat),
          longitude: parseFloat(record.lon),
          postalCode: addr.postcode || queryString.trim(),
          city: city,
          state: state,
          district: district,
          country: resolvedCountry,
          countryCode: countryCode
        };
      }
    }
  } catch (e) {
    console.warn("Client-side Nominatim OSM search fallback failed:", e);
  }

  return null;
}

async function performLocationLookup(queryString, countryCode) {
  // Set UI to loading state
  setLoadingState(true);
  hideToast();

  // 1. Read the ZIP Code & country
  const countryObj = countries.find(c => c.code.toUpperCase() === (countryCode || "").toUpperCase()) || STATE.selectedCountry;
  const countryName = countryObj ? countryObj.name : "";
  const countryCodeVal = countryObj ? countryObj.code : "";
  
  const isZipQuery = isProbablyPostalCode(queryString);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NOMINATIM_TIMEOUT_MS);

  let isSuccess = false;

  try {
    let verifiedResult = null;
    let fallbackToGeneralSearch = false;

    if (isZipQuery) {
      try {
        const response = await fetch('/api/postal-lookup', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            country: countryCodeVal,
            postalCode: queryString
          }),
          signal: controller.signal
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.success) {
            verifiedResult = {
              lat: data.latitude,
              lon: data.longitude,
              postalCode: data.postalCode,
              city: data.city,
              state: data.state,
              district: data.district || "N/A",
              country: data.country,
              countryCode: data.countryCode
            };
          }
        }
      } catch (e) {
        console.warn("Backend postal lookup failed, attempting client-side fallback:", e);
      }

      if (!verifiedResult) {
        const fallback = await clientSidePostalLookup(countryCodeVal, queryString, countryName);
        if (fallback) {
          verifiedResult = {
            lat: fallback.latitude,
            lon: fallback.longitude,
            postalCode: fallback.postalCode,
            city: fallback.city,
            state: fallback.state,
            district: fallback.district || "N/A",
            country: fallback.country,
            countryCode: fallback.countryCode
          };
        }
      }

      if (!verifiedResult) {
        console.warn("Postal Code precise APIs found nothing. Falling back to general search...");
        fallbackToGeneralSearch = true;
      }
    }

    if (!isZipQuery || fallbackToGeneralSearch) {
      // General city/location searches (non-ZIP/Postal query) - Use normal Nominatim fallback
      const fetchPromises = [];

      let searchQuery = queryString;
      if (countryName && !queryString.toLowerCase().includes(countryName.toLowerCase())) {
        searchQuery = `${queryString} ${countryName}`;
      }
      let freeFormUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&limit=10`;
      if (countryCodeVal) {
        freeFormUrl += `&countrycodes=${countryCodeVal.toLowerCase()}`;
      }
      fetchPromises.push(
        fetch(freeFormUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'NearbyFinderPro/1.0 (m.jrnayeem@gmail.com)'
          }
        }).then(res => res.ok ? res.json() : []).catch(() => [])
      );

      const results = await Promise.all(fetchPromises);
      const [freeFormData] = results;

      if (!freeFormData || freeFormData.length === 0) {
        throw new Error("Postal Code not found");
      }

      const selectedItem = freeFormData[0];
      const addr = selectedItem.address || {};
      verifiedResult = {
        lat: parseFloat(selectedItem.lat),
        lon: parseFloat(selectedItem.lon),
        postalCode: addr.postcode || (isZipQuery ? queryString : "N/A"),
        city: addr.city || addr.town || addr.village || "N/A",
        state: addr.state || "N/A",
        district: addr.county || "N/A",
        country: addr.country || countryName || "N/A",
        countryCode: addr.country_code ? addr.country_code.toUpperCase() : countryCodeVal
      };
    }

    clearTimeout(timeoutId);

    // D. Perform a Reverse Geocoding request using verified coordinates as final source of truth for administrative labels
    const finalLat = verifiedResult.lat;
    const finalLon = verifiedResult.lon;
    
    let locationObj;

    if (isZipQuery) {
      // For verified postal codes, use the direct verified results to ensure absolute accuracy without reverse geocoding distortion
      const formattedAddr = `${verifiedResult.city}, ${verifiedResult.district && verifiedResult.district !== "N/A" ? verifiedResult.district + ', ' : ''}${verifiedResult.state !== "N/A" ? verifiedResult.state + ', ' : ''}${verifiedResult.country}`;
      locationObj = {
        name: `${verifiedResult.city}, ${verifiedResult.country}`,
        city: verifiedResult.city,
        state: verifiedResult.state,
        district: verifiedResult.district || "N/A",
        postalCode: verifiedResult.postalCode,
        country: verifiedResult.country,
        countryCode: verifiedResult.countryCode,
        lat: finalLat,
        lon: finalLon,
        formattedAddress: formattedAddr
      };
    } else {
      let finalItem = {
        display_name: `${verifiedResult.city}, ${verifiedResult.state !== "N/A" ? verifiedResult.state + ', ' : ''}${verifiedResult.country}`,
        address: {
          postcode: verifiedResult.postalCode,
          city: verifiedResult.city,
          state: verifiedResult.state,
          country: verifiedResult.country,
          country_code: verifiedResult.countryCode.toLowerCase()
        },
        lat: finalLat,
        lon: finalLon
      };

      try {
        const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${finalLat}&lon=${finalLon}&format=json&addressdetails=1`;
        const revResponse = await fetch(reverseUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'NearbyFinderPro/1.0 (m.jrnayeem@gmail.com)'
          }
        });

        if (revResponse.ok) {
          const revData = await revResponse.json();
          if (revData && revData.address) {
            finalItem = {
              ...revData,
              lat: finalLat,
              lon: finalLon,
              address: {
                ...revData.address,
                postcode: verifiedResult.postalCode, // Enforce exact postcode
                country_code: verifiedResult.countryCode.toLowerCase() // Enforce exact country code
              }
            };
          }
        }
      } catch (revError) {
        console.warn("Reverse geocoding failed, falling back to verified postal code data:", revError);
      }

      const addr = finalItem.address || {};
      const postal = addr.postcode || verifiedResult.postalCode || "N/A";
      
      // Apply our smart location parser
      const parsedLoc = parseNominatimLocation(finalItem, queryString);
      
      // Normalize and clean up location strings if they match certain patterns
      parsedLoc.locality = normalizeLocationName(parsedLoc.locality || verifiedResult.city);
      parsedLoc.state = normalizeLocationName(parsedLoc.state || verifiedResult.state);
      parsedLoc.district = normalizeLocationName(parsedLoc.district || verifiedResult.district);

      // If city/locality is still unavailable/NA, use verifiedResult city/state
      if (!parsedLoc.locality || parsedLoc.locality === "N/A") {
        parsedLoc.locality = verifiedResult.city;
      }
      if (!parsedLoc.state || parsedLoc.state === "N/A") {
        parsedLoc.state = verifiedResult.state;
      }

      // For UK postcodes, ensure city/locality is London if Westminster/Greater London is detected
      if (addr.country_code === 'gb' || addr.country_code === 'uk') {
        if (finalItem.display_name && finalItem.display_name.includes("London")) {
          parsedLoc.locality = "London";
        }
      }

      // Parse location values
      locationObj = {
        name: finalItem.display_name || `${parsedLoc.locality}, ${parsedLoc.state !== "N/A" ? parsedLoc.state + ', ' : ''}${addr.country || verifiedResult.country}`,
        city: parsedLoc.locality,
        state: parsedLoc.state,
        district: parsedLoc.district,
        postalCode: postal,
        country: addr.country || verifiedResult.country || "N/A",
        countryCode: verifiedResult.countryCode,
        lat: finalLat,
        lon: finalLon,
        formattedAddress: finalItem.display_name || `${parsedLoc.locality}, ${parsedLoc.state !== "N/A" ? parsedLoc.state + ', ' : ''}${addr.country || verifiedResult.country}`
      };
    }

    // Update global state
    STATE.currentLocation = locationObj;

    // Automatically update selected country in dropdown to match the resolved location's country
    if (locationObj.countryCode) {
      const matchedCountry = countries.find(c => c.code.toUpperCase() === locationObj.countryCode.toUpperCase());
      if (matchedCountry && STATE.selectedCountry.code !== matchedCountry.code) {
        selectCountry(matchedCountry);
      }
    }

    // Display values to UI
    renderLocationDetails();
    
    // Update map marker
    updateLeafletMapView();

    // Add search to recent lists
    addSearchToRecents(locationObj);

    isSuccess = true;

  } catch (error) {
    console.error("Lookup failed: ", error);
    let errorMsg = "Unable to find location. Please check your spelling or try another ZIP.";
    if (error.name === 'AbortError') {
      errorMsg = "Request timed out. Please check your internet connection and try again.";
    } else if (error.message) {
      errorMsg = error.message;
    }
    showToast(errorMsg);
  } finally {
    setLoadingState(false, !isSuccess);
  }
}

function setLoadingState(isLoading, isError = false) {
  if (isLoading) {
    els.skeletonLoader.classList.remove('hidden');
    els.locationDetailsContent.classList.add('hidden');
    els.searchBtn.disabled = true;
    els.searchBtn.querySelector('.btn-text').textContent = "Searching...";
  } else {
    els.skeletonLoader.classList.add('hidden');
    if (!isError) {
      els.locationDetailsContent.classList.remove('hidden');
    } else {
      els.locationDetailsContent.classList.add('hidden');
    }
    els.searchBtn.disabled = false;
    els.searchBtn.querySelector('.btn-text').textContent = "Find Location";
  }
}

function renderLocationDetails() {
  const loc = STATE.currentLocation;

  // Header Title
  els.locationNameDisplay.textContent = loc.city !== "N/A" ? `${loc.city}, ${loc.country}` : loc.name.split(',')[0];
  els.locationHierarchyDisplay.textContent = loc.formattedAddress;
  
  // Badge
  els.locationBadgePostal.textContent = loc.postalCode !== "N/A" ? `Postal Code: ${loc.postalCode}` : "Detected Coordinate";

  // Table Details
  els.valCity.textContent = loc.city;
  els.valState.textContent = loc.district && loc.district !== "N/A" ? `${loc.district}, ${loc.state}` : loc.state;
  els.valPostal.textContent = loc.postalCode;
  els.valCountry.textContent = loc.country;
  els.valLat.textContent = loc.lat.toFixed(5);
  els.valLong.textContent = loc.lon.toFixed(5);

  // Setup Dynamic Action URLs
  // Google Maps Search link
  let locationParts = [];
  if (loc.city && loc.city !== "N/A") {
    locationParts.push(loc.city);
  }
  if (loc.district && loc.district !== "N/A") {
    locationParts.push(loc.district);
  } else if (loc.state && loc.state !== "N/A") {
    locationParts.push(loc.state);
  }
  if (loc.country && loc.country !== "N/A") {
    locationParts.push(loc.country);
  }
  if (locationParts.length === 0) {
    locationParts.push(loc.name);
  }
  const queryStr = locationParts.join(', ');
  els.actionBtnGmaps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;
  
  // OpenStreetMap link
  els.actionBtnOsm.href = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lon}#map=16/${loc.lat}/${loc.lon}`;

  // Toggle favorite icon state
  updateFavoriteIconState();

  // Trigger automatic generation of 5 local mobile numbers for the resolved location
  updateMobileNumberGeneratorUI(loc.countryCode, loc.country);

  // Highlight result with smooth entry animation
  els.locationDetailsContent.classList.remove('fade-in');
  void els.locationDetailsContent.offsetWidth; // Trigger reflow
  els.locationDetailsContent.classList.add('fade-in');
}

// ==========================================================================
// 7. Favorites & Recent Searches LocalStorage Managers
// ==========================================================================

function loadUserDataFromStorage() {
  // Favorites
  try {
    const savedFavs = localStorage.getItem('np_favorites');
    STATE.favorites = savedFavs ? JSON.parse(savedFavs) : [];
  } catch (e) {
    STATE.favorites = [];
  }
  
  // Recents
  try {
    const savedRecents = localStorage.getItem('np_recents');
    STATE.recents = savedRecents ? JSON.parse(savedRecents) : [];
  } catch (e) {
    STATE.recents = [];
  }

  renderFavoritesList();
  renderRecentsList();
}

// Save favorites helper
function saveFavoritesToStorage() {
  localStorage.setItem('np_favorites', JSON.stringify(STATE.favorites));
  renderFavoritesList();
  updateFavoriteIconState();
}

// Save recents helper
function saveRecentsToStorage() {
  localStorage.setItem('np_recents', JSON.stringify(STATE.recents));
  renderRecentsList();
}

// Add current location to favorites list
function toggleFavoriteCurrentLocation() {
  const loc = STATE.currentLocation;
  const index = STATE.favorites.findIndex(f => f.lat === loc.lat && f.lon === loc.lon);

  if (index >= 0) {
    // Already favorite, remove
    STATE.favorites.splice(index, 1);
  } else {
    // Add to favorites
    STATE.favorites.unshift({ ...loc, savedAt: new Date().toISOString() });
  }

  saveFavoritesToStorage();
}

function updateFavoriteIconState() {
  const loc = STATE.currentLocation;
  const isFav = STATE.favorites.some(f => f.lat === loc.lat && f.lon === loc.lon);
  if (isFav) {
    els.favoriteToggleBtn.classList.add('active');
    els.favoriteToggleBtn.title = "Saved in Favorites";
  } else {
    els.favoriteToggleBtn.classList.remove('active');
    els.favoriteToggleBtn.title = "Save to Favorites";
  }
}

// Render Favorites list in Sidebar
function renderFavoritesList() {
  els.favoritesCount.textContent = STATE.favorites.length;
  els.favoritesList.innerHTML = '';

  if (STATE.favorites.length === 0) {
    els.favoritesList.innerHTML = '<p class="empty-state-text">No saved locations yet. Click the star on detected locations to save.</p>';
    return;
  }

  STATE.favorites.forEach(fav => {
    const card = document.createElement('div');
    card.className = 'saved-item-card fade-in';
    
    const info = document.createElement('div');
    info.className = 'saved-item-info';
    const flag = getFlagEmoji(fav.countryCode);
    const shortTitle = fav.city !== "N/A" ? `${fav.city}, ${fav.countryCode}` : fav.name.split(',')[0];
    const subTitle = fav.postalCode !== "N/A" ? `Postal Code: ${fav.postalCode}` : fav.state;
    
    info.innerHTML = `
      <div class="saved-item-name">${flag} ${shortTitle}</div>
      <div class="saved-item-meta">${subTitle}</div>
    `;
    
    info.addEventListener('click', () => {
      STATE.currentLocation = fav;
      renderLocationDetails();
      updateLeafletMapView();
    });

    const actions = document.createElement('div');
    actions.className = 'saved-item-actions';

    const btnNav = document.createElement('button');
    btnNav.className = 'btn-saved-icon nav';
    btnNav.title = "Focus Location";
    btnNav.innerHTML = '<i data-lucide="eye" style="width:14px;height:14px;"></i>';
    btnNav.addEventListener('click', () => {
      STATE.currentLocation = fav;
      renderLocationDetails();
      updateLeafletMapView();
    });

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-saved-icon delete';
    btnDelete.title = "Delete Favorite";
    btnDelete.innerHTML = '<i data-lucide="trash-2" style="width:14px;height:14px;"></i>';
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      STATE.favorites = STATE.favorites.filter(f => !(f.lat === fav.lat && f.lon === fav.lon));
      saveFavoritesToStorage();
    });

    actions.appendChild(btnNav);
    actions.appendChild(btnDelete);
    card.appendChild(info);
    card.appendChild(actions);
    
    els.favoritesList.appendChild(card);
  });
  
  lucide.createIcons();
}

// Add lookup to recent history array
function addSearchToRecents(loc) {
  // Prevent duplicate consecutive entries
  if (STATE.recents.length > 0) {
    const first = STATE.recents[0];
    if (first.lat === loc.lat && first.lon === loc.lon) return;
  }

  // Remove matching coordinates to move to top
  STATE.recents = STATE.recents.filter(r => !(r.lat === loc.lat && r.lon === loc.lon));
  
  // Prepend
  STATE.recents.unshift({ ...loc, searchedAt: new Date().toISOString() });
  
  // Cap at 10 items
  if (STATE.recents.length > 10) {
    STATE.recents.pop();
  }

  saveRecentsToStorage();
}

// Render Recent Searches list
function renderRecentsList() {
  els.recentsList.innerHTML = '';

  if (STATE.recents.length === 0) {
    els.recentsList.innerHTML = '<p class="empty-state-text">Your recent searches will appear here.</p>';
    return;
  }

  STATE.recents.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'saved-item-card fade-in';
    
    const info = document.createElement('div');
    info.className = 'saved-item-info';
    const flag = getFlagEmoji(rec.countryCode);
    const shortTitle = rec.city !== "N/A" ? `${rec.city}, ${rec.countryCode}` : rec.name.split(',')[0];
    const subTitle = rec.postalCode !== "N/A" ? `Postal Code: ${rec.postalCode}` : rec.state;
    
    info.innerHTML = `
      <div class="saved-item-name">${flag} ${shortTitle}</div>
      <div class="saved-item-meta">${subTitle}</div>
    `;
    
    info.addEventListener('click', () => {
      STATE.currentLocation = rec;
      renderLocationDetails();
      updateLeafletMapView();
    });

    const actions = document.createElement('div');
    actions.className = 'saved-item-actions';

    const btnNav = document.createElement('button');
    btnNav.className = 'btn-saved-icon nav';
    btnNav.title = "View Location";
    btnNav.innerHTML = '<i data-lucide="chevron-right" style="width:14px;height:14px;"></i>';
    btnNav.addEventListener('click', () => {
      STATE.currentLocation = rec;
      renderLocationDetails();
      updateLeafletMapView();
    });

    actions.appendChild(btnNav);
    card.appendChild(info);
    card.appendChild(actions);
    
    els.recentsList.appendChild(card);
  });

  lucide.createIcons();
}

// ==========================================================================
// 8. Visual theme Control Manager
// ==========================================================================

function initThemeToggler() {
  // Load saved theme preference
  const savedTheme = localStorage.getItem('np_theme') || 'dark';
  applyTheme(savedTheme);

  els.themeToggleBtn.addEventListener('click', () => {
    const newTheme = STATE.theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  });
}

function applyTheme(themeName) {
  STATE.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('np_theme', themeName);
  
  // Re-render map tiles configuration if Leaflet is active
  if (STATE.map) {
    // Redraw tile layers
    STATE.map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        layer.redraw();
      }
    });
  }
}

// ==========================================================================
// 9. Event Listeners & Bootstrapping
// ==========================================================================

function setupEventListeners() {
  // Main Search Lookup
  els.searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = els.searchInput.value.trim();
    if (query) {
      performLocationLookup(query, STATE.selectedCountry.code);
    }
  });

  // Category Cards clicks & premium interactions
  const categoryCards = document.querySelectorAll('.category-card');
  categoryCards.forEach(card => {
    card.addEventListener('click', () => {
      const category = card.getAttribute('data-category');
      const googleSearchUrl = getGoogleMapsSearchUrl(category);
      window.open(googleSearchUrl, '_blank');
    });

    // Dynamic mouse move cursor tracker & luxurious 3D perspective tilt
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const tiltX = ((y - centerY) / centerY) * 4; // Max 4 degrees tilt
      const tiltY = ((centerX - x) / centerX) * 4;
      card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-3px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // Global premium keyboard shortcuts (Press '/' or 'Cmd+K' to focus lookup)
  document.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || document.activeElement.isContentEditable) {
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      els.searchInput.focus();
      els.searchInput.select();
    }
  });

  // Custom Place/Business Search
  els.customSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = els.customSearchInput.value.trim();
    if (query) {
      const googleSearchUrl = getGoogleMapsSearchUrl(query);
      window.open(googleSearchUrl, '_blank');
    }
  });

  // Quick chips clicks
  els.quickChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-query');
      const googleSearchUrl = getGoogleMapsSearchUrl(query);
      window.open(googleSearchUrl, '_blank');
    });
  });

  // Example lookup chips inside Search Card
  els.exampleChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.getAttribute('data-search');
      const countryCode = chip.getAttribute('data-country');
      els.searchInput.value = query;
      
      // Update country dropdown trigger selection
      const countryMatch = countries.find(c => c.code === countryCode);
      if (countryMatch) {
        selectCountry(countryMatch);
      }
      
      performLocationLookup(query, countryCode);
    });
  });

  // Location details operations
  els.favoriteToggleBtn.addEventListener('click', () => {
    toggleFavoriteCurrentLocation();
  });

  // Copy full location address to clipboard
  els.actionBtnCopyAddress.addEventListener('click', () => {
    const loc = STATE.currentLocation;
    copyToClipboard(loc.formattedAddress, els.actionBtnCopyAddress, "Address Copied!");
  });

  // Copy lat/long coordinates to clipboard
  els.actionBtnCopyCoords.addEventListener('click', () => {
    const loc = STATE.currentLocation;
    const coordString = `${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`;
    copyToClipboard(coordString, els.actionBtnCopyCoords, "Coords Copied!");
  });

  // Share Location trigger
  els.actionBtnShare.addEventListener('click', async () => {
    const loc = STATE.currentLocation;
    const shareTitle = `Explore ${loc.city || 'Location'} - Nearby Finder Pro`;
    const shareText = `Check out nearby spots around ${loc.formattedAddress}. Powered by Nearby Finder Pro.`;
    const shareUrl = `${window.location.origin}${window.location.pathname}?search=${encodeURIComponent(loc.postalCode !== "N/A" ? loc.postalCode : (loc.city !== "N/A" ? loc.city : loc.name))}&country=${loc.countryCode}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl
        });
      } catch (err) {
        // Fallback to clipboard if sharing is dismissed or blocked
        console.log("Navigator sharing failed or cancelled, using copy fallback.");
        copyToClipboard(shareUrl, els.actionBtnShare, "Share Link Copied!");
      }
    } else {
      // Fallback
      copyToClipboard(shareUrl, els.actionBtnShare, "Share Link Copied!");
    }
  });

  // Clear recents
  els.clearRecentsBtn.addEventListener('click', () => {
    STATE.recents = [];
    saveRecentsToStorage();
  });

  // Close toast notification
  els.closeToastBtn.addEventListener('click', () => {
    hideToast();
  });

  // Copy All Mobile Numbers trigger
  if (els.copyAllMobileBtn) {
    els.copyAllMobileBtn.addEventListener('click', () => {
      copyAllMobileNumbers(els.copyAllMobileBtn);
    });
  }
}

// Parse initial URL query parameters to allow sharing links
function parseUrlQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const searchVal = params.get('search');
  const countryVal = params.get('country');

  if (searchVal) {
    els.searchInput.value = decodeURIComponent(searchVal);
    if (countryVal) {
      const match = countries.find(c => c.code.toLowerCase() === countryVal.toLowerCase());
      if (match) {
        selectCountry(match);
      }
    }
    performLocationLookup(searchVal, countryVal || "");
  } else {
    // Render default location (Washington D.C.) on initial loading
    renderLocationDetails();
    initLeafletMap();
  }
}

// ==========================================================================
// 10. Initialization Bootstrapper
// ==========================================================================

function init() {
  // Initialize UI features
  initThemeToggler();
  initCountryDropdown();
  loadUserDataFromStorage();
  setupEventListeners();

  // Parse any share queries, or fallback to standard boot
  parseUrlQueryParams();

  // Run live UTC clock
  updateLiveClock();
  setInterval(updateLiveClock, 60000);

  // Initialize Lucide Vector Icons
  lucide.createIcons();
}

// ==========================================================================
// 11. Local Mobile Number Generator Module
// ==========================================================================

const COUNTRY_MOBILE_PLANS = {
  US: {
    flag: "🇺🇸",
    generate: () => {
      const areaCodes = ["212", "310", "415", "617", "702", "818", "917", "407", "305", "718", "206", "503", "312", "404", "214", "713", "602", "303", "919", "704", "512", "305", "416", "604"];
      const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
      const co1 = Math.floor(Math.random() * 8) + 2;
      const co2 = Math.floor(Math.random() * 10);
      const co3 = Math.floor(Math.random() * 10);
      const line = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `(${area}) ${co1}${co2}${co3}-${line}`;
    }
  },
  CA: {
    flag: "🇨🇦",
    generate: () => {
      const areaCodes = ["416", "647", "438", "514", "604", "778", "403", "587", "613", "905"];
      const area = areaCodes[Math.floor(Math.random() * areaCodes.length)];
      const co1 = Math.floor(Math.random() * 8) + 2;
      const co2 = Math.floor(Math.random() * 10);
      const co3 = Math.floor(Math.random() * 10);
      const line = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `(${area}) ${co1}${co2}${co3}-${line}`;
    }
  },
  BD: {
    flag: "🇧🇩",
    generate: () => {
      const prefixes = ["013", "014", "015", "016", "017", "018", "019"];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const part1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const part2 = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
      return `${prefix}${part1}-${part2}`;
    }
  },
  GB: {
    flag: "🇬🇧",
    generate: () => {
      const prefixes = ["073", "074", "075", "077", "078", "079", "071", "072"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const sub1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const sub2 = String(Math.floor(Math.random() * 100000)).padStart(6, '0');
      return `${pref}${sub1} ${sub2}`;
    }
  },
  PL: {
    flag: "🇵🇱",
    generate: () => {
      const prefixes = ["45", "50", "51", "53", "57", "60", "66", "69", "72", "73", "78", "79", "88"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const d1 = Math.floor(Math.random() * 10);
      const part1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const part2 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      return `${pref}${d1} ${part1} ${part2}`;
    }
  },
  DE: {
    flag: "🇩🇪",
    generate: () => {
      const prefixes = ["0151", "0152", "0157", "0159", "0160", "0162", "0163", "0170", "0171", "0172", "0173", "0174", "0175", "0176", "0177", "0178", "0179"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const rest = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
      return `${pref} ${rest}`;
    }
  },
  FR: {
    flag: "🇫🇷",
    generate: () => {
      const pref = Math.random() < 0.7 ? "06" : "07";
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p4 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref} ${p1} ${p2} ${p3} ${p4}`;
    }
  },
  AU: {
    flag: "🇦🇺",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p3 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      return `04${p1} ${p2} ${p3}`;
    }
  },
  NL: {
    flag: "🇳🇱",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `06-${p1}${p2}`;
    }
  },
  BE: {
    flag: "🇧🇪",
    generate: () => {
      const pref = "04" + (Math.floor(Math.random() * 30) + 70);
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref} ${p1} ${p2} ${p3}`;
    }
  },
  IT: {
    flag: "🇮🇹",
    generate: () => {
      const prefixes = ["320", "327", "328", "329", "330", "331", "333", "334", "335", "338", "339", "340", "345", "347", "348", "349", "350", "366", "370", "380", "388", "389"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  ES: {
    flag: "🇪🇸",
    generate: () => {
      const prefixes = ["607", "612", "615", "620", "630", "645", "650", "660", "670", "680", "690", "717", "722"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  SE: {
    flag: "🇸🇪",
    generate: () => {
      const prefixes = ["070", "072", "073", "076", "079"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref}-${p1} ${p2} ${p3}`;
    }
  },
  AT: {
    flag: "🇦🇹",
    generate: () => {
      const prefixes = ["0650", "0660", "0664", "0676", "0680", "0699"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const rest = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
      return `${pref} ${rest}`;
    }
  },
  IN: {
    flag: "🇮🇳",
    generate: () => {
      const prefixes = ["98", "97", "96", "95", "91", "90", "89", "88", "87", "85", "80", "79", "78", "77", "75", "70", "63", "62"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(5, '0');
      return `${pref}${p1}-${p2}`;
    }
  },
  CH: {
    flag: "🇨🇭",
    generate: () => {
      const prefixes = ["075", "076", "077", "078", "079"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref} ${p1} ${p2} ${p3}`;
    }
  },
  BR: {
    flag: "🇧🇷",
    generate: () => {
      const ddds = ["11", "21", "31", "41", "51", "61", "71", "81", "91"];
      const ddd = ddds[Math.floor(Math.random() * ddds.length)];
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `(${ddd}) 9${p1}-${p2}`;
    }
  },
  MX: {
    flag: "🇲🇽",
    generate: () => {
      const ddds = ["55", "81", "33", "222", "664", "999"];
      const ddd = ddds[Math.floor(Math.random() * ddds.length)];
      if (ddd.length === 2) {
        const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        return `${ddd} ${p1} ${p2}`;
      } else {
        const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
        const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        return `${ddd} ${p1} ${p2}`;
      }
    }
  },
  JP: {
    flag: "🇯🇵",
    generate: () => {
      const prefixes = ["070", "080", "090"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref}-${p1}-${p2}`;
    }
  },
  CN: {
    flag: "🇨🇳",
    generate: () => {
      const prefixes = ["138", "139", "158", "159", "178", "188", "198", "130", "131", "132", "156", "186", "133", "189"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  KR: {
    flag: "🇰🇷",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `010-${p1}-${p2}`;
    }
  },
  ZA: {
    flag: "🇿🇦",
    generate: () => {
      const prefixes = ["060", "061", "062", "063", "071", "072", "073", "074", "081", "082", "083", "084"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  PK: {
    flag: "🇵🇰",
    generate: () => {
      const prefixes = ["0300", "0301", "0302", "0312", "0321", "0333", "0345"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const rest = String(Math.floor(Math.random() * 10000000)).padStart(7, '0');
      return `${pref} ${rest}`;
    }
  },
  SA: {
    flag: "🇸🇦",
    generate: () => {
      const prefixes = ["050", "053", "054", "055", "056", "057", "058", "059"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  AE: {
    flag: "🇦🇪",
    generate: () => {
      const prefixes = ["050", "052", "054", "055", "056", "058"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  PH: {
    flag: "🇵🇭",
    generate: () => {
      const prefixes = ["0917", "0918", "0920", "0927", "0935", "0995"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  MY: {
    flag: "🇲🇾",
    generate: () => {
      const prefixes = ["012", "013", "014", "016", "017", "018", "019"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref}-${p1} ${p2}`;
    }
  },
  SG: {
    flag: "🇸🇬",
    generate: () => {
      const pref = Math.random() < 0.5 ? "8" : "9";
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref}${p1} ${p2}`;
    }
  },
  NZ: {
    flag: "🇳🇿",
    generate: () => {
      const prefixes = ["021", "022", "027", "028", "029"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  IE: {
    flag: "🇮🇪",
    generate: () => {
      const prefixes = ["083", "085", "086", "087", "089"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  NO: {
    flag: "🇳🇴",
    generate: () => {
      const pref = Math.random() < 0.5 ? "4" : "9";
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p4 = String(Math.floor(Math.random() * 10)).padStart(1, '0');
      return `${pref}${p1} ${p2} ${p3}${p4}`;
    }
  },
  DK: {
    flag: "🇩🇰",
    generate: () => {
      const pref = String(Math.floor(Math.random() * 80) + 20).padStart(2, '0');
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref} ${p1} ${p2} ${p3}`;
    }
  },
  FI: {
    flag: "🇫🇮",
    generate: () => {
      const prefixes = ["040", "041", "044", "045", "050"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 10000007)).padStart(7, '0');
      return `${pref} ${p1}`;
    }
  },
  PT: {
    flag: "🇵🇹",
    generate: () => {
      const prefixes = ["91", "92", "93", "96"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10004)).padStart(4, '0');
      return `${pref}${p1[0]} ${p1.slice(1)}${p2.slice(0, 2)} ${p2.slice(2)}`;
    }
  },
  TR: {
    flag: "🇹🇷",
    generate: () => {
      const prefixes = ["0532", "0533", "0542", "0544", "0555"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p3 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      return `${pref} ${p1} ${p2} ${p3}`;
    }
  },
  AR: {
    flag: "🇦🇷",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `11 15-${p1}-${p2}`;
    }
  },
  CL: {
    flag: "🇨🇱",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `9 ${p1} ${p2}`;
    }
  },
  CO: {
    flag: "🇨🇴",
    generate: () => {
      const prefixes = ["300", "301", "302", "304", "305", "310", "311", "312", "313", "314", "315", "316", "317", "318", "319", "320"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  },
  PE: {
    flag: "🇵🇪",
    generate: () => {
      const p1 = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const p2 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p3 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      return `9${p1} ${p2} ${p3}`;
    }
  },
  VN: {
    flag: "🇻🇳",
    generate: () => {
      const prefixes = ["032", "039", "070", "081", "090", "098"];
      const pref = prefixes[Math.floor(Math.random() * prefixes.length)];
      const p1 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const p2 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      return `${pref} ${p1} ${p2}`;
    }
  }
};

function generateGenericMobile(code, countryName) {
  const match = countries.find(c => c.code.toUpperCase() === (code || '').toUpperCase());
  const flag = match ? match.flag : "🌐";
  const pref = Math.random() < 0.5 ? "07" : "04";
  const p1 = String(Math.floor(Math.random() * 10)).padStart(1, '0');
  const p2 = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const p3 = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return {
    flag,
    number: `${pref}${p1} ${p2} ${p3}`
  };
}

function generate5UniqueMobileNumbers(code, countryName) {
  const upperCode = (code || 'US').toUpperCase();
  const plan = COUNTRY_MOBILE_PLANS[upperCode];
  
  let flag = "🌐";
  if (plan && plan.flag) {
    flag = plan.flag;
  } else {
    const match = countries.find(c => c.code.toUpperCase() === upperCode);
    if (match) flag = match.flag;
  }

  const resultNumbers = [];
  let attempts = 0;
  
  while (resultNumbers.length < 5 && attempts < 150) {
    attempts++;
    let numStr = "";
    if (plan) {
      numStr = plan.generate();
    } else {
      numStr = generateGenericMobile(upperCode, countryName).number;
    }

    if (!STATE.usedMobileNumbers.has(numStr)) {
      STATE.usedMobileNumbers.add(numStr);
      resultNumbers.push(numStr);
    }
  }

  while (resultNumbers.length < 5) {
    const fallbackNum = plan ? plan.generate() : generateGenericMobile(upperCode, countryName).number;
    resultNumbers.push(fallbackNum);
  }

  return {
    countryCode: upperCode,
    countryName: countryName || upperCode,
    flag: flag,
    numbers: resultNumbers
  };
}

function updateMobileNumberGeneratorUI(countryCode, countryName) {
  const container = els.mobileNumbersList || document.getElementById('mobile-numbers-list');
  const badge = els.mobileGenCountryBadge || document.getElementById('mobile-gen-country-badge');
  if (!container) return;

  const data = generate5UniqueMobileNumbers(countryCode, countryName);
  STATE.currentGeneratedMobileNumbers = data.numbers;

  if (badge) {
    badge.textContent = `${data.countryName} ${data.flag}`;
  }

  container.innerHTML = data.numbers.map((num) => `
    <div class="mobile-number-item">
      <div class="mobile-number-left">
        <i data-lucide="smartphone" class="mobile-number-icon"></i>
        <span class="mobile-number-val font-mono">${num}</span>
        <span class="mobile-number-badge">Mobile</span>
      </div>
      <div class="mobile-number-actions">
        <button class="btn-copy-single" data-number="${num}">
          <i data-lucide="copy" class="action-icon"></i>
          <span>Copy</span>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }

  container.querySelectorAll('.btn-copy-single').forEach(btn => {
    btn.addEventListener('click', () => {
      const numToCopy = btn.getAttribute('data-number');
      copySingleMobileNumber(numToCopy, btn);
    });
  });
}

function copySingleMobileNumber(text, btnEl) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  btnEl.classList.add('copied');
  const span = btnEl.querySelector('span');
  const origText = span.textContent;
  span.textContent = "Copied!";
  
  setTimeout(() => {
    btnEl.classList.remove('copied');
    span.textContent = origText;
  }, 1500);
}

function copyAllMobileNumbers(btnEl) {
  if (!STATE.currentGeneratedMobileNumbers || STATE.currentGeneratedMobileNumbers.length === 0) return;
  const allText = STATE.currentGeneratedMobileNumbers.join('\n');
  
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(allText).catch(() => {});
  } else {
    const textArea = document.createElement("textarea");
    textArea.value = allText;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  btnEl.classList.add('copied');
  const span = btnEl.querySelector('span');
  const origText = span ? span.textContent : "";
  if (span) span.textContent = "Copied All!";

  setTimeout(() => {
    btnEl.classList.remove('copied');
    if (span) span.textContent = origText;
  }, 1500);
}

// Run init once DOM loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
