// Phone helpers: full screen + landscape while playing.
export const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const isFullscreen = () => !!(document.fullscreenElement || (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement);
export const isLandscape = () => screen.orientation?.type.startsWith('landscape') ?? window.matchMedia('(orientation: landscape)').matches;

// Must be called from a tap or click (browsers refuse full screen otherwise).
export async function goFullscreenLandscape(): Promise<void> {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (!isFullscreen()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }
  } catch { /* some browsers say no; the rotate hint still works */ }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (o?.lock) await o.lock('landscape');
  } catch { /* orientation lock only works in full screen on Android Chrome */ }
}
