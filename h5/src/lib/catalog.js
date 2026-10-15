import { invoke } from './cloud';
import { read, write } from './cache';
import { categories } from './data';

const CACHE_KEY = 'catalog';
let products = [];
let loading = null;

function setProducts(list) {
  if (!Array.isArray(list)) return;
  const valid = list.filter(p => p && typeof p.id === 'string' && Number.isInteger(p.priceCents) && p.priceCents > 0);
  products = valid;
}

// 先用本地缓存的商品铺满首屏，随后由 loadProducts 刷新
setProducts(read(CACHE_KEY));

export function getProducts() { return products; }

export function loadProducts() {
  if (loading) return loading;
  loading = invoke('getCatalog')
    .then(list => {
      setProducts(list);
      write(CACHE_KEY, products);
      return products;
    })
    .finally(() => { loading = null; });
  return loading;
}

export { categories };
