/**
 * 应用状态（Zustand）。
 *
 * 铁律（guard 会断言）：**快门路径不得 await 任何 AI / 网络**。
 * capture() 只 await 两件本机的事：① 本地取图（静止图像或抓帧）② 写 IndexedDB；
 * 生图一律 `queue.add(...)` 同步入队后立刻返回。
 */
import { create } from 'zustand';
import { db } from '../data/db';
import { themesDb } from '../data/themesDb';
import { queue, installQueueHooks } from './queueRuntime';
import { cam, currentStream, ensurePersistOnce, openStream, tuneCamera, shutterShot } from './cameraRuntime';
import type { QueueCounts } from '../domain/genQueue';
import { makeThumb, queueThumb } from '../domain/thumbs';
import { GEN_STRENGTH, STYLES, pickRandomNote, styleByKey } from '../domain/presets';
import { SCENES, type GridMode } from '../domain/scenes';
import { camMetaParts } from '../domain/capture';
import { aiCreds, aiBaseSetting, genAutoSetting, loadGeo, saveAiSettings, saveGeo, AI_MODEL_DEFAULT, LS, type GeoPoint } from '../domain/settings';
import { sunTimes } from '../domain/sun';
import { fmtTime, saveOrShare, canvasToBlob } from '../domain/media';
import { aiRedrawCore, humanAiErr } from '../domain/aiRedraw';
import type { PhotoRec, QueueTask, ThemeMode, ThemeRec } from '../domain/types';
import type { CollageLayout } from '../domain/collage';
import {
  addSource,
  applyThemeEvent,
  canGenerate,
  collectSubTaskSources,
  expectedOutputs,
  newTheme,
  pickAllIds,
  resetForRegen,
  syncThemeStatus,
  themeById,
  togglePick,
  THEME_MAX_SOURCES,
} from '../domain/themes';
import { buildPrompt, ideaAt, surpriseWords, toggleWord } from '../domain/promptBuilder';

export type View = 'cam' | 'theme' | 'film' | 'dark' | 'pola' | 'edit' | 'album';

/** 相册分组：原始胶卷 / AI 归档 / 主题作品（主题作品里再分合成作品与同风格组） */
export type AlbumGroup = 'raw' | 'ai' | 'theme';

export interface AppState {
  initialized: boolean;
  view: View;
  photos: PhotoRec[];
  album: PhotoRec[];
  selected: string[];
  sceneIdx: number;
  gridMode: GridMode;
  /** 相机 */
  camReady: boolean;
  camFacing: 'environment' | 'user';
  camStill: boolean;
  camRes: string;
  camLastShot: '' | 'still' | 'frame';
  flash: boolean;
  /** 水平仪 */
  levelOn: boolean;
  levelDeviation: number | null;
  /** 生图开关 */
  genAuto: boolean;
  genStyleKey: string;
  /** 队列镜像（由引擎 onChange 推送） */
  queueItems: QueueTask[];
  queueCounts: QueueCounts;
  queueOpen: boolean;
  settingsOpen: boolean;
  lightboxId: string | null;
  /** 拍立得 */
  polaPhotoId: string | null;
  polaFilm: string;
  polaNote: string;
  /** 每次「换显影 / 换胶片 / 换照片」自增，用来重放显影动画 */
  polaNonce: number;
  /** 修图 */
  editPhotoId: string | null;
  editStyleKey: string;
  editStrength: number;
  editResult: Blob | null;
  editAiApplied: boolean;
  editBusy: boolean;
  /** 设置表单镜像 */
  aiBaseInput: string;
  aiKeyInput: string;
  aiModelInput: string;
  latInput: string;
  lonInput: string;
  geo: GeoPoint | null;
  sunTitle: string;
  sunDetail: string;
  toast: string | null;
  /** 非安全上下文横幅 */
  insecure: boolean;
  // ---------------- 主题模式 ----------------
  /** 全部主题（独立库 snapsaga_themes，只存 id 引用） */
  themes: ThemeRec[];
  /** 正在「边拍边收」的主题 id（取景页顶部主题条用它） */
  activeThemeId: string | null;
  /** 新建主题面板是否展开 */
  themeCreateOpen: boolean;
  /** 主题详情面板 */
  themeDetailId: string | null;
  /** 新建面板表单镜像 */
  themePromptDraft: string;
  themeWords: string[];
  themeMode: ThemeMode;
  themeLayout: CollageLayout;
  themeStrength: number;
  /** 已选素材（≤ 9） */
  themePick: string[];
  /** 相册分组 */
  albumGroup: AlbumGroup;
}

