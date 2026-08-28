"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";

const AIBlackHoleZero = dynamic(
  () => import("@/components/ai-black-hole-zero"),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full w-full place-items-center font-mono text-[10px] uppercase tracking-[0.24em] opacity-35">
        Initialising WebGL
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

type Theme = "dark" | "light" | "graphite" | "chromatic";
type Surface = "viewport" | "orb";
type ChromaticMode = "mono" | "spectrum";

const themes: Theme[] = ["dark", "light", "graphite", "chromatic"];
const surfaces: Surface[] = ["viewport", "orb"];

export default function SphereShowcase() {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    readReducedMotion,
    () => false,
  );
  const [theme, setTheme] = useState<Theme>("chromatic");
  const [surface, setSurface] = useState<Surface>("orb");
  const [chromaticColor, setChromaticColor] = useState("#6978ff");
  const [chromaticMode, setChromaticMode] = useState<ChromaticMode>("mono");
  const light = theme !== "dark";

  const frameClass = surface === "viewport"
    ? "absolute inset-0"
    : "relative aspect-square w-[min(76vw,680px)] overflow-hidden rounded-full";
  const frameSurface = surface === "orb"
    ? "bg-transparent"
    : light
      ? "bg-white"
      : "bg-[#020208]";

  return (
    <main
      className={`relative min-h-svh overflow-hidden transition-colors duration-300 ${
        light ? "bg-[#f1f3f7] text-[#10131c]" : "bg-[#020208] text-white"
      }`}
    >
      <section className="relative grid min-h-svh place-items-center px-4 py-28 sm:px-8">
        <div className={`${frameClass} ${frameSurface}`}>
          <AIBlackHoleZero
            paused={reducedMotion}
            lensEnabled={surface === "orb"}
            theme={theme}
            chromaticMode={chromaticMode}
            color={chromaticColor}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      </section>

      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-5 sm:p-8">
        <div className="shrink-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] opacity-42 sm:text-[10px]">
            AI Blob × Black Hole
          </p>
          <h1 className="mt-2 text-lg font-medium tracking-[-0.035em] sm:text-xl">
            Adaptive surface study
          </h1>
        </div>

        <div className="flex max-w-[34rem] flex-wrap justify-end gap-2">
          {theme === "chromatic" && (
            <div className="flex items-center gap-2">
              <div
                className={`flex rounded-full border p-1 ${
                  light
                    ? "border-black/10 bg-white/80"
                    : "border-white/10 bg-black/40"
                }`}
              >
                {(["mono", "spectrum"] as ChromaticMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={chromaticMode === item}
                    onClick={() => setChromaticMode(item)}
                    className={`rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                      chromaticMode === item
                        ? "bg-black text-white"
                        : "opacity-45 hover:opacity-75"
                    }`}
                  >
                    {item === "mono" ? "单色" : "彩色"}
                  </button>
                ))}
              </div>

              {chromaticMode === "mono" && (
                <label className="flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em]">
                  Color
                  <span
                    className="relative size-5 overflow-hidden rounded-full border border-black/10 shadow-sm"
                    style={{ backgroundColor: chromaticColor }}
                  >
                    <input
                      type="color"
                      aria-label="Choose orb color"
                      value={chromaticColor}
                      onChange={(event) => setChromaticColor(event.target.value)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                  </span>
                </label>
              )}
            </div>
          )}
          <div
            className={`flex rounded-full border p-1 ${
              light ? "border-black/10 bg-white/80" : "border-white/10 bg-black/40"
            }`}
          >
            {themes.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={theme === item}
                onClick={() => setTheme(item)}
                className={`rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                  theme === item
                    ? light ? "bg-black text-white" : "bg-white text-black"
                    : "opacity-45 hover:opacity-75"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <div
            className={`flex rounded-full border p-1 ${
              light ? "border-black/10 bg-white/80" : "border-white/10 bg-black/40"
            }`}
          >
            {surfaces.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={surface === item}
                onClick={() => setSurface(item)}
                className={`rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                  surface === item
                    ? light ? "bg-black text-white" : "bg-white text-black"
                    : "opacity-45 hover:opacity-75"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-6 p-5 font-mono text-[9px] uppercase leading-5 tracking-[0.15em] opacity-35 sm:p-8 sm:text-[10px]">
        <p>Transparent canvas · responsive renderer</p>
        <p className="text-right">Move pointer to bend gravity</p>
      </footer>
    </main>
  );
}
