/**
 * 安装到手机桌面（PWA）相关能力：
 * - 捕获 Chrome / Android 的 beforeinstallprompt，供页面里的按钮触发原生安装
 * - 识别 iOS：没有原生安装 API，只能引导「分享 → 添加到主屏幕」
 * - 识别是否已经以独立窗口运行（已安装）
 */

let deferredPrompt = null;
let installedFlag = isStandalone();
const listeners = new Set();

function emit() {
  listeners.forEach(fn => fn());
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return !!(standalone || window.navigator.standalone === true);
}

export function isIos() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  const iOSDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  return iOSDevice && !window.MSStream;
}

export function isInstalled() {
  return installedFlag;
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

export function subscribeInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installedFlag = true;
    emit();
  });

  const media = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
  if (media && media.addEventListener) {
    media.addEventListener('change', (event) => {
      installedFlag = event.matches;
      emit();
    });
  }
}

/** 触发原生安装弹窗；返回是否真的弹出了 */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  emit();
  try {
    event.prompt();
    await event.userChoice;
  } catch (error) {
    /* 用户取消或浏览器不支持时忽略 */
  }
  return true;
}

/** 生产环境注册 Service Worker：离线外壳 + 满足「可安装」条件 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL || '/';
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* 注册失败不影响正常使用 */
    });
  });
}
