<script setup lang="ts">
import mapboxgl from 'mapbox-gl';
import { onMounted } from 'vue';
import { mapData } from './data';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGxicyIsImEiOiJjazQ5MW05NnYwMGp5M2ZwZGhlaXlrMjZoIn0.Mftbu2WiRY4SChlAU8mfrA';

onMounted(() => {
  console.log('loading map');
  const mapbox = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11',
    center: [138.5311, -34.9462],
    zoom: 10
    // pitch: 30,
    // bearing: -83,
  });
  mapbox.on('style.load', () => {
    mapbox.addSource('areas', { type: 'geojson', data: mapData });
    mapbox.addLayer({
      id: 'areas',
      type: 'fill',
      source: 'areas',
      paint: {
        'fill-color': '#088',
        'fill-opacity': 0.1
      }
    });
    mapbox.addLayer({
      id: 'areasOutline',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': '#088',
        'line-opacity': 1
      }
    });
  });
});
</script>

<template>
  <link href="https://api.tiles.mapbox.com/mapbox-gl-js/v2.13.0/mapbox-gl.css" rel="stylesheet" />

  <div id="map" class="map"></div>
</template>

<style scoped>
.map {
  width: 100vw;
  height: 100vh;
}
</style>