export interface AppActions {
  init(): Promise<void>;
  setView(v: View): void;
  showToast(msg: string, ms?: number): void;
  // 相机
  startCamera(): Promise<void>;
  switchCamera(): Promise<void>;
  capture(): Promise<void>;
  addPhoto(blob: Blob, shot: 'still' | 'frame'): Promise<PhotoRec>;
  syncCam(): void;
  // 场景 / 水平仪
  setScene(i: number): void;
  /** 构图网格：三分 → 黄金螺旋 → 关（取景 HUD 的 ▦ 按钮循环） */
  setGridMode(m: GridMode): void;
  toggleLevel(): Promise<void>;
  setLevelDeviation(deg: number | null): void;
  // 胶卷
  toggleSelect(id: string): void;
  clearSelection(): void;
  deletePhoto(id: string): Promise<void>;
  // 拍立得
  toPolaroid(photoId: string): void;
  setPolaFilm(k: string): void;
  setPolaNote(v: string): void;
  rollNote(): void;
  redevelop(): void;
  savePolaroid(): Promise<void>;
  // 修图
  toEdit(photoId: string): void;
  setEditStyle(k: string): void;
  setEditStrength(v: number): void;
  runAiRedraw(): Promise<void>;
  saveEditResult(): Promise<void>;
  // 队列
  toggleGenAuto(): void;
  setGenStyle(k: string): void;
  openQueue(): void;
  closeQueue(): void;
  retryTask(id: string): void;
  dropTask(id: string): void;
  clearFinished(): void;
  // AI 相册
  openLightbox(id: string): void;
  closeLightbox(): void;
  deleteAlbumPhoto(id: string): Promise<void>;
  saveAlbumPhoto(): Promise<void>;
  // 设置
  openSettings(): void;
  closeSettings(): void;
  setAiInput(field: 'aiBaseInput' | 'aiKeyInput' | 'aiModelInput', v: string): void;
  setLatLon(lat: string, lon: string): void;
  saveAi(): void;
  testAi(): Promise<void>;
  locate(): void;
  enableSun(): void;
  renderSun(): void;
  wipeAll(): Promise<void>;
  // ---------------- 主题模式 ----------------
  openThemeCreate(withPick?: boolean): void;
  closeThemeCreate(): void;
  setThemePrompt(v: string): void;
  toggleThemeWord(w: string): void;
  clearThemeDraft(): void;
  surpriseThemeDraft(): void;
  useIdea(i: number): void;
  setThemeMode(m: ThemeMode): void;
  setThemeLayout(l: CollageLayout): void;
  setThemeStrength(v: number): void;
  toggleThemePick(id: string): void;
  themePickAll(): void;
  /** 创建主题（shootMode=true = 创建并开拍 → 边拍边收） */
  createTheme(shootMode?: boolean): void;
  openThemeDetail(id: string): void;
  closeThemeDetail(): void;
  regenTheme(id: string): void;
  resumeTheme(id: string): void;
  endActiveTheme(): void;
  saveThemeToAlbum(id: string): void;
  reuseThemePrompt(id: string): void;
  setAlbumGroup(g: AlbumGroup): void;
  /** 边拍边收：把刚拍的一张同步收进主题（**同步**，快门路径不许 await 它） */
  collectIntoActiveTheme(rec: PhotoRec): boolean;
}

