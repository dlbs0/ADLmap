<script setup lang="ts">
import mapboxgl from 'mapbox-gl';
import { computed, onMounted, ref, watch } from 'vue';
import { gameState as gameStateInitial, mapData } from './data';
import { area } from '@turf/turf';
import { useDocument } from 'vuefire';
import { collection, doc, getFirestore, setDoc } from 'firebase/firestore';
import { firebaseApp } from '@/main';
import { Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioBufferSource, QUALITY_HIGH } from 'mediabunny';

mapboxgl.accessToken = 'pk.eyJ1IjoiZGxicyIsImEiOiJjazQ5MW05NnYwMGp5M2ZwZGhlaXlrMjZoIn0.Mftbu2WiRY4SChlAU8mfrA';
mapboxgl.accessToken = 'pk.eyJ1IjoiZGxiczAiLCJhIjoiY20wdGlpMmc2MHJqaDJsczVtNXRvN2ZneCJ9.47aVkXUGN8JNldnZUjj-nA';

const currentlySelectedState = ref<string | null>(null);

// const gameState = ref(gameStateInitial);
const colours: Record<string, { colour: string; teamName: string; colourName: string }> = {
  unclaimed: { colour: '#088', teamName: 'Unclaimed', colourName: 'Clear' },
  1: { colour: '#9b3531', teamName: 'Red Team', colourName: 'Red' },
  2: { colour: '#0d546b ', teamName: 'Blue Team', colourName: 'Blue' }
};

let map: mapboxgl.Map | null = null;

const db = getFirestore(firebaseApp);
const gameState = useDocument(doc(collection(db, 'gameState'), 'game1'));

// setDoc(doc(db, 'gameState', 'game1'), gameState.value, { merge: false });

