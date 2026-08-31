"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImageUp, RotateCcw } from "lucide-react";
import { decompressFrames, parseGIF } from "gifuct-js";
import MediaLensFrame, {
  type MediaLensKind,
  type MediaLensShape,
} from "@/components/media-lens-frame";

const DEFAULT_MEDIA = "/generated-bloom-loop-v11-optical.mp4";
const DEFAULT_MEDIA_NAME = "原创蓝色绽放 · 光流 60 FPS 循环";
const DEFAULT_MEDIA_INFO = "VIDEO · 960×960 · 6 秒 · 光流 60 FPS";

export default function MediaLensShowcase() {
  const [src, setSrc] = useState(DEFAULT_MEDIA);
  const [kind, setKind] = useState<MediaLensKind>("video");
  const [fileName, setFileName] = useState(DEFAULT_MEDIA_NAME);
  const [fileInfo, setFileInfo] = useState(DEFAULT_MEDIA_INFO);
  const [shape, setShape] = useState<MediaLensShape>("circle");
  const [borderWidth, setBorderWidth] = useState(24);
  const [cornerRadius, setCornerRadius] = useState(76);
  const [refraction, setRefraction] = useState(1.18);
  const [mediaScale, setMediaScale] = useState(1);
  const [mediaOffsetX, setMediaOffsetX] = useState(0);
  const [mediaOffsetY, setMediaOffsetY] = useState(0);
  const [mediaRotation, setMediaRotation] = useState(0);
  const [lensAngle, setLensAngle] = useState(45);
  const inspectionId = useRef(0);

  useEffect(() => {
    return () => {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
  }, [src]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isGif = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    const nextKind: MediaLensKind = isGif
      ? "gif"
      : file.type.startsWith("video/")
        ? "video"
        : "image";
    const nextInspectionId = inspectionId.current + 1;
    inspectionId.current = nextInspectionId;
    const nextSrc = URL.createObjectURL(file);
    setSrc((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return nextSrc;
    });
    setKind(nextKind);
    setFileName(file.name);
    setFileInfo(isGif ? "GIF · 正在读取帧" : nextKind.toUpperCase());

    if (isGif) {
      void file.arrayBuffer()
        .then((buffer) => decompressFrames(parseGIF(buffer), false).length)
        .then((frameCount) => {
          if (inspectionId.current !== nextInspectionId) return;
          setFileInfo(
            frameCount > 1 ? `GIF · ${frameCount} 帧` : "GIF · 仅 1 帧",
          );
        })
        .catch(() => {
          if (inspectionId.current === nextInspectionId) {
            setFileInfo("GIF · 无法解析");
          }
        });
    }
  };

  const reset = () => {
    setSrc((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return DEFAULT_MEDIA;
    });
    setKind("video");
    setFileName(DEFAULT_MEDIA_NAME);
    setFileInfo(DEFAULT_MEDIA_INFO);
    inspectionId.current += 1;
    setMediaScale(1);
    setMediaOffsetX(0);
    setMediaOffsetY(0);
    setMediaRotation(0);
    setLensAngle(45);
  };

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#eef2f7] px-5 pb-28 pt-24 text-[#10141e] sm:px-8 sm:pt-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_42%,rgba(76,116,255,.14),transparent_31%),radial-gradient(circle_at_22%_80%,rgba(84,214,255,.12),transparent_28%)]" />

      <header className="relative mx-auto mb-8 max-w-6xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/42">
          Universal media lens
        </p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.04em] sm:text-3xl">
          把任何媒体装进一圈真实折射里
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/48">
          支持静态图、GIF 和视频。媒体先卷成类似 360° 相机的小行星投影，再叠加外圈引力透镜与玻璃色散；点击画面可激发水波。
        </p>
      </header>

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-[28px] border border-black/8 bg-white/72 p-5 shadow-[0_18px_60px_rgba(32,49,90,.1)] backdrop-blur-xl">
          <label className="relative flex min-h-16 cursor-pointer touch-manipulation items-center justify-between gap-4 overflow-hidden rounded-2xl border border-dashed border-black/16 bg-white/65 px-4 py-3 transition active:scale-[0.99] active:border-black/28 active:bg-white hover:border-black/28 hover:bg-white">
            <span className="pointer-events-none min-w-0">
              <span className="block text-sm font-medium">上传图片、GIF 或视频</span>
              <span className="mt-1 block truncate font-mono text-[9px] uppercase tracking-[0.12em] text-black/38">
                {fileName} · {fileInfo}
              </span>
            </span>
            <ImageUp className="pointer-events-none size-4 shrink-0" />
            <input
              type="file"
              accept="image/*,video/*"
              onChange={handleFile}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              aria-label="Upload image, GIF, or video"
            />
          </label>

          <div className="mt-6">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">Shape</p>
            <div className="mt-2 grid grid-cols-2 rounded-full border border-black/10 bg-black/[.035] p-1">
              {(["circle", "rounded"] as MediaLensShape[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={shape === item}
                  onClick={() => setShape(item)}
                  className={`touch-manipulation rounded-full px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] transition ${
                    shape === item
                      ? "bg-black text-white shadow-sm"
                      : "text-black/42 hover:text-black/70"
                  }`}
                >
                  {item === "circle" ? "圆形" : "圆角方形"}
                </button>
              ))}
            </div>
          </div>

          <Control
            label="透镜范围"
            value={borderWidth}
            min={10}
            max={44}
            step={1}
            unit="px"
            onChange={setBorderWidth}
          />
          <Control
            label="圆角"
            value={cornerRadius}
            min={24}
            max={160}
            step={2}
            unit="px"
            disabled={shape === "circle"}
            onChange={setCornerRadius}
          />
          <Control
            label="投影 / 折射强度"
            value={refraction}
            min={0.2}
            max={1.6}
            step={0.05}
            onChange={setRefraction}
          />
          <Control
            label="内容大小"
            value={mediaScale}
            min={0.6}
            max={2.2}
            step={0.05}
            onChange={setMediaScale}
          />
          <Control
            label="水平位置"
            value={mediaOffsetX}
            min={-50}
            max={50}
            step={1}
            unit="%"
            onChange={setMediaOffsetX}
          />
          <Control
            label="垂直位置"
            value={mediaOffsetY}
            min={-50}
            max={50}
            step={1}
            unit="%"
            onChange={setMediaOffsetY}
          />
          <Control
            label="内容旋转"
            value={mediaRotation}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onChange={setMediaRotation}
          />
          <Control
            label="边缘扭曲点"
            value={lensAngle}
            min={0}
            max={360}
            step={1}
            unit="°"
            onChange={setLensAngle}
          />

          <button
            type="button"
            onClick={reset}
            className="mt-6 flex w-full touch-manipulation items-center justify-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-black/52 transition hover:bg-white hover:text-black"
          >
            <RotateCcw className="size-3.5" />
            恢复示例媒体
          </button>
        </aside>

        <section className="grid min-h-[560px] place-items-center rounded-[36px] border border-white/80 bg-white/48 p-5 shadow-[0_26px_100px_rgba(42,59,105,.12)] backdrop-blur-sm sm:p-10">
          <MediaLensFrame
            src={src}
            kind={kind}
            shape={shape}
            borderWidth={borderWidth}
            cornerRadius={cornerRadius}
            refraction={refraction}
            mediaScale={mediaScale}
            mediaOffsetX={mediaOffsetX}
            mediaOffsetY={mediaOffsetY}
            mediaRotation={mediaRotation}
            lensAngle={lensAngle}
            className="aspect-square w-[min(70vw,560px)]"
          />
        </section>
      </div>
    </main>
  );
}

function Control({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`mt-5 block ${disabled ? "opacity-30" : ""}`}>
      <span className="flex items-center justify-between gap-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-black/38">{label}</span>
        <span className="font-mono text-[9px] tabular-nums text-black/52">
          {Number.isInteger(value) ? value : value.toFixed(2)}{unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-black"
      />
    </label>
  );
}
