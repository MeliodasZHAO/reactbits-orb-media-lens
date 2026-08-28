"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import AIBlob from "@/components/react-bits/ai-blob";
import BlackHole from "@/components/react-bits/black-hole";
import { cn } from "@/lib/utils";

export default function AiGravityBlob({
  className,
  paused = false,
}: {
  className?: string;
  paused?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const blobLayer = useRef<HTMLDivElement>(null);
  const fieldLayer = useRef<HTMLDivElement>(null);
  const [blobSize, setBlobSize] = useState(360);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    const resize = () => {
      const bounds = node.getBoundingClientRect();
      setBlobSize(Math.round(Math.min(bounds.width, bounds.height) * 0.92));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();
    return () => observer.disconnect();
  }, []);

  const moveLayers = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paused) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    if (blobLayer.current) {
      blobLayer.current.style.transform = `translate3d(${x * 8}px, ${y * 7}px, 0) scale(${1 + Math.hypot(x, y) * 0.012})`;
    }
    if (fieldLayer.current) {
      fieldLayer.current.style.transform = `translate3d(${-x * 5}px, ${-y * 4}px, 0) scale(1.025)`;
    }
  };

  const resetLayers = () => {
    if (blobLayer.current) blobLayer.current.style.transform = "translate3d(0, 0, 0) scale(1)";
    if (fieldLayer.current) fieldLayer.current.style.transform = "translate3d(0, 0, 0) scale(1.025)";
  };

  return (
    <div
      ref={root}
      className={cn("relative h-full w-full overflow-hidden bg-[#02040b]", className)}
      onPointerMove={moveLayers}
      onPointerLeave={resetLayers}
      role="img"
      aria-label="ReactBits AI Blob fused with a restrained interactive Black Hole field"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(34,69,129,.18),transparent_48%)]" />

      <div
        ref={fieldLayer}
        className="absolute -inset-[4%] transition-transform duration-500 ease-out"
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at 50% 50%, transparent 0%, transparent 27%, rgba(0,0,0,.18) 35%, #000 49%, #000 78%, transparent 100%)",
          maskImage:
            "radial-gradient(circle at 50% 50%, transparent 0%, transparent 27%, rgba(0,0,0,.18) 35%, #000 49%, #000 78%, transparent 100%)",
        }}
      >
        <BlackHole
          width="100%"
          height="100%"
          speed={paused ? 0 : 0.58}
          zoom={1.65}
          particleCount={17}
          orbSize={0.4}
          glow={0.035}
          contrast={3.4}
          mirrorSplits={3}
          warpEnabled
          distanceFade={0.11}
          colorShiftR={-4.2}
          colorShiftG={0.75}
          colorShiftB={2.8}
          colorSpeed={0.13}
          backgroundColor="#02040b"
          opacity={0.62}
          cursorInteraction={!paused}
          cursorIntensity={1.08}
          className="h-full w-full"
        />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[64%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(111,229,255,.13),rgba(94,76,255,.055)_52%,transparent_73%)] blur-2xl" />

      <div
        ref={blobLayer}
        className="pointer-events-none absolute inset-0 grid place-items-center transition-transform duration-300 ease-out will-change-transform"
      >
        <div className="relative grid place-items-center">
          <div className="absolute h-[86%] w-[86%] rounded-full bg-cyan-300/10 blur-3xl" />
          <AIBlob
            size={blobSize}
            animationSpeed={paused ? 0 : 0.72}
            glowIntensity={1.0}
            noiseScale={3.15}
            innerScale={1.08}
            resolution={0.9}
            colors={["#ff788f", "#8e62ff", "#39cfff", "#82ffc0"]}
            className="relative drop-shadow-[0_0_32px_rgba(103,232,249,.28)] saturate-[1.12] contrast-[1.06]"
          />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_30%,rgba(2,4,11,.05)_53%,rgba(2,4,11,.5)_100%)]" />
    </div>
  );
}
