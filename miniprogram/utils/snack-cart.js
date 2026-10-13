const { products } = require('./snack-catalog');
const STORAGE_KEY = 'snack-cart-v1';

function readQuantities() {
  let saved;
  try { saved = wx.getStorageSync(STORAGE_KEY); } catch (e) { return {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const quantities = {};
  products.forEach(product => {
    const count = saved[product.id];
    if (Number.isInteger(count) && count > 0 && count <= 20) quantities[product.id] = count;
  });
  return quantities;
}

function change(id, delta) {
  if (!products.some(product => product.id === id) || (delta !== 1 && delta !== -1)) return getSummary();
  const quantities = readQuantities();
  const next = Math.max(0, Math.min(20, (quantities[id] || 0) + delta));
  if (next) quantities[id] = next;
  else delete quantities[id];
  wx.setStorageSync(STORAGE_KEY, quantities);
  return getSummary();
}

function clear() {
  wx.removeStorageSync(STORAGE_KEY);
  return getSummary();
}

function getSummary() {
  const quantities = readQuantities();
  const items = products.filter(product => quantities[product.id]).map(product => ({
    ...product,
    quantity: quantities[product.id],
    subtotal: ((product.priceCents * quantities[product.id]) / 100).toFixed(2)
  }));
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return { items, count, total: (totalCents / 100).toFixed(2) };
}

module.exports = { getSummary, change, clear };
