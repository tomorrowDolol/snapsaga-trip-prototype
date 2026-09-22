/**
 * 太阳计算（精简 SunCalc 核心算法）
 *
 * ⚠️ 铁律 4：这段算法已数值验证（成都/北京/赫尔辛基/三亚，日出日落偏差 <11 分钟，见
 * docs/iteration-log.md v0.1）。从根目录 index.html 的 vanilla 实现**逐行等价搬迁**到这里：
 * 运算顺序、常量、函数拆解一律保持原样，只加类型。任何"顺手重构"（例如换公式、合并中间量、
 * 改成返回时间戳而不是 Date）都必须重新跑四城市数值对比。
 *
 * 等价性由 src/test/sun.equivalence.test.ts 守卫：它把 index.html 里的**原始实现**抽出来跑，
 * 逐城市逐时刻断言两边结果完全一致（epsilon 1e-9 毫秒）。
 */

export const rad = Math.PI / 180;
export const dayMs = 86400000;
export const J1970 = 2440588;
export const J2000 = 2451545;

export function toJulian(date: Date): number {
  return date.valueOf() / dayMs - 0.5 + J1970;
}
export function toDays(date: Date): number {
  return toJulian(date) - J2000;
}
export function solarMeanAnomaly(d: number): number {
  return rad * (357.5291 + 0.98560028 * d);
}
export function eclipticLongitude(M: number): number {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + Math.PI;
}
export function declination(l: number, b: number): number {
  const e = rad * 23.4397;
  return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
}
export function julianCycle(d: number, lw: number): number {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI));
}
export function approxTransit(Ht: number, lw: number, n: number): number {
  return 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
}
export function solarTransitJ(ds: number, M: number, L: number): number {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
}
export function hourAngle(h: number, phi: number, d: number): number {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}
export function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number): number {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  /** 太阳升到 -4°（晨黄金开始） */
  morningStart: Date;
  /** 太阳升到 +6°（晨黄金结束） */
  morningEnd: Date;
  /** 太阳降到 +6°（晚黄金开始） */
  eveningStart: Date;
  /** 太阳降到 -4°（晚黄金结束） */
  eveningEnd: Date;
}

export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const h0 = rad * -0.833;
  const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  const JgoldDown = getSetJ(rad * -4, lw, phi, dec, n, M, L); // 太阳降到 -4°（晚黄金结束）
  const JgoldUp = Jnoon - (JgoldDown - Jnoon); // 太阳升到 -4°（晨黄金开始）
  const J6down = getSetJ(rad * 6, lw, phi, dec, n, M, L); // 太阳降到 +6°（晚黄金开始）
  const J6up = Jnoon - (J6down - Jnoon); // 太阳升到 +6°（晨黄金结束）
  const F = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
  return {
    sunrise: F(Jrise),
    sunset: F(Jset),
    morningStart: F(JgoldUp),
    morningEnd: F(J6up),
    eveningStart: F(J6down),
    eveningEnd: F(JgoldDown),
  };
}
