"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";

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

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#020713] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(28,91,198,.24), transparent 34%), radial-gradient(circle at 50% 105%, rgba(74,174,255,.12), transparent 36%), linear-gradient(180deg, #020713 0%, #030a1c 58%, #01040c 100%)",
        }}
      />
      <div className="page-grid pointer-events-none absolute inset-0 opacity-35" />

      <section
        className="relative h-svh min-h-[620px] w-full cursor-crosshair"
        onPointerDown={() => setRestartSignal((value) => value + 1)}
      >
        <BlueBloomFirework
          color={color}
          particleCount={26000}
          cycleDuration={6}
          paused={reducedMotion}
          restartSignal={restartSignal}
          className="absolute inset-0"
        />
      </section>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-5 p-5 sm:p-8">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-sky-100/42 sm:text-[10px]">
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
        </div>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex items-end justify-between gap-6 p-5 font-mono text-[9px] uppercase leading-5 tracking-[0.15em] text-sky-100/32 sm:bottom-12 sm:p-8 sm:text-[10px]">
        <p>26,000 deterministic sparks · DPR 2</p>
        <p className="text-right">Click anywhere to relaunch</p>
      </footer>
    </main>
  );
}
