import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const projectDirectory = resolve(import.meta.dirname, "..");
const atlasPath = resolve(
  projectDirectory,
  "public/organic-bloom-sprite-v2-96f.png",
);
const outputDirectory = resolve(
  process.argv[2] ?? resolve(projectDirectory, ".bloom-video-frames"),
);

const columns = 12;
const rows = 8;
const frameCount = columns * rows;
const cellSize = 320;
const outputSize = 960;
const baseSize = outputSize * 0.86;
const renderPadding = 128;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smoother = (value) => {
  const progress = clamp01(value);
  return progress ** 3 * (progress * (progress * 6 - 15) + 10);
};

await mkdir(outputDirectory, { recursive: true });

async function renderFrame(frame, outputIndex = frame) {
  const authoredProgress = frame / (frameCount - 1);
  const opening = smoother((authoredProgress - 0.12) / 0.34);
  const closing = 1 - smoother((authoredProgress - 0.7) / 0.26);
  const expansion = opening * closing;
  const releaseScale = 1 + expansion * 0.055;
  const baseWidth = baseSize * releaseScale;
  const baseHeight = baseSize * releaseScale;
  const stretchX = 1 + expansion * 0.12;
  const stretchY = 1 + expansion * 0.17;
  const drawWidth = Math.round(baseWidth * stretchX);
  const drawHeight = Math.round(baseHeight * stretchY);
  const baseX = (outputSize - baseWidth) * 0.5;
  const baseY = (outputSize - baseHeight) * 0.5;
  const pivotX = baseX + baseWidth * 0.72;
  const pivotY = baseY + baseHeight * 0.27;
  const drawX = Math.round(pivotX - drawWidth * 0.72);
  const drawY = Math.round(pivotY - drawHeight * 0.27);
  const cell = await sharp(atlasPath)
    .extract({
      left: (frame % columns) * cellSize,
      top: Math.floor(frame / columns) * cellSize,
      width: cellSize,
      height: cellSize,
    })
    .resize(drawWidth, drawHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const filename = `frame-${String(outputIndex).padStart(4, "0")}.png`;
  const paddedFrame = await sharp({
    create: {
      width: outputSize + renderPadding * 2,
      height: outputSize + renderPadding * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: cell,
      left: drawX + renderPadding,
      top: drawY + renderPadding,
    }])
    .png()
    .toBuffer();

  await sharp(paddedFrame)
    .extract({
      left: renderPadding,
      top: renderPadding,
      width: outputSize,
      height: outputSize,
    })
    .png({ compressionLevel: 5 })
    .toFile(resolve(outputDirectory, filename));
}

for (let frame = 0; frame < frameCount; frame += 1) {
  await renderFrame(frame);
  process.stdout.write(`Rendered ${frame + 1}/${frameCount} authored poses\r`);
}

// Repeat the first pose once so optical flow can synthesize the closing seam.
await renderFrame(0, frameCount);
process.stdout.write(`\nWrote ${frameCount + 1} source poses to ${outputDirectory}\n`);
