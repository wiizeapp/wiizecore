import { useEffect, useRef } from "react";
import type { Globe } from "cobe";

// Adapted from the user's GlobePulse reference. Illustration only, no live data.
export function GlobePulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);
  const rotation = useRef(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stopped = false;
    let globe: Globe | undefined;
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const readColor = (name: string): [number, number, number] => {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      const ctx = probe.getContext("2d");
      if (!ctx) return [0, 0, 0];
      ctx.fillStyle = getComputedStyle(canvas).getPropertyValue(name).trim();
      ctx.fillRect(0, 0, 1, 1);
      const p = ctx.getImageData(0, 0, 1, 1).data;
      return [(p[0] ?? 0) / 255, (p[1] ?? 0) / 255, (p[2] ?? 0) / 255];
    };
    const resize = new ResizeObserver(() => {
      const width = canvas.getBoundingClientRect().width;
      const dpr = Math.min(window.devicePixelRatio, 2);
      globe?.update({ width: width * dpr, height: width * dpr });
    });
    const start = async () => {
      const { default: createGlobe } = await import("cobe");
      if (stopped) return;
      const width = canvas.getBoundingClientRect().width;
      const dpr = Math.min(window.devicePixelRatio, 2);
      globe = createGlobe(canvas, {
        width: width * dpr, height: width * dpr, devicePixelRatio: dpr,
        phi: 4.7, theta: -0.2, dark: 1, diffuse: 1.6,
        mapSamples: 16000, mapBrightness: 5,
        baseColor: readColor("--secure-globe-land"),
        markerColor: readColor("--secure-globe-marker"),
        glowColor: readColor("--secure-globe-glow"),
        markerElevation: 0.02,
        markers: [{ id: "brazil", location: [-23.55, -46.63], size: 0.045 }],
        opacity: 1,
      });
      canvas.dataset.ready = "true";
      resize.observe(canvas);
      let phi = 4.7;
      const animate = () => {
        if (stopped) return;
        if (!reduced.matches && dragging.current === null) phi += 0.0014;
        globe?.update({ phi: phi + rotation.current });
        frame = requestAnimationFrame(animate);
      };
      animate();
    };
    void start().catch(() => { canvas.dataset.ready = "unavailable"; });
    return () => { stopped = true; cancelAnimationFrame(frame); resize.disconnect(); globe?.destroy(); };
  }, []);
  return <div className="secure-globe relative mx-auto aspect-square w-full max-w-[460px] select-none" aria-hidden="true">
    <canvas ref={canvasRef} className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing" onPointerDown={e => { dragging.current = e.clientX; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (dragging.current === null) return; rotation.current += (e.clientX - dragging.current) / 250; dragging.current = e.clientX; }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} />
    <span className="secure-globe-pulse"><span /><span /></span>
  </div>;
}