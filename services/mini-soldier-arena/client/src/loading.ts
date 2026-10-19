// Loads the game files while the title picture is on screen and reports progress (0..1).
export function runLoading(urls: string[], onProgress: (p: number) => void, minMs = 1700): Promise<void> {
  const start = performance.now();
  let done = 0;
  urls.forEach((u) => { fetch(u).then((r) => r.blob()).catch(() => null).then(() => { done++; }); });
  return new Promise((resolve) => {
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / minMs);
      const p = Math.min(done / urls.length, t);
      onProgress(p);
      if (p >= 1) resolve(); else requestAnimationFrame(tick);
    };
    tick();
  });
}
