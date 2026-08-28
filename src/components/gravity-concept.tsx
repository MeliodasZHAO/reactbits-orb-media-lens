"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type GravityConceptVariant = "rupture" | "binary" | "eclipse";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uPulse;
uniform float uTime;
uniform int uVariant;

const float PI = 3.14159265359;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
    mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.56;
  mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    value += noise2(p) * amplitude;
    p = turn * p * 1.92 + vec2(0.17, -0.13);
    amplitude *= 0.47;
  }
  return value / 1.04;
}

float smoother(float value) {
  value = clamp(value, 0.0, 1.0);
  return value * value * (3.0 - 2.0 * value);
}

mat2 rotate2D(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

vec3 palette(float value) {
  float scaled = fract(value) * 5.0;
  float blend = smoother(fract(scaled));
  vec3 ice = vec3(0.52, 0.98, 1.00);
  vec3 sky = vec3(0.16, 0.58, 1.00);
  vec3 violet = vec3(0.58, 0.32, 1.00);
  vec3 coral = vec3(1.00, 0.43, 0.46);
  vec3 mint = vec3(0.48, 1.00, 0.66);
  if (scaled < 1.0) return mix(ice, sky, blend);
  if (scaled < 2.0) return mix(sky, violet, blend);
  if (scaled < 3.0) return mix(violet, coral, blend);
  if (scaled < 4.0) return mix(coral, mint, blend);
  return mix(mint, ice, blend);
}

vec4 aiMaterial(vec2 q, float radius, float phase, float time) {
  vec2 p = q / max(radius, 0.001);
  float l = dot(p, p);
  float mask = smoothstep(1.035, 0.965, l);
  float z = sqrt(max(0.0, 1.0 - min(l, 1.0)));
  vec2 rotated = rotate2D(time * 0.21 + sin(time * 0.13) * 0.42) * p;
  float nx = fbm(rotated * 1.42 + vec2(time * 0.09, -time * 0.065) + 25.69);
  float ny = fbm(rotated.yx * 1.36 + vec2(-time * 0.055, time * 0.08) + 86.31);
  vec2 domain = rotated + vec2(nx - 0.5, ny - 0.5) * 0.84;
  float liquid = fbm(domain * 1.54 + vec2(time * 0.07, -time * 0.05));
  float colorPhase = phase + rotated.x * 0.16 + rotated.y * 0.11
    + liquid * 0.31 + nx * 0.12;
  vec3 color = palette(colorPhase);
  vec3 adjacent = palette(colorPhase + 0.17);
  float light = smoother(dot(normalize(vec3(p, z + 0.08)), normalize(vec3(-0.5, 0.66, 0.82))) * 0.5 + 0.5);
  float fresnel = pow(1.0 - z, 2.5);
  float caustic = pow(smoother(1.0 - abs(nx - ny) * 2.8), 5.0);
  color = mix(color, adjacent, smoother(liquid) * 0.46);
  color *= 0.34 + light * 0.62 + z * 0.18;
  color += mix(color, vec3(0.88, 0.99, 1.0), 0.72) * fresnel * 0.68;
  color += vec3(1.0, 0.98, 0.95) * pow(light, 12.0) * z * 0.56;
  color += adjacent * caustic * 0.16;
  return vec4(color, mask);
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 path = b - a;
  float position = clamp(dot(p - a, path) / max(dot(path, path), 0.0001), 0.0, 1.0);
  return length(p - (a + path * position));
}

vec3 backgroundColor(vec2 frag) {
  vec3 color = vec3(0.0025, 0.0045, 0.013);
  color += vec3(0.008, 0.014, 0.04) * (1.0 - smoothstep(0.1, 1.6, length(frag)));
  return color;
}

vec3 ruptureConcept(vec2 frag, vec2 pointer, float time) {
  vec3 color = backgroundColor(frag);
  vec2 center = vec2(-0.42, -0.02);
  vec2 autoTarget = vec2(0.64 + sin(time * 0.17) * 0.08, 0.10 + cos(time * 0.23) * 0.16);
  vec2 target = mix(autoTarget, pointer, smoother(uPointerActive) * 0.82);
  vec2 axis = normalize(target - center + vec2(0.001));
  vec2 side = vec2(-axis.y, axis.x);
  vec2 hole = center + axis * 1.02;
  vec2 q = frag - center;
  float longitudinal = dot(q, axis);
  float lateral = dot(q, side);
  float radius = 0.57 + (fbm(normalize(q + vec2(0.001)) * 1.6 + time * 0.05) - 0.5) * 0.035;
  vec4 body = aiMaterial(q, radius, time * 0.025, time);

  float tearWidth = mix(0.05, 0.22, smoother((longitudinal - 0.12) / 0.48));
  float tear = smoother((longitudinal - 0.10) / 0.46)
    * (1.0 - smoother(abs(lateral) / max(tearWidth, 0.001)));
  float bodyMask = body.a * (1.0 - tear * 0.94);
  color = mix(color, body.rgb, bodyMask);

  float ribbonEnergy = 0.0;
  vec3 ribbonColor = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float index = float(i);
    float t = clamp((longitudinal - 0.35) / 0.73, 0.0, 1.0);
    float offset = (index - 2.5) * 0.042;
    float curve = offset * (1.0 - t)
      + sin(t * PI * 1.18 + time * (0.58 + index * 0.018) + index * 0.24) * 0.055 * sin(t * PI);
    float width = mix(0.019, 0.0045, t) * (0.88 + fract(index * 0.37) * 0.24);
    float line = 1.0 - smoothstep(width, width * 2.5, abs(lateral - curve));
    float window = smoother(t * 8.0) * smoother((1.0 - t) * 7.0);
    float energy = line * window;
    vec3 strand = palette(time * 0.026 + index * 0.032 + t * 0.15);
    ribbonColor += strand * energy;
    ribbonEnergy += energy;
  }
  color += ribbonColor * (0.34 + min(ribbonEnergy, 1.0) * 0.25);

  for (int i = 0; i < 10; i++) {
    float index = float(i);
    float t = fract(time * (0.09 + index * 0.002) + index * 0.137);
    float along = mix(0.42, 1.03, t);
    float across = sin(t * PI * 2.2 + index) * 0.10 * sin(t * PI) + (fract(index * 0.43) - 0.5) * 0.08;
    vec2 particle = center + axis * along + side * across;
    float spark = exp(-dot(frag - particle, frag - particle) * 4800.0);
    color += palette(time * 0.025 + index * 0.04) * spark * 0.86;
  }

  float holeDistance = length(frag - hole);
  float coreRadius = 0.083 + uPulse * 0.012;
  float lens = exp(-abs(holeDistance - coreRadius * 1.32) * 68.0);
  color += mix(palette(time * 0.025), vec3(0.88, 0.98, 1.0), 0.64) * lens * 0.72;
  color = mix(color, vec3(0.0002, 0.0005, 0.002), smoothstep(coreRadius, coreRadius * 0.78, holeDistance));
  return color;
}