export type AppStore = AppState & AppActions;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppStore>()((set, get) => {
  const showToast = (msg: string, ms = 2200) => {
    set({ toast: msg });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), ms);
  };

  /** 缩略图补好后只换这一格（不重建网格） */
  const patchThumb = (rec: PhotoRec) => {
    set((s) => {
      const key = rec.kind === 'ai' ? 'album' : 'photos';
      return { [key]: s[key].map((p) => (p.id === rec.id ? { ...p, thumb: rec.thumb } : p)) } as Partial<AppState>;
    });
  };

  /** 历史照片（本版之前存的没有 thumb 字段）后台逐张补：一次一张，让出主线程 */
  const backfillThumbs = () => {
    const todo = [...get().photos, ...get().album].filter((p) => !p.thumb);
    if (!todo.length) return;
    let i = 0;
    const step = () => {
      if (i >= todo.length) return;
      const rec = todo[i++];
      void makeThumb(rec.blob).then(async (t) => {
        if (t) {
          rec.thumb = t;
          try {
            await db.put(rec);
          } catch {
            /* 落库失败下次再补 */
          }
          patchThumb(rec);
        }
        setTimeout(step, 80);
      });
    };
    setTimeout(step, 400);
  };

  return {
    initialized: false,
    view: 'cam',
    photos: [],
    album: [],
    selected: [],
    sceneIdx: 0,
    gridMode: SCENES[0].grid,
    camReady: false,
    camFacing: cam.facing,
    camStill: cam.still,
    camRes: '',
    camLastShot: '',
    flash: false,
    levelOn: false,
    levelDeviation: null,
    genAuto: genAutoSetting(),
    genStyleKey: localStorage.getItem(LS.genStyle) || STYLES[0].k,
    queueItems: [],
    queueCounts: { run: 0, queued: 0, failed: 0, done: 0 },
    queueOpen: false,
    settingsOpen: false,
    lightboxId: null,
    polaPhotoId: null,
    polaFilm: '600',
    polaNote: '',
    polaNonce: 0,
    editPhotoId: null,
    editStyleKey: STYLES[0].k,
    editStrength: 0.7,
    editResult: null,
    editAiApplied: false,
    editBusy: false,
    aiBaseInput: aiBaseSetting(),
    aiKeyInput: localStorage.getItem(LS.aiKey) || '',
    aiModelInput: localStorage.getItem(LS.aiModel) || AI_MODEL_DEFAULT,
    latInput: '',
    lonInput: '',
    geo: loadGeo(),
    sunTitle: '黄金时刻：点击开启',
    sunDetail: '使用定位或手动填经纬度（设置里）',
    toast: null,
    insecure: typeof window !== 'undefined' && !window.isSecureContext,
    themes: [],
    activeThemeId: null,
    themeCreateOpen: false,
    themeDetailId: null,
    themePromptDraft: '',
    themeWords: [],
    themeMode: 'merge',
    themeLayout: '网格拼贴',
    themeStrength: 0.62,
    themePick: [],
    albumGroup: 'ai',

    showToast,

    async init() {
      if (get().initialized) return;
      set({ initialized: true });
      await db.open();
      const all = await db.all();
      set({ photos: all.filter((p) => p.kind !== 'ai'), album: all.filter((p) => p.kind === 'ai') });
      const geo = get().geo;
      if (geo) {
        set({ latInput: String(geo.lat), lonInput: String(geo.lon) });
      }
      get().renderSun();
      ensurePersistOnce();
      backfillThumbs();
      // 主题：独立库（见 data/themesDb.ts 的说明）；加载后让状态跟随恢复出来的队列
      try {
        await themesDb.open();
        set({ themes: await themesDb.all() });
      } catch {
        /* 主题库打不开不阻塞启动 */
      }
      try {
        const c = queue.restore(await db.tasks());
        syncThemesFromQueue();
        if (c.run + c.queued) showToast(`已恢复后台生图队列：生成中 ${c.run} · 排队 ${c.queued}`, 3200);
      } catch {
        /* 队列恢复失败不阻塞应用启动 */
      }
    },

    setView(v) {
      set({ view: v });
    },

    // ---------------- 相机 ----------------
    async startCamera() {
      try {
        await openStream(cam.facing);
        const v = document.querySelector<HTMLVideoElement>('#video');
        if (v) {
          v.srcObject = currentStream();
          void v.play().catch(() => {});
        }
        cam.lastShot = '';
        cam.res = '';
        await tuneCamera();
        set({ camReady: true, camRes: cam.res, camStill: cam.still, camFacing: cam.facing, camLastShot: '' });
      } catch (e) {
        const err = e as DOMException;
        showToast('相机打开失败：' + (err.name === 'NotAllowedError' ? '未授权相机权限' : err.message), 3200);
      }
    },

    async switchCamera() {
      cam.facing = cam.facing === 'environment' ? 'user' : 'environment';
      set({ camFacing: cam.facing });
      await get().startCamera();
    },

    syncCam() {
      set({ camRes: cam.res, camStill: cam.still, camLastShot: cam.lastShot, camReady: !!currentStream() });
    },

    async addPhoto(blob, shot) {
      const rec: PhotoRec = {
        id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
        blob,
        ts: Date.now(),
        shot: shot || 'frame',
      };
      await db.put(rec);
      set((s) => ({ photos: [rec, ...s.photos] })); // 增量：只 prepend 一格，已有格子的 DOM 节点被 React 复用
      queueThumb(rec, { put: (r) => db.put(r), onReady: patchThumb }); // fire-and-forget：快门不等它
      return rec;
    },

    async capture() {
      const video = document.querySelector<HTMLVideoElement>('#video');
      if (!currentStream() || !video || !video.videoWidth) {
        showToast('相机还没就绪');
        return;
      }
      set({ flash: true });
      setTimeout(() => set({ flash: false }), 120);
      // ——— 快门只做「拍下（本地）→ 存胶卷 → 同步入队」，全程不碰 AI、不 await 网络 ———
      const shot = await shutterShot(video);
      cam.lastShot = shot.kind;
      get().syncCam();
      const rec = await get().addPhoto(shot.blob, shot.kind);
      // 主题生效中：这张归主题（同步收图 + 同步入队，依然不 await 任何东西）
      if (get().collectIntoActiveTheme(rec)) return;
      const creds = aiCreds();
      if (get().genAuto && creds.base && creds.key) {
        queue.add(rec, styleByKey(get().genStyleKey), GEN_STRENGTH); // 同步入队，立即返回；后台最多 9 并发
        showToast('已存胶卷 🎞 · 已加入生图队列');
      } else if (get().genAuto) {
        showToast('已收进胶卷 🎞 · 未配置 AI（设置里填 Base/Key），这张没入队');
      } else {
        showToast('已收进胶卷 🎞');
      }
    },

    // ---------------- 场景 / 水平仪 ----------------
    setScene(i) {
      set({ sceneIdx: i, gridMode: SCENES[i].grid });
    },
    setGridMode(m) {
      set({ gridMode: m });
    },

    async toggleLevel() {
      if (get().levelOn) {
        set({ levelOn: false, levelDeviation: null });
        window.removeEventListener('deviceorientation', levelHandler);
        return;
      }
      try {
        const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
        if (typeof DOE !== 'undefined' && DOE?.requestPermission) {
          const r = await DOE.requestPermission();
          if (r !== 'granted') {
            showToast('未授权方向传感器');
            return;
          }
        }
        set({ levelOn: true });
        window.addEventListener('deviceorientation', levelHandler);
        showToast('水平仪已开启：把手机贴在竖直或水平面上校平');
      } catch {
        showToast('此设备不支持方向传感器');
      }
    },

    setLevelDeviation(deg) {
      set({ levelDeviation: deg });
    },

    // ---------------- 胶卷 ----------------
    toggleSelect(id) {
      set((s) => ({
        selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
      }));
    },
    clearSelection() {
      set({ selected: [] });
    },
    async deletePhoto(id) {
      await db.del(id);
      set((s) => ({ photos: s.photos.filter((p) => p.id !== id), selected: s.selected.filter((x) => x !== id) }));
    },

    // ---------------- 拍立得 ----------------
    toPolaroid(photoId) {
      set({ polaPhotoId: photoId, view: 'pola', polaNonce: get().polaNonce + 1 });
      if (!get().polaNote) set({ polaNote: pickRandomNote() });
    },
    setPolaFilm(k) {
      set({ polaFilm: k, polaNonce: get().polaNonce + 1 });
    },
    setPolaNote(v) {
      set({ polaNote: v });
    },
    rollNote() {
      set({ polaNote: pickRandomNote(), polaNonce: get().polaNonce + 1 });
    },
    redevelop() {
      set({ polaNonce: get().polaNonce + 1 });
    },
    async savePolaroid() {
      const c = document.querySelector<HTMLCanvasElement>('#polaCanvas');
      const photo = get().photos.find((p) => p.id === get().polaPhotoId) ?? get().album.find((p) => p.id === get().polaPhotoId);
      if (!c || !photo) {
        showToast('先选一张照片');
        return;
      }
      const blob = await canvasToBlob(c);
      const out = await saveOrShare(blob, `snapsaga-pola-${Date.now()}.jpg`, '拾光拍立得');
      if (out === 'downloaded') showToast('已保存到下载（或用分享面板存到相册）');
    },

    // ---------------- 修图 ----------------
    toEdit(photoId) {
      set({ editPhotoId: photoId, view: 'edit', editResult: null, editAiApplied: false });
    },
    setEditStyle(k) {
      set({ editStyleKey: k, editResult: null, editAiApplied: false });
    },
    setEditStrength(v) {
      set({ editStrength: v });
    },
    async runAiRedraw() {
      const id = get().editPhotoId;
      const photo = get().photos.find((p) => p.id === id) ?? get().album.find((p) => p.id === id);
      if (!photo) {
        showToast('先选一张照片');
        return;
      }
      const st = styleByKey(get().editStyleKey);
      set({ editBusy: true });
      try {
        const out = await aiRedrawCore(photo.blob, st, get().editStrength);
        set({ editResult: out, editAiApplied: true });
        showToast('AI 重绘完成 ✨');
      } catch (e) {
        const c = aiCreds();
        if (!c.base || !c.key) {
          showToast('未配置 AI：先在设置里填 API Key（Base 已有默认值）', 3200);
          get().openSettings();
        } else showToast('AI 重绘失败：' + humanAiErr(e), 4000);
      } finally {
        set({ editBusy: false });
      }
    },
    async saveEditResult() {
      const c = document.querySelector<HTMLCanvasElement>('#editStage #editCanvas');
      if (!c) {
        showToast('还没有可保存的结果');
        return;
      }
      const blob = await canvasToBlob(c);
      await saveOrShare(blob, `snapsaga-edit-${Date.now()}.jpg`, '拾光修图');
      showToast('已保存');
    },

    // ---------------- 队列 ----------------
    toggleGenAuto() {
      const on = !get().genAuto;
      localStorage.setItem(LS.genAuto, on ? '1' : '0');
      set({ genAuto: on });
      showToast(on ? '拍完自动排队生图（不打断拍照）' : '已关闭自动生图');
    },
    setGenStyle(k) {
      localStorage.setItem(LS.genStyle, k);
      set({ genStyleKey: k });
    },
    openQueue() {
      set({ queueOpen: true });
    },
    closeQueue() {
      set({ queueOpen: false });
    },
    retryTask(id) {
      queue.retry(id);
    },
    dropTask(id) {
      queue.drop(id);
    },
    clearFinished() {
      queue.clearFinished();
      showToast('已清理结束的任务');
    },

    // ---------------- AI 相册 ----------------
    openLightbox(id) {
      set({ lightboxId: id });
    },
    closeLightbox() {
      set({ lightboxId: null });
    },
    async deleteAlbumPhoto(id) {
      await db.del(id);
      set((s) => ({ album: s.album.filter((p) => p.id !== id) }));
    },
    async saveAlbumPhoto() {
      const p = get().album.find((x) => x.id === get().lightboxId);
      if (!p) return;
      const isPng = (p.blob.type || '').includes('png');
      const out = await saveOrShare(p.blob, `snapsaga-ai-${Date.now()}.${isPng ? 'png' : 'jpg'}`, '拾光 AI 生图');
      if (out === 'downloaded') showToast('已保存到下载（或用分享面板存到相册）');
    },

    // ---------------- 设置 ----------------
    openSettings() {
      const geo = get().geo;
      set({
        settingsOpen: true,
        aiBaseInput: aiBaseSetting(),
        aiKeyInput: localStorage.getItem(LS.aiKey) || '',
        aiModelInput: localStorage.getItem(LS.aiModel) || AI_MODEL_DEFAULT,
        latInput: geo ? String(geo.lat) : '',
        lonInput: geo ? String(geo.lon) : '',
      });
    },
    closeSettings() {
      set({ settingsOpen: false });
    },
    setAiInput(field, v) {
      set({ [field]: v } as unknown as Partial<AppState>);
    },
    setLatLon(lat, lon) {
      set({ latInput: lat, lonInput: lon });
    },
    saveAi() {
      const { aiBaseInput, aiKeyInput, aiModelInput } = get();
      saveAiSettings(aiBaseInput, aiKeyInput, aiModelInput);
      showToast('已保存到本机');
    },
    async testAi() {
      const base = (get().aiBaseInput || '').replace(/\/+$/, '');
      const key = get().aiKeyInput.trim();
      if (!base || !key) {
        showToast('先填 API Key（Base 已有默认值，如需自建可改）');
        return;
      }
      showToast('测试中…');
      try {
        const r = await fetch(base + '/models', { headers: { Authorization: 'Bearer ' + key } });
        showToast(r.ok ? '连通成功 ✓（HTTP ' + r.status + '）' : '服务响应 HTTP ' + r.status + '，检查 Base/Key');
      } catch (e) {
        const msg = '' + (e as Error).message;
        showToast('连不上：' + (msg.includes('Failed to fetch') ? '网络或 CORS 限制' : msg), 3600);
      }
    },
    locate() {
      if (!navigator.geolocation) {
        showToast('此浏览器不支持定位');
        return;
      }
      showToast('定位中…');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const geo = { lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) };
          saveGeo(geo);
          set({ geo, latInput: String(geo.lat), lonInput: String(geo.lon) });
          get().renderSun();
          showToast('已定位，黄金时刻已就绪');
        },
        () => showToast('定位失败：可手动填经纬度'),
        { timeout: 8000 },
      );
    },
    enableSun() {
      const la = parseFloat(get().latInput);
      const lo = parseFloat(get().lonInput);
      if (Number.isNaN(la) || Number.isNaN(lo)) {
        showToast('先填或定位经纬度');
        return;
      }
      const geo = { lat: la, lon: lo };
      saveGeo(geo);
      set({ geo });
      get().renderSun();
      showToast('黄金时刻提醒已启用（离线计算）');
    },
    renderSun() {
      const geo = get().geo;
      if (!geo) {
        set({ sunTitle: '黄金时刻：未设置地点', sunDetail: '设置里点「定位」或手填经纬度' });
        return;
      }
      const now = new Date();
      const st = sunTimes(now, geo.lat, geo.lon);
      const stTm = sunTimes(new Date(now.valueOf() + 86400000), geo.lat, geo.lon);
      const windows = [
        { a: st.morningStart, b: st.morningEnd, c: '清晨' },
        { a: st.eveningStart, b: st.eveningEnd, c: '傍晚' },
      ];
      let msg: [string, string] | null = null;
      for (const w of windows) {
        if (now >= w.a && now <= w.b) {
          msg = ['☀️ 黄金时刻进行中！', `至 ${fmtTime(w.b)}（${w.c}光）`];
          break;
        }
        if (now < w.a) {
          msg = [`🌅 ${w.c}黄金时刻 ${fmtTime(w.a)} 开始`, `日出 ${fmtTime(st.sunrise)} · 日落 ${fmtTime(st.sunset)}`];
          break;
        }
      }
      if (!msg) {
        msg = ['🌙 今日黄金时刻已结束', `明日 ${fmtTime(stTm.morningStart)} 起晨光 · 傍晚 ${fmtTime(stTm.eveningStart)} 开始`];
      }
      set({ sunTitle: msg[0], sunDetail: msg[1] });
    },
    async wipeAll() {
      await db.clear();
      await db.putTasks([]);
      await themesDb.clear();
      queue.reset(); // 队列与在飞的生成结果一起作废
      localStorage.clear();
      // 注意：不碰相机流 —— 原型「清空数据」后相机仍可用，可以继续拍（只是没 Key 不再入队）
      set({
        photos: [],
        album: [],
        selected: [],
        lightboxId: null,
        polaPhotoId: null,
        editPhotoId: null,
        editResult: null,
        genAuto: false,
        genStyleKey: STYLES[0].k,
        aiBaseInput: aiBaseSetting(),
        aiKeyInput: '',
        aiModelInput: AI_MODEL_DEFAULT,
        settingsOpen: false,
        themes: [],
        activeThemeId: null,
        themeCreateOpen: false,
        themeDetailId: null,
        themePromptDraft: '',
        themeWords: [],
        themePick: [],
        albumGroup: 'ai',
      });
      showToast('已清空');
    },

    // ---------------- 主题模式 ----------------
    openThemeCreate(withPick) {
      const s = get();
      // 「用这些照片建主题」：优先用胶卷里选中的，没选就带最近 4 张（设计稿口径）
      const picked = s.selected.length
        ? s.selected.slice(0, THEME_MAX_SOURCES)
        : s.photos.slice(0, 4).map((p) => p.id);
      set({
        themeCreateOpen: true,
        themeDetailId: null,
        themePromptDraft: '',
        themeWords: [],
        themePick: withPick ? picked : [],
      });
    },
    closeThemeCreate() {
      set({ themeCreateOpen: false });
    },
    setThemePrompt(v) {
      set({ themePromptDraft: v });
    },
    toggleThemeWord(w) {
      set((s) => ({ themeWords: toggleWord(s.themeWords, w) }));
    },
    clearThemeDraft() {
      set({ themePromptDraft: '', themeWords: [] });
    },
    surpriseThemeDraft() {
      set({ themeWords: surpriseWords() });
      showToast('换了一批灵感词');
    },
    useIdea(i) {
      set({ themeCreateOpen: true, themePromptDraft: ideaAt(i), themeWords: [] });
    },
    setThemeMode(m) {
      set({ themeMode: m });
    },
    setThemeLayout(l) {
      set({ themeLayout: l });
      showToast('合成布局：' + l);
    },
    setThemeStrength(v) {
      set({ themeStrength: Math.min(1, Math.max(0, v)) });
    },
    toggleThemePick(id) {
      const r = togglePick(get().themePick, id);
      if (!r.accepted) {
        showToast(r.reason, 2600);
        return;
      }
      set({ themePick: r.pick });
    },
    themePickAll() {
      const s = get();
      const ids = s.photos.map((p) => p.id);
      const next = pickAllIds(ids, s.themePick.length);
      set({ themePick: next });
      if (next.length >= THEME_MAX_SOURCES) showToast(`已选满 ${THEME_MAX_SOURCES} 张（多图上限）`, 2600);
    },

    createTheme(shootMode) {
      const s = get();
      const prompt = buildPrompt(s.themePromptDraft, s.themeWords);
      const ids = s.themePick.filter((id) => s.photos.some((p) => p.id === id));
      const theme = newTheme({
        id: 'th' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        prompt,
        words: s.themeWords,
        mode: s.themeMode,
        layout: s.themeLayout,
        strength: s.themeStrength,
        sourceIds: ids,
      });
      if (!canGenerate(ids.length)) {
        if (!shootMode) {
          showToast(`选 2–${THEME_MAX_SOURCES} 张照片才能生成`, 2600);
          return;
        }
      }
      const created = applyThemeEvent(theme, 'collect-start');
      const first: ThemeRec = shootMode ? { ...created, collecting: true } : theme;
      set({ themes: [first, ...s.themes], themeCreateOpen: false, themePick: [], themePromptDraft: '', themeWords: [] });
      persistThemes([first, ...s.themes]);

      if (shootMode) {
        // 边拍边收：主题立即生效，快门自动收图；已选中的先跑一轮
        if (canGenerate(ids.length)) enqueueTheme(first, ids);
        set({ activeThemeId: first.id, view: 'cam' });
        showToast(`主题已启用「${first.name}」· 按快门就自动收进这个主题`, 3200);
        return;
      }
      enqueueTheme(first, ids);
      set({ view: 'dark' });
      showToast(`已加入暗房：${first.mode === 'merge' ? '合成一张' : '统一风格'} · ${ids.length} 张 → 产出 ${expectedOutputs(first.mode, ids.length)} 张`, 3200);
    },

    openThemeDetail(id) {
      set({ themeDetailId: id, themeCreateOpen: false });
    },
    closeThemeDetail() {
      set({ themeDetailId: null });
    },
    regenTheme(id) {
      const t = themeById(get().themes, id);
      if (!t) return;
      const next = resetForRegen(t);
      patchTheme(next);
      enqueueTheme(next, next.sourceIds);
      set({ themeDetailId: null, view: 'dark' });
      showToast('已重新排队：' + t.name);
    },
    resumeTheme(id) {
      const t = themeById(get().themes, id);
      if (!t) return;
      const next = applyThemeEvent(t, 'collect-start');
      patchTheme(next);
      set({ activeThemeId: next.id, themeDetailId: null, view: 'cam' });
      showToast(`继续用「${next.name}」拍，快门自动收图`, 3200);
    },
    endActiveTheme() {
      const s = get();
      const t = themeById(s.themes, s.activeThemeId);
      if (!t) {
        set({ activeThemeId: null });
        return;
      }
      const next = applyThemeEvent(t, 'collect-end');
      patchTheme(next);
      set({ activeThemeId: null, view: 'dark' });
      showToast(`主题「${next.name}」已结束 · 共收 ${next.sourceIds.length} 张，去暗房看成片`, 3200);
    },
    saveThemeToAlbum(id) {
      const t = themeById(get().themes, id);
      if (!t) return;
      set({ themeDetailId: null, albumGroup: 'theme', view: 'album' });
      showToast(`已保存到相册「主题作品」· ${t.outputIds.length} 张`, 2600);
    },
    reuseThemePrompt(id) {
      const t = themeById(get().themes, id);
      if (!t) return;
      set({
        themeDetailId: null,
        themeCreateOpen: true,
        themePromptDraft: t.prompt,
        themeWords: t.words,
        themeMode: t.mode,
        themeLayout: t.layout,
        themeStrength: t.strength,
        themePick: t.sourceIds.slice(0, THEME_MAX_SOURCES),
      });
      showToast('提示词与参数已复制到新建面板', 2600);
    },
    setAlbumGroup(g) {
      set({ albumGroup: g });
    },

    /** 边拍边收：**同步**把这张收进主题（快门路径调用，绝不允许 await 它） */
    collectIntoActiveTheme(rec) {
      const s = get();
      const t = themeById(s.themes, s.activeThemeId);
      if (!t || !t.collecting) return false;
      const r = addSource(t, rec.id);
      if (!r.accepted) {
        showToast(r.reason, 3200);
        return true; // 仍算「归主题」，只是没收进去（已收满）
      }
      const withShot = applyThemeEvent(r.theme, 'collect-shot');
      patchTheme(withShot);
      queue.addTheme({
        themeId: withShot.id,
        themeName: withShot.name,
        prompt: withShot.prompt,
        mode: 'unify', // 边拍边收 = 每张各自重绘，同一主题同一调子
        strength: withShot.strength,
        sources: collectSubTaskSources(rec.id, rec.blob),
        pid: rec.id,
      });
      showToast(`已收进主题「${withShot.name}」· 第 ${withShot.sourceIds.length} 张，正在统一风格`, 2600);
      return true;
    },
  };
});

