/**
 * 场景插画 / 相机机身 / 胶卷盒的 SVG 字符串（纯 TS：无 React、无 DOM、无第三方依赖）。
 *
 * 逐值移植自设计真源 `opendesign-projects/42f9ef8f-…/design.html`：
 *   - `function art(i,tint)`  → `sceneArtSvg()`：8 张场景插画（general/lake/mountain/street/night/beach/portrait/food，
 *     顺序与设计稿 `const SC=[…]` 的 `k` 字段一致）+ 非空 tint 时叠加的两层 overlay
 *   - `function skin(i,ac)`   → `sceneSkinSvg()`：4 种相机机身
 *   - `filmCanisterSvg()`     → 设计稿里胶卷盒是 div（`.cn/.cp/.lb`，见样式表），此处按同一套数值还原成 SVG：
 *     56×74、圆角 7/7/9/9、顶部 34×9 深色盖（#2a2f31，top:-4px 被 overflow 裁掉上沿）、
 *     白标签从 26px 铺到底（rgba(255,255,255,.94)）、名称 9px/800、ISO 13px 等宽、底部 8px `35mm COLOR`、
 *     右侧 inset -8px 0 14px rgba(0,0,0,.5) 的暗角。
 *
 * 坐标、颜色、渐变 stop 全部照抄设计稿；唯一差异是 id 前缀：设计稿用自增计数器 `let AI=0` 生成 `a0/a1/…`，
 * 这里换成 `ss-art-0/ss-art-1/…`，保证同页多张插画互不串渐变。
 */

/** 场景插画张数（= 设计稿 `const SC` 的长度） */
export const SCENE_ART_COUNT = 8;

/** 与设计稿 `const SC=[…]` 的 `k` 字段顺序完全一致；`art(i)` 用它把索引映射到画面 */
const SCENE_KEYS = ['general', 'lake', 'mountain', 'street', 'night', 'beach', 'portrait', 'food'] as const;

/** 设计稿的 `let AI=0`：让每次调用产出的 gradient / clipPath id 都不同 */
let AI = 0;

/** 仅供测试：重置内部 id 计数器 */
export function __resetArtIds(): void {
  AI = 0;
}

function nextArtId(): string {
  return `ss-art-${AI++}`;
}

/** 设计稿 `art()` 内的 `G()`：线性渐变 */
const G = (id: string, a: string, b: string, x1: number, y1: number, x2: number, y2: number): string =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