vec3 binaryConcept(vec2 frag, vec2 pointer, float time) {
  vec3 color = backgroundColor(frag);
  float angle = time * 0.24 + sin(time * 0.11) * 0.34;
  vec2 orbit = vec2(cos(angle), sin(angle) * 0.66);
  vec2 pointerShift = pointer * smoother(uPointerActive) * 0.12;
  vec2 firstCenter = orbit * 0.40 + pointerShift;
  vec2 secondCenter = -orbit * 0.40 + pointerShift;
  float firstRadius = 0.37 + sin(time * 0.63) * 0.018;
  float secondRadius = 0.34 + cos(time * 0.57) * 0.02;
  vec4 first = aiMaterial(frag - firstCenter, firstRadius, time * 0.023, time);
  vec4 second = aiMaterial(frag - secondCenter, secondRadius, time * 0.023 + 0.44, -time * 0.92);
  color = mix(color, first.rgb, first.a);
  color = mix(color, second.rgb, second.a * (1.0 - first.a * 0.22));

  float bridgeDistance = segmentDistance(frag, firstCenter, secondCenter);
  float bridgePulse = 0.055 + sin(time * 1.15) * 0.018 + uPulse * 0.028;
  float bridge = (1.0 - smoothstep(bridgePulse, bridgePulse * 2.4, bridgeDistance))
    * (1.0 - smoothstep(0.58, 0.78, length(frag)));
  float bridgeFlow = fbm(frag * 4.2 + vec2(time * 0.18, -time * 0.12));
  color += mix(first.rgb, second.rgb, smoother(dot(frag, orbit) * 1.4 + 0.5))
    * bridge * (0.16 + bridgeFlow * 0.26);

  float coreDistance = length(frag - pointerShift * 0.35);
  float coreRadius = 0.07 + uPulse * 0.016;
  float threeFold = pow(1.0 - abs(sin(atan(frag.y, frag.x) * 3.0 - time * 0.8)), 32.0)
    * smoothstep(0.08, 0.14, coreDistance) * (1.0 - smoothstep(0.24, 0.38, coreDistance));
  color += palette(time * 0.024 + coreDistance * 0.4) * threeFold * 0.12;
  float lens = exp(-abs(coreDistance - coreRadius * 1.45) * 74.0);
  color += vec3(0.68, 0.91, 1.0) * lens * 0.54;
  color = mix(color, vec3(0.0002, 0.0004, 0.0018), smoothstep(coreRadius, coreRadius * 0.75, coreDistance));
  return color;
}