/* ---------------- 主题模式的小工具（不进 state，避免无意义重渲染） ---------------- */

/** 主题列表整体落库（主题数量小，整表写最简单可靠，与队列仓同一套做法） */
function persistThemes(list: readonly ThemeRec[]): void {
  void themesDb.putAll(list);
}

/** 改一个主题（其余原样），并落库 */
function patchTheme(next: ThemeRec): void {
  const list = useAppStore.getState().themes.map((t) => (t.id === next.id ? next : t));
  useAppStore.setState({ themes: list });
  persistThemes(list);
}

/** 把主题的素材入队（一个主题任务 = 一个槽位） */
function enqueueTheme(t: ThemeRec, sourceIds: readonly string[]): void {
  const photos = useAppStore.getState().photos;
  const sources = sourceIds
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is PhotoRec => !!p)
    .map((p) => ({ id: p.id, blob: p.blob as Blob | null }));
  if (!sources.length) return;
  patchTheme(applyThemeEvent(t, 'submit'));
  queue.addTheme({
    themeId: t.id,
    themeName: t.name,
    prompt: t.prompt,
    mode: t.mode,
    layout: t.layout,
    strength: t.strength,
    sources,
  });
}

/** 队列变化 → 主题状态跟随（running / queued / done） */
function syncThemesFromQueue(): void {
  const s = useAppStore.getState();
  const items = queue.items;
  let changed = false;
  const list = s.themes.map((t) => {
    const next = syncThemeStatus(t, items);
    if (next !== t) changed = true;
    return next;
  });
  if (!changed) return;
  useAppStore.setState({ themes: list });
  persistThemes(list);
}

