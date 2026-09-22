/**
 * 设置与凭证：localStorage 键名与根目录单文件原型**完全一致**，两个入口（根 index.html 与新
 * web/ 应用）同源共享同一份浏览器数据，任何一边填过的设置另一边打开就直接可用。
 *
 * 键名清单（改动即破坏向后兼容，别动）：
 *   ss_ai_base / ss_ai_key / ss_ai_model / ss_gen_auto / ss_gen_style / snapsaga_geo
 */

export const LS = {
  aiBase: 'ss_ai_base',
  aiKey: 'ss_ai_key',
  aiModel: 'ss_ai_model',
  genAuto: 'ss_gen_auto',
  genStyle: 'ss_gen_style',
  geo: 'snapsaga_geo',
} as const;

export const AI_BASE_DEFAULT = 'https://api.klong.lat/v1'; // 默认生图 Base（可在设置里改，改后存本机）
export const AI_BASE_LEGACY = 'https://api.openai.com/v1'; // 旧默认：仅用于识别「没主动改过、只是沿用了默认值」
export const AI_MODEL_DEFAULT = 'gpt-image-2';

/**
 * 未填过 → 用默认值；填过 → 用用户的值（去掉尾部 `/`）。
 * 保存值恰好等于旧默认 openai 的浏览器会被切到新默认（见 iteration-log K11）。
 */
export function resolveAiBase(saved: string | null | undefined): string {
  const v = (saved ?? '').trim();
  if (!v || v === AI_BASE_LEGACY) return AI_BASE_DEFAULT;
  return v.replace(/\/+$/, '');
}

export interface AiCreds {
  base: string;
  key: string;
  model: string;
}

export function aiBaseSetting(storage: Pick<Storage, 'getItem'> = localStorage): string {
  return resolveAiBase(storage.getItem(LS.aiBase));
}

export function aiCreds(storage: Storage = localStorage): AiCreds {
  return {
    base: aiBaseSetting(storage),
    key: storage.getItem(LS.aiKey) || '',
    model: storage.getItem(LS.aiModel) || AI_MODEL_DEFAULT,
  };
}

/** 「拍完自动生图」开关：默认开（只有显式存过 '0' 才算关） */
export function genAutoSetting(storage: Storage = localStorage): boolean {
  return storage.getItem(LS.genAuto) !== '0';
}

export function saveAiSettings(base: string, key: string, model: string, storage: Storage = localStorage): void {
  storage.setItem(LS.aiBase, base.trim());
  storage.setItem(LS.aiKey, key.trim());
  storage.setItem(LS.aiModel, model.trim() || AI_MODEL_DEFAULT);
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export function loadGeo(storage: Storage = localStorage): GeoPoint | null {
  try {
    const raw = storage.getItem(LS.geo);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeoPoint | null;
    if (!parsed || typeof parsed.lat !== 'number' || typeof parsed.lon !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGeo(geo: GeoPoint, storage: Storage = localStorage): void {
  storage.setItem(LS.geo, JSON.stringify(geo));
}
