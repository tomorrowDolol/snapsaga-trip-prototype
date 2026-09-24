import { PROMPT_IDEAS } from '../domain/promptBuilder';
import { THEME_MODE_LABEL, themeProgress } from '../domain/themes';
import type { PhotoRec, ThemeRec } from '../domain/types';
import { activeTheme, themeOutputs, themeSources, useAppStore } from '../store/useAppStore';
import { ThumbImg } from './ThumbImg';

/** 主题卡片的产出预览：合成卡 = 拼贴成品一张；统一风格卡 = 产出横排缩略图（没有产出就退回素材） */
function ThemePreview({ theme, photos, album }: { theme: ThemeRec; photos: PhotoRec[]; album: PhotoRec[] }) {
  const outputs = themeOutputs(album, theme);
  const sources = themeSources(photos, theme);
  const list = outputs.length ? outputs : sources;
  const shown = theme.mode === 'merge' ? list.slice(0, 1) : list.slice(0, 4);
  if (!shown.length) return <div className="tcard-empty">暂无预览</div>;
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
  const statusText = theme.collecting ? `收集 ${theme.sourceIds.length}/9` : `${THEME_MODE_LABEL[theme.mode]} · ${outputs.length} 张`;
  return (
    <div className="tcard" data-id={theme.id} onClick={() => openThemeDetail(theme.id)}>
      <div className="top">
        <div className="ic">{theme.mode === 'merge' ? '合' : '风'}</div>
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

  return (
    <>
      <div className="page-head row-between">
        <div>
          <h1 className="h1">主题</h1>
          <p className="sub">一句话，生成一组照片</p>
        </div>
        <button className="bt s" id="btnThemeNew" onClick={() => openThemeCreate(false)}>
          ＋ 新建
        </button>
      </div>

      {active ? (
        <div className="thbar" id="thbarTheme">
          <div className="ic">✨</div>
          <div className="grow">
            <div className="t1">主题：{active.name}</div>
            <div className="t2">边拍边收 · {active.sourceIds.length}/9</div>
          </div>
          <span className="pulse" />
          <button className="pl g" id="btnThemeResume" onClick={() => resumeTheme(active.id)}>
            继续拍
          </button>
        </div>
      ) : null}

      <div className="pd">
        <div className="h2">灵感</div>
        <div className="insp" id="themeIdeas">
          {PROMPT_IDEAS.map((x, i) => (
            <button key={x} data-i={i} onClick={() => useIdea(i)}>
              {x.slice(0, 12)}…
            </button>
          ))}
        </div>
      </div>

      <div className="pd">
        <div className="h2">最近</div>
      </div>
      <div id="themeList">
        {themes.length ? (
          themes.map((t) => <ThemeCard key={t.id} theme={t} photos={photos} album={album} />)
        ) : (
          <div className="pd sub">还没有主题</div>
        )}
      </div>
    </>
  );
}
