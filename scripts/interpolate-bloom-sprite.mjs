import sharp from "sharp";
import { fileURLToPath } from "node:url";

const INPUT = fileURLToPath(new URL(
  "../public/organic-bloom-sprite-v1.png",
  import.meta.url,
));
const OUTPUT = fileURLToPath(new URL(
  "../public/organic-bloom-sprite-v2-96f.png",
  import.meta.url,
));

const SOURCE_COLUMNS = 4;
const SOURCE_ROWS = 4;
const SOURCE_FRAME_COUNT = SOURCE_COLUMNS * SOURCE_ROWS;
const SUBDIVISIONS = 6;
const OUTPUT_COLUMNS = 12;
const OUTPUT_ROWS = 8;
const CELL_SIZE = 320;
const LOW_SIZE = 64;
const GRID_STEP = 4;
const PATCH_RADIUS = 2;
const SEARCH_RADIUS = 6;

const smoothstep = (minimum, maximum, value) => {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const removeIsolatedMatteNoise = (data) => {
  const pixelCount = CELL_SIZE * CELL_SIZE;
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || data[start * 4 + 3] < 14) continue;
    let read = 0;
    let write = 0;
    queue[write] = start;
    write += 1;
    visited[start] = 1;

    while (read < write) {
      const pixel = queue[read];
      read += 1;
      const x = pixel % CELL_SIZE;
      const y = Math.floor(pixel / CELL_SIZE);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const neighborY = y + offsetY;
        if (neighborY < 0 || neighborY >= CELL_SIZE) continue;
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const neighborX = x + offsetX;
          if (
            (offsetX === 0 && offsetY === 0)
            || neighborX < 0
            || neighborX >= CELL_SIZE
          ) continue;
          const neighbor = neighborY * CELL_SIZE + neighborX;
          if (visited[neighbor] || data[neighbor * 4 + 3] < 14) continue;
          visited[neighbor] = 1;
          queue[write] = neighbor;
          write += 1;
        }
      }
    }

    if (write < 28) {
      for (let index = 0; index < write; index += 1) {
        data[queue[index] * 4 + 3] = 0;
      }
    }
  }
};

const clamp = (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, value))
);

const sourceMetadata = await sharp(INPUT).metadata();
if (!sourceMetadata.width || !sourceMetadata.height) {
  throw new Error("Unable to read the source sprite dimensions.");
}

const rawFrames = [];

