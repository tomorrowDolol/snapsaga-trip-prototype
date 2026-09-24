import { useEffect, useState } from 'react';
import { COLLAGE_LAYOUTS } from '../domain/collage';
import { PROMPT_EMPTY_PREVIEW, PROMPT_GROUPS, buildPrompt, qualityOf } from '../domain/promptBuilder';
import { THEME_MAX_SOURCES, canGenerate, pickHint } from '../domain/themes';
import { useAppStore } from '../store/useAppStore';
import { ThumbImg } from './ThumbImg';

/**
 * 新建主题面板（设计稿 sp4）。
 * 提示词友好化：分组词库点选拼装 + 实时预览 + 质量提示 + 换一批灵感 + 清空；
 * 方式二选一（合成一张 / 统一风格）；强度滑杆；选图上限 9（第 10 张被拒并提示）。
 */
export function ThemeCreateSheet() {
  const s = useAppStore((st) => st);
  const open = s.themeCreateOpen;
  const full = buildPrompt(s.themePromptDraft, s.themeWords);
  const quality = qualityOf(full);
  const n = s.themePick.length;
  const selected = new Set(s.themePick);
  const [ideasOpen, setIdeasOpen] = useState(false);

  useEffect(() => {
    if (open) setIdeasOpen(false);
  }, [open]);

  const surprise = () => {
    setIdeasOpen(true);
    s.surpriseThemeDraft();
  };

  return (
    <>
      <div id="themeCreateMask" className={open ? 'show' : ''} onClick={s.closeThemeCreate} />
      <div id="themeCreate" className={open ? 'show' : ''} role="dialog" aria-label="新建主题">
        <div className="grab" />
        <div className="row-between">
          <h3 className="h1 sm">新建主题</h3>
          <button className="pl" id="btnCloseThemeCreate" onClick={s.closeThemeCreate}>
            关闭
          </button>
        </div>
        <div className="fi">
          <label htmlFor="tPrompt">主题</label>
          <textarea
            id="tPrompt"
            rows={2}
            placeholder="写下你想要的感觉"
            value={s.themePromptDraft}
            onChange={(e) => s.setThemePrompt(e.target.value)}
          />
        </div>
        <div className="pv" id="pv">
          {full ? (
            full
          ) : (
            PROMPT_EMPTY_PREVIEW
          )}
        </div>
        {full ? (
          <div className={`pqhint ${quality.level === 'ok' ? 'ok' : 'warn'}`} id="pqhint">
            {quality.hint}
          </div>
        ) : null}

        <div className="prompt-tools">
          <button
            className={`pl${ideasOpen ? ' g' : ''}`}
            id="promptIdeasToggle"
            aria-expanded={ideasOpen}
            onClick={() => setIdeasOpen((value) => !value)}
          >
            灵感
          </button>
          <button className="pl" id="btnSurprise" onClick={surprise}>换一批</button>
          {full ? <button className="pl" id="btnClearPrompt" onClick={s.clearThemeDraft}>清空</button> : null}
        </div>

        <div id="pBuild" style={{ display: ideasOpen ? 'block' : 'none' }}>
          {PROMPT_GROUPS.map((g) => (
            <div className="pbg" key={g.g}>
              <div className="gl">{g.g}</div>
              <div className="ws">
                {g.w.map((w) => (
                  <button
                    key={w}
                    data-w={w}
                    className={s.themeWords.includes(w) ? 'on' : ''}
                    onClick={() => s.toggleThemeWord(w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mode compact" id="modeBox">
          <div className={`m${s.themeMode === 'merge' ? ' on' : ''}`} data-m="merge" onClick={() => s.setThemeMode('merge')}>
            <div className="ck" />
            <div className="t7">合成一张</div>
            <div className="t8">多张变一张</div>
          </div>
          <div className={`m${s.themeMode === 'unify' ? ' on' : ''}`} data-m="unify" onClick={() => s.setThemeMode('unify')}>
            <div className="ck" />
            <div className="t7">统一风格</div>
            <div className="t8">每张保持同一风格</div>
          </div>
        </div>

        <details className="theme-advanced" id="themeAdvanced">
          <summary>更多设置</summary>
          <div id="mergeOpt" style={{ display: s.themeMode === 'merge' ? 'block' : 'none' }}>
            <div className="fi">
              <label>合成布局</label>
              <div className="lay-row">
                {COLLAGE_LAYOUTS.map((l) => (
                  <button key={l} className={`pl${s.themeLayout === l ? ' g' : ''}`} data-lay={l} onClick={() => s.setThemeLayout(l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fi">
            <label htmlFor="themeStrength">
              风格强度 <span className="mo gold" id="strV">{s.themeStrength.toFixed(2)}</span>
            </label>
            <input
              id="themeStrength"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.themeStrength}
              onChange={(e) => s.setThemeStrength(Number(e.target.value))}
            />
          </div>
        </details>

        <div className="row-between pick-head">
            <div className="pick-title">照片 <span className="mo gold">{n}/{THEME_MAX_SOURCES}</span></div>
          <button className="pl" id="pickAll" onClick={s.themePickAll}>
            全选
          </button>
        </div>
        <div className="pick" id="pick">
          {s.photos.length ? (
            s.photos.map((p) => {
              const idx = s.themePick.indexOf(p.id);
              return (
                <div
                  key={p.id}
                  className={`pk${selected.has(p.id) ? ' on' : ''}`}
                  data-id={p.id}
                  onClick={() => s.toggleThemePick(p.id)}
                >
                  <ThumbImg photo={p} />
                  <span className="num">{idx >= 0 ? idx + 1 : ''}</span>
                </div>
              );
            })
          ) : (
            <div className="pk empty">还没有照片——先去「取景」拍几张</div>
          )}
        </div>

        <div className="sticky-actions">
          <div className="row-actions">
            <button className="bt" id="genBtn" disabled={!canGenerate(n)} onClick={() => s.createTheme(false)}>
              生成
            </button>
            {s.themeMode === 'unify' ? (
              <button className="bt violet" id="shootBtn" onClick={() => s.createTheme(true)}>
                生成并拍摄
              </button>
            ) : null}
          </div>
          <div className="sub sm center" id="genHint">
            {pickHint(s.themeMode, n)}
          </div>
        </div>
      </div>
    </>
  );
}