onMounted(() => {
  console.log('loading map');
  map = new mapboxgl.Map({
    container: 'map',
    // style: 'mapbox://styles/mapbox/standard',
    style: 'mapbox://styles/dlbs0/cmgxhrmbw005101r106903f0q',
    center: [138.5311, -34.9462],
    zoom: 10,
    antialias: true
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
        'fill-opacity': ['case', ['!=', ['get', 'fillColor'], '#088'], 0.5, 0]
      }
    });
    map.addLayer({
      id: 'areasOutlineBase',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': '#FFF',
        'line-opacity': 1,
        'line-width': 4
      },
      layout: {}
    });
    map.addLayer({
      id: 'areasOutline',
      type: 'line',
      source: 'areas',
      paint: {
        // 'line-color': '#0DA',
        'line-color': '#715C46',
        'line-opacity': 1,
        'line-width': 2
      }
    });
    map.addLayer({
      id: 'areaLabel',
      type: 'symbol',
      source: 'areas',
      maxzoom: 13,
      minzoom: 10.5,
      layout: {
        'text-field': ['get', 'electorate'],
        'text-font': ['Droid Serif Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 20]
      },
      paint: {
        'text-color': '#000',
        'text-halo-color': '#FFF',
        'text-halo-width': 2
      }
    });
    // setTimeout(() => {
    //   updateMap();
    // }, 2000);
    gameState.promise.value.then(() => {
      updateMap();
    });
    map.on('click', 'areas', (e) => {
      if (!e.lngLat || !e.features) return;
      if (!map) return;
      const areaResult = area(e.features[0]) * 0.000001;
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

// Recording state and utilities
const recording = ref(false);
const recordProgress = ref(0);

// Deterministic render-driven recorder using mapboxgl.setNow to advance time and capture exact frames.
async function recordFlyTo(targetCenter: [number, number], targetZoom = 12, durationMs = 4000, fps = 60) {
  if (!map) return;
  if (recording.value) return;
  recording.value = true;
  recordProgress.value = 0;

  const outWidth = 1920;
  const outHeight = 1080;

  const srcCanvas = map.getCanvas();

  const output = new Output({
    format: new Mp4OutputFormat(), // The format of the file
    target: new BufferTarget() // Where to write the file (here, to memory)
  });

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    recording.value = false;
    return;
  }
  const videoSource = new CanvasSource(srcCanvas, {
    codec: 'avc',
    bitrate: QUALITY_HIGH
  });
  output.addVideoTrack(videoSource);

  await output.start();

  // deterministic timing
  const framesCount = Math.ceil((durationMs / 1000) * fps);
  console.log('framesCount:', framesCount);
  let framesRecorded = 0;
  let now = performance.now();
  const hasSetNow = typeof (mapboxgl as any).setNow === 'function';
  console.log('hasSetNow:', hasSetNow);
  if (hasSetNow) (mapboxgl as any).setNow(now);

  let previousFrameComplete = true;

  async function onRender() {
    if (previousFrameComplete === false) return;
    previousFrameComplete = false;

    try {
      if (!ctx) return;
      await videoSource.add(framesRecorded / fps, 1 / fps);
    } catch (e) {
      console.error('Error drawing frame for recording', e);
    }

    framesRecorded += 1;
    console.log('framesRecorded:', framesRecorded);
    recordProgress.value = Math.round((framesRecorded / framesCount) * 100);

    if (framesRecorded >= framesCount) {
      // stop recording flow
      if (map) map.off('render', onRender);
      try {
        if (hasSetNow && typeof (mapboxgl as any).restoreNow === 'function') (mapboxgl as any).restoreNow();
      } catch (e) {
        /* ignore */
      }
      // stop recorder
      await output.finalize();
    }

    now += 1000 / fps;
    if (hasSetNow) (mapboxgl as any).setNow(now);
    previousFrameComplete = true;
  }

  map.on('render', onRender);

  // start the animation; setNow will drive animation timing deterministically
  map.easeTo({ center: targetCenter, zoom: targetZoom, duration: durationMs, easing: (t: number) => t });

  while (output.state != 'finalized') {
    await new Promise((r) => setTimeout(r, 100));
  }

  const buffer = output.target.buffer;

  if (!buffer) {
    recording.value = false;
    recordProgress.value = 100;
    return;
  }

  // Ensure we have a Blob for createObjectURL; if we have an ArrayBuffer, wrap it
  const blob = buffer instanceof Blob ? buffer : new Blob([buffer], { type: 'video/webm' });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `map-export-${Date.now()}.webm`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  recording.value = false;
  recordProgress.value = 100;
}
watch(gameState, () => {
  // Update map colors based on game state
  updateMap();
});

function updateMap(newState = gameState.value) {
  if (!map) return;

  const features = mapData.features.map((feature) => {
    const electorate = feature.properties?.electorate;
    //@ts-expect-error electorate is always defined
    const state = newState[electorate] || 'unclaimed';
    feature.properties = {
      ...feature.properties,
      fillColor: colours[state].colour
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
  // use the firestore api to set the game state
  setDoc(doc(db, 'gameState', 'game1'), { [key1]: claimer }, { merge: true });
}

const score = computed(() => {
  let teams: Record<string, { count: number; area: number; teamName: string; colourName: string; colour: string }> = Object.keys(
    colours
  ).reduce((acc, k) => {
    acc[k] = { count: 0, area: 0, teamName: colours[k].teamName, colourName: colours[k].colourName, colour: colours[k].colour };
    return acc;
  }, {} as Record<string, { count: number; area: number; teamName: string; colourName: string; colour: string }>);

  if (!gameState.value) return teams;
  Object.keys(gameState.value).forEach((k) => {
    if (!gameState.value) return;
    const v = gameState.value[k as keyof typeof gameState.value] || 'unclaimed';
    teams[v].count = (teams[v].count ?? 0) + 1;
    const feature = mapData.features.find((f) => f.properties?.electorate === k);
    if (feature) {
      teams[v].area = (teams[v].area ?? 0) + (area(feature) * 0.000001 || 0);
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
      <div class="team" v-for="(value, key) in score" :key="key">
        <h3 :style="{ color: value.colour }">{{ value.teamName }}</h3>
        <div class="count" :style="{ color: value.colour }">
          {{ value.count }}
        </div>
        {{ value.area?.toFixed(1) }}km²
      </div>
    </div>
  </div>
  <div class="center">
    <div class="buttonHolder">
      <div class="currSelected">
        {{ currentlySelectedState }}
      </div>
      <template v-for="(value, key) in colours" :key="key">
        <button @click="claim(key as '1' | '2' | 'unclaimed')">{{ value.colourName }}</button>
      </template>
      <div class="recordControls">
        <button @click="recordFlyTo([138.8, -35.0], 12, 4000, 60)" :disabled="recording">
          {{ recording ? 'Recording...' : 'Record' }}
        </button>
        <div v-if="recording" class="progressBox">{{ recordProgress }}%</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map {
  width: 1920px;
  height: 1080px;
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
  align-items: center;
  display: grid;
  grid-template-columns: auto auto auto;
  grid-template-rows: auto auto;
}
.currSelected {
  grid-column: span 3;
  text-align: center;
  font-weight: bold;
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
  gap: 32px;
  h2 {
    margin: 0;
  }
  h3 {
    margin: 0;
  }
}
.team {
  /* opacity: 0.8; */
  background-color: #fafafa44;
}
.count {
  font-size: 2em;
  font-weight: bold;
}

button {
  padding: 8px 16px;
  /* font-size: 16px; */
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: #1e1e1e;
  color: white;
  transition: background-color 0.3s ease;
}

.recordControls {
  grid-column: span 3;
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}
.progressBox {
  min-width: 120px;
  text-align: center;
}
</style>
