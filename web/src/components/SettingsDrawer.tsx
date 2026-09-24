import { QUEUE_MAX } from '../domain/genQueue';
import { THEME_MAX_SOURCES } from '../domain/themes';
import { useAppStore } from '../store/useAppStore';

export function SettingsDrawer() {
  const s = useAppStore((st) => st);
  return (
    <>
      <div id="settingsMask" className={s.settingsOpen ? 'show' : ''} onClick={s.closeSettings} />
      <div id="settings" className={s.settingsOpen ? 'show' : ''}>
        <div className="grab" />
        <h3>黄金时刻</h3>
        <p className="desc">日出、日落和拍摄窗口</p>
        <div className="field">
          <input
            id="latInput"
            inputMode="decimal"
            placeholder="纬度，如 30.65"
            value={s.latInput}
            onChange={(e) => s.setLatLon(e.target.value, s.lonInput)}
          />
          <input
            id="lonInput"
            inputMode="decimal"
            placeholder="经度，如 104.07"
            value={s.lonInput}
            onChange={(e) => s.setLatLon(s.latInput, e.target.value)}
          />
          <button className="mini" id="btnGeo" onClick={s.locate}>
            使用当前位置
          </button>
        </div>
        <button className="mini ghost" id="btnSunOn" onClick={s.enableSun}>
          开启提醒
        </button>

        <h3>AI 生图</h3>
        <p className="desc">可选。Key 只保存在这台设备。</p>
        <div className="field">
          <input
            id="aiBase"
            placeholder="服务地址（可留空）"
            value={s.aiBaseInput}
            onChange={(e) => s.setAiInput('aiBaseInput', e.target.value)}
          />
        </div>
        <div className="field">
          <input
            id="aiKey"
            type="password"
            placeholder="API Key"
            value={s.aiKeyInput}
            onChange={(e) => s.setAiInput('aiKeyInput', e.target.value)}
          />
        </div>
        <div className="field">
          <input
            id="aiModel"
            placeholder="模型名"
            value={s.aiModelInput}
            onChange={(e) => s.setAiInput('aiModelInput', e.target.value)}
          />
        </div>
        <div className="field">
          <button className="mini" id="btnAiTest" onClick={() => void s.testAi()}>
            测试
          </button>
          <button className="mini ghost" id="btnAiSave" onClick={s.saveAi}>
            保存
          </button>
        </div>

        <h3>主题</h3>
        <div className="rl">
          <span>默认强度</span>
          <span className="v" id="setStrength">
            {s.themeStrength.toFixed(2)}
          </span>
        </div>
        <div className="rl">
          <span>合成布局</span>
          <span className="v" id="setLayout">
            {s.themeLayout}
          </span>
        </div>
        <div className="rl">
          <span>保留原构图</span>
          <div className="sw on" id="setKeepFraming" />
        </div>
        <div className="rl">
          <span>并发</span>
          <span className="v">{QUEUE_MAX}</span>
        </div>
        <div className="rl">
          <span>最多照片</span>
          <span className="v">{THEME_MAX_SOURCES} 张</span>
        </div>

        <h3>数据</h3>
        <div className="field">
          <button
            className="mini ghost"
            id="btnWipe"
            onClick={() => {
              if (confirm('清空全部照片与设置？不可恢复')) void s.wipeAll();
            }}
          >
            清空本机数据
          </button>
        </div>
        <p className="desc" style={{ marginTop: 10 }}>照片默认只保存在本机。</p>
      </div>
    </>
  );
}
