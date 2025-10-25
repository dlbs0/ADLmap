<script setup lang="ts">
import mapboxgl, { PointLike } from 'mapbox-gl';
import { computed, onMounted, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { gameState as gameStateInitial, mapData } from './data';
import { area } from '@turf/turf';
import type { FeatureCollection, Point } from '@turf/turf';
import { Output, BufferTarget, Mp4OutputFormat, CanvasSource, QUALITY_HIGH } from 'mediabunny';
import { useStorage } from '@vueuse/core';

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

const gameState = useStorage('gameState', gameStateInitial);

interface BoardState {
  markerLocations: Record<string, [number, number]>;
  camera: { center: [number, number]; zoom: number };
  exitDurationMs: number;
  holdDurationMs: number;
  gameState: typeof gameStateInitial;
}

const currentBoardState: Ref<BoardState> = ref({
  markerLocations: {},
  camera: { center: [138.5311, -34.9462], zoom: 10 },
  exitDurationMs: 1000,
  holdDurationMs: 1000,
  gameState: gameStateInitial
});

const boardStates: Ref<BoardState[]> = useStorage('boardState', []);
// setDoc(doc(db, 'gameState', 'game1'), gameState.value, { merge: false });
const markersGeoData: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: currentBoardState.value.markerLocations.team1 || [138.5011, -34.9462]
      },
      properties: {
        id: 'team1-marker',
        colour: '#F84C4C'
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: currentBoardState.value.markerLocations.team2 || [138.5611, -34.9462]
      },
      properties: {
        id: 'team2-marker',
        colour: '#4C8FF8'
      }
    }
  ]
};

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
        'fill-opacity': ['case', ['!=', ['get', 'fillColor'], '#088'], 0.5, 0],
        'fill-color-transition': { duration: 500 },
        'fill-opacity-transition': { duration: 500 }
      }
    });
    map.addLayer({
      id: 'areasOutlineBase',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': '#FFF',
        'line-opacity': 1,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 14, 6]
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 4]
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
    const canvas = map.getCanvasContainer();

    // ensure a GeoJSON source exists for the point layer so we can update it with setData
    map.addSource('point', { type: 'geojson', data: markersGeoData });
    map.addLayer({
      id: 'point',
      type: 'circle',
      source: 'point',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 20],
        'circle-color': ['get', 'colour'],
        'circle-stroke-color': '#FFF',
        'circle-stroke-width': 2
      }
    });
    let draggingPoint: null | string = null;
    function onMove(e: { point: PointLike | [PointLike, PointLike]; lngLat: any }) {
      if (draggingPoint == null) {
        const features = map?.queryRenderedFeatures(e.point, { layers: ['point'] });
        // Set a UI indicator for dragging.
        canvas.style.cursor = 'grabbing';

        // Update the point feature in `point` source with new coordinates
        if (features && features.length > 0) {
          const id = features[0].properties?.id;
          if (!id) return;
          draggingPoint = id;
        }
      }
      const marker = markersGeoData.features.find((f) => f.properties?.id === draggingPoint);
      if (!marker) return;
      marker.geometry.coordinates = [e.lngLat.lng, e.lngLat.lat];
      const pointSource = map?.getSource('point') as mapboxgl.GeoJSONSource | undefined;
      if (pointSource) {
        pointSource.setData(markersGeoData);
      }
    }

    function onUp() {
      canvas.style.cursor = '';
      draggingPoint = null;
      map?.off('mousemove', onMove);
      map?.off('touchmove', onMove);
      currentBoardState.value.markerLocations = {
        team1: markersGeoData.features.find((f) => f.properties?.id === 'team1-marker')?.geometry.coordinates as [number, number],
        team2: markersGeoData.features.find((f) => f.properties?.id === 'team2-marker')?.geometry.coordinates as [number, number]
      };
    }

    // When the cursor enters a feature in
    // the point layer, prepare for dragging.
    map.on('mouseenter', 'point', () => {
      // map?.setPaintProperty('point', 'circle-color', '#3bb2d0');
      canvas.style.cursor = 'move';
    });

    map.on('mouseleave', 'point', () => {
      // map?.setPaintProperty('point', 'circle-color', '#3887be');
      canvas.style.cursor = '';
    });

    map.on('mousedown', 'point', (e) => {
      // Prevent the default map drag behavior.
      e.preventDefault();

      canvas.style.cursor = 'grab';

      map?.on('mousemove', onMove);
      map?.once('mouseup', onUp);
    });

    map.on('touchstart', 'point', (e) => {
      if (e.points.length !== 1) return;

      // Prevent the default map drag behavior.
      e.preventDefault();

      map?.on('touchmove', onMove);
      map?.once('touchend', onUp);
    });

    updateMap();
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
async function recordFlyTo(record: boolean, fps = 30) {
  if (!map) return;
  if (recording.value) return;
  recording.value = true;
  recordProgress.value = 0;

  gameState.value = { ...gameStateInitial };
  updateMap();
  if (boardStates.value.length > 0)
    map.jumpTo({ center: boardStates.value[0].camera.center, zoom: boardStates.value[0].camera.zoom });
  await new Promise((r) => setTimeout(r, 100));

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

  if (record) await output.start();

  // deterministic timing
  let now = performance.now();
  // Calculate total duration from board states
  const durationMs = boardStates.value.reduce((acc, state) => acc + state.exitDurationMs + state.holdDurationMs, 0);
  const startTime = now;
  const endTime = startTime + durationMs;
  const hasSetNow = typeof (mapboxgl as any).setNow === 'function';
  if (hasSetNow && record) (mapboxgl as any).setNow(now);

  function captureMap(frameNum: number) {
    console.log('Capturing frame:', frameNum);
    let numCapsForThisFrame = 0;
    return new Promise<void>((resolve, reject) => {
      if (!map) {
        reject();
        return;
      }
      const exitTimer = setTimeout(exit, 500);
      map.on('render', capture);
      map.triggerRepaint();

      function capture() {
        numCapsForThisFrame += 1;
        videoSource.add(frameNum / fps, 1 / fps).catch((e) => reject(e));
        if (numCapsForThisFrame > 3) exit();
        return;
      }
      function exit() {
        clearTimeout(exitTimer);
        if (numCapsForThisFrame == 0)
          videoSource
            .add(frameNum / fps, 1 / fps)
            .then(() => resolve())
            .catch((e) => reject(e));
        else resolve();
        map?.off('render', capture);
      }
    });
  }

  let lastGameStateIndex = -1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  async function showMapState(now: number, frameNum: number) {
    // find the right frame based on now - startTime
    const elapsedMs = now - startTime;
    let accumulatedMs = 0;
    let lastMarkerPositions: Record<string, [number, number]> = boardStates.value[0]?.markerLocations || {
      team1: [138.5011, -34.9462],
      team2: [138.5611, -34.9462]
    };
    for (const state of boardStates.value) {
      const stateDurationMs = state.exitDurationMs + state.holdDurationMs;
      if (elapsedMs >= accumulatedMs && elapsedMs < accumulatedMs + stateDurationMs) {
        // in this state
        if (boardStates.value.indexOf(state) !== lastGameStateIndex) {
          lastGameStateIndex = boardStates.value.indexOf(state);
          console.log('Entering board state index:', lastGameStateIndex);
          gameState.value = { ...state.gameState };
          updateMap();
        }
        const stateElapsedMs = elapsedMs - accumulatedMs;
        const team1Marker = [
          lerp(
            lastMarkerPositions.team1[0],
            state.markerLocations.team1[0],
            stateElapsedMs / (state.holdDurationMs + state.exitDurationMs)
          ),
          lerp(
            lastMarkerPositions.team1[1],
            state.markerLocations.team1[1],
            stateElapsedMs / (state.holdDurationMs + state.exitDurationMs)
          )
        ];
        const team2Marker = [
          lerp(
            lastMarkerPositions.team2[0],
            state.markerLocations.team2[0],
            stateElapsedMs / (state.holdDurationMs + state.exitDurationMs)
          ),
          lerp(
            lastMarkerPositions.team2[1],
            state.markerLocations.team2[1],
            stateElapsedMs / (state.holdDurationMs + state.exitDurationMs)
          )
        ];
        markersGeoData.features.forEach((feature) => {
          if (feature.properties?.id === 'team1-marker') {
            feature.geometry.coordinates = team1Marker;
          }
          if (feature.properties?.id === 'team2-marker') {
            feature.geometry.coordinates = team2Marker;
          }
        });
        (map?.getSource('point') as mapboxgl.GeoJSONSource | undefined)?.setData(markersGeoData);
        if (stateElapsedMs < state.holdDurationMs) {
          // holding
          map?.jumpTo({ center: state.camera.center, zoom: state.camera.zoom });
          //lerp the marker positions for the duration of the hold
        } else {
          // transitioning to next state
          const t = (stateElapsedMs - state.holdDurationMs) / state.exitDurationMs;
          const nextState = boardStates.value[boardStates.value.indexOf(state) + 1];
          if (nextState) {
            const center: [number, number] = [
              lerp(state.camera.center[0], nextState.camera.center[0], t),
              lerp(state.camera.center[1], nextState.camera.center[1], t)
            ];
            const zoom = lerp(state.camera.zoom, nextState.camera.zoom, t);
            map?.jumpTo({ center, zoom });
          }
        }
        if (record) await captureMap(frameNum);
        break;
      }
      accumulatedMs += stateDurationMs;
      lastMarkerPositions = { ...state.markerLocations };
    }
  }

  let frameNum = 0;
  while (now <= endTime) {
    await showMapState(now, frameNum);
    frameNum += 1;

    if (!record) now = performance.now();
    else {
      now += 1000 / fps;
      if (hasSetNow && record) (mapboxgl as any).setNow(now);
    }

    await new Promise((r) => requestAnimationFrame(r));
    recordProgress.value = Math.min(100, Math.round(((now - startTime) / durationMs) * 100));
  }
  console.log('Finished all frames');
  if (hasSetNow && typeof (mapboxgl as any).restoreNow === 'function') (mapboxgl as any).restoreNow();

  // Handle finalising the recording and exporting as video

  if (record) {
    await output.finalize();
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
  }
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
  gameState.value = {
    ...gameState.value,
    [key1]: claimer
  };
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

function saveFrame(index?: number, insert = false) {
  const newFrame = JSON.parse(JSON.stringify(currentBoardState.value));
  newFrame.frameDurationMs = 1000;
  newFrame.camera.center = map?.getCenter().toArray() as [number, number];
  newFrame.camera.zoom = map?.getZoom() || 10;
  newFrame.gameState = JSON.parse(JSON.stringify(gameState.value));
  newFrame.markerLocations = { ...currentBoardState.value.markerLocations };

  if (insert) boardStates.value.splice(index || 0, 0, newFrame);
  else if (typeof index == 'undefined') boardStates.value.push(newFrame);
  else boardStates.value[index] = newFrame;
}

function loadFrame(index: number) {
  const frame = boardStates.value[index];
  if (!frame) return;
  currentBoardState.value = JSON.parse(JSON.stringify(frame));
  gameState.value = JSON.parse(JSON.stringify(frame.gameState));
  updateMap();
  map?.jumpTo({ center: frame.camera.center, zoom: frame.camera.zoom });
  markersGeoData.features.forEach((feature) => {
    if (feature.properties?.id === 'team1-marker' && frame.markerLocations.team1) {
      feature.geometry.coordinates = frame.markerLocations.team1;
    }
    if (feature.properties?.id === 'team2-marker' && frame.markerLocations.team2) {
      feature.geometry.coordinates = frame.markerLocations.team2;
    }
  });
  (map?.getSource('point') as mapboxgl.GeoJSONSource | undefined)?.setData(markersGeoData);
}
</script>

<template>
  <link href="https://api.tiles.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css" rel="stylesheet" />

  <div class="framesContainer">
    <template v-for="(state, index) in boardStates" :key="index">
      <button style="height: 3em" @click="saveFrame(index, true)">+</button>
      <div class="frame" :id="`mapFrame${index}`">
        <button @click="boardStates.splice(index, 1)">Delete</button>
        <button @click="loadFrame(index)">Load</button>
        <button @click="saveFrame(index)">Save</button>
        <br />
        Hold time<input label="Hold time" type="number" v-model.number="state.holdDurationMs" />ms
        <br />
        Exit time<input type="number" v-model.number="state.exitDurationMs" />ms {{ state.camera.center }} /
        {{ state.camera.zoom }}
      </div>
    </template>
    <div class="frame">
      Add Frame
      <button @click="saveFrame()">+</button>
    </div>
  </div>
  <div class="mapWrapper">
    <div id="map" class="map"></div>
    <div class="gridOverlay" aria-hidden="true">
      <div class="vline" style="left: 33.3333%"></div>
      <div class="vline" style="left: 66.6666%"></div>
      <div class="hline" style="top: 33.3333%"></div>
      <div class="hline" style="top: 66.6666%"></div>
      <div class="centerCross"></div>
    </div>
  </div>
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
        <button @click="recordFlyTo(false)" :disabled="recording">
          {{ recording ? 'Playing...' : 'Play' }}
        </button>
        <button @click="recordFlyTo(true)" :disabled="recording">
          {{ recording ? 'Recording...' : 'Record' }}
        </button>
        <div v-if="recording" class="progressBox">{{ recordProgress }}%</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.frame {
  margin: 4px;
  width: 200px;
  height: 180px;
  border: #1e1e1e 2px solid;
  border-radius: 4px;
}
.framesContainer {
  display: flex;
}
.mapWrapper {
  width: 1920px;
  height: 1080px;
  position: relative;
}
.map {
  width: 100%;
  height: 100%;
}

.gridOverlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 2;
}
.gridOverlay .vline,
.gridOverlay .hline {
  position: absolute;
  background: rgba(129, 129, 129, 0.65);
  mix-blend-mode: overlay;
}
.gridOverlay .vline {
  width: 1px;
  top: 0;
  bottom: 0;
}
.gridOverlay .hline {
  height: 1px;
  left: 0;
  right: 0;
}
.gridOverlay .centerCross {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
}
.gridOverlay .centerCross:before,
.gridOverlay .centerCross:after {
  content: '';
  position: absolute;
  background: rgba(109, 109, 109, 0.75);
}
.gridOverlay .centerCross:before {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}
.gridOverlay .centerCross:after {
  top: 50%;
  left: 0;
  height: 1px;
  width: 100%;
  transform: translateY(-50%);
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
  bottom: 10px;
  right: 0px;
  z-index: 10;
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
