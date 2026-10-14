const { callShop } = require('./snack-cloud');
const { read, write } = require('./snack-cache');
const KEY = 'shop-context';

// 仅缓存对所有顾客公开的店铺设置，不缓存身份信息。
function peekContext() {
  const cached = read(KEY);
  return cached && typeof cached === 'object' ? cached : null;
}

async function loadContext() {
  const context = await callShop('getContext');
  const { isOwner, ownOpenid, ...publicPart } = context || {};
  write(KEY, publicPart);
  return context;
}

module.exports = { peekContext, loadContext };
