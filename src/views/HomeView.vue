<script setup lang="ts">
import mapboxgl from 'mapbox-gl';
import { computed, onMounted, ref, watch } from 'vue';
import { gameState as gameStateInitial, mapData } from './data';
import { area } from '@turf/turf';
import { useDocument } from 'vuefire';
import { collection, doc, getFirestore, setDoc } from 'firebase/firestore';
import { firebaseApp } from '@/main';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGxicyIsImEiOiJjazQ5MW05NnYwMGp5M2ZwZGhlaXlrMjZoIn0.Mftbu2WiRY4SChlAU8mfrA';

const currentlySelectedState = ref<string | null>(null);

// const gameState = ref(gameStateInitial);

let map: mapboxgl.Map | null = null;

const db = getFirestore(firebaseApp);
const gameState = useDocument(doc(collection(db, 'gameState'), 'game1'));

// setDoc(doc(db, 'gameState', 'game1'), gameState.value, { merge: false });

onMounted(() => {
  console.log('loading map');
  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/standard',
    center: [138.5311, -34.9462],
    zoom: 10
  });
  if (!map) return;
  map.on('style.load', () => {
    if (!map) return;

    map.addSource('areas', { type: 'geojson', data: mapData });
    map.addLayer({
      id: 'areas',
      type: 'fill',
      source: 'areas',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['case', ['!=', ['get', 'fillColor'], '#088'], 0.5, 0.1]
      }
    });
    map.addLayer({
      id: 'areasOutline',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': '#088',
        'line-opacity': 1
      }
    });
    updateMap();
    map.on('click', 'areas', (e) => {
      if (!e.lngLat || !e.features) return;
      if (!map) return;
      const areaResult = area(e.features[0]) * 0.000001;
      console.log('areaResult', areaResult);
      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`${e?.features[0].properties?.electorate} <br/> ${areaResult.toFixed(1)}km2`)
        .addTo(map);
      currentlySelectedState.value = e?.features[0].properties?.electorate;
    });
  });
  map.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true,
      showUserHeading: true
    })
  );
});

watch(gameState, (newState) => {
  console.log('gameState changed', newState);
  // Update map colors based on game state
  // Iterate through the mapdata features and set the fill color based on the game state
  updateMap();
});

function updateMap(newState = gameState.value) {
  if (!map) return;
  const colors: Record<string, string> = {
    unclaimed: '#088',
    1: '#f00',
    2: '#00f'
  };
  const features = mapData.features.map((feature) => {
    const electorate = feature.properties?.electorate;
    //@ts-expect-error electorate is always defined
    const state = newState[electorate] || 'unclaimed';
    feature.properties = {
      ...feature.properties,
      fillColor: colors[state]
    };
    return feature;
  });
  //@ts-expect-error Stupid mapbox types
  map.getSource('areas')?.setData({
    type: 'FeatureCollection',
    features
  });
}

function claim(claimer: '1' | '2' | 'unclaimed') {
  if (!currentlySelectedState.value) return;
  gameState.value = {
    ...gameState.value,
    [currentlySelectedState.value]: claimer
  };
  const key1 = currentlySelectedState.value;
  // use the firesotre api to set the game state
  setDoc(doc(db, 'gameState', 'game1'), { [key1]: claimer }, { merge: true });
}

const score = computed(() => {
  const teams: Record<string, { count: number; area: number }> = {
    '1': { count: 0, area: 0 },
    '2': { count: 0, area: 0 },
    unclaimed: { count: 0, area: 0 }
  };
  if (!gameState.value) return teams;
  Object.keys(gameState.value).forEach((k) => {
    if (!gameState.value) return;
    const v = gameState.value[k as keyof typeof gameState.value] || 'unclaimed';
    teams[v].count = teams[v].count + 1;
    const feature = mapData.features.find((f) => f.properties?.electorate === k);
    console.log('feature for', k, feature);
    if (feature) {
      teams[v].area = teams[v].area + (area(feature) * 0.000001 || 0);
    }
  });
  return teams;
});
</script>

<template>
  <link href="https://api.tiles.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css" rel="stylesheet" />

  <div id="map" class="map"></div>
  <div class="center">
    <div class="scoreHolder">
      <div class="team" v-for="(value, key) in score" :key="value">
        <h2>{{ key != 'unclaimed' ? 'Team ' + key : key }}</h2>
        <!-- {{ value }} -->
        Count: {{ value.count }} <br />
        Area: {{ value.area.toFixed(1) }}km²
      </div>
      <!-- {{ score }} -->
    </div>
  </div>
  <div class="center">
    <div class="buttonHolder">
      {{ currentlySelectedState }}
      <button @click="claim('1')">Claim 1</button>
      <button @click="claim('2')">Claim 2</button>
      <button @click="claim('unclaimed')">Clear</button>
    </div>
  </div>
</template>

<style scoped>
.map {
  width: 100vw;
  height: 100vh;
}
.center {
  width: 100%;
  display: flex;
  justify-content: center;
  /* pointer-events: none; Allow clicks to pass through */
}
.buttonHolder {
  position: absolute;
  bottom: 10px;
  /* left: 10px; */
  z-index: 1;
  /* width: 100%; */
  display: flex;
  justify-content: center;
  gap: 8px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px;
  border-radius: 4px;
  margin: auto;
}

.scoreHolder {
  position: absolute;
  text-align: center;
  top: 10px;
  z-index: 1;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  gap: 16px;
  h2 {
    margin: 0;
  }
}
</style>
