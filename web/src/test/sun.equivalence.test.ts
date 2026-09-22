/**
 * 太阳算法等价性测试（铁律 4）。
 *
 * 这里不"重新验证"算法对不对（那是 v0.1 做过的事：成都/北京/赫尔辛基/三亚偏差 <11 分钟），
 * 而是证明**这次移植没有改变任何数值**：把根目录 index.html 里的原始实现抽出来在 node 里跑，
 * 与 src/domain/sun.ts 的结果逐城市、逐时刻、逐字段比对。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sunTimes } from '../domain/sun';

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = resolve(HERE, '..', '..', '..', 'index.html'); // web/src/test → 仓库根

type SunFn = (date: Date, lat: number, lng: number) => Record<string, Date>;

function loadOriginalSunTimes(): { fn: SunFn; srcLength: number } {
  const html = readFileSync(INDEX, 'utf8');
  const start = html.indexOf('const rad=Math.PI/180');
  const end = html.indexOf('let geo={lat:null,lon:null};');
  expect(start, 'index.html 里应能找到太阳算法起点').toBeGreaterThan(0);
  expect(end, 'index.html 里应能找到太阳算法终点').toBeGreaterThan(start);
  const src = html.slice(start, end);
  expect(src, '抽出的源码应包含 sunTimes').toContain('function sunTimes');
  const factory = new Function(`${src}\n;return { sunTimes };`);
  const mod = factory() as { sunTimes: SunFn };
  return { fn: mod.sunTimes, srcLength: src.length };
}

const CITIES: Array<[string, number, number]> = [
  ['成都', 30.65, 104.07],
  ['北京', 39.9042, 116.4074],
  ['赫尔辛基', 60.1699, 24.9384],
  ['三亚', 18.2528, 109.5119],
];

const FIELDS = ['sunrise', 'sunset', 'morningStart', 'morningEnd', 'eveningStart', 'eveningEnd'] as const;

function sampleDates(): Date[] {
  const out: Date[] = [];
  for (let month = 0; month < 12; month++) {
    for (const day of [1, 15, 28]) {
      out.push(new Date(2026, month, day, 0, 0, 0, 0));
    }
  }
  return out;
}

const HOURS: Array<[number, number]> = [
  [0, 0],
  [6, 30],
  [12, 0],
  [18, 45],
  [23, 59],
];

describe('太阳算法：TS 版与 index.html 原实现逐值等价', () => {
  const { fn: original, srcLength } = loadOriginalSunTimes();

  it('抽到了非空的原始实现（防止测试空跑）', () => {
    expect(srcLength).toBeGreaterThan(800);
  });

  it('四个城市 × 36 个日期 × 5 个时刻 × 6 个字段全部一致（epsilon 1e-9 ms）', () => {
    let compared = 0;
    for (const [name, lat, lon] of CITIES) {
      for (const d of sampleDates()) {
        for (const [h, m] of HOURS) {
          const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
          const a = original(at, lat, lon);
          const b = sunTimes(at, lat, lon);
          for (const f of FIELDS) {
            expect(
              Math.abs(a[f].valueOf() - b[f].valueOf()),
              `${name} ${at.toISOString()} ${f}`,
            ).toBeLessThan(1e-9);
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(CITIES.length * sampleDates().length * HOURS.length * FIELDS.length);
  });

  it('结果是有意义的 Date（不是 NaN）', () => {
    const st = sunTimes(new Date(2026, 5, 21, 12, 0, 0), 30.65, 104.07);
    for (const f of FIELDS) expect(Number.isFinite(st[f].valueOf())).toBe(true);
    // 夏至前后，北半球日出早于日落
    expect(st.sunrise.valueOf()).toBeLessThan(st.sunset.valueOf());
  });
});
