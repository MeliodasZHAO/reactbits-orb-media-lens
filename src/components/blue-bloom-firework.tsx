"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface BlueBloomFireworkProps {
  color?: string;
  backgroundColor?: string;
  lightSurface?: boolean;
  particleCount?: number;
  cycleDuration?: number;
  paused?: boolean;
  restartSignal?: number;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  className?: string;
}

const SPRITE_COLUMNS = 12;
const SPRITE_ROWS = 8;
const FRAME_COUNT = SPRITE_COLUMNS * SPRITE_ROWS;
const INTERPOLATED_STEPS = 6;
const SPRITE_SOURCE = "/organic-bloom-sprite-v2-96f.png";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoother = (value: number) => {
  const progress = clamp01(value);
  return progress * progress * progress
    * (progress * (progress * 6 - 15) + 10);
};

const getFramePosition = (phase: number) => {
  // One continuous acceleration curve replaces the former bud/open segments,
  // whose velocity changed abruptly at their boundary. The flower reaches its
  // clearest generated pose, breathes through a very small continuation, then
  // follows the authored curl-back poses into the loop.
  if (phase < 0.62) return smoother(phase / 0.62) * 10;
  if (phase < 0.68) {
    return 10 + smoother((phase - 0.62) / 0.06) * 0.2;
  }
  return 10.2 + smoother((phase - 0.68) / 0.32) * 5.8;
};

interface FrameDrawOptions {
  alpha: number;
  canvasHeight: number;
  canvasWidth: number;
  context: CanvasRenderingContext2D;
  frame: number;
  image: HTMLImageElement;
  phase: number;
  scale: number;
}

function drawFrame({
  alpha,
  canvasHeight,
  canvasWidth,
  context,
  frame,
  image,
  phase,
  scale,
}: FrameDrawOptions) {
  const frameWidth = image.naturalWidth / SPRITE_COLUMNS;
  const frameHeight = image.naturalHeight / SPRITE_ROWS;
  const normalizedFrame = ((frame % FRAME_COUNT) + FRAME_COUNT) % FRAME_COUNT;
  const sourceX = (normalizedFrame % SPRITE_COLUMNS) * frameWidth;
  const sourceY = Math.floor(normalizedFrame / SPRITE_COLUMNS) * frameHeight;
  const coverScale = Math.min(
    canvasWidth / frameWidth,
    canvasHeight / frameHeight,
  ) * 0.84;
  const breathing = 1 + Math.sin(phase * Math.PI * 2) * 0.006;
  const drawWidth = frameWidth * coverScale * scale * breathing;
  const drawHeight = frameHeight * coverScale * scale * breathing;
  const drawX = (canvasWidth - drawWidth) * 0.5;
  const drawY = (canvasHeight - drawHeight) * 0.5;

  context.save();
  context.globalAlpha = alpha;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    frameWidth,
    frameHeight,
    drawX,
    drawY,
    drawWidth,
    drawHeight,
  );
  context.restore();
}

export default function BlueBloomFirework({
  color = "#9edcf3",
  backgroundColor = "#f8fbfd",
  cycleDuration = 6.5,
  paused = false,
  restartSignal = 0,
  onCanvasReady,
  className,
}: BlueBloomFireworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const elapsedRef = useRef(0);
  const lastTimestampRef = useRef<number | null>(null);
  const onCanvasReadyRef = useRef(onCanvasReady);

  useEffect(() => {
    onCanvasReadyRef.current = onCanvasReady;
  }, [onCanvasReady]);

  useEffect(() => {
    elapsedRef.current = 0;
    lastTimestampRef.current = null;
  }, [restartSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const image = new Image();
    image.decoding = "async";
    let animationFrame = 0;
    let mounted = true;

    const render = (timestamp: number) => {
      if (!mounted) return;
      const bounds = canvas.getBoundingClientRect();
      // The source cells are 320px, so a huge Retina backing store adds much
      // more compositing work than visible detail. Keep smaller instances crisp
      // while capping large canvases to a stable per-frame pixel budget.
      const pixelBudgetScale = Math.sqrt(
        1_650_000 / Math.max(1, bounds.width * bounds.height),
      );
      const deviceScale = Math.max(1, Math.min(
        window.devicePixelRatio || 1,
        1.6,
        pixelBudgetScale,
      ));
      const targetWidth = Math.max(1, Math.round(bounds.width * deviceScale));
      const targetHeight = Math.max(1, Math.round(bounds.height * deviceScale));
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      if (!paused && lastTimestampRef.current !== null) {
        elapsedRef.current += Math.min(
          (timestamp - lastTimestampRef.current) / 1_000,
          0.05,
        );
      }
      lastTimestampRef.current = timestamp;

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      if (image.complete && image.naturalWidth > 0) {
        const phase = paused
          ? 0.56
          : (elapsedRef.current % cycleDuration) / cycleDuration;
        const framePosition = getFramePosition(phase) * INTERPOLATED_STEPS;
        // Display exactly one complete motion-interpolated pose. Layering the
        // next transparent frame on top increased brightness throughout every
        // interval and reset it at the boundary, creating a high-frequency
        // pulse. The 96-pose atlas is dense enough to switch directly.
        const currentFrame = Math.round(framePosition) % FRAME_COUNT;
        const releaseScale = 1;

        drawFrame({
          alpha: 1,
          canvasHeight: canvas.height,
          canvasWidth: canvas.width,
          context,
          frame: currentFrame,
          image,
          phase,
          scale: releaseScale,
        });
        context.save();
        context.globalCompositeOperation = "source-atop";
        context.globalAlpha = 0.11;
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();
      }

      context.save();
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();

      animationFrame = window.requestAnimationFrame(render);
    };

    image.addEventListener("load", () => {
      onCanvasReadyRef.current?.(canvas);
      animationFrame = window.requestAnimationFrame(render);
    }, { once: true });
    image.src = SPRITE_SOURCE;

    return () => {
      mounted = false;
      window.cancelAnimationFrame(animationFrame);
    };
  }, [backgroundColor, color, cycleDuration, paused]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        aria-label="Original pale-blue organic bloom animation"
      />
    </div>
  );
}
