/** 8 个场景卡与构图提示（文案与根目录原型逐字一致） */

export type GridMode = 'thirds' | 'spiral';

export interface Scene {
  k: string;
  n: string;
  grid: GridMode;
  /** 提示里加粗的前缀 */
  lead: string;
  /** 提示正文 */
  rest: string;
}

export const SCENES: Scene[] = [
  { k: 'general', n: '通用', grid: 'thirds', lead: '通用', rest: '：把主体放在三分交点上，地平线贴 1/3 线。' },
  { k: 'lake', n: '湖泊', grid: 'thirds', lead: '湖泊', rest: '：地平线放低留 2/3 给天空与倒影；蹲低找前景（栈道、石头）拉纵深。' },
  { k: 'mountain', n: '山野', grid: 'thirds', lead: '山野', rest: '：山脊线贴下 1/3；等云影掠过山体再按快门，层次立刻不一样。' },
  { k: 'street', n: '老街', grid: 'spiral', lead: '老街', rest: '：站路中间用对称或黄金螺旋引导线；等一个行人入画当比例尺。' },
  { k: 'night', n: '夜景', grid: 'thirds', lead: '夜景', rest: '：找光源当主角（灯牌/落日余光），手臂夹紧稳住手机，多按两张挑一张。' },
  { k: 'beach', n: '海滩', grid: 'thirds', lead: '海滩', rest: '：海平线务必水平；人物别顶天立地，脚贴画面下缘留天空。' },
  { k: 'portrait', n: '人像', grid: 'spiral', lead: '人像', rest: '：脸朝的方向留白；镜头稍低仰拍显腿长；逆光开人像模式或点脸对焦拉亮度。' },
  { k: 'food', n: '美食', grid: 'spiral', lead: '美食', rest: '：45° 俯角或正俯拍；挪动餐盘找个纯色背景，靠近拍。' },
];
