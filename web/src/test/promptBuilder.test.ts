/**
 * 提示词拼装器单测：点选 / 去重 / 预览 / 质量提示 / 换一批灵感 / 清空 / 主题名。
 * 词库内容与设计稿逐字一致（5 组共 32 个词），这里把「词库口径」也钉成断言 —— 改词库必须是有意为之。
 */
import { describe, expect, it } from 'vitest';
import {
  PROMPT_EMPTY_PREVIEW,
  PROMPT_GROUPS,
  PROMPT_IDEAS,
  PROMPT_WORD_COUNT,
  buildPrompt,
  ideaAt,
  qualityOf,
  surpriseWords,
  themeNameFromPrompt,
  toggleWord,
} from '../domain/promptBuilder';

describe('词库与灵感（设计稿口径）', () => {
  it('5 组词库、共 32 个词，组名与设计稿一致', () => {
    expect(PROMPT_GROUPS.map((g) => g.g)).toEqual(['风格', '色调', '光线', '镜头', '氛围']);
    expect(PROMPT_GROUPS.map((g) => g.w.length)).toEqual([8, 6, 6, 6, 6]);
    expect(PROMPT_WORD_COUNT, '词库总词数 = 32').toBe(32);
  });

  it('词库里的词不重复（拼出来的提示词不会自己撞车）', () => {
    const all = PROMPT_GROUPS.flatMap((g) => g.w);
    expect(new Set(all).size).toBe(all.length);
  });

  it('灵感胶囊 6 条，越界取模', () => {
    expect(PROMPT_IDEAS.length).toBe(6);
    expect(ideaAt(0)).toBe(PROMPT_IDEAS[0]);
    expect(ideaAt(6)).toBe(PROMPT_IDEAS[0]);
    expect(ideaAt(-1)).toBe(PROMPT_IDEAS[5]);
  });

  it('预览空态文案与设计稿一致', () => {
    expect(PROMPT_EMPTY_PREVIEW).toBe('上面写一句，或用下面的词拼一个');
  });
});

describe('拼装：点选 / 去重 / 预览', () => {
  it('点一下加入、再点一下移除，顺序按点选顺序（天然去重）', () => {
    let words: string[] = [];
    words = toggleWord(words, '富士胶片');
    words = toggleWord(words, '柔光');
    words = toggleWord(words, '暖黄秋天');
    expect(words).toEqual(['富士胶片', '柔光', '暖黄秋天']);
    words = toggleWord(words, '柔光');
    expect(words, '再点一次移除').toEqual(['富士胶片', '暖黄秋天']);
    words = toggleWord(words, '富士胶片');
    words = toggleWord(words, '富士胶片');
    expect(words, '同一个词不会出现两次').toEqual(['暖黄秋天', '富士胶片']);
  });

  it('手写句 + 点选词按「，」连接；两侧空值都过滤', () => {
    expect(buildPrompt('富士胶片旅拍', ['暖黄秋天', '柔光'])).toBe('富士胶片旅拍，暖黄秋天，柔光');
    expect(buildPrompt('', ['柔光']), '没手写就只有词').toBe('柔光');
    expect(buildPrompt('只写了手写句', []), '没点词就只有手写句').toBe('只写了手写句');
    expect(buildPrompt('   ', []), '纯空白等于没写').toBe('');
    expect(buildPrompt(' 前后有空格 ', ['柔光']), '手写句会 trim').toBe('前后有空格，柔光');
  });

  it('「换一批灵感」每组各取一个词（rand 可注入）', () => {
    const first = surpriseWords(() => 0);
    expect(first, '每组取第一个词').toEqual(['富士胶片', '暖黄秋天', '柔光', '25mm 广角', '旅途纪实']);
    const last = surpriseWords(() => 0.999);
    expect(last.length).toBe(PROMPT_GROUPS.length);
    last.forEach((w, i) => expect(PROMPT_GROUPS[i].w).toContain(w));
  });

  it('换一批 + 拼装可以串起来用', () => {
    const p = buildPrompt('', surpriseWords(() => 0.5));
    expect(p.split('，').length).toBe(5);
  });
});

describe('质量提示（设计稿的三档判定）', () => {
  it('0 字 → 提醒补风格词，且不算可提交', () => {
    const q = qualityOf('');
    expect(q.level).toBe('empty');
    expect(q.hint).toBe('再补一个风格词，生成会更稳');
    expect(q.ready).toBe(false);
    expect(q.length).toBe(0);
  });

  it('少于 6 字 → 提醒补色调 / 光线词（只警告，不拦提交）', () => {
    const q = qualityOf('柔光');
    expect(q.level).toBe('short');
    expect(q.hint).toBe('有点短，再加一个色调或光线词');
    expect(q.ready, '短提示词只警告，不禁止生成').toBe(true);
    expect(q.length).toBe(2);
  });

  it('6 字及以上 → ✓ 并给出字数', () => {
    const q = qualityOf('富士胶片旅拍，柔光');
    expect(q.level).toBe('ok');
    expect(q.hint).toBe('✓ 看起来不错（9 字）');
    expect(q.length).toBe(9);
  });

  it('边界：恰好 6 字算 ok', () => {
    expect(qualityOf('一二三四五六').level).toBe('ok');
    expect(qualityOf('一二三四五').level).toBe('short');
  });

  it('拼装后的提示词质量随之提升（拼两个词就过线）', () => {
    expect(qualityOf(buildPrompt('', [])).level).toBe('empty');
    expect(qualityOf(buildPrompt('', ['富士胶片'])).level).toBe('short');
    expect(qualityOf(buildPrompt('', ['富士胶片', '柔光'])).level).toBe('ok');
  });
});

describe('主题名', () => {
  it('取提示词前 10 字；空提示词回落「未命名主题」', () => {
    expect(themeNameFromPrompt('富士胶片旅拍，暖黄秋天，柔光')).toBe('富士胶片旅拍，暖黄秋');
    expect(themeNameFromPrompt('   ')).toBe('未命名主题');
    expect(themeNameFromPrompt('')).toBe('未命名主题');
  });
});