for (let frame = 0; frame < SOURCE_FRAME_COUNT; frame += 1) {
  const column = frame % SOURCE_COLUMNS;
  const row = Math.floor(frame / SOURCE_COLUMNS);
  const left = Math.round(column * sourceMetadata.width / SOURCE_COLUMNS);
  const right = Math.round((column + 1) * sourceMetadata.width / SOURCE_COLUMNS);
  const top = Math.round(row * sourceMetadata.height / SOURCE_ROWS);
  const bottom = Math.round((row + 1) * sourceMetadata.height / SOURCE_ROWS);
  const { data } = await sharp(INPUT)
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(CELL_SIZE, CELL_SIZE, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  rawFrames.push(data);
}

// The pale spotlight behind every generated pose is almost identical, but its
// luminance is not a single key color. Comparing each pose with the closed-bud
// reference removes that low-frequency vignette without deleting the flower's
// translucent white folds. Saturation and local darkness preserve the stable
// bud/sepals that are shared with the reference itself.
const referenceFrame = rawFrames[0];
const sourceFrames = rawFrames.map((rawFrame, frameIndex) => {
  const data = Buffer.from(rawFrame);
  const backgroundDeltas = [];

  if (frameIndex > 0) {
    for (let y = 8; y < CELL_SIZE - 8; y += 8) {
      for (let x = 8; x < CELL_SIZE - 8; x += 8) {
        if (x > CELL_SIZE * 0.46 && y < CELL_SIZE * 0.52) continue;
        const offset = (y * CELL_SIZE + x) * 4;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (saturation > 34 || Math.min(red, green, blue) < 188) continue;
        backgroundDeltas.push([
          red - referenceFrame[offset],
          green - referenceFrame[offset + 1],
          blue - referenceFrame[offset + 2],
        ]);
      }
    }
  }

  const driftRed = backgroundDeltas.length > 0
    ? median(backgroundDeltas.map((sample) => sample[0]))
    : 0;
  const driftGreen = backgroundDeltas.length > 0
    ? median(backgroundDeltas.map((sample) => sample[1]))
    : 0;
  const driftBlue = backgroundDeltas.length > 0
    ? median(backgroundDeltas.map((sample) => sample[2]))
    : 0;

  for (let pixel = 0; pixel < CELL_SIZE * CELL_SIZE; pixel += 1) {
    const offset = pixel * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const referenceRed = clamp(referenceFrame[offset] + driftRed, 0, 255);
    const referenceGreen = clamp(referenceFrame[offset + 1] + driftGreen, 0, 255);
    const referenceBlue = clamp(referenceFrame[offset + 2] + driftBlue, 0, 255);
    const referenceDistance = Math.hypot(
      red - referenceRed,
      green - referenceGreen,
      blue - referenceBlue,
    );
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    const darkness = Math.max(0, 203 - Math.min(red, green, blue));
    const stableStructure = Math.max(
      Math.max(0, saturation - 31) * 0.72,
      darkness * 0.22,
    );
    let alpha = smoothstep(8.5, 23, Math.max(referenceDistance, stableStructure));
    if (alpha < 0.055) alpha = 0;
    if (alpha > 0.955) alpha = 1;
    data[offset + 3] = Math.round(alpha * 255);
  }

  removeIsolatedMatteNoise(data);

  return data;
});

const exportEndpoint = async (frame, filename) => {
  const output = fileURLToPath(new URL(`../public/${filename}`, import.meta.url));
  await sharp(frame, {
    raw: { width: CELL_SIZE, height: CELL_SIZE, channels: 4 },
  })
    .resize(1024, 1024, { kernel: sharp.kernel.lanczos3 })
    .flatten({ background: "#f8fbfd" })
    .png({ compressionLevel: 9 })
    .toFile(output);
};

await exportEndpoint(sourceFrames[0], "organic-bloom-first-frame.png");
await exportEndpoint(sourceFrames[3], "organic-bloom-video-source.png");
await exportEndpoint(sourceFrames[10], "organic-bloom-bloom-frame.png");

const makeFeatureMap = async (frame) => {
  const { data } = await sharp(frame, {
    raw: { width: CELL_SIZE, height: CELL_SIZE, channels: 4 },
  })
    .resize(LOW_SIZE, LOW_SIZE, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = new Float32Array(LOW_SIZE * LOW_SIZE);
  const tone = new Float32Array(LOW_SIZE * LOW_SIZE);

  for (let pixel = 0; pixel < LOW_SIZE * LOW_SIZE; pixel += 1) {
    const offset = pixel * 4;
    const normalizedAlpha = data[offset + 3] / 255;
    const luminance = (
      data[offset] * 0.2126
      + data[offset + 1] * 0.7152
      + data[offset + 2] * 0.0722
    );
    alpha[pixel] = normalizedAlpha * 255;
    tone[pixel] = normalizedAlpha * (255 - luminance);
  }

  return { alpha, tone };
};

const featureMaps = await Promise.all(sourceFrames.map(makeFeatureMap));
const gridWidth = Math.ceil((LOW_SIZE - 1) / GRID_STEP) + 1;
const gridHeight = gridWidth;

function estimateFlow(from, to) {
  const flow = new Float32Array(gridWidth * gridHeight * 2);
  const confidence = new Float32Array(gridWidth * gridHeight);

  for (let gridY = 0; gridY < gridHeight; gridY += 1) {
    const y = Math.min(gridY * GRID_STEP, LOW_SIZE - 1);
    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      const x = Math.min(gridX * GRID_STEP, LOW_SIZE - 1);
      const flowIndex = (gridY * gridWidth + gridX) * 2;
      let alphaEnergy = 0;

      for (let patchY = -PATCH_RADIUS; patchY <= PATCH_RADIUS; patchY += 1) {
        const sampleY = clamp(y + patchY, 0, LOW_SIZE - 1);
        for (let patchX = -PATCH_RADIUS; patchX <= PATCH_RADIUS; patchX += 1) {
          const sampleX = clamp(x + patchX, 0, LOW_SIZE - 1);
          alphaEnergy += from.alpha[sampleY * LOW_SIZE + sampleX];
        }
      }

      if (alphaEnergy < 90) continue;

      let bestCost = Number.POSITIVE_INFINITY;
      let bestX = 0;
      let bestY = 0;
      let secondCost = Number.POSITIVE_INFINITY;

      for (let offsetY = -SEARCH_RADIUS; offsetY <= SEARCH_RADIUS; offsetY += 1) {
        for (let offsetX = -SEARCH_RADIUS; offsetX <= SEARCH_RADIUS; offsetX += 1) {
          let cost = 0;
          for (let patchY = -PATCH_RADIUS; patchY <= PATCH_RADIUS; patchY += 1) {
            const fromY = clamp(y + patchY, 0, LOW_SIZE - 1);
            const toY = clamp(y + patchY + offsetY, 0, LOW_SIZE - 1);
            for (let patchX = -PATCH_RADIUS; patchX <= PATCH_RADIUS; patchX += 1) {
              const fromX = clamp(x + patchX, 0, LOW_SIZE - 1);
              const toX = clamp(x + patchX + offsetX, 0, LOW_SIZE - 1);
              const fromIndex = fromY * LOW_SIZE + fromX;
              const toIndex = toY * LOW_SIZE + toX;
              const alphaDelta = from.alpha[fromIndex] - to.alpha[toIndex];
              const toneDelta = from.tone[fromIndex] - to.tone[toIndex];
              cost += alphaDelta * alphaDelta * 1.8 + toneDelta * toneDelta;
            }
          }

          if (cost < bestCost) {
            secondCost = bestCost;
            bestCost = cost;
            bestX = offsetX;
            bestY = offsetY;
          } else if (cost < secondCost) {
            secondCost = cost;
          }
        }
      }

      flow[flowIndex] = bestX;
      flow[flowIndex + 1] = bestY;
      confidence[flowIndex / 2] = secondCost > 0
        ? clamp((secondCost - bestCost) / secondCost, 0.05, 1)
        : 1;
    }
  }

  // Two light coherence passes remove isolated block matches while retaining
  // the large, asymmetric unfurling motion of the generated petals.
  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed = new Float32Array(flow.length);
    for (let gridY = 0; gridY < gridHeight; gridY += 1) {
      for (let gridX = 0; gridX < gridWidth; gridX += 1) {
        let totalWeight = 0;
        let flowX = 0;
        let flowY = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const neighborY = clamp(gridY + offsetY, 0, gridHeight - 1);
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const neighborX = clamp(gridX + offsetX, 0, gridWidth - 1);
            const neighbor = neighborY * gridWidth + neighborX;
            const weight = (offsetX === 0 && offsetY === 0 ? 2.5 : 1)
              * (0.35 + confidence[neighbor]);
            flowX += flow[neighbor * 2] * weight;
            flowY += flow[neighbor * 2 + 1] * weight;
            totalWeight += weight;
          }
        }
        const target = (gridY * gridWidth + gridX) * 2;
        smoothed[target] = flowX / totalWeight;
        smoothed[target + 1] = flowY / totalWeight;
      }
    }
    flow.set(smoothed);
  }

  return flow;
}

