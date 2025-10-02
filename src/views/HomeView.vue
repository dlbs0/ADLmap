<script setup lang="ts">
import mapboxgl from 'mapbox-gl';
import { onMounted, ref, watch } from 'vue';
import { gameState as gameStateInitial, mapData } from './data';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGxicyIsImEiOiJjazQ5MW05NnYwMGp5M2ZwZGhlaXlrMjZoIn0.Mftbu2WiRY4SChlAU8mfrA';

const currentlySelectedState = ref<string | null>(null);

const gameState = ref(gameStateInitial);

let map: mapboxgl.Map | null = null;

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
        'fill-opacity': ['case', ['==', ['get', 'fillColor'], '#088'], 0.1, 0.5]
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
    map.on('click', 'areas', (e) => {
      if (!e.lngLat || !e.features) return;
      if (!map) return;
      new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(e?.features[0].properties?.electorate).addTo(map);
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
});

function claim(claimer: '1' | '2' | 'unclaimed') {
  if (!currentlySelectedState.value) return;
  gameState.value = {
    ...gameState.value,
    [currentlySelectedState.value]: claimer
  };
}
</script>

<template>
  <link href="https://api.tiles.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css" rel="stylesheet" />

  <div id="map" class="map"></div>
  <div class="buttonHolder">
    {{ currentlySelectedState }}
    <button @click="claim('1')">Claim 1</button>
    <button @click="claim('2')">Claim 2</button>
    <button @click="claim('unclaimed')">Clear</button>
  </div>
</template>

<style scoped>
.map {
  width: 100vw;
  height: 100vh;
}
.buttonHolder {
  position: absolute;
  bottom: 10px;
  /* left: 10px; */
  z-index: 1;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 8px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 8px;
  border-radius: 4px;
  margin: auto;
}
</style>
