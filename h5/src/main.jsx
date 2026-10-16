import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initPwa, registerServiceWorker } from './lib/pwa';
import './styles.css';

if (!window.location.hash) window.location.replace(`${window.location.pathname}${window.location.search}#/`);

initPwa();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