function readFlow(flow, x, y) {
  const lowX = x * (LOW_SIZE - 1) / (CELL_SIZE - 1);
  const lowY = y * (LOW_SIZE - 1) / (CELL_SIZE - 1);
  const gridX = lowX / GRID_STEP;
  const gridY = lowY / GRID_STEP;
  const x0 = clamp(Math.floor(gridX), 0, gridWidth - 1);
  const y0 = clamp(Math.floor(gridY), 0, gridHeight - 1);
  const x1 = Math.min(x0 + 1, gridWidth - 1);
  const y1 = Math.min(y0 + 1, gridHeight - 1);
  const mixX = gridX - Math.floor(gridX);
  const mixY = gridY - Math.floor(gridY);
  const index00 = (y0 * gridWidth + x0) * 2;
  const index10 = (y0 * gridWidth + x1) * 2;
  const index01 = (y1 * gridWidth + x0) * 2;
  const index11 = (y1 * gridWidth + x1) * 2;
  const scale = CELL_SIZE / LOW_SIZE;

  const interpolate = (channel) => {
    const top = flow[index00 + channel] * (1 - mixX)
      + flow[index10 + channel] * mixX;
    const bottom = flow[index01 + channel] * (1 - mixX)
      + flow[index11 + channel] * mixX;
    return (top * (1 - mixY) + bottom * mixY) * scale;
  };

  return [interpolate(0), interpolate(1)];
}

