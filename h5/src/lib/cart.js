import { useEffect, useState } from 'react';
import { getProducts } from './catalog';

const STORAGE_KEY = 'snack-cart-v1';
const MAX_PER_ITEM = 20;
const listeners = new Set();

function readQuantities() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const quantities = {};
  getProducts().forEach(product => {
    const count = saved[product.id];
    if (Number.isInteger(count) && count > 0 && count <= MAX_PER_ITEM) quantities[product.id] = count;
  });
  return quantities;
}

export function getSummary() {
  const quantities = readQuantities();
  const items = getProducts().filter(product => quantities[product.id]).map(product => ({
    ...product,
    quantity: quantities[product.id],
    subtotal: ((product.priceCents * quantities[product.id]) / 100).toFixed(2)
  }));
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return { items, count, total: (totalCents / 100).toFixed(2) };
}

function notify() {
  const summary = getSummary();
  listeners.forEach(fn => fn(summary));
}

export function change(id, delta) {
  if (!getProducts().some(product => product.id === id) || (delta !== 1 && delta !== -1)) return getSummary();
  const quantities = readQuantities();
  const next = Math.max(0, Math.min(MAX_PER_ITEM, (quantities[id] || 0) + delta));
  if (next) quantities[id] = next;
  else delete quantities[id];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(quantities)); } catch (e) { /* ignore */ }
  notify();
  return getSummary();
}

export function clear() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  notify();
  return getSummary();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useCart() {
  const [summary, setSummary] = useState(() => getSummary());
  useEffect(() => subscribe(setSummary), []);
  return summary;
}
