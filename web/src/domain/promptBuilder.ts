/**
 * 提示词拼装器（纯逻辑，无 React / 无 DOM）。
 *
 * 为什么要它：主题模式的输入是一句「图生图提示词」，但让用户从零写一句话门槛太高。
 * 于是给一份**分组词库**（5 组共 32 个词，词库内容照设计稿），点一下就拼进提示词，
 * 并给实时预览与质量提示；写不动就「换一批灵感」（每组随机取一个）。
 *
 * 词库与灵感胶囊**逐字来自设计稿**（design.html 的 `PB` 与 `TH_IDEAS`），不许改写文案：
 * 提示词质量直接决定出图效果，词库是要拿去收集调参数据的。
 */

export interface PromptGroup {
  /** 组名（风格 / 色调 / 光线 / 镜头 / 氛围） */
  g: string;
  /** 该组的词 */
  w: string[];
}

/** 5 组词库（设计稿 PB，共 32 个词） */
export const PROMPT_GROUPS: PromptGroup[] = [
  { g: '风格', w: ['富士胶片', '水彩手账', '油画厚涂', '赛博霓虹', '老电影胶片', '黑白胶片', '宝丽来', '连环画分镜'] },
  { g: '色调', w: ['暖黄秋天', '青灰低饱和', '高饱和', '复古褪色', '清晨冷调', '奶油白'] },
  { g: '光线', w: ['柔光', '逆光轮廓', '黄金时刻', '夜景霓虹', '阴天散射', '窗边侧光'] },
  { g: '镜头', w: ['25mm 广角', '50mm 标准', '85mm 人像', '微距特写', '低机位仰拍', '俯拍'] },
  { g: '氛围', w: ['旅途纪实', '静谧清晨', '热闹市集', '雨天街道', '节日灯火', '街头烟火'] },
];

/** 词库总词数（设计稿口径：32） */
export const PROMPT_WORD_COUNT = PROMPT_GROUPS.reduce((n, g) => n + g.w.length, 0);

/** 灵感胶囊（设计稿 TH_IDEAS，点一下整句填入） */
export const PROMPT_IDEAS: string[] = [
  '富士胶片旅拍，暖黄秋天，柔光，胶片颗粒',
  '水彩手账风，淡彩晕染，留白多',
  '老电影海报，高对比蓝橙，颗粒感',
  '连环画分镜，粗描边，波普色',
  '美食地图拼贴，暖色，店铺霓虹',
  '英伦阴天，低饱和，青灰调',
];

/** 拼装：手写句 + 点选词（按点选顺序），用「，」连接；两侧空值都过滤掉 */
export function buildPrompt(custom: string, words: readonly string[]): string {
  const c = (custom || '').trim();
  const ws = words.filter((w) => !!w);
  return [c, ws.join('，')].filter(Boolean).join('，');
}

/** 点选 / 取消：已选则移除，未选则追加（保持点选顺序，天然去重） */
export function toggleWord(words: readonly string[], w: string): string[] {
  if (words.includes(w)) return words.filter((x) => x !== w);
  return [...words, w];
}

export type PromptQualityLevel = 'empty' | 'short' | 'ok';

export interface PromptQuality {
  level: PromptQualityLevel;
  /** 直接可显示的提示文案（含 ✓ / 字数），与设计稿一致 */
  hint: string;
  /** 提示词字符数 */
  length: number;
  /** 是否已经够格提交（原型只在 0 字时算「空」，短提示词只警告不拦） */
  ready: boolean;
}

/** 质量提示：0 字 → 提醒补风格词；<6 字 → 提醒补色调/光线；否则 ✓（设计稿 updatePrompt 的判定） */
export function qualityOf(full: string): PromptQuality {
  const n = (full || '').length;
  if (n === 0) return { level: 'empty', hint: '再补一个风格词，生成会更稳', length: n, ready: false };
  if (n < 6) return { level: 'short', hint: '有点短，再加一个色调或光线词', length: n, ready: true };
  return { level: 'ok', hint: `✓ 看起来不错（${n} 字）`, length: n, ready: true };
}

/** 「换一批灵感」：每组随机取一个词（rand 可注入，便于单测） */
export function surpriseWords(rand: () => number = Math.random): string[] {
  return PROMPT_GROUPS.map((g) => g.w[Math.floor(rand() * g.w.length)] ?? g.w[0]);
}

/** 灵感胶囊按索引取（越界取模） */
export function ideaAt(i: number): string {
  const n = PROMPT_IDEAS.length;
  return PROMPT_IDEAS[((i % n) + n) % n];
}

/** 主题名 = 提示词前 10 字（设计稿口径）；空提示词回落到「未命名主题」 */
export function themeNameFromPrompt(prompt: string): string {
  const p = (prompt || '').trim();
  return p ? p.slice(0, 10) : '未命名主题';
}

/** 提示词预览区文案（未填时的引导语与设计稿一致） */
export const PROMPT_EMPTY_PREVIEW = '上面写一句，或用下面的词拼一个';
