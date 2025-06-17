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
let selectedShelter = null;
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

      // レイヤー変更時、経路とハイライトをリセット、避難施設の選択は保持
      if (routeLineLayer) {
        map.removeLayer(routeLineLayer);
        routeLineLayer = null;
      }

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
        // ✅ 選択状態を復元
        if (selectedShelterFeature && selectedShelterFeature.properties.name === f.properties.name) {
          li.classList.add('selected');
        }
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
      // ✅ すでに選択済み避難所がある場合はマーカーを再描画
      if (selectedShelterFeature) {
        const [lng, lat] = selectedShelterFeature.geometry.coordinates;
        if (selectedShelterMarker) {
          map.removeLayer(selectedShelterMarker);
        }
        selectedShelterMarker = L.circleMarker([lat, lng], {
          radius: 10,
          color: '#3399ff',
          weight: 3,
          fillOpacity: 0.6
        }).addTo(map);
      }
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
  if (!userLocation) return;

  const [destLng, destLat] = feature.geometry.coordinates;

  // 表示中のハザードレイヤのポリゴンを収集
  let polygons = [];
  for (const key in layers) {
    const layer = layers[key];
    if (layer && map.hasLayer(layer)) {
      layer.eachLayer(layerInstance => {
        const geo = layerInstance.toGeoJSON();
        if (geo.geometry.type === 'Polygon') {
          polygons.push(geo.geometry.coordinates);
        } else if (geo.geometry.type === 'MultiPolygon') {
          geo.geometry.coordinates.forEach(poly => polygons.push(poly));
        }
      });
    }
  }
  // turfでポリゴンを簡素化
const simplifiedPolygons = [];

// ポリゴンを距離つきで一時配列に
const filtered = [];
// 出発地点と目的地を結ぶ直線
const line = turf.lineString([
  [userLocation[0], userLocation[1]],
  [destLng, destLat]
]);

// 回避ポリゴン候補を収集（交差＋距離フィルタ）
const candidatePolygons = [];
polygons.forEach(polygonCoords => {
  try {
    const turfPolygon = turf.polygon(polygonCoords);
    const simplified = turf.simplify(turfPolygon, {
      tolerance: 0.001,
      highQuality: false
    });

    const intersects = turf.booleanIntersects(line, simplified);
    const centroid = turf.centroid(turfPolygon);
    const distanceKm = turf.distance(turf.point(userLocation), centroid, { units: 'kilometers' });

    if (intersects && distanceKm <= 1.5) {
      candidatePolygons.push({
        coordinates: simplified.geometry.coordinates,
        distance: distanceKm
      });
    }
  } catch (e) {
    console.warn('ポリゴン処理エラー:', e);
  }
});

// 距離の近い順に最大5件まで採用
const limitedPolygons = candidatePolygons
  .sort((a, b) => a.distance - b.distance)
  .slice(0, 5)
  .map(p => p.coordinates);

// デバッグ表示
console.log('送信ポリゴン数（交差＋距離フィルタ後）:', limitedPolygons.length);

// ORS APIに送信するルートリクエスト
const body = {
  coordinates: [
    [userLocation[0], userLocation[1]],
    [destLng, destLat]
  ],
  format: 'geojson',
  instructions: false
};

if (limitedPolygons.length > 0) {
  body.options = {
    avoid_polygons: {
      type: 'MultiPolygon',
      coordinates: limitedPolygons
    }
  };
}

try {
  const orsRes = await fetch('https://shelterdemo.netlify.app/.netlify/functions/route', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!orsRes.ok) throw new Error('ORS APIエラー');
  const geojson = await orsRes.json();

  if (routeLineLayer) map.removeLayer(routeLineLayer);
  routeLineLayer = L.geoJSON(geojson, {
    style: { color: '#0066cc', weight: 5 }
  }).addTo(map);
  // ✅ すでに選択済み避難所がある場合はマーカーを再描画
  if (selectedShelterFeature) {
    const [lng, lat] = selectedShelterFeature.geometry.coordinates;
    if (selectedShelterMarker) {
      map.removeLayer(selectedShelterMarker);
    }
    selectedShelterMarker = L.circleMarker([lat, lng], {
      radius: 10,
      color: '#3399ff',
      weight: 3,
      fillOpacity: 0.6
    }).addTo(map);
  }

  document.getElementById('route-warning').style.display = 'none';

} catch (err) {
  console.error(err);
  const warningBox = document.getElementById('route-warning');
  if (warningBox) {
    warningBox.style.display = 'block';
    setTimeout(() => {
      warningBox.style.display = 'none';
    }, 5000);
  }
}
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