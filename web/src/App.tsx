import { useEffect } from 'react';
import { AlbumView } from './components/AlbumView';
import { AppHeader } from './components/AppHeader';
import { BottomNav } from './components/BottomNav';
import { CameraView } from './components/CameraView';
import { DarkroomView } from './components/DarkroomView';
import { EditView } from './components/EditView';
import { FilmView } from './components/FilmView';
import { Lightbox } from './components/Lightbox';
import { PolaroidView } from './components/PolaroidView';
import { QueuePanel } from './components/QueuePanel';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ThemeCreateSheet } from './components/ThemeCreateSheet';
import { ThemeDetailSheet } from './components/ThemeDetailSheet';
import { ThemeView } from './components/ThemeView';
import { Toast } from './components/Toast';
import { useAppStore } from './store/useAppStore';

export function App() {
  const view = useAppStore((s) => s.view);
  const insecure = useAppStore((s) => s.insecure);
  const init = useAppStore((s) => s.init);
  const renderSun = useAppStore((s) => s.renderSun);

  useEffect(() => {
    void init();
  }, [init]);

  // 黄金时刻倒计时每 30s 刷新一次（与原型一致）
  useEffect(() => {
    const t = setInterval(() => renderSun(), 30000);
    return () => clearInterval(t);
  }, [renderSun]);

  // 取景页时给 body 挂一个标记：toast 要抬高到底栏之上（快门是主角，不能被反馈气泡压住）
  useEffect(() => {
    document.body.classList.toggle('view-cam', view === 'cam');
    return () => document.body.classList.remove('view-cam');
  }, [view]);

  return (
    <>
      <AppHeader />
      <div className={`ctx-banner${insecure ? ' show' : ''}`} id="ctxBanner">
        ⚠️ 当前不是 HTTPS 环境，浏览器不允许打开相机。本地调试或出游使用请先按交付说明部署（本地 https 或静态托管），刷新后此提示消失。
      </div>
      <main>
        {/* 七个视图都保持挂载（CSS 控制显隐）：相机流与已解码的网格都不该被切页销毁 */}
        <section className={`view${view === 'cam' ? ' on' : ''}`} id="view-cam">
          <CameraView />
        </section>
        <section className={`view${view === 'theme' ? ' on' : ''}`} id="view-theme">
          <ThemeView />
        </section>
        <section className={`view${view === 'film' ? ' on' : ''}`} id="view-film">
          <FilmView />
        </section>
        <section className={`view${view === 'dark' ? ' on' : ''}`} id="view-dark">
          <DarkroomView />
        </section>
        <section className={`view${view === 'album' ? ' on' : ''}`} id="view-album">
          <AlbumView />
        </section>
        <section className={`view${view === 'pola' ? ' on' : ''}`} id="view-pola">
          <PolaroidView />
        </section>
        <section className={`view${view === 'edit' ? ' on' : ''}`} id="view-edit">
          <EditView />
        </section>
      </main>
      <SettingsDrawer />
      <QueuePanel />
      <ThemeCreateSheet />
      <ThemeDetailSheet />
      <Lightbox />
      <BottomNav />
      <Toast />
    </>
  );
}
