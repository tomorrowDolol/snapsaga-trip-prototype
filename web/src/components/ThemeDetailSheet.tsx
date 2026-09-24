import { THEME_MAX_SOURCES, THEME_MODE_LABEL, THEME_STATUS_LABEL, themeProgress } from '../domain/themes';
import { detailTheme, themeOutputs, themeSources, useAppStore } from '../store/useAppStore';
import { ThumbImg } from './ThumbImg';

/** 主题详情（设计稿 sp5）：素材 → 产出 → 再来一版 / 保存 / 复用提示词 / 继续边拍边收 */
export function ThemeDetailSheet() {
  const t = useAppStore((s) => detailTheme(s));
  const photos = useAppStore((s) => s.photos);
  const album = useAppStore((s) => s.album);
  const close = useAppStore((s) => s.closeThemeDetail);
  const outputs = t ? themeOutputs(album, t) : [];
  const sources = t ? themeSources(photos, t) : [];
  const regenTheme = useAppStore((s) => s.regenTheme);
  const resumeTheme = useAppStore((s) => s.resumeTheme);
  const saveThemeToAlbum = useAppStore((s) => s.saveThemeToAlbum);
  const reuseThemePrompt = useAppStore((s) => s.reuseThemePrompt);
  const openLightbox = useAppStore((s) => s.openLightbox);
  const open = !!t;
  const prog = t ? themeProgress(t) : { k: 0, n: 0 };

  return (
    <>
      <div id="themeDetailMask" className={open ? 'show' : ''} onClick={close} />
      <div id="themeDetail" className={open ? 'show' : ''} role="dialog" aria-label="主题详情">
        <div className="grab" />
        {t ? (
          <>
            <div className="row-between">
              <div className="grow">
                <h3 className="h1 sm" id="tdName">
                  {t.name}
                </h3>
                <div className="sub mo sm" id="tdPrompt">
                  “{t.prompt}”
                </div>
              </div>
              <span className={`tag ${t.mode === 'merge' ? 'mg' : 'uf'}`}>{THEME_MODE_LABEL[t.mode]}</span>
            </div>

            <div className="sub sm td-meta" id="tdMeta">
              {t.sourceIds.length} 张 · {t.collecting ? '收集中' : THEME_STATUS_LABEL[t.status]}
            </div>

            <div className="h2">素材（{sources.length}/{THEME_MAX_SOURCES}）</div>
            <div className="mini-grid" id="tdSources">
              {sources.length ? (
                sources.map((p) => (
                  <div className="mini" key={p.id} onClick={() => openLightbox(p.id)}>
                    <ThumbImg photo={p} />
                  </div>
                ))
              ) : (
                <div className="sub">还没有素材</div>
              )}
            </div>

            <div className="h2">产出 {t.outputIds.length ? `（${prog.k}/${prog.n || t.outputIds.length}）` : ''}</div>
            {outputs.length ? (
              <div className="mini-grid big" id="tdOutputs">
                {outputs.map((p) => (
                  <div className="mini" key={p.id} onClick={() => openLightbox(p.id)}>
                    <ThumbImg photo={p} />
                    {p.merge ? <span className="b3">合成</span> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="td-empty" id="tdOutputsEmpty">
                还在生成中，产出会逐张出现。
              </div>
            )}

            <div className="row-actions wrap">
              <button className="bt s" id="tdRegen" onClick={() => regenTheme(t.id)}>
                再来一版
              </button>
              {t.mode === 'unify' ? (
                <button className="bt s violet" id="tdResume" onClick={() => resumeTheme(t.id)}>
                  继续拍摄
                </button>
              ) : null}
              <button className="bt g s" id="tdSave" onClick={() => saveThemeToAlbum(t.id)}>
                保存
              </button>
              <button className="bt g s" id="tdReuse" onClick={() => reuseThemePrompt(t.id)}>
                复用提示词
              </button>
              <button className="bt g s" id="tdClose" onClick={close}>
                关闭
              </button>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