/** 水平仪：gamma 偏差 ≤2° 视为水平（与原型一致） */
function levelHandler(e: DeviceOrientationEvent): void {
  const gamma = e.gamma || 0;
  useAppStore.getState().setLevelDeviation(Math.round(Math.abs(gamma)));
}

/** 队列 → 界面镜像 */
installQueueHooks({
  async archive(task, out) {
    const rec: PhotoRec = {
      id: 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      blob: out,
      ts: Date.now(),
      kind: 'ai',
      from: task.photoId || '',
      style: task.styleKey || '',
      styleName: task.styleName || '',
    };
    await db.put(rec);
    useAppStore.setState((s) => ({ album: [rec, ...s.album] }));
    // 归档后后台补缩略图（大图仍用原图），补好回写到任务上供队列面板显示
    queueThumb(rec, {
      put: (r) => db.put(r),
      onReady: (r) => {
        task.thumb = r.thumb;
        queue.persist();
        useAppStore.setState((s) => ({ album: s.album.map((p) => (p.id === r.id ? { ...p, thumb: r.thumb } : p)) }));
      },
    });
    useAppStore.getState().showToast('生图完成：' + (rec.styleName || 'AI') + ' ✨ 已归档到 AI 相册', 2600);
  },
  /** 主题任务每张产出：逐张入库 + 进相册（每张好了就亮）+ 回写主题的 outputIds */
  async archiveOutput(task, index, out) {
    const rec: PhotoRec = {
      id: 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '_' + index,
      blob: out,
      ts: Date.now(),
      kind: 'ai',
      from: task.pid || task.sources?.[index]?.id || task.photoId || '',
      style: task.styleKey || '',
      styleName: task.themeName || '主题',
      theme: task.themeId || '',
      themeName: task.themeName || '',
      merge: task.mode === 'merge',
      ids: task.mode === 'merge' ? (task.sources ?? []).map((s) => s.id) : undefined,
      layout: task.mode === 'merge' ? task.layout : undefined,
    };
    await db.put(rec);
    useAppStore.setState((s) => ({ album: [rec, ...s.album] }));
    queueThumb(rec, {
      put: (r) => db.put(r),
      onReady: (r) => {
        useAppStore.setState((s) => ({ album: s.album.map((p) => (p.id === r.id ? { ...p, thumb: r.thumb } : p)) }));
      },
    });
    // 产出回写到主题：k/n 进度与「再来一版」都靠它
    const t = themeById(useAppStore.getState().themes, task.themeId);
    if (t) patchTheme({ ...t, outputIds: [...t.outputIds, rec.id], updatedAt: Date.now() });
    const total = task.mode === 'merge' ? 1 : (task.n ?? 1);
    useAppStore.getState().showToast(`主题产出 ${index + 1}/${total} 张 · 已进相册「主题作品」`, 2200);
  },
  onChange() {
    useAppStore.setState({ queueItems: queue.items.slice(), queueCounts: queue.counts() });
    syncThemesFromQueue();
  },
});

