import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import router from './router';

import './assets/main.css';

import { initializeApp } from 'firebase/app';
import { VueFire, VueFireAuth } from 'vuefire';

import { getFirestore, collection } from 'firebase/firestore';
// ... other firebase imports
const firebaseConfig = {
  apiKey: 'AIzaSyDlLdW6Ce7zP4QJwWTnqZ710psL4DiMSU0',
  authDomain: 'adljetlagmap.firebaseapp.com',
  projectId: 'adljetlagmap',
  storageBucket: 'adljetlagmap.firebasestorage.app',
  messagingSenderId: '1069443483517',
  appId: '1:1069443483517:web:f594952b90c7df8c042e14'
};

export const firebaseApp = initializeApp(firebaseConfig);

// used for the firestore refs
const db = getFirestore(firebaseApp);

const app = createApp(App);

app.use(createPinia());
app.use(VueFire, {
  firebaseApp,
  modules: []
});
app.use(router);

app.mount('#app');
