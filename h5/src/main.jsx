import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if (!window.location.hash) window.location.replace(`${window.location.pathname}${window.location.search}#/`);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
