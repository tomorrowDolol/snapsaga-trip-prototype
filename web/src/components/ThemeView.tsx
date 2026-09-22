import { PROMPT_IDEAS, PROMPT_WORD_COUNT } from '../domain/promptBuilder';
import { THEME_MODE_LABEL, summarize, themeProgress } from '../domain/themes';
import type { PhotoRec, ThemeRec } from '../domain/types';
import { activeTheme, themeOutputs, themeSources, useAppStore } from '../store/useAppStore';
import { ThumbImg } from './ThumbImg';

/** 主题卡片的产出预览：合成卡 = 拼贴成品一张；统一风格卡 = 产出横排缩略图（没有产出就退回素材） */
function ThemePreview({ theme, photos, album }: { theme: ThemeRec; photos: PhotoRec[]; album: PhotoRec[] }) {
  const outputs = themeOutputs(album, theme);
  const sources = themeSources(photos, theme);
  const list = outputs.length ? outputs : sources;
  const shown = theme.mode === 'merge' ? list.slice(0, 1) : list.slice(0, 4);
  if (!shown.length) return <div className="tcard-empty">还没有素材 / 产出</div>;
  return (
    <div className={`row${theme.mode === 'merge' ? ' merge' : ''}`}>
      {shown.map((p) => (
        <div className="mini" key={p.id}>
          <ThumbImg photo={p} />
        </div>
      ))}
    </div>
  );
}

function ThemeCard({ theme, photos, album }: { theme: ThemeRec; photos: PhotoRec[]; album: PhotoRec[] }) {
  const openThemeDetail = useAppStore((s) => s.openThemeDetail);
  const outputs = themeOutputs(album, theme);
  const prog = themeProgress(theme);
  const statusText = theme.collecting
    ? `边拍边收中 · 已收 ${theme.sourceIds.length} 张`
    : `${THEME_MODE_LABEL[theme.mode]} · ${theme.sourceIds.length} 张素材 · 产出 ${outputs.length} 张`;
  return (
    <div className="tcard" data-id={theme.id} onClick={() => openThemeDetail(theme.id)}>
      <div className="top">
        <div className="ic">{theme.mode === 'merge' ? '🧩' : '🎨'}</div>
        <div className="grow">
          <div className="t5">{theme.name}</div>
          <div className="t6">“{theme.prompt.slice(0, 26)}”</div>
        </div>
        <span className={`tag ${theme.mode === 'merge' ? 'mg' : 'uf'}`}>{THEME_MODE_LABEL[theme.mode]}</span>
      </div>
      <div className="tmeta">
        <span>{statusText}</span>
        {theme.status === 'running' || theme.status === 'queued' ? (
          <span className="mo">
            {prog.k}/{prog.n}
          </span>
        ) : null}
        {theme.collecting ? <span className="pulse" /> : null}
      </div>
      <ThemePreview theme={theme} photos={photos} album={album} />
    </div>
  );
}

export function ThemeView() {
  const themes = useAppStore((s) => s.themes);
  const photos = useAppStore((s) => s.photos);
  const album = useAppStore((s) => s.album);
  const active = useAppStore((s) => activeTheme(s));
  const openThemeCreate = useAppStore((s) => s.openThemeCreate);
  const useIdea = useAppStore((s) => s.useIdea);
  const resumeTheme = useAppStore((s) => s.resumeTheme);
  const stats = summarize(themes);

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1 className="h1">主题</h1>
          <p className="sub">写一句主题 → 选多张图 → AI 图生图</p>
        </div>
        <button className="bt s" id="btnThemeNew" onClick={() => openThemeCreate(false)}>
          ＋ 新建
        </button>
      </div>

      <div className="stat" id="themeStats">
        <div>
          <div className="n2" id="tAll">
            {stats.all}
          </div>
          <div className="l3">已建主题</div>
        </div>
        <div>
          <div className="n2 gold" id="tMg">
            {stats.merge}
          </div>
          <div className="l3">合成作品</div>
        </div>
        <div>
          <div className="n2 teal" id="tUf">
            {stats.unify}
          </div>
          <div className="l3">同风格组</div>
        </div>
      </div>

      {active ? (
        <div className="thbar" id="thbarTheme">
          <div className="ic">✨</div>
          <div className="grow">
            <div className="t1">主题：{active.name}</div>
            <div className="t2">边拍边收 · 已收 {active.sourceIds.length} 张 · 每张自动统一风格</div>
          </div>
          <span className="pulse" />
          <button className="pl g" id="btnThemeResume" onClick={() => resumeTheme(active.id)}>
            继续拍
          </button>
        </div>
      ) : null}

      <div className="pd">
        <div className="h2">灵感（点一下填入提示词）</div>
        <div className="insp" id="themeIdeas">
          {PROMPT_IDEAS.map((x, i) => (
            <button key={x} data-i={i} onClick={() => useIdea(i)}>
              {x.slice(0, 12)}…
            </button>
          ))}
        </div>
      </div>

      <div className="pd">
        <div className="h2">两种产出方式</div>
      </div>
      <div className="pd mode-cards">
        <div className="cd">
          <div className="big2">🧩</div>
          <div className="t7">合成一张</div>
          <div className="sub sm">2–9 张照片由 AI 缝合成**一张**新图（旅行海报 / 连环画）</div>
        </div>
        <div className="cd">
          <div className="big2">🎨</div>
          <div className="t7">统一风格</div>
          <div className="sub sm">2–9 张各自重绘，但**同一主题同一调子**</div>
        </div>
      </div>

      <div className="pd">
        <div className="h2">我的主题</div>
      </div>
      <div id="themeList">
        {themes.length ? (
          themes.map((t) => <ThemeCard key={t.id} theme={t} photos={photos} album={album} />)
        ) : (
          <div className="pd sub">还没有主题。点右上「＋ 新建」，写一句主题就能开始。</div>
        )}
      </div>
      <p className="pd sub foot-note">
        提示词词库 {PROMPT_WORD_COUNT} 个词 · 一个主题任务只占 1 个队列槽位（内部 2–9 张） · 多图上限 9 张
      </p>
    </>
  );
}
