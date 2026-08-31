"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useSyncExternalStore } from "react";

const BlueBloomFirework = dynamic(
  () => import("@/components/blue-bloom-firework"),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.24em] text-sky-100/35">
        Seeding particle field
      </div>
    ),
  },
);

const MediaLensFrame = dynamic(
  () => import("@/components/media-lens-frame"),
  { ssr: false },
);

const subscribeReducedMotion = (callback: () => void) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

const readReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function ParticleBloomShowcase() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );
  const [color, setColor] = useState("#58b7ff");
  const [restartSignal, setRestartSignal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [lensPreview, setLensPreview] = useState(false);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const exportWebM = () => {
    const canvas = canvasRef.current;
    if (!canvas || exporting || typeof MediaRecorder === "undefined") return;

    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const stream = canvas.captureStream(60);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 14_000_000,
    });

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mimeType ?? "video/webm" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "blue-lens-bloom-loop.webm";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      stream.getTracks().forEach((track) => track.stop());
      setExporting(false);
    });

    setExporting(true);
    setRestartSignal((value) => value + 1);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        recorder.start(250);
        window.setTimeout(() => recorder.stop(), 6_030);
      });
    });
  };

  return (
    <main
      className={`relative min-h-svh overflow-hidden transition-colors duration-500 ${
        lensPreview ? "bg-[#f8fbfd] text-[#0b4167]" : "bg-[#020713] text-white"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: lensPreview
            ? "#f8fbfd"
            : "radial-gradient(circle at 50% 45%, rgba(28,91,198,.24), transparent 34%), radial-gradient(circle at 50% 105%, rgba(74,174,255,.12), transparent 36%), linear-gradient(180deg, #020713 0%, #030a1c 58%, #01040c 100%)",
        }}
      />
      <div
        className={`page-grid pointer-events-none absolute inset-0 ${
          lensPreview ? "opacity-10" : "opacity-35"
        }`}
      />

      <section
        className="relative h-svh min-h-[620px] w-full cursor-crosshair"
        onPointerDown={() => setRestartSignal((value) => value + 1)}
      >
        <BlueBloomFirework
          color={color}
          backgroundColor={lensPreview ? "#f8fbfd" : undefined}
          lightSurface={lensPreview}
          particleCount={32000}
          cycleDuration={6}
          paused={reducedMotion}
          restartSignal={restartSignal}
          onCanvasReady={(canvas) => {
            canvasRef.current = canvas;
            setSourceCanvas((current) => current ?? canvas);
          }}
          className={`absolute inset-0 transition-opacity duration-500 ${
            lensPreview ? "opacity-0" : "opacity-100"
          }`}
        />

        {lensPreview && sourceCanvas ? (
          <div
            className="absolute inset-0 z-10 grid place-items-center px-5 pt-16 pb-20 sm:px-10"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div
              className="relative shrink-0"
              style={{
                width: "min(74vw, 72vh, 640px)",
                height: "min(74vw, 72vh, 640px)",
                aspectRatio: "1 / 1",
              }}
            >
              <MediaLensFrame
                src=""
                sourceCanvas={sourceCanvas}
                kind="image"
                shape="circle"
                borderWidth={30}
                refraction={1.18}
                mediaScale={0.9}
                alt="Live particle bloom inside the refractive media lens"
                className="h-full w-full !bg-white/8 !shadow-[20px_28px_74px_rgba(30,109,156,.2),-18px_-20px_52px_rgba(255,255,255,.74)]"
              />
            </div>
          </div>
        ) : null}
      </section>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-5 p-5 sm:p-8">
        <div>
          <p className={`font-mono text-[9px] uppercase tracking-[0.22em] sm:text-[10px] ${
            lensPreview ? "text-[#165c83]/55" : "text-sky-100/42"
          }`}>
            GPU particle study · 06 seconds
          </p>
          <h1 className="mt-2 text-lg font-medium tracking-[-0.035em] sm:text-xl">
            Blue bloom firework
          </h1>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65 backdrop-blur-xl">
            Blue
            <span
              className="relative size-5 overflow-hidden rounded-full border border-white/20 shadow-[0_0_18px_rgba(88,183,255,.5)]"
              style={{ backgroundColor: color }}
            >
              <input
                type="color"
                aria-label="Choose firework color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => setRestartSignal((value) => value + 1)}
            className="touch-manipulation rounded-full border border-white/10 bg-black/30 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-white/65 backdrop-blur-xl transition hover:border-sky-300/35 hover:text-white"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => setLensPreview((value) => !value)}
            className={`touch-manipulation rounded-full border px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] backdrop-blur-xl transition ${
              lensPreview
                ? "border-cyan-200/45 bg-cyan-300/15 text-white"
                : "border-white/10 bg-black/30 text-white/65 hover:border-sky-300/35 hover:text-white"
            }`}
          >
            {lensPreview ? "Viewport" : "Lens preview"}
          </button>
          <button
            type="button"
            onClick={exportWebM}
            disabled={exporting}
            className="touch-manipulation rounded-full border border-sky-200/20 bg-sky-300/10 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-sky-50/80 backdrop-blur-xl transition hover:border-sky-200/40 hover:bg-sky-300/15 disabled:cursor-wait disabled:opacity-55"
          >
            {exporting ? "Exporting 6s" : "Export WebM"}
          </button>
        </div>
      </header>

      <footer className={`pointer-events-none absolute inset-x-0 bottom-16 z-20 flex items-end justify-between gap-6 p-5 font-mono text-[9px] uppercase leading-5 tracking-[0.15em] sm:bottom-12 sm:p-8 sm:text-[10px] ${
        lensPreview ? "text-[#165c83]/46" : "text-sky-100/32"
      }`}>
        <p>32,000 layered sparks · counterflow corona + mist</p>
        <p className="text-right">
          {lensPreview ? "Live canvas texture · click lens for ripple" : "Click anywhere to relaunch"}
        </p>
      </footer>
    </main>
  );
}
