/**
 * 场景插画单测：只测「结构 / 唯一性 / 取模 / 转义」这些能自动化的不变量。
 * 视觉一致性靠 sceneArt.ts 里逐字照抄设计稿的字符串（见该文件头注释），
 * 「肉眼和设计稿一致」在浏览器里看，不在单测里断言。
 */
import { describe, expect, it } from 'vitest';
import {
  SCENE_ART_COUNT,
  __resetArtIds,
  filmCanisterSvg,
  sceneArtSvg,
  sceneSkinSvg,
} from '../domain/sceneArt';

/** 把自增 id 抹平成占位符，用来比较「视觉骨架」（只差 id 时应当相等） */
const skeleton = (svg: string) => svg.replace(/ss-art-\d+/g, 'X');
const countOf = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const idsOf = (s: string) => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);

describe('sceneArtSvg：8 张场景插画', () => {
  it('SCENE_ART_COUNT = 8', () => {
    expect(SCENE_ART_COUNT).toBe(8);
  });

  it('每张都以 <svg viewBox="0 0 390 430" 开头、</svg> 结尾、长度 > 300', () => {
    for (let i = 0; i < SCENE_ART_COUNT; i++) {
      const svg = sceneArtSvg(i);
      expect(svg.startsWith('<svg viewBox="0 0 390 430"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg.length).toBeGreaterThan(300);
    }
  });

  it('都带 preserveAspectRatio="xMidYMid slice"（与设计稿一致）', () => {
    for (let i = 0; i < SCENE_ART_COUNT; i++) {
      expect(sceneArtSvg(i)).toContain('preserveAspectRatio="xMidYMid slice"');
    }
  });

  it('8 张彼此不同（抹平 id 后依然互不相等）', () => {
    const bodies = Array.from({ length: SCENE_ART_COUNT }, (_, i) => skeleton(sceneArtSvg(i)));
    expect(new Set(bodies).size).toBe(SCENE_ART_COUNT);
  });
});

describe('sceneArtSvg：id 唯一', () => {
  it('连续调用 16 次，抽出的所有 id 全局唯一', () => {
    __resetArtIds();
    const all: string[] = [];
    for (let i = 0; i < 16; i++) all.push(...idsOf(sceneArtSvg(i)));
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => id.startsWith('ss-art-'))).toBe(true);
  });

  it('__resetArtIds() 之后计数器归零（id 会复用）', () => {
    __resetArtIds();
    const first = idsOf(sceneArtSvg(2));
    __resetArtIds();
    expect(idsOf(sceneArtSvg(2))).toEqual(first);
  });
});

describe('sceneArtSvg：索引取模', () => {
  it('sceneArtSvg(9) 与 sceneArtSvg(1) 的骨架一致（标签数相同）', () => {
    const a = sceneArtSvg(9);
    const b = sceneArtSvg(1);
    expect(countOf(a, /<[a-zA-Z]/g)).toBe(countOf(b, /<[a-zA-Z]/g));
    expect(skeleton(a)).toBe(skeleton(b));
  });

  it('负索引也取模：-1 → 7，-8 → 0', () => {
    expect(skeleton(sceneArtSvg(-1))).toBe(skeleton(sceneArtSvg(7)));
    expect(skeleton(sceneArtSvg(-8))).toBe(skeleton(sceneArtSvg(0)));
  });

  it('16 = 0、17 = 1（跨一轮后仍对齐）', () => {
    expect(skeleton(sceneArtSvg(16))).toBe(skeleton(sceneArtSvg(0)));
    expect(skeleton(sceneArtSvg(17))).toBe(skeleton(sceneArtSvg(1)));
  });
});

describe('sceneArtSvg：tint overlay', () => {
  it('传 tint 时多出 2 个 <rect>', () => {
    const plain = countOf(sceneArtSvg(3), /<rect/g);
    const tinted = countOf(sceneArtSvg(3, '#E9B44C'), /<rect/g);
    expect(tinted - plain).toBe(2);
  });

  it('两层 overlay 分别带 mix-blend-mode:overlay 与 opacity=".18"', () => {
    const svg = sceneArtSvg(0, '#E9B44C');
    expect(svg).toContain('<rect width="390" height="430" fill="#E9B44C" style="mix-blend-mode:overlay"/>');
    expect(svg).toContain('<rect width="390" height="430" fill="#E9B44C" opacity=".18"/>');
    expect(countOf(svg, /#E9B44C/g)).toBe(2);
  });

  it('空字符串 tint 视为没有 tint', () => {
    expect(skeleton(sceneArtSvg(5, ''))).toBe(skeleton(sceneArtSvg(5)));
  });
});

describe('sceneSkinSvg：4 种相机机身', () => {
  it('viewBox 0 0 104 96，4 种互不相同，accent 出现在描边里', () => {
    const accent = '#6FD3C7';
    const bodies = [0, 1, 2, 3].map((v) => sceneSkinSvg(v, accent));
    for (const svg of bodies) {
      expect(svg.startsWith('<svg viewBox="0 0 104 96">')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).toContain(accent);
    }
    expect(new Set(bodies).size).toBe(4);
  });

  it('越界取模：4 → 0，-1 → 3', () => {
    expect(sceneSkinSvg(4, '#fff')).toBe(sceneSkinSvg(0, '#fff'));
    expect(sceneSkinSvg(-1, '#fff')).toBe(sceneSkinSvg(3, '#fff'));
  });
});

describe('filmCanisterSvg：胶卷盒', () => {
  it('viewBox 0 0 56 74，含 ISO 数字与 35mm COLOR', () => {
    const svg = filmCanisterSvg({ name: 'Business 400', iso: 400, accent: '#2E7D4F' });
    expect(svg.startsWith('<svg viewBox="0 0 56 74">')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('ISO 400');
    expect(svg).toContain('35mm COLOR');
    expect(svg).toContain('fill="#2E7D4F"');
  });

  it('名称里的 < 被转义（不会内联出真标签）', () => {
    const svg = filmCanisterSvg({ name: '<script>alert(1)</script>', iso: 200, accent: '#1E63B0' });
    expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('& < > " \' 五种字符都被转义', () => {
    const svg = filmCanisterSvg({ name: `A&B<C>"D"'E'`, iso: 80, accent: '#E0A32E' });
    expect(svg).toContain('A&amp;B&lt;C&gt;&quot;D&quot;&#39;E&#39;');
  });

  it('每次调用的 id 都不同', () => {
    __resetArtIds();
    const a = idsOf(filmCanisterSvg({ name: 'EK 80', iso: 80, accent: '#E0A32E' }));
    const b = idsOf(filmCanisterSvg({ name: 'EK 80', iso: 80, accent: '#E0A32E' }));
    expect(a.length).toBeGreaterThan(0);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });
});
