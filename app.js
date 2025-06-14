// Mapbox APIキー
const MAPBOX_TOKEN = 'pk.eyJ1IjoiaXNld2FzYWJpNzkiLCJhIjoiY21ib3E3b2JxMW5xdDJrcXlxaWMycThtaSJ9.lihaq-v3RYij-k8G9ps03g';
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

// 初期位置の指定：福岡市役所座標（経度, 緯度）
const fallbackCoords = [130.4209, 33.5902];

const layers = {
  flood_under50: null,
  flood_over50: null,
  sediment: null,
  tsunami: null,
  inlandFlood: null
};

let userLocation = null;
let shelterLayer = null;
let routeLine = null;
let routeLineLayer = null;
let shelterData = [];
let selectedShelterMarker = null;
let selectedShelterFeature = null;
let userLocationMarker = null;

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
  userLocationMarker = L.marker([fallbackCoords[1], fallbackCoords[0]], {
    draggable: true,
    icon: L.icon({
      iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-blue.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    })
  }).addTo(map).bindPopup("ここを動かして出発位置を変更できます").openPopup();

  // 🔧 ドラッグ終了後に userLocation を更新
  userLocationMarker.on("dragend", (e) => {
    const newPos = e.target.getLatLng();
    userLocation = [newPos.lng, newPos.lat];
    loadShelters('data/shelters.json'); // 避難所データを再読み込み
  });
  
  loadAllGeoJSON();
});

// ソースデータの指定
function loadAllGeoJSON() {
  loadHazardLayer('flood_under50', 'data/flood_under50.geojson', '#F6F599');
  loadHazardLayer('flood_over50', 'data/flood_over50.geojson', '#FFCEB3');
  loadHazardLayer('sediment', 'data/sediment.geojson', '#F61F15');
  loadHazardLayer('tsunami', 'data/tsunami.geojson', '#FFFFAA');
  loadHazardLayer('inlandFlood', 'data/inland_flood.geojson', '#FFFFAA');
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

  const checkbox = document.getElementById(`${key}Layer`);
  if (checkbox) {
    checkbox.addEventListener('change', e => {
      if (e.target.checked && layers[key]) {
        map.addLayer(layers[key]);
      } else if (layers[key]) {
        map.removeLayer(layers[key]);
      }

      // レイヤー変更時、経路とハイライトをリセット
      if (routeLineLayer) {
        map.removeLayer(routeLineLayer);
        routeLineLayer = null;
      }
      if (selectedShelterMarker) {
        map.removeLayer(selectedShelterMarker);
        selectedShelterMarker = null;
      }
      selectedShelterFeature = null;
      document.getElementById('route-search-btn').style.display = 'none';
      document.querySelectorAll('#shelter-list li').forEach(li => li.classList.remove('selected'));
    });
  }
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
        .slice(0, 20);

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
        pointToLayer: (feature, latlng) => {
          const type = feature.properties.type || '';
          const name = feature.properties.name || '避難所';
          const color = type.includes('緊急') ? '#d62728' : '#228B22'; 
          const marker = L.circleMarker(latlng, {
            radius: 5,
            fillColor: color,
            color: '#444',
            weight: 1,
            fillOpacity: 0.9
          });
          marker.bindPopup(name);  // ポップアップに名前表示
          return marker;
        }
      }).addTo(map);
    });
}

function onSelectShelter(feature, listItem) {
  document.querySelectorAll('#shelter-list li').forEach(li => li.classList.remove('selected'));
  listItem.classList.add('selected');

  const [lng, lat] = feature.geometry.coordinates;
  if (!userLocation) return;

  if (selectedShelterMarker) {
    map.removeLayer(selectedShelterMarker);
    selectedShelterMarker = null;
  }

  // 選択された避難所をハイライト
  selectedShelterMarker = L.circleMarker([lat, lng], {
    radius: 10,
    color: '#3399ff',
    weight: 3,
    fillOpacity: 0.6
  }).addTo(map);

  // 選択された避難所の情報を保持
  selectedShelterFeature = feature;
  // 「経路検索」ボタンを表示
  document.getElementById('route-search-btn').style.display = 'block';
}

async function searchRouteToShelter(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  if (!userLocation) return;

  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${userLocation[0]},${userLocation[1]};${lng},${lat}?geometries=geojson&alternatives=true&radiuses=100;100&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();

  let safeRoute = null;

  if (data.routes && data.routes.length > 0) {
    for (const route of data.routes) {
      const line = turf.lineString(route.geometry.coordinates);
      let intersects = false;

      for (const key in layers) {
        const layer = layers[key];
        if (layer && map.hasLayer(layer)) {
          try {
            layer.eachLayer(layerInstance => {
              const polygon = layerInstance.feature;
              if (polygon && turf.booleanIntersects(line, polygon)) {
                intersects = true;
              }
            });
          } catch (e) {
            console.warn(`レイヤー ${key} の交差チェック中にエラーが発生しました`, e);
          }
        }
      }

      if (!intersects) {
        safeRoute = line;
        break;
      }
    }
  }

  // 🔧 安全ルートが見つからなかった場合の警告処理（共通化）
  if (!safeRoute) {
    const warningBox = document.getElementById('route-warning');
    if (warningBox) {
      warningBox.style.display = 'block';
      setTimeout(() => {
        warningBox.style.display = 'none';
      }, 5000);
    }
    return;
  }

  // 🔧 表示前に前のルートを削除
  if (routeLineLayer) {
    map.removeLayer(routeLineLayer);
  }

  // 🔧 安全な経路を表示
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

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-panel-btn');
  const panel = document.getElementById('control-panel');
  const routeBtn = document.getElementById('route-search-btn');

  if (toggleBtn && panel) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('active');
    });
  }

  if (routeBtn) {
    routeBtn.addEventListener('click', () => {
      if (selectedShelterFeature) {
        searchRouteToShelter(selectedShelterFeature);
      }
    });
  }
});