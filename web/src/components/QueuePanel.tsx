import { fmtTime } from '../domain/media';
import type { QueueTask } from '../domain/types';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { queue } from '../store/queueRuntime';
import { useAppStore } from '../store/useAppStore';

const Q_LABEL: Record<QueueTask['status'], string> = {
  queued: '排队中',
  running: '生成中',
  done: '已完成',
  failed: '失败',
};

function QueueThumb({ task }: { task: QueueTask }) {
  const photos = useAppStore((s) => s.photos);
  const srcPhoto = photos.find((x) => x.id === task.photoId);
  // 缩略图优先：已完成的结果 > 源照片缩略图 > 原图（避免面板里挂一堆 3MB 原图）
  const blob = (task.status === 'done' && task.thumb) || srcPhoto?.thumb || task.blob;
  const url = useObjectUrl(blob);
  return <img className="q-thumb" src={url || undefined} alt="" decoding="async" loading="lazy" />;
}

function QueueItem({ task, position }: { task: QueueTask; position: number | null }) {
  const retryTask = useAppStore((s) => s.retryTask);
  const dropTask = useAppStore((s) => s.dropTask);
  const label = task.status === 'queued' ? `排队中 · 第 ${position} 位` : Q_LABEL[task.status];
  return (
    <div className={`q-item ${task.status}`}>
      <QueueThumb task={task} />
      <div className="q-main">
        <div className="q-title">
          {task.styleName || 'AI 生图'} <span className={`q-badge ${task.status}`}>{label}</span>
        </div>
        <div className="q-time">
          {fmtTime(new Date(task.ts))}
          {task.status === 'running' ? (
            <>
              {' · '}
              <span className="q-dot" /> 暗房冲洗中
            </>
          ) : null}
        </div>
        {task.status === 'failed' && task.error ? <div className="q-err">{task.error}</div> : null}
        {task.status === 'failed' ? (
          <div className="q-acts">
            <button className="mini q-act" data-retry={task.id} onClick={() => retryTask(task.id)}>
              重试
            </button>
            <button className="mini ghost q-act" data-drop={task.id} onClick={() => dropTask(task.id)}>
              移除
            </button>
          </div>
        ) : task.status === 'done' ? (
          <div className="q-acts">
            <button className="mini ghost q-act" data-drop={task.id} onClick={() => dropTask(task.id)}>
              移除
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function QueuePanel() {
  const items = useAppStore((s) => s.queueItems);
  const counts = useAppStore((s) => s.queueCounts);
  const open = useAppStore((s) => s.queueOpen);
  const closeQueue = useAppStore((s) => s.closeQueue);
  const clearFinished = useAppStore((s) => s.clearFinished);
  const setView = useAppStore((s) => s.setView);

  const positions = new Map<string, number>();
  items.filter((t) => t.status === 'queued').forEach((t, i) => positions.set(t.id, i + 1));

  return (
    <>
      <div id="queueMask" className={open ? 'show' : ''} onClick={closeQueue} />
      <div id="queuePanel" className={open ? 'show' : ''}>
        <div className="grab" />
        <h3>✨ 生图队列</h3>
        <p className="desc" id="queueSummary">
          并发上限 {queue.MAX} · 生成中 {counts.run} · 排队 {counts.queued} · 已完成 {counts.done} · 失败{' '}
          {counts.failed}
        </p>
        <div id="queueList">
          {items.length === 0 ? (
            <div className="queue-empty">
              队列是空的
              <br />
              <span>在「取景」拍一张，就会在后台排队生图（同时最多 4 个）</span>
            </div>
          ) : (
            items.map((t) => <QueueItem key={t.id} task={t} position={positions.get(t.id) ?? null} />)
          )}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <button
            className="mini"
            id="btnQueueToAlbum"
            onClick={() => {
              closeQueue();
              setView('album');
            }}
          >
            看 AI 相册
          </button>
          <button className="mini ghost" id="btnQueueClear" onClick={clearFinished}>
            清理已结束
          </button>
        </div>
        <p className="desc" style={{ marginTop: 10 }}>
          队列任务存在本机 IndexedDB，刷新页面后未完成的任务会自动继续。
        </p>
      </div>
    </>
  );
}
