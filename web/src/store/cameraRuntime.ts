/** 相机运行时：stream / 能力调优 / 快门取图（模块级单例，不进 React state，避免流被反复重建） */
import {
  camTune,
  createCamState,
  ensurePersist,
  grabStill,
  grabFrameFromVideo,
  type CamState,
  type GrabEnv,
  type StillShot,
} from '../domain/capture';

export const cam: CamState = createCamState();

let stream: MediaStream | null = null;
let persistAsked = false;

export function currentStream(): MediaStream | null {
  return stream;
}

export function stopStream(): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

export function videoTrack(): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

export async function openStream(facing: CamState['facing']): Promise<MediaStream> {
  stopStream();
  const s = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1440 } },
    audio: false,
  });
  stream = s;
  return s;
}

/** 打开相机后按能力下约束；返回实际分辨率等（信息条用） */
export async function tuneCamera(): Promise<void> {
  cam.res = '';
  await camTune(videoTrack(), cam);
}

export function browserGrabEnvFor(video: HTMLVideoElement): GrabEnv {
  return {
    ImageCaptureCtor: (window as unknown as { ImageCapture?: GrabEnv['ImageCaptureCtor'] }).ImageCapture,
    grabFrame: () => grabFrameFromVideo(video),
  };
}

/** 快门取图：只产出 Blob，不碰 AI / 队列 / 网络 */
export function shutterShot(video: HTMLVideoElement): Promise<StillShot> {
  return grabStill(browserGrabEnvFor(video), videoTrack(), cam);
}

export function ensurePersistOnce(): void {
  if (persistAsked) return;
  persistAsked = true;
  void ensurePersist();
}
