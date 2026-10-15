/** 与小程序 app.wxss 保持一致的设计 token */
export const theme = {
  bg: '#F8F6F1',
  card: '#FFFFFF',
  text: '#26352E',
  muted: '#7C8B83',
  line: '#EDE7DC',
  brand: '#E2725B',
  brandSoft: '#FBE6DF',
  ok: '#3F8F6B',
  warn: '#C8792B',
  danger: '#C0503C',
  radius: 16,
  space: 14,
};

/** 商品卡片配色，与云函数里的 TONES 对齐 */
export const TONES: Record<string, string> = {
  peach: '#F6C6B4',
  cocoa: '#D8B49A',
  butter: '#F2DCA6',
  sage: '#BFD3B8',
  rose: '#EFC0C4',
  mango: '#F7CB8A',
  lemon: '#EEDF9B',
  oat: '#E3D9C6',
};

export function toneColor(tone: string): string {
  return TONES[tone] || TONES.oat;
}
