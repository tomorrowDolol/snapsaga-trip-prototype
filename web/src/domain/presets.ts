/** 主题修图风格 / 拍立得胶片 / 手写注记（与根目录原型逐字一致，prompt 不许改写：D1 靠它收集调参数据） */

export interface EditStyle {
  k: string;
  n: string;
  prompt: string;
  /** 本地滤镜用的 CSS filter 串（离线可用） */
  css: string;
  overlay: string;
}

export const STYLES: EditStyle[] = [
  {
    k: 'summer',
    n: '夏日动画风',
    prompt:
      'Redraw this photo in a warm hand-drawn anime summer style: luminous saturated greens, translucent blue sky with towering cumulus clouds, soft golden light halos, gentle painterly texture. Strictly keep the original composition, subject positions and number of people unchanged.',
    css: 'saturate(1.5) contrast(1.08) brightness(1.07) hue-rotate(-6deg)',
    overlay: 'rgba(255,196,80,.10)',
  },
  {
    k: 'ink',
    n: '水墨江南',
    prompt:
      'Redraw this photo as a Chinese ink-wash painting: monochrome ink gradients on rice paper, misty negative space, soft brush edges, a single restrained vermilion seal accent. Keep the original composition and subjects recognizable.',
    css: 'grayscale(.85) contrast(1.15) brightness(1.06)',
    overlay: 'rgba(246,239,221,.16)',
  },
  {
    k: 'film',
    n: '复古胶片',
    prompt:
      'Redraw this photo as vintage 35mm film photography: warm faded tones, soft grain, gentle vignette, slightly lifted blacks, 1970s travel postcard mood. Keep composition and subjects unchanged.',
    css: 'sepia(.32) saturate(1.12) contrast(1.04)',
    overlay: 'rgba(120,80,40,.08)',
  },
  {
    k: 'cyber',
    n: '赛博都市',
    prompt:
      'Redraw this photo as a cyberpunk city nightscape style: neon teal and magenta rim light, wet reflective surfaces, cinematic haze, high contrast. Keep the original composition and subjects unchanged.',
    css: 'contrast(1.18) saturate(1.45) hue-rotate(-10deg)',
    overlay: 'rgba(90,0,140,.14)',
  },
  {
    k: 'warm',
    n: '暖阳',
    prompt:
      'Redraw this photo with warm late-afternoon sunlight: golden hour glow, soft long shadows, honey-toned highlights. Keep composition and subjects unchanged.',
    css: 'brightness(1.06) saturate(1.18) sepia(.14)',
    overlay: 'rgba(255,150,60,.10)',
  },
];

export function styleByKey(k: string | null | undefined): EditStyle {
  return STYLES.find((s) => s.k === k) ?? STYLES[0];
}

/** 拍照自动生图的强度，与修图页默认一致 */
export const GEN_STRENGTH = 0.7;

export interface FilmSpec {
  label: string;
  tint: string;
  contrast: number;
  wide?: boolean;
}

export const FILMS: Record<string, FilmSpec> = {
  '600': { label: '600', tint: 'rgba(255,190,120,.10)', contrast: 1.04 },
  sx70: { label: 'SX-70', tint: 'rgba(255,150,150,.12)', contrast: 1.1 },
  wide: { label: '宽幅', tint: 'rgba(150,200,255,.08)', contrast: 1.0, wide: true },
};

export const NOTES = [
  '把今天存进相纸里',
  '风是甜的，云是软的',
  '慢一点，再慢一点',
  '这一刻值得慢门显影',
  '山川湖海，都是回礼',
  '出发本身就是意义',
  '今天的晚霞不营业也好看',
  '我们和落日都准时',
  '走神的一秒被拍下来了',
  '包里装着整个夏天',
  '路比地图长，快乐也是',
  '下一次还来',
];

export function pickRandomNote(): string {
  return NOTES[Math.floor(Math.random() * NOTES.length)];
}
