// 邻里广场（社区信息交流）板块与展示辅助
const BOARDS = [
  { id: 'all', name: '全部' },
  { id: 'chat', name: '邻里闲聊' },
  { id: 'help', name: '互助求助' },
  { id: 'lost', name: '失物招领' },
  { id: 'notice', name: '社区公告' }
];
const POST_BOARDS = BOARDS.filter(board => board.id !== 'all');
const BOARD_NAMES = BOARDS.reduce((map, board) => { map[board.id] = board.name; return map; }, {});

function boardName(id) { return BOARD_NAMES[id] || '邻里闲聊'; }

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  if (diff < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`;
  const date = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function excerpt(text, max = 80) {
  const flat = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

module.exports = { BOARDS, POST_BOARDS, boardName, timeAgo, excerpt };