function samplePremultiplied(frame, x, y) {
  const sampleX = clamp(x, 0, CELL_SIZE - 1);
  const sampleY = clamp(y, 0, CELL_SIZE - 1);
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const x1 = Math.min(x0 + 1, CELL_SIZE - 1);
  const y1 = Math.min(y0 + 1, CELL_SIZE - 1);
  const mixX = sampleX - x0;
  const mixY = sampleY - y0;
  const output = [0, 0, 0, 0];

  const accumulate = (pixelX, pixelY, weight) => {
    const offset = (pixelY * CELL_SIZE + pixelX) * 4;
    const alpha = frame[offset + 3] / 255;
    output[0] += frame[offset] * alpha * weight;
    output[1] += frame[offset + 1] * alpha * weight;
    output[2] += frame[offset + 2] * alpha * weight;
    output[3] += alpha * weight;
  };

  accumulate(x0, y0, (1 - mixX) * (1 - mixY));
  accumulate(x1, y0, mixX * (1 - mixY));
  accumulate(x0, y1, (1 - mixX) * mixY);
  accumulate(x1, y1, mixX * mixY);
  return output;
}

function interpolateFrames(fromFrame, toFrame, forwardFlow, backwardFlow, progress) {
  const output = Buffer.alloc(CELL_SIZE * CELL_SIZE * 4);

  for (let y = 0; y < CELL_SIZE; y += 1) {
    for (let x = 0; x < CELL_SIZE; x += 1) {
      const [forwardX, forwardY] = readFlow(forwardFlow, x, y);
      const [backwardX, backwardY] = readFlow(backwardFlow, x, y);
      const fromSample = samplePremultiplied(
        fromFrame,
        x - forwardX * progress,
        y - forwardY * progress,
      );
      const toSample = samplePremultiplied(
        toFrame,
        x - backwardX * (1 - progress),
        y - backwardY * (1 - progress),
      );
      const inverse = 1 - progress;
      const alpha = fromSample[3] * inverse + toSample[3] * progress;
      const offset = (y * CELL_SIZE + x) * 4;

      if (alpha > 0.0001) {
        output[offset] = Math.round(
          (fromSample[0] * inverse + toSample[0] * progress) / alpha,
        );
        output[offset + 1] = Math.round(
          (fromSample[1] * inverse + toSample[1] * progress) / alpha,
        );
        output[offset + 2] = Math.round(
          (fromSample[2] * inverse + toSample[2] * progress) / alpha,
        );
      }
      output[offset + 3] = Math.round(alpha * 255);
    }
  }

  return output;
}

const outputFrameCount = SOURCE_FRAME_COUNT * SUBDIVISIONS;
const atlasWidth = OUTPUT_COLUMNS * CELL_SIZE;
const atlasHeight = OUTPUT_ROWS * CELL_SIZE;
const atlas = Buffer.alloc(atlasWidth * atlasHeight * 4);

function writeFrame(frame, frameIndex) {
  const column = frameIndex % OUTPUT_COLUMNS;
  const row = Math.floor(frameIndex / OUTPUT_COLUMNS);
  for (let y = 0; y < CELL_SIZE; y += 1) {
    const sourceStart = y * CELL_SIZE * 4;
    const targetStart = ((row * CELL_SIZE + y) * atlasWidth + column * CELL_SIZE) * 4;
    frame.copy(atlas, targetStart, sourceStart, sourceStart + CELL_SIZE * 4);
  }
}

for (let frame = 0; frame < SOURCE_FRAME_COUNT; frame += 1) {
  const nextFrame = (frame + 1) % SOURCE_FRAME_COUNT;
  const forwardFlow = estimateFlow(featureMaps[frame], featureMaps[nextFrame]);
  const backwardFlow = estimateFlow(featureMaps[nextFrame], featureMaps[frame]);

  for (let subdivision = 0; subdivision < SUBDIVISIONS; subdivision += 1) {
    const progress = subdivision / SUBDIVISIONS;
    const outputIndex = frame * SUBDIVISIONS + subdivision;
    const interpolated = subdivision === 0
      ? sourceFrames[frame]
      : interpolateFrames(
        sourceFrames[frame],
        sourceFrames[nextFrame],
        forwardFlow,
        backwardFlow,
        progress,
      );
    writeFrame(interpolated, outputIndex);
  }
  process.stdout.write(`Interpolated ${frame + 1}/${SOURCE_FRAME_COUNT} source frames\r`);
}

if (outputFrameCount !== OUTPUT_COLUMNS * OUTPUT_ROWS) {
  throw new Error("Output atlas dimensions do not match the frame count.");
}

await sharp(atlas, {
  raw: { width: atlasWidth, height: atlasHeight, channels: 4 },
})
  .png({ compressionLevel: 9, palette: true, quality: 100 })
  .toFile(OUTPUT);

process.stdout.write(`\nWrote ${outputFrameCount} motion-interpolated frames to ${OUTPUT}\n`);