/** 设计稿 `art()` 内的 `R()`：径向渐变（末端全透明） */
const R = (id: string, a: string, b: string): string =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>`;

/** 8 张场景插画主体，按场景 key 索引；`u` 是本次调用的 id 前缀 */
function sceneBodies(u: string): Record<string, string> {
  return {
 general:`${G(u+'k','#cbdde6','#7d97a4',0,0,0,1)}${G(u+'g','#33454e','#1a2429',0,0,0,1)}<rect width="390" height="430" fill="url(#${u}k)"/><circle cx="296" cy="96" r="52" fill="rgba(255,246,220,.55)"/><g fill="#5b727d"><rect x="8" y="196" width="44" height="124"/><rect x="60" y="168" width="36" height="152"/><rect x="162" y="150" width="42" height="170"/><rect x="258" y="162" width="48" height="158"/><rect x="314" y="202" width="68" height="118"/></g><g fill="#cfe0e6" opacity=".5"><rect x="14" y="206" width="8" height="10"/><rect x="68" y="180" width="8" height="10"/><rect x="170" y="162" width="8" height="10"/><rect x="266" y="174" width="8" height="10"/></g><path d="M0 366 L390 352 L390 430 L0 430Z" fill="url(#${u}g)"/><g fill="#0f1518"><circle cx="196" cy="330" r="7"/><path d="M188 338 h16 l3 30 h-22z"/><circle cx="240" cy="336" r="6"/><path d="M233 343 h14 l3 26 h-20z"/></g><rect x="292" y="298" width="5" height="70" fill="#141c20"/><circle cx="294" cy="296" r="9" fill="#ffe9b0"/>`,
 lake:`${G(u+'k','#eaf6fb','#8fc3da',0,0,0,1)}${G(u+'w','#4e93ad','#1e3f4d',0,0,0,1)}${R(u+'s','rgba(255,240,200,.95)','rgba(255,240,200,0)')}<rect width="390" height="430" fill="url(#${u}k)"/><circle cx="150" cy="168" r="26" fill="#fff3cf"/><circle cx="150" cy="168" r="70" fill="url(#${u}s)"/><path d="M0 196 L70 158 L128 192 L196 150 L268 190 L330 162 L390 194 L390 232 L0 232Z" fill="#7ba7b8"/><path d="M0 214 L88 186 L166 214 L250 184 L330 212 L390 196 L390 240 L0 240Z" fill="#5b8595"/><rect y="236" width="390" height="194" fill="url(#${u}w)"/><g fill="#fff" opacity=".22"><rect x="24" y="252" width="120" height="4" rx="2"/><rect x="180" y="268" width="150" height="3" rx="2"/><rect x="60" y="292" width="90" height="3" rx="2"/><rect x="210" y="312" width="130" height="4" rx="2"/></g><rect x="142" y="240" width="16" height="120" fill="#fff3cf" opacity=".35"/><path d="M0 402 L390 392 L390 430 L0 430Z" fill="#1a2b31"/><g fill="#0f1c20"><rect x="18" y="386" width="6" height="30"/><rect x="52" y="390" width="6" height="26"/><rect x="86" y="386" width="6" height="30"/></g><rect x="12" y="384" width="86" height="4" fill="#16262c"/>`,
 mountain:`${G(u+'k','#e2efe8','#93b0a4',0,0,0,1)}<rect width="390" height="430" fill="url(#${u}k)"/><path d="M0 210 L52 158 L104 202 L150 150 L206 200 L258 152 L316 198 L390 160 L390 430 L0 430Z" fill="#a3bcaf"/><path d="M0 250 L60 200 L120 248 L180 194 L246 246 L306 200 L390 244 L390 430 L0 430Z" fill="#7d998c"/><path d="M0 292 L70 244 L140 290 L212 240 L286 288 L360 246 L390 268 L390 430 L0 430Z" fill="#5b7568"/><path d="M0 344 L80 306 L170 344 L262 302 L350 340 L390 322 L390 430 L0 430Z" fill="#3b5247"/><g fill="#fff" opacity=".2"><rect x="10" y="256" width="150" height="7" rx="3.5"/><rect x="200" y="272" width="170" height="6" rx="3"/></g><g fill="#1f2c28"><path d="M60 430 L74 372 L88 430Z"/><path d="M74 400 L94 366 L114 430 L60 430Z"/><path d="M300 430 L312 380 L324 430Z"/></g><circle cx="300" cy="96" r="20" fill="#fff6dd"/>`,
 street:`${G(u+'k','#f0dcb4','#c69a5e',0,0,0,1)}${G(u+'r','#7a5c39','#2b1e12',0,0,0,1)}${R(u+'g','rgba(255,214,140,.75)','rgba(255,214,140,0)')}<rect width="390" height="430" fill="url(#${u}k)"/><path d="M0 0 L150 0 L150 300 L0 430Z" fill="#8a6338"/><path d="M390 0 L240 0 L240 300 L390 430Z" fill="#7a5530"/><g fill="#5c3f22"><rect x="18" y="60" width="40" height="56"/><rect x="74" y="140" width="40" height="56"/><rect x="278" y="60" width="40" height="56"/><rect x="334" y="140" width="40" height="56"/></g><g fill="#ffd88a" opacity=".55"><rect x="22" y="66" width="32" height="20"/><rect x="78" y="146" width="32" height="20"/><rect x="282" y="146" width="32" height="20"/><rect x="338" y="66" width="32" height="20"/></g><path d="M150 300 L240 300 L390 430 L0 430Z" fill="url(#${u}r)"/><g stroke="#c9a878" stroke-width="2" opacity=".3"><path d="M120 336 L270 336"/><path d="M92 372 L296 372"/><path d="M60 410 L330 410"/></g><circle cx="168" cy="132" r="16" fill="#e0503a"/><circle cx="168" cy="132" r="40" fill="url(#${u}g)"/><circle cx="228" cy="120" r="14" fill="#e0503a"/><circle cx="228" cy="120" r="36" fill="url(#${u}g)"/><g fill="#2b1e12"><circle cx="196" cy="352" r="8"/><path d="M187 361 h18 l4 34 h-26z"/></g>`,
 night:`${G(u+'k','#232a58','#070912',0,0,0,1)}${G(u+'w','#12203a','#05070f',0,0,0,1)}<rect width="390" height="430" fill="url(#${u}k)"/><g fill="#fff"><circle cx="40" cy="52" r="1.4"/><circle cx="150" cy="66" r="1.2"/><circle cx="268" cy="74" r="1.3"/><circle cx="364" cy="96" r="1.2"/></g><circle cx="318" cy="70" r="17" fill="#e9eefc"/><g fill="#0c1226"><rect x="0" y="216" width="52" height="130"/><rect x="58" y="186" width="44" height="160"/><rect x="152" y="200" width="50" height="146"/><rect x="256" y="192" width="46" height="154"/><rect x="308" y="222" width="82" height="124"/></g><g fill="#ffd06a"><rect x="12" y="228" width="6" height="8"/><rect x="66" y="198" width="6" height="8"/><rect x="160" y="212" width="6" height="8"/><rect x="264" y="204" width="6" height="8"/></g><rect x="116" y="252" width="22" height="60" fill="#ff5c8a"/><rect x="258" y="240" width="18" height="52" fill="#6fd3c7"/><rect y="346" width="390" height="84" fill="url(#${u}w)"/><g opacity=".5"><rect x="120" y="350" width="14" height="60" fill="#ff5c8a"/><rect x="262" y="348" width="12" height="52" fill="#6fd3c7"/></g><g stroke="#fff" stroke-width="2" opacity=".35" fill="none"><path d="M20 420 Q140 396 300 408"/></g>`,
 beach:`${G(u+'k','#ffeccf','#8fd8ff',0,0,0,1)}${G(u+'s','#3b83a6','#1d4a60',0,0,0,1)}${R(u+'o','rgba(255,244,214,.95)','rgba(255,244,214,0)')}<rect width="390" height="430" fill="url(#${u}k)"/><circle cx="110" cy="140" r="30" fill="#fff6dd"/><circle cx="110" cy="140" r="86" fill="url(#${u}o)"/><g fill="#fff" opacity=".45"><ellipse cx="286" cy="86" rx="54" ry="16"/><ellipse cx="60" cy="72" rx="46" ry="13"/></g><rect y="228" width="390" height="130" fill="url(#${u}s)"/><g stroke="#fff" stroke-width="2" opacity=".45" fill="none"><path d="M0 250 Q60 244 120 250 T240 250 T390 248"/><path d="M0 278 Q70 270 140 278 T280 278 T390 274"/><path d="M0 312 Q80 302 160 312 T320 310 T390 306"/></g><path d="M0 352 Q120 340 240 352 T390 350 L390 430 L0 430Z" fill="#e6cfa6"/><path d="M0 352 Q120 340 240 352 T390 350 L390 366 Q240 368 120 358 T0 368Z" fill="#d9bd8f"/><g fill="#26343a"><ellipse cx="300" cy="404" rx="30" ry="12"/><ellipse cx="258" cy="412" rx="18" ry="8"/><path d="M40 430 L52 396 L64 430Z"/></g>`,
 portrait:`${G(u+'k','#f6dfd6','#8a6f6d',0,0,0,1)}${R(u+'b','rgba(255,232,200,.85)','rgba(255,232,200,0)')}<rect width="390" height="430" fill="url(#${u}k)"/><g opacity=".55"><circle cx="72" cy="92" r="34" fill="url(#${u}b)"/><circle cx="300" cy="70" r="42" fill="url(#${u}b)"/><circle cx="340" cy="180" r="26" fill="url(#${u}b)"/><circle cx="40" cy="210" r="30" fill="url(#${u}b)"/></g><path d="M196 148 q40 0 44 46 q2 30 -14 44 q26 8 40 30 q16 24 18 62 L96 430 q6 -44 24 -70 q16 -22 44 -30 q-16 -16 -14 -46 q4 -44 46 -46Z" fill="#3b2a2b"/><path d="M196 148 q40 0 44 46 q2 30 -14 44" fill="none" stroke="#ffd9a8" stroke-width="3"/>`,
 food:`${R(u+'t','#6b4a24','#2b1c0e')}<rect width="390" height="430" fill="url(#${u}t)"/><circle cx="196" cy="216" r="132" fill="#f4efe6"/><circle cx="196" cy="216" r="108" fill="#e8e1d4"/><ellipse cx="166" cy="188" rx="46" ry="34" fill="#c05a3f"/><ellipse cx="232" cy="214" rx="38" ry="28" fill="#6f9c5e"/><ellipse cx="176" cy="258" rx="40" ry="26" fill="#e0b45a"/><g fill="#b9c2c4"><rect x="52" y="150" width="12" height="132" rx="6"/><rect x="328" y="150" width="12" height="132" rx="6"/></g><ellipse cx="196" cy="216" rx="150" ry="150" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="26"/>`};
}

/** 第 i 张场景插画（i 会 mod 8）。tint 非空时叠加同设计稿的 overlay 两层。 */
export function sceneArtSvg(i: number, tint?: string): string {
  const u = nextArtId();
  const s = SCENE_KEYS[((Math.trunc(i) % SCENE_ART_COUNT) + SCENE_ART_COUNT) % SCENE_ART_COUNT];
  const D = sceneBodies(u);
  const tintRect = tint
    ? `<rect width="390" height="430" fill="${tint}" style="mix-blend-mode:overlay"/><rect width="390" height="430" fill="${tint}" opacity=".18"/>`
    : '';
  return `<svg viewBox="0 0 390 430" preserveAspectRatio="xMidYMid slice">${D[s] || D.lake}${tintRect}</svg>`;
}

/** 4 种相机机身（设计稿 `function skin(i,ac)` 的数组字面量，`a` = accent） */
function skinBodies(a: string): readonly string[] {
  return [`<rect x="8" y="20" width="88" height="60" rx="9" fill="#1b1f21" stroke="rgba(255,255,255,.14)"/><circle cx="52" cy="50" r="21" fill="#0e1213" stroke="${a}" stroke-width="2"/><circle cx="52" cy="50" r="12" fill="#171d1f" stroke="rgba(255,255,255,.22)"/><circle cx="52" cy="50" r="5" fill="${a}" opacity=".75"/>`,`<rect x="6" y="26" width="92" height="50" rx="8" fill="#20262a" stroke="rgba(255,255,255,.14)"/><rect x="6" y="26" width="92" height="9" rx="4" fill="${a}" opacity=".85"/><circle cx="52" cy="53" r="17" fill="#0d1112" stroke="rgba(255,255,255,.3)" stroke-width="2"/><circle cx="52" cy="53" r="7" fill="#1a2124"/>`,`<rect x="10" y="16" width="84" height="66" rx="8" fill="#181c1e" stroke="rgba(255,255,255,.14)"/><path d="M38 16 L44 8 H60 L66 16 Z" fill="#242a2d"/><circle cx="52" cy="50" r="23" fill="#0c0f10" stroke="${a}" stroke-width="2.5"/><circle cx="52" cy="50" r="13" fill="#14191b"/><circle cx="52" cy="50" r="6" fill="#0a0d0e"/><circle cx="52" cy="50" r="2.4" fill="${a}"/>`,`<rect x="9" y="22" width="86" height="56" rx="10" fill="#1d2224" stroke="rgba(255,255,255,.14)"/><rect x="9" y="22" width="86" height="7" rx="3" fill="${a}" opacity=".7"/><circle cx="52" cy="52" r="18" fill="#0e1213" stroke="rgba(255,255,255,.28)" stroke-width="2"/><circle cx="52" cy="52" r="7" fill="${a}" opacity=".5"/>`];
}

/** 相机机身插画（variant 0..3，越界取模）。accent 是机身描边色。 */
export function sceneSkinSvg(variant: number, accent: string): string {
  const bodies = skinBodies(accent);
  const n = bodies.length;
  const v = ((Math.trunc(variant) % n) + n) % n;
  return `<svg viewBox="0 0 104 96">${bodies[v]}</svg>`;
}

/** 内联进 HTML/SVG 的文本转义（& < > " '） */
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 胶卷盒实物造型（竖版小盒：顶部盖 + 白标签 + 名称 + ISO）。 */
export function filmCanisterSvg(opts: { name: string; iso: number; accent: string }): string {
  const u = nextArtId();
  const name = escapeText(opts.name);
  const sans = "system-ui,-apple-system,'Segoe UI',sans-serif";
  const mono = 'ui-monospace,Menlo,monospace';
  return `<svg viewBox="0 0 56 74"><defs><linearGradient id="${u}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,.5)"/></linearGradient><clipPath id="${u}c"><rect width="56" height="74" rx="7"/></clipPath></defs><g clip-path="url(#${u}c)"><rect width="56" height="74" fill="${opts.accent}"/><rect width="56" height="74" fill="url(#${u}s)"/><rect x="11" y="-4" width="34" height="9" rx="4" fill="#2a2f31"/><rect y="26" width="56" height="48" fill="rgba(255,255,255,.94)"/><text x="6" y="38" font-size="9" font-weight="800" fill="#111" font-family="${sans}">${name}</text><text x="6" y="55" font-size="13" fill="#111" font-family="${mono}">ISO ${opts.iso}</text><text x="6" y="66" font-size="8" font-weight="800" fill="#111" font-family="${sans}">35mm COLOR</text></g></svg>`;
}
