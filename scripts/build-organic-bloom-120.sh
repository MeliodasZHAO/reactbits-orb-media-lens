#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
output_video="${1:-$project_dir/public/organic-bloom-loop-optical-120.webm}"
frame_dir="$(mktemp -d "${TMPDIR:-/tmp}/organic-bloom-frames.XXXXXX")"

cleanup() {
  rm -rf "$frame_dir"
}
trap cleanup EXIT

node "$script_dir/render-bloom-video-frames.mjs" "$frame_dir"

# 96 authored poses span 6.5 seconds. Bidirectional motion compensation creates
# 780 genuinely distinct timestamps; RGB and alpha are interpolated separately
# so the result remains a transparent, tintable texture for the live canvas.
ffmpeg \
  -y \
  -hide_banner \
  -framerate 192/13 \
  -i "$frame_dir/frame-%04d.png" \
  -filter_complex "[0:v]split=2[color][matte];[color]format=yuv444p,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1:scd=none[color120];[matte]alphaextract,format=gray,minterpolate=fps=120:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:me=epzs:vsbmc=1:scd=none[alpha120];[color120][alpha120]alphamerge,tpad=stop_mode=clone:stop_duration=0.08,format=yuva420p[out]" \
  -map "[out]" \
  -t 6.5 \
  -an \
  -c:v libvpx-vp9 \
  -crf 20 \
  -b:v 0 \
  -row-mt 1 \
  -cpu-used 2 \
  -auto-alt-ref 0 \
  -pix_fmt yuva420p \
  "$output_video"

echo "Wrote $output_video"
