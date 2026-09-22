import type { CollageLayout } from './collage';

/** 照片记录：与根目录原型写进 IndexedDB 的结构**逐字段一致**（含 thumb），两边互相读得懂。
 *
 * v0.8 只**新增可选字段**（theme / themeName / merge / ids / layout）：老版本读到它们会忽略，
 * 不会因为多字段而读不懂；`kind === 'ai' && theme` 就是相册里的「主题作品」。 */
export interface PhotoRec {
  id: string;
  blob: Blob;
  ts: number;
  /** 这张图是怎么来的：still=设备静止图像管线，frame=从实时预览抓帧 */
  shot?: 'still' | 'frame';
  /** 列表专用缩略图（最长边 320 / jpeg .72）；老记录可能没有，启动后回填 */
  thumb?: Blob;
  /** 缺省 = 相机原片（胶卷）；'ai' = 生图归档（AI 相册） */
  kind?: 'ai';
  /** AI 归档专用：源片 id / 风格 key / 风格名 */
  from?: string;
  style?: string;
  styleName?: string;
  /** 主题作品专用：所属主题 id / 主题名（相册「主题作品」分组靠它） */
  theme?: string;
  themeName?: string;
  /** 主题作品专用：true = 「合成一张」的成品（一张拼贴卡），false/缺省 = 同风格组里的一张 */
  merge?: boolean;
  /** 合成成品的素材源片 id 列表（最多 9） */
  ids?: string[];
  /** 合成成品的布局（网格拼贴 / 无缝融合 / 故事板） */
  layout?: CollageLayout;
}

export type QueueStatus = 'queued' | 'running' | 'done' | 'failed';

export type QueueKind = 'photo' | 'theme';

export type ThemeMode = 'merge' | 'unify';

export type ThemeStatus = 'idle' | 'queued' | 'running' | 'done' | 'ended';

/** 主题任务的多图入参（一个主题任务 = 一个队列槽位，内部可能含 2–9 张） */
export interface QueueSource {
  id: string;
  blob: Blob | null;
}

export interface QueueTask {
  id: string;
  photoId: string;
  blob: Blob | null;
  ts: number;
  styleKey: string;
  styleName: string;
  strength: number;
  status: QueueStatus;
  error: string;
  tries: number;
  startedAt: number;
  endedAt: number;
  /** 完成后的结果缩略图（队列面板优先显示它） */
  thumb?: Blob;
  /** 缺省 = 'photo'（单张重绘，老快照兼容）；'theme' = 主题任务（只占 1 个槽位） */
  kind?: QueueKind;
  /** 主题任务：主题 id / 主题名 / 产出方式 / 合成布局 / 提示词 */
  themeId?: string;
  themeName?: string;
  mode?: ThemeMode;
  layout?: CollageLayout;
  prompt?: string;
  /** 主题任务：多图入参 */
  sources?: QueueSource[];
  /** 主题任务：总张数 n 与已完成张数 k（界面显示 k/n，**不是百分比**） */
  n?: number;
  k?: number;
  /** 边拍边收的子任务：这一张对应的原片 id（可选） */
  pid?: string;
  /** 主题任务当前阶段文案（合成中 / 统一风格中） */
  stage?: string;
}

/** 主题记录：不进 `snapsaga` 库（那个库的版本被根原型钉在 v2，升版本会让它打不开），
 *  存在独立库 `snapsaga_themes` 里。只存 id 引用，不存 blob。 */
export interface ThemeRec {
  id: string;
  name: string;
  prompt: string;
  /** 点选过的词库词（用于「复用提示词」时还原拼装状态） */
  words: string[];
  mode: ThemeMode;
  layout: CollageLayout;
  strength: number;
  /** 素材（胶卷原片 id），上限 9 */
  sourceIds: string[];
  /** 产出（AI 相册记录 id），逐张进来 */
  outputIds: string[];
  status: ThemeStatus;
  /** 边拍边收进行中（取景页顶部主题条显示的就是它） */
  collecting: boolean;
  ts: number;
  updatedAt: number;
}

/** 落库快照：结构与原型一致，刷新后未完成任务靠它续跑 */
export type QueueSnapshot = QueueTask;
