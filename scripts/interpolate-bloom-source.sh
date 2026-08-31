#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
input_video="${1:-$project_dir/public/generated-bloom-source.mp4}"
output_video="${2:-$project_dir/public/generated-bloom-source-optical-60fps.mp4}"

ffmpeg \
  -y \
  -hide_banner \
  -i "$input_video" \
  -vf "minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bilat:me=umh:mb_size=8:search_param=64:vsbmc=1:scd=none" \
  -an \
  -c:v libx264 \
  -preset slow \
  -crf 10 \
  -pix_fmt yuv420p \
  "$output_video"
