// Mapbox APIキー
const MAPBOX_TOKEN = 'sk.eyJ1IjoiaXNld2FzYWJpNzkiLCJhIjoiY21ib3B6cXBkMDB3ZzJrc2ExMWRxcHZ6diJ9.W148OMrADrRtJPWUtHmr4Q';
mapboxgl.accessToken = MAPBOX_TOKEN;
const mapboxClient = mapboxSdk({ accessToken: MAPBOX_TOKEN });

// Mapbox 地図レイヤ
const mapboxLayer = L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`, {
  tileSize: 512,
  zoomOffset: -1,
  attribution: '© Mapbox © OpenStreetMap',
  minZoom: 5,
  maxZoom: 18
});

// 福岡市役所座標（経度, 緯度）
const fallbackCoords = [130.4209, 33.5902];

const layers = {
  flood: null,
  sediment: null,
  tsunami: null,
  inlandFlood: null
};

let userLocation = null;
let shelterLayer = null;
let routeLine = null;
let routeLineLayer = null;
let shelterData = [];

const map = L.map('map', {
  center: [fallbackCoords[1], fallbackCoords[0]],
  zoom: 14,
  layers: [mapboxLayer]
});

navigator.geolocation.getCurrentPosition(success => {
  const { latitude, longitude } = success.coords;
  userLocation = [longitude, latitude];
  map.setView([latitude, longitude], 15);
  L.circleMarker([latitude, longitude], { radius: 6, color: 'blue' }).addTo(map);
  loadAllGeoJSON();
}, error => {
  userLocation = fallbackCoords;
  map.setView([fallbackCoords[1], fallbackCoords[0]], 14);
  L.circleMarker([fallbackCoords[1], fallbackCoords[0]], { radius: 6, color: 'blue' }).addTo(map);
  loadAllGeoJSON();
});

function loadAllGeoJSON() {
  //loadHazardLayer('flood', 'data/flood.json', '#1f77b4');
  //loadHazardLayer('sediment', 'data/sediment.json', '#ff7f0e');
  //loadHazardLayer('tsunami', 'data/tsunami.json', '#d62728');
  loadHazardLayer('inlandFlood', 'data/inland_flood.json', '#9467bd');
  loadShelters('data/shelters.json');
}

function loadHazardLayer(key, path, color) {
  fetch(path)
    .then(res => res.json())
    .then(data => {
      layers[key] = L.geoJSON(data, {
        style: {
          color: color,
          weight: 1,
          fillOpacity: 0.3
        }
      });
    });

  document.getElementById(`${key}Layer`).addEventListener('change', e => {
    if (e.target.checked && layers[key]) {
      map.addLayer(layers[key]);
    } else if (layers[key]) {
      map.removeLayer(layers[key]);
    }
  });
}

function loadShelters(path) {
  fetch(path)
    .then(res => res.json())
    .then(data => {
      shelterData = data.features.map(f => {
        const [lon, lat] = f.geometry.coordinates;
        const dist = distance(userLocation, [lon, lat]);
        return { ...f, distance_km: dist };
      }).sort((a, b) => a.distance_km - b.distance_km)
        .slice(0, 10);

      const ul = document.getElementById('shelter-list');
      ul.innerHTML = '';

      shelterData.forEach((f, i) => {
        const li = document.createElement('li');
        const name = f.properties.name || `避難所 ${i + 1}`;
        const dist = f.distance_km.toFixed(2);
        li.textContent = `${name}（${dist}km）`;
        li.addEventListener('click', () => onSelectShelter(f, li));
        ul.appendChild(li);
      });

      if (shelterLayer) map.removeLayer(shelterLayer);
      shelterLayer = L.geoJSON(shelterData, {
        pointToLayer: (f, latlng) => L.circleMarker(latlng, {
          radius: 5,
          fillColor: '#228B22',
          color: '#006400',
          weight: 1,
          fillOpacity: 0.9
        })
      }).addTo(map);
    });
}

async function onSelectShelter(feature, listItem) {
  document.querySelectorAll('#shelter-list li').forEach(li => li.classList.remove('selected'));
  listItem.classList.add('selected');

  const [lng, lat] = feature.geometry.coordinates;
  if (!userLocation) return;

  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userLocation[0]},${userLocation[1]};${lng},${lat}?geometries=geojson&alternatives=true&radiuses=100;100&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    alert("ルートが見つかりませんでした。");
    return;
  }

  const routeLine = turf.lineString(data.routes[0].geometry.coordinates); // fallback
  let safeRoute = null;

  for (const route of data.routes) {
    const line = turf.lineString(route.geometry.coordinates);
    let intersects = false;

    for (const key in layers) {
      if (map.hasLayer(layers[key])) {
        layers[key].eachLayer(layer => {
          const polygon = layer.feature;
          if (polygon && turf.booleanIntersects(line, polygon)) {
            intersects = true;
          }
        });
      }
    }

    if (!intersects) {
      safeRoute = line;
      break;
    }
  }

if (!safeRoute) {
  const warningBox = document.getElementById('route-warning');
  warningBox.style.display = 'block';
  setTimeout(() => {
    warningBox.style.display = 'none';
  }, 5000);
  return;
}

if (routeLineLayer) map.removeLayer(routeLineLayer);
  routeLineLayer = L.geoJSON(safeRoute, {
    style: { color: '#0066cc', weight: 5 }
  }).addTo(map);
}

function distance([lon1, lat1], [lon2, lat2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
