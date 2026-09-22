/**
 * 应用状态（Zustand）。
 *
 * 铁律（guard 会断言）：**快门路径不得 await 任何 AI / 网络**。
 * capture() 只 await 两件本机的事：① 本地取图（静止图像或抓帧）② 写 IndexedDB；
 * 生图一律 `queue.add(...)` 同步入队后立刻返回。
 */
import { create } from 'zustand';
import { db } from '../data/db';
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
import type { PhotoRec, QueueTask } from '../domain/types';

export type View = 'cam' | 'film' | 'pola' | 'edit' | 'album';

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
      try {
        const c = queue.restore(await db.tasks());
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
      const creds = aiCreds();
      if (get().genAuto && creds.base && creds.key) {
        queue.add(rec, styleByKey(get().genStyleKey), GEN_STRENGTH); // 同步入队，立即返回；后台最多 4 并发
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
      });
      showToast('已清空');
    },
  };
});

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
  onChange() {
    useAppStore.setState({ queueItems: queue.items.slice(), queueCounts: queue.counts() });
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
