const categories = [
  { id: 'all', name: '全部' },
  { id: 'fresh', name: '新鲜食材' },
  { id: 'household', name: '居家日用' },
  { id: 'dairy', name: '牛奶乳品' }
];

const products = [];
const { callShop } = require('./snack-cloud');
let loadingPromise;

async function loadProducts() {
  if (!loadingPromise) {
    loadingPromise = callShop('getCatalog').then(list => {
      setProducts(list);
      return products;
    }).finally(() => { loadingPromise = null; });
  }
  return loadingPromise;
}

function setProducts(list) {
  if (!Array.isArray(list)) return;
  const valid = list.filter(p => p && typeof p.id === 'string' && Number.isInteger(p.priceCents) && p.priceCents > 0);
  products.splice(0, products.length, ...valid);
}

module.exports = { categories, products, setProducts, loadProducts };
