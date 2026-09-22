/**
 * AI Base 取值逻辑：与 snapsaga_queue_check/check_ai_base.cjs 的断言一一对应
 * （默认真的生效、只填 Key 就算已配置、旧默认自动迁移、自定义值被尊重、请求 URL 正确）。
 * 那个脚本在真浏览器 + 真 localStorage 下跑，这里在 jsdom 的 localStorage 下跑同样的逻辑。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { aiCreds, aiBaseSetting, genAutoSetting, resolveAiBase, AI_BASE_DEFAULT, AI_BASE_LEGACY, AI_MODEL_DEFAULT, LS } from '../domain/settings';
import { aiRedrawUrl } from '../domain/aiRedraw';

describe('resolveAiBase', () => {
  it('未填过 → 用新默认（生图请求会用它）', () => {
    expect(resolveAiBase(null)).toBe(AI_BASE_DEFAULT);
    expect(resolveAiBase('')).toBe(AI_BASE_DEFAULT);
    expect(resolveAiBase('   ')).toBe(AI_BASE_DEFAULT);
  });
  it('旧默认 openai → 切到新默认', () => {
    expect(resolveAiBase(AI_BASE_LEGACY)).toBe(AI_BASE_DEFAULT);
  });
  it('用户显式填的自定义 Base 保留，并去掉尾部斜杠', () => {
    expect(resolveAiBase('https://my.gateway.example/v1/')).toBe('https://my.gateway.example/v1');
    expect(resolveAiBase('https://my.gateway.example/v1///')).toBe('https://my.gateway.example/v1');
    expect(resolveAiBase('https://my.gateway.example/v1')).toBe('https://my.gateway.example/v1');
  });
  it('新默认自己带不带斜杠都归一', () => {
    expect(resolveAiBase('https://api.klong.lat/v1/')).toBe(AI_BASE_DEFAULT);
  });
});

describe('localStorage 集成（键名必须与根目录原型一致）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('键名就是 ss_ai_base / ss_ai_key / ss_ai_model / ss_gen_auto / ss_gen_style', () => {
    expect([LS.aiBase, LS.aiKey, LS.aiModel, LS.genAuto, LS.genStyle]).toEqual([
      'ss_ai_base',
      'ss_ai_key',
      'ss_ai_model',
      'ss_gen_auto',
      'ss_gen_style',
    ]);
  });

  it('全新用户：base = 新默认、model = gpt-image-2', () => {
    const c = aiCreds();
    expect(c.base).toBe(AI_BASE_DEFAULT);
    expect(c.model).toBe(AI_MODEL_DEFAULT);
    expect(c.key).toBe('');
  });

  it('只填 Key（没碰 Base）→ 视为已配置', () => {
    localStorage.setItem(LS.aiKey, 'sk-demo');
    const c = aiCreds();
    expect(c.base).toBe(AI_BASE_DEFAULT);
    expect(c.key).toBe('sk-demo');
    expect(!!(c.base && c.key)).toBe(true);
  });

  it('沿用旧默认的浏览器会被切到新默认', () => {
    localStorage.setItem(LS.aiBase, AI_BASE_LEGACY);
    expect(aiCreds().base).toBe(AI_BASE_DEFAULT);
  });

  it('自定义 Base 不被覆盖', () => {
    localStorage.setItem(LS.aiBase, 'https://my.gateway.example/v1/');
    expect(aiCreds().base).toBe('https://my.gateway.example/v1');
    expect(aiBaseSetting()).toBe('https://my.gateway.example/v1');
  });

  it('genAuto 默认开，存 0 才算关', () => {
    expect(genAutoSetting()).toBe(true);
    localStorage.setItem(LS.genAuto, '0');
    expect(genAutoSetting()).toBe(false);
    localStorage.setItem(LS.genAuto, '1');
    expect(genAutoSetting()).toBe(true);
  });

  it('生图请求打到 <base>/images/edits', () => {
    expect(aiRedrawUrl(resolveAiBase(localStorage.getItem(LS.aiBase)))).toBe(AI_BASE_DEFAULT + '/images/edits');
    localStorage.setItem(LS.aiBase, 'https://my.gateway.example/v1');
    expect(aiRedrawUrl(aiCreds().base)).toBe('https://my.gateway.example/v1/images/edits');
  });
});