/** 供界面与调试桥使用的小派生量 */
export function camMeta(state: Pick<AppState, 'camRes' | 'camStill' | 'camLastShot'>) {
  return camMetaParts({ res: state.camRes, still: state.camStill, lastShot: state.camLastShot });
}
export function currentPolaPhoto(s: AppState): PhotoRec | null {
  return s.photos.find((p) => p.id === s.polaPhotoId) ?? s.album.find((p) => p.id === s.polaPhotoId) ?? null;
}
export function currentEditPhoto(s: AppState): PhotoRec | null {
  return s.photos.find((p) => p.id === s.editPhotoId) ?? s.album.find((p) => p.id === s.editPhotoId) ?? null;
}
export function lightboxPhoto(s: AppState): PhotoRec | null {
  return s.album.find((p) => p.id === s.lightboxId) ?? s.photos.find((p) => p.id === s.lightboxId) ?? null;
}

/** 正在边拍边收的主题（取景页顶部主题条用它） */
export function activeTheme(s: AppState): ThemeRec | null {
  return themeById(s.themes, s.activeThemeId);
}

/** 详情面板对应的主题 */
export function detailTheme(s: AppState): ThemeRec | null {
  return themeById(s.themes, s.themeDetailId);
}

/* ---------------- 派生列表 ----------------
 * ⚠️ 这些函数**不能**直接当 zustand selector 用（每次返回新数组会让 v5 的
 * useSyncExternalStore 无限重渲染，React 报 #185）。用法：先 select 稳定的原始切片，
 * 再在渲染里算：`const list = albumPhotos({ photos, album, albumGroup })`。 */

