import { useEffect, useRef } from "react";

export default function CanvasApp() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;

      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);

      // Draw in CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // clear to black
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);

      // tiny sanity marker
      ctx.fillStyle = "white";
      ctx.font = "12px sans-serif";
      ctx.fillText("blankpad ready", 12, 20);
      ctx.fillText("File → Settings…", 12, 38);
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
        background: "black",
      }}
    />
  );
}
