// 轻量全局 UI：替代小程序的 wx.showToast / wx.showModal，任意模块可直接调用
const listeners = new Set();

function emit(payload) {
  listeners.forEach(fn => fn(payload));
}

export function subscribeUi(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toast(message, duration = 2200) {
  if (!message) return;
  emit({ type: 'toast', message, duration });
}

export function confirm(options) {
  return new Promise(resolve => {
    emit({
      type: 'confirm',
      title: options.title || '提示',
      content: options.content || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      danger: options.danger === true,
      showCancel: options.showCancel !== false,
      resolve
    });
  });
}
