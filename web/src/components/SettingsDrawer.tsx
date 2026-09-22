import { useAppStore } from '../store/useAppStore';

export function SettingsDrawer() {
  const s = useAppStore((st) => st);
  return (
    <>
      <div id="settingsMask" className={s.settingsOpen ? 'show' : ''} onClick={s.closeSettings} />
      <div id="settings" className={s.settingsOpen ? 'show' : ''}>
        <div className="grab" />
        <h3>🌅 黄金时刻</h3>
        <p className="desc">计算日出日落与黄金拍摄窗口，全程离线。</p>
        <div className="field">
          <input
            id="latInput"
            inputMode="decimal"
            placeholder="纬度 lat，如 30.65"
            value={s.latInput}
            onChange={(e) => s.setLatLon(e.target.value, s.lonInput)}
          />
          <input
            id="lonInput"
            inputMode="decimal"
            placeholder="经度 lon，如 104.07"
            value={s.lonInput}
            onChange={(e) => s.setLatLon(s.latInput, e.target.value)}
          />
          <button className="mini" id="btnGeo" onClick={s.locate}>
            定位
          </button>
        </div>
        <button className="mini ghost" id="btnSunOn" onClick={s.enableSun}>
          启用黄金时刻提醒
        </button>

        <h3>✨ AI 重绘（可选）</h3>
        <p className="desc">
          正式版走自家网关，原型允许直连体验。Key 只存本机 localStorage。无 Key 时本地滤镜全部可用。
        </p>
        <div className="field">
          <input
            id="aiBase"
            placeholder="API Base，默认 https://api.klong.lat/v1"
            value={s.aiBaseInput}
            onChange={(e) => s.setAiInput('aiBaseInput', e.target.value)}
          />
        </div>
        <div className="field">
          <input
            id="aiKey"
            type="password"
            placeholder="API Key（sk-…）"
            value={s.aiKeyInput}
            onChange={(e) => s.setAiInput('aiKeyInput', e.target.value)}
          />
        </div>
        <div className="field">
          <input
            id="aiModel"
            placeholder="模型名，默认 gpt-image-2"
            value={s.aiModelInput}
            onChange={(e) => s.setAiInput('aiModelInput', e.target.value)}
          />
        </div>
        <div className="field">
          <button className="mini" id="btnAiTest" onClick={() => void s.testAi()}>
            测试连通
          </button>
          <button className="mini ghost" id="btnAiSave" onClick={s.saveAi}>
            保存
          </button>
        </div>

        <h3>🗂 数据</h3>
        <div className="field">
          <button
            className="mini ghost"
            id="btnWipe"
            onClick={() => {
              if (confirm('清空全部照片与设置？不可恢复')) void s.wipeAll();
            }}
          >
            清空全部照片与设置
          </button>
        </div>
        <p className="desc" style={{ marginTop: 10 }}>
          拾光 SnapSaga 出行原型 · 照片仅存本机 IndexedDB · AI 重绘仅在主动点击时把所选照片发往你配置的服务
        </p>
      </div>
    </>
  );
}
