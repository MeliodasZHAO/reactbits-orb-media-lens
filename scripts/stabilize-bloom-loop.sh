#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
input_video="${1:-$project_dir/public/generated-bloom-loop-v11-optical.mp4}"
output_video="${2:-$project_dir/public/generated-bloom-loop-v13-stable-120.mp4}"
target_fps="${3:-120}"

if ! [[ "$target_fps" =~ ^[0-9]+$ ]] || (( target_fps < 60 || target_fps > 120 )); then
  echo "target FPS must be an integer from 60 through 120" >&2
  exit 2
fi

# The source already contains motion-compensated 60 FPS imagery. A short,
# weighted temporal mix removes one-frame highlight pops without changing the
# flower's authored pose. The final linear half-frames are intentionally used
# instead of another full optical-flow pass: at 60 -> 120 FPS the displacement
# is tiny, while blending avoids inventing torn detail in translucent petals.
ffmpeg \
  -y \
  -hide_banner \
  -i "$input_video" \
  -vf "tmix=frames=3:weights='1 2 1',framerate=fps=${target_fps}:interp_start=0:interp_end=255:scene=100" \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 10 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  "$output_video"