export interface PhotoSlices {
  photos: PhotoRec[];
  album: PhotoRec[];
  albumGroup: AlbumGroup;
}

/** 相册当前分组的照片：raw = 胶卷原片；ai = 全部 AI 归档；theme = 主题作品 */
export function albumPhotos({ photos, album, albumGroup }: PhotoSlices): PhotoRec[] {
  if (albumGroup === 'raw') return photos;
  if (albumGroup === 'theme') return album.filter((p) => !!p.theme);
  return album;
}

/** 主题作品再分两组：合成成品（merge）与同风格组 */
export function themeAlbumSplit(album: PhotoRec[]): { merges: PhotoRec[]; unify: PhotoRec[] } {
  const list = album.filter((p) => !!p.theme);
  return { merges: list.filter((p) => p.merge), unify: list.filter((p) => !p.merge) };
}

/** 主题的素材照片（按 sourceIds 顺序） */
export function themeSources(photos: PhotoRec[], t: ThemeRec): PhotoRec[] {
  return t.sourceIds.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoRec => !!p);
}

/** 主题的产出照片（按 outputIds 顺序） */
export function themeOutputs(album: PhotoRec[], t: ThemeRec): PhotoRec[] {
  return t.outputIds.map((id) => album.find((p) => p.id === id)).filter((p): p is PhotoRec => !!p);
}