vec3 eclipseConcept(vec2 frag, vec2 pointer, float time) {
  vec3 color = backgroundColor(frag);
  vec2 center = vec2(-0.48, -0.05);
  vec2 autoHole = center + vec2(0.52 + sin(time * 0.18) * 0.22, 0.12 + cos(time * 0.21) * 0.25);
  vec2 hole = mix(autoHole, pointer * 0.62 + center * 0.38, smoother(uPointerActive) * 0.72);
  vec2 toHole = frag - hole;
  float holeDistance = length(toHole);
  float lensStrength = exp(-holeDistance * 8.0) * 0.12;
  vec2 lensedFrag = frag + normalize(toHole + vec2(0.001)) * lensStrength;
  vec2 q = lensedFrag - center;
  float radius = 0.92 + sin(atan(q.y, q.x) * 2.0 - time * 0.35) * 0.016;
  vec4 body = aiMaterial(q, radius, time * 0.021 + 0.12, time * 0.78);

  float z = sqrt(max(0.0, 1.0 - min(dot(q / radius, q / radius), 1.0)));
  vec2 holeAxis = normalize(hole - center + vec2(0.001));
  float shadow = smoother(dot(normalize(q + vec2(0.001)), holeAxis) * 0.5 + 0.5)
    * exp(-holeDistance * 2.6);
  vec3 shadedBody = body.rgb * (1.0 - shadow * 0.54);
  shadedBody += palette(time * 0.022 + 0.18) * pow(1.0 - z, 2.8) * 0.22;
  color = mix(color, shadedBody, body.a);

  float coreRadius = 0.12 + uPulse * 0.018;
  float lens = exp(-abs(holeDistance - coreRadius * 1.34) * 68.0);
  float outerLens = exp(-abs(holeDistance - coreRadius * 2.15) * 24.0) * 0.20;
  vec3 lensColor = mix(palette(time * 0.02 + 0.52), vec3(0.9, 0.99, 1.0), 0.62);
  color += lensColor * (lens * 0.82 + outerLens);
  float streak = exp(-abs(dot(toHole, vec2(-holeAxis.y, holeAxis.x))) * 58.0)
    * (1.0 - smoothstep(0.14, 0.72, abs(dot(toHole, holeAxis))))
    * (1.0 - smoothstep(coreRadius, coreRadius * 1.25, holeDistance));
  color += lensColor * streak * 0.35;
  color = mix(color, vec3(0.0001, 0.0003, 0.0014), smoothstep(coreRadius, coreRadius * 0.78, holeDistance));
  return color;
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 frag = (vUv * 2.0 - 1.0) * aspect;
  vec2 pointer = (uPointer - 0.5) * vec2(2.0 * aspect.x, -2.0);
  vec3 color;
  if (uVariant == 0) color = ruptureConcept(frag, pointer, uTime);
  else if (uVariant == 1) color = binaryConcept(frag, pointer, uTime);
  else color = eclipseConcept(frag, pointer, uTime);

  float grain = hash21(gl_FragCoord.xy + floor(uTime * 13.0)) - 0.5;
  color += grain * 0.006;
  float vignette = 1.0 - smoothstep(0.35, 1.65, length(frag * vec2(0.82, 1.0)));
  color *= 0.72 + vignette * 0.28;
  color = color / (1.0 + color * 0.36);
  color = pow(max(color, 0.0), vec3(0.91));
  gl_FragColor = vec4(color, 1.0);
}
`;

const variantIndex: Record<GravityConceptVariant, number> = {
  rupture: 0,
  binary: 1,
  eclipse: 2,
};

export default function GravityConcept({
  variant,
  paused = false,
  className,
}: {
  variant: GravityConceptVariant;
  paused?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef(new THREE.Vector2(0.5, 0.5));
  const pointerTarget = useRef(new THREE.Vector2(0.5, 0.5));
  const pointerActive = useRef(0);
  const pointerTargetActive = useRef(0);
  const pulse = useRef(0);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
    renderer.setClearColor(0x02040b, 1);
    renderer.domElement.className = "absolute inset-0 h-full w-full";
    node.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uPointerActive: { value: 0 },
      uPulse: { value: 0 },
      uTime: { value: 0 },
      uVariant: { value: variantIndex[variant] },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const bounds = node.getBoundingClientRect();
      renderer.setSize(Math.max(bounds.width, 1), Math.max(bounds.height, 1), false);
      uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    resize();

    let frame = 0;
    let elapsed = 0;
    let previous = performance.now();
    const render = (now: number) => {
      const delta = Math.min((now - previous) * 0.001, 0.05);
      previous = now;
      if (!paused) elapsed += delta;
      pointer.current.lerp(pointerTarget.current, 0.07);
      pointerActive.current += (pointerTargetActive.current - pointerActive.current) * 0.06;
      pulse.current *= 0.945;
      uniforms.uTime.value = elapsed;
      uniforms.uPointer.value.copy(pointer.current);
      uniforms.uPointerActive.value = pointerActive.current;
      uniforms.uPulse.value = pulse.current;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === node) node.removeChild(renderer.domElement);
    };
  }, [paused, variant]);

  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerTarget.current.set(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    );
    pointerTargetActive.current = paused ? 0 : 1;
  };

  const labels: Record<GravityConceptVariant, string> = {
    rupture: "A liquid AI sphere torn into ribbons by a constrained gravity well",
    binary: "Two AI liquid cores orbiting and merging around a central gravity well",
    eclipse: "A cinematic close-up AI sphere distorted by a black hole crossing its surface",
  };

  return (
    <div
      ref={container}
      className={cn("relative h-full w-full overflow-hidden bg-[#02040b]", className)}
      onPointerMove={updatePointer}
      onPointerLeave={() => {
        pointerTarget.current.set(0.5, 0.5);
        pointerTargetActive.current = 0;
      }}
      onPointerDown={() => {
        if (!paused) pulse.current = 1;
      }}
      role="img"
      aria-label={labels[variant]}
    />
  );
}
