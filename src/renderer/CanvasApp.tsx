import { useEffect, useRef, useState } from "react";

type StatusLine = {
  text: string;
  tone?: "normal" | "success" | "error";
};

export default function CanvasApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const statusRef = useRef<StatusLine[]>([]);
  const [status, setStatus] = useState<StatusLine[]>([]);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);

    const lines = statusRef.current;

    ctx.font = "13px sans-serif";

    let y = 28;
    for (const line of lines) {
      if (line.tone === "success") ctx.fillStyle = "#b9ffb9";
      else if (line.tone === "error") ctx.fillStyle = "#ffb9b9";
      else ctx.fillStyle = "white";

      ctx.fillText(line.text, 14, y);
      y += 22;
    }
  };

  // Setup canvas context and resize handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctxRef.current = ctx;

    const onResize = () => draw();
    window.addEventListener("resize", onResize);

    draw();

    return () => {
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep statusRef in sync + redraw
  useEffect(() => {
    statusRef.current = status;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const runConnectionStatusFlow = async () => {
    const initialized = await window.bootshot.settings.isDbInitialized();

    if (!initialized) {
      setStatus([
        { text: "No database connection is configured yet." },
        { text: "Please set one up via File → Database Settings." },
      ]);
      return;
    }

    setStatus([{ text: "Attempting to establish database connection..." }]);

    const res = await window.bootshot.db.attemptInitialConnection();

    if (res.ok) {
      setStatus([{ text: "Database connection established.", tone: "success" }]);
    } else {
      const msg = res.message
        ? `Database connection failed: ${res.message}`
        : "Database connection failed.";
      setStatus([{ text: msg, tone: "error" }]);
    }
  };

  // Startup DB messaging flow + refresh after save
  useEffect(() => {
    let cancelled = false;

    const safeRun = async () => {
      try {
        if (cancelled) return;
        await runConnectionStatusFlow();
      } catch {
        if (!cancelled) {
          setStatus([
            { text: "Database connection check failed unexpectedly.", tone: "error" },
          ]);
        }
      }
    };

    safeRun();

    const off =
      window.bootshot?.ui?.onDbSettingsSaved?.(() => {
        safeRun();
      }) ?? undefined;

    return () => {
      cancelled = true;
      if (off) off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        width: "100vw",
        height: "100vh",
        background: "black",
      }}
    />
  );
}
