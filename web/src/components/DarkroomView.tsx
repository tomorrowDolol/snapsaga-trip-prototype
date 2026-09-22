import { QUEUE_MAX } from '../domain/genQueue';
import { fmtTime } from '../domain/media';
import type { QueueTask } from '../domain/types';
import { queue } from '../store/queueRuntime';
import { useAppStore } from '../store/useAppStore';
import { ThumbImg } from './ThumbImg';

const STATUS_LABEL: Record<QueueTask['status'], string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  failed: '失败',
};

/** 一个任务的进度文案：主题任务显示 k/n（分张，不是百分比）；单张任务不编造百分比 */
export function taskProgressText(t: QueueTask): string {
  if (t.kind === 'theme') return `${t.k ?? 0}/${t.n ?? 0}`;
  if (t.status === 'running') return '冲洗中';
  return t.status === 'done' ? '完成' : '';
}

function Slot({ task, index }: { task: QueueTask | null; index: number }) {
  const photos = useAppStore((s) => s.photos);
  const srcId = task?.kind === 'theme' ? task?.sources?.[0]?.id : task?.photoId;
  const photo = photos.find((p) => p.id === srcId);
  if (!task) {
    return (
      <div className="sl" data-slot={index}>
        <div className="id">空槽</div>
      </div>
    );
  }
  return (
    <div className={`sl busy${task.kind === 'theme' ? ' theme' : ''}`} data-slot={index}>
      {photo ? <ThumbImg photo={photo} /> : null}
      <div className="fl" style={{ height: task.kind === 'theme' && task.n ? `${Math.round(((task.k ?? 0) / task.n) * 100)}%` : '35%' }} />
      <div className="pc">{taskProgressText(task)}</div>
    </div>
  );
}

export function DarkroomView() {
  const items = useAppStore((s) => s.queueItems);
  const counts = useAppStore((s) => s.queueCounts);
  const setView = useAppStore((s) => s.setView);
  const retryTask = useAppStore((s) => s.retryTask);
  const dropTask = useAppStore((s) => s.dropTask);
  const clearFinished = useAppStore((s) => s.clearFinished);

  const running = items.filter((t) => t.status === 'running');
  const queued = items.filter((t) => t.status === 'queued');
  const done = items.filter((t) => t.status === 'done');
  const failed = items.filter((t) => t.status === 'failed');
  const order = [...running, ...queued, ...failed, ...done];

  return (
    <>
      <div className="page-head">
        <h1 className="h1">暗房</h1>
        <p className="sub">
          主题任务与单张生图共用同一条队列（并发 <span className="mo gold">{QUEUE_MAX}</span>）
        </p>
      </div>

      <div className="pd">
        <div className="cd">
          <div className="row-between">
            <div className="t7">
              显影槽 · 并发 <span className="mo gold">{QUEUE_MAX}</span>
            </div>
            <div className="sub mo" id="ds">
              运行 {counts.run} · 排队 {counts.queued} · 完成 {counts.done}
            </div>
          </div>
          <div className="sls" id="slots">
            {Array.from({ length: QUEUE_MAX }, (_, i) => (
              <Slot key={i} index={i} task={running[i] ?? null} />
            ))}
          </div>
          <div className="sub sm note">
            一个主题任务算**一个**任务（内部可能含 2–9 张）；第 {QUEUE_MAX + 1} 个任务起排队。槽位里的 <span className="mo">k/n</span> 是分张进度。
          </div>
        </div>
      </div>

      <div className="pd">
        <div className="h2">任务</div>
        <div className="cd" id="darkQueue">
          {order.length ? (
            order.map((t) => {
              const pos = queued.indexOf(t) + 1;
              const label = t.status === 'queued' ? `排队中${pos ? ` · 第 ${pos} 位` : ''}` : STATUS_LABEL[t.status];
              return (
                <div className={`qi${t.kind === 'theme' ? ' theme' : ''}`} key={t.id} data-id={t.id}>
                  <div className="th">
                    {t.kind === 'theme' ? <span className="ic3">{t.mode === 'merge' ? '🧩' : '🎨'}</span> : null}
                  </div>
                  <div className="mn">
                    <div className="t3">
                      {(t.themeName || t.styleName || 'AI 生图').slice(0, 12)}
                      {t.kind === 'theme' ? (
                        <span className="stt mg">{t.mode === 'merge' ? '合成一张' : '统一风格'}</span>
                      ) : null}
                      <span className={`stt ${t.status === 'running' ? 'run' : t.status === 'queued' ? 'q' : t.status === 'done' ? 'dn' : 'fl'}`}>
                        {label}
                      </span>
                    </div>
                    <div className="s3">
                      {t.kind === 'theme'
                        ? `${t.stage || '主题任务'} ${taskProgressText(t)} 张`
                        : t.status === 'done'
                          ? '单张重绘完成'
                          : '单张重绘'}
                      {' · '}
                      {fmtTime(new Date(t.ts))}
                    </div>
                    {t.error ? <div className="q-err">{t.error}</div> : null}
                    {t.status === 'failed' ? (
                      <div className="row-actions">
                        <button className="mini" data-retry={t.id} onClick={() => retryTask(t.id)}>
                          重试
                        </button>
                        <button className="mini ghost" data-drop={t.id} onClick={() => dropTask(t.id)}>
                          移除
                        </button>
                      </div>
                    ) : t.status === 'done' ? (
                      <div className="row-actions">
                        <button className="mini ghost" data-drop={t.id} onClick={() => dropTask(t.id)}>
                          移除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="sub">队列是空的。拍几张，或到「主题」建一个主题。</div>
          )}
        </div>
      </div>

      <div className="pd row-actions">
        <button className="mini" id="btnDarkToAlbum" onClick={() => setView('album')}>
          看相册
        </button>
        <button className="mini ghost" id="btnDarkClear" onClick={clearFinished}>
          清理已结束
        </button>
        <button className="mini ghost" id="btnDarkOpenPanel" onClick={() => useAppStore.getState().openQueue()}>
          队列详情
        </button>
      </div>
      <p className="pd sub foot-note">
        并发上限 {queue.MAX}（与引擎一致）· 队列存在本机 IndexedDB，刷新后未完成的任务会自动继续。
      </p>
    </>
  );
}
