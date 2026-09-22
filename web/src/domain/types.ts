/** 照片记录：与根目录原型写进 IndexedDB 的结构**逐字段一致**（含 thumb），两边互相读得懂。 */
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
}

export type QueueStatus = 'queued' | 'running' | 'done' | 'failed';

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
}

/** 落库快照：结构与原型一致，刷新后未完成任务靠它续跑 */
export type QueueSnapshot = QueueTask;
