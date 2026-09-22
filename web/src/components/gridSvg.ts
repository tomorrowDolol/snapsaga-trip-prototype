/** 构图网格 SVG（三分 / 黄金螺旋 / 关），与根目录原型逐字符一致 */
export function gridSVG(mode: 'thirds' | 'spiral' | 'off'): string {
  if (mode === 'off') return '';
  if (mode === 'spiral') {
    return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <g stroke="rgba(255,255,255,.45)" stroke-width=".35" fill="none">
        <path d="M38.2,0 V100 M61.8,0 V100 M0,38.2 H100 M0,61.8 H100"/>
        <path d="M100,61.8 L38.2,61.8 A23.6,23.6 0 0 1 61.8,38.2 L61.8,80.7 A42.5,42.5 0 0 1 19.3,38.2 L19.3,15.6 A76,76 0 0 1 95.3,15.6" stroke="rgba(255,138,61,.6)"/>
      </g></svg>`;
  }
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <g stroke="rgba(255,255,255,.45)" stroke-width=".35">
      <line x1="33.3" y1="0" x2="33.3" y2="100"/><line x1="66.6" y1="0" x2="66.6" y2="100"/>
      <line x1="0" y1="33.3" x2="100" y2="33.3"/><line x1="0" y1="66.6" x2="100" y2="66.6"/>
    </g></svg>`;
}
