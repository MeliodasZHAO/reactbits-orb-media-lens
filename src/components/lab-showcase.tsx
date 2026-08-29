"use client";

import { useState } from "react";
import MediaLensShowcase from "@/components/media-lens-showcase";
import ParticleBloomShowcase from "@/components/particle-bloom-showcase";
import SphereShowcase from "@/components/sphere-showcase";

type Study = "saved-orb" | "media-lens" | "particle-bloom";

export default function LabShowcase() {
  const [study, setStudy] = useState<Study>("particle-bloom");

  const content = study === "saved-orb"
    ? <SphereShowcase />
    : study === "media-lens"
      ? <MediaLensShowcase />
      : <ParticleBloomShowcase />;

  return (
    <div className="relative">
      {content}

      <nav
        aria-label="Study selector"
        className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 rounded-full border border-black/10 bg-white/80 p-1 shadow-[0_12px_40px_rgba(14,22,48,.16)] backdrop-blur-xl"
      >
        {([
          ["saved-orb", "已存球体"],
          ["media-lens", "媒体透镜"],
          ["particle-bloom", "蓝色花火"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={study === value}
            onClick={() => setStudy(value)}
            className={`touch-manipulation rounded-full px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
              study === value
                ? "bg-black text-white"
                : "text-black/42 hover:text-black/70"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
