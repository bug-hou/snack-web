const { callShop } = require('./snack-cloud');
const { read, write } = require('./snack-cache');
const KEY = 'user-profile';

const EMPTY = { nickName: '', avatarUrl: '' };
const normalize = data => ({
  nickName: data && typeof data.nickName === 'string' ? data.nickName : '',
  avatarUrl: data && typeof data.avatarUrl === 'string' ? data.avatarUrl : ''
});

// 个人资料只用于「我的」页面展示，缓存一份便于秒开
function peekProfile() {
  const cached = read(KEY);
  return cached && typeof cached === 'object' ? normalize(cached) : { ...EMPTY };
}

async function loadProfile() {
  const data = normalize(await callShop('getProfile'));
  write(KEY, data);
  return data;
}

async function saveProfile(input) {
  const data = normalize(await callShop('saveProfile', {
    nickName: input && input.nickName ? input.nickName : '',
    avatarUrl: input && input.avatarUrl ? input.avatarUrl : ''
  }));
  write(KEY, data);
  return data;
}

module.exports = { peekProfile, loadProfile, saveProfile };
