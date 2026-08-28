"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export type WireframeBallShape =
  "tetrahedron" | "cube" | "octahedron" | "dodecahedron" | "icosahedron";

export interface WireframeBallProps {
  shape?: WireframeBallShape;
  detail?: number;
  stretch?: number;
  zoom?: number;
  speed?: number;
  wobble?: number;
  showEdges?: boolean;
  edgeColor?: string;
  edgeGlow?: number;
  edgeThickness?: number;
  showVertices?: boolean;
  vertexColor?: string;
  vertexSize?: number;
  vertexGlow?: number;
  depthColor?: string;
  depthTint?: number;
  depthFade?: number;
  backgroundColor?: string;
  brightness?: number;
  opacity?: number;
  cursorInteraction?: boolean;
  cursorTilt?: number;
  dragToSpin?: boolean;
  spinFriction?: number;
  adaptiveQuality?: boolean;
  targetFps?: number;
  dpr?: number;
  paused?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

const strandVertex = `
attribute vec2 corner;
attribute vec3 aHead;
attribute vec3 aTail;

uniform mat3 uFrame;
uniform vec2 uProject;
uniform float uReach;

varying vec2 vPoint;
varying vec2 vHead;
varying vec2 vTail;
varying float vSlab;

void main() {
  vec3 head = uFrame * aHead;
  vec3 tail = uFrame * aTail;

  vec2 a = head.xy;
  vec2 b = tail.xy;
  vec2 run = b - a;
  float span = length(run);
  vec2 along = span > 1e-6 ? run / span : vec2(1.0, 0.0);
  vec2 side = vec2(-along.y, along.x);

  float u = corner.x;
  float v = corner.y * 2.0 - 1.0;
  vec2 seat = a + along * (u * span + (u * 2.0 - 1.0) * uReach) + side * v * uReach;

  vPoint = seat;
  vHead = a;
  vTail = b;
  vSlab = (head.z + tail.z) * 0.5;

  gl_Position = vec4(seat * uProject, 0.0, 1.0);
}
`;

const strandFragment = `
precision highp float;

uniform vec3 uInk;
uniform vec3 uDepthInk;
uniform float uYield;
uniform float uCore;
uniform float uTint;
uniform float uRecede;
uniform float uShell;

varying vec2 vPoint;
varying vec2 vHead;
varying vec2 vTail;
varying float vSlab;

void main() {
  vec2 rel = vPoint - vHead;
  vec2 run = vTail - vHead;
  float t = clamp(dot(rel, run) / max(dot(run, run), 1e-8), 0.0, 1.0);
  float gap = length(rel - run * t);

  float lift = uYield / (uCore + gap);

  float depth = clamp(vSlab / uShell * 0.5 + 0.5, 0.0, 1.0);
  lift *= mix(1.0, depth, uRecede);

  vec3 hue = mix(uInk, uDepthInk, uTint * (1.0 - depth));

  gl_FragColor = vec4(hue * lift, lift);
}
`;

const nodeVertex = `
attribute vec2 corner;
attribute vec3 aSeat;
attribute float aWeight;

uniform mat3 uFrame;
uniform vec2 uProject;
uniform float uReach;

varying vec2 vOffset;
varying float vWeight;
varying float vSlab;

void main() {
  vec3 seat = uFrame * aSeat;
  vec2 pull = (corner * 2.0 - 1.0) * uReach;

  vOffset = pull;
  vWeight = aWeight;
  vSlab = seat.z;

  gl_Position = vec4((seat.xy + pull) * uProject, 0.0, 1.0);
}
`;

const nodeFragment = `
precision highp float;

uniform vec3 uInk;
uniform vec3 uDepthInk;
uniform float uGrain;
uniform float uYield;
uniform float uTint;
uniform float uRecede;
uniform float uShell;

varying vec2 vOffset;
varying float vWeight;
varying float vSlab;

void main() {
  float bead = smoothstep(uGrain, 0.0, length(vOffset));
  if (bead <= 0.0) discard;

  float depth = clamp(vSlab / uShell * 0.5 + 0.5, 0.0, 1.0);
  float lift = bead * vWeight * uYield * mix(1.0, depth, uRecede);

  vec3 hue = mix(uInk, uDepthInk, uTint * (1.0 - depth));

  gl_FragColor = vec4(hue * lift, lift);
}
`;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

const readHex = (hex: string, fallback: string) => {
  const tone = new THREE.Color();
  try {
    tone.set(hex);
  } catch {
    tone.set(fallback);
  }
  return tone;
};

const GOLD = (1 + Math.sqrt(5)) / 2;
const HOUSE_RADIUS = Math.hypot(1.28, 1);
const EDGE_CUTOFF = 0.0035;

const seedPoints = (shape: WireframeBallShape, stretch: number): number[][] => {
  if (shape === "tetrahedron") {
    return [
      [1, 1, 1],
      [-1, -1, 1],
      [-1, 1, -1],
      [1, -1, -1],
    ];
  }

  if (shape === "cube") {
    const out: number[][] = [];
    for (let x = -1; x <= 1; x += 2)
      for (let y = -1; y <= 1; y += 2)
        for (let z = -1; z <= 1; z += 2) out.push([x, y, z]);
    return out;
  }

  if (shape === "octahedron") {
    return [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
  }

  if (shape === "dodecahedron") {
    const out: number[][] = [];
    for (let x = -1; x <= 1; x += 2)
      for (let y = -1; y <= 1; y += 2)
        for (let z = -1; z <= 1; z += 2) out.push([x, y, z]);
    const short = 1 / GOLD;
    for (let a = -1; a <= 1; a += 2)
      for (let b = -1; b <= 1; b += 2) {
        out.push([0, a * short, b * GOLD]);
        out.push([a * short, b * GOLD, 0]);
        out.push([a * GOLD, 0, b * short]);
      }
    return out;
  }

  const out: number[][] = [];
  for (let a = -1; a <= 1; a += 2)
    for (let b = -1; b <= 1; b += 2) {
      out.push([a * stretch, b, 0]);
      out.push([0, a * stretch, b]);
      out.push([b, 0, a * stretch]);
    }
  return out;
};

const sub = (a: number[], b: number[]) => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];

const cross = (a: number[], b: number[]) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot3 = (a: number[], b: number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

const hullRings = (pts: number[][]) => {
  const total = pts.length;
  const claimed = new Set<string>();
  const rings: number[][] = [];

  for (let i = 0; i < total; i++)
    for (let j = i + 1; j < total; j++)
      for (let k = j + 1; k < total; k++) {
        const raw = cross(sub(pts[j], pts[i]), sub(pts[k], pts[i]));
        const mag = norm(raw);
        if (mag < 1e-6) continue;

        let axis = [raw[0] / mag, raw[1] / mag, raw[2] / mag];
        let plane = dot3(axis, pts[i]);
        if (plane < 0) {
          axis = [-axis[0], -axis[1], -axis[2]];
          plane = -plane;
        }
        if (plane < 1e-6) continue;

        const flat: number[] = [];
        let outside = false;
        for (let m = 0; m < total && !outside; m++) {
          const gap = dot3(axis, pts[m]) - plane;
          if (gap > 1e-6) outside = true;
          else if (gap > -1e-6) flat.push(m);
        }
        if (outside || flat.length < 3) continue;

        const tag = flat.join("_");
        if (claimed.has(tag)) continue;
        claimed.add(tag);

        const hub = [0, 0, 0];
        flat.forEach((m) => {
          hub[0] += pts[m][0] / flat.length;
          hub[1] += pts[m][1] / flat.length;
          hub[2] += pts[m][2] / flat.length;
        });

        const spoke = sub(pts[flat[0]], hub);
        const sLen = norm(spoke);
        const ex = [spoke[0] / sLen, spoke[1] / sLen, spoke[2] / sLen];
        const ey = cross(axis, ex);

        rings.push(
          flat
            .map((m) => {
              const d = sub(pts[m], hub);
              return { m, a: Math.atan2(dot3(d, ey), dot3(d, ex)) };
            })
            .sort((x, y) => x.a - y.a)
            .map((x) => x.m),
        );
      }

  return rings;
};

const buildLattice = (
  shape: WireframeBallShape,
  detail: number,
  stretch: number,
) => {
  const seeds = seedPoints(shape, stretch);
  const rings = hullRings(seeds);
  const shell = norm(seeds[0]) || 1;

  const pts = seeds.map((p) => p.slice());
  const pairs = new Set<string>();
  const link = (a: number, b: number) =>
    pairs.add(a < b ? `${a}:${b}` : `${b}:${a}`);

  if (detail <= 0) {
    rings.forEach((ring) => {
      for (let i = 0; i < ring.length; i++)
        link(ring[i], ring[(i + 1) % ring.length]);
    });
  } else {
    const onShell = (p: number[]) => {
      const len = norm(p) || 1;
      return [(p[0] / len) * shell, (p[1] / len) * shell, (p[2] / len) * shell];
    };

    let tris: number[][] = [];
    rings.forEach((ring) => {
      if (ring.length === 3) {
        tris.push([ring[0], ring[1], ring[2]]);
        return;
      }
      const hub = [0, 0, 0];
      ring.forEach((m) => {
        hub[0] += pts[m][0] / ring.length;
        hub[1] += pts[m][1] / ring.length;
        hub[2] += pts[m][2] / ring.length;
      });
      const hubIndex = pts.push(onShell(hub)) - 1;
      for (let i = 0; i < ring.length; i++)
        tris.push([hubIndex, ring[i], ring[(i + 1) % ring.length]]);
    });

    for (let pass = 0; pass < detail; pass++) {
      const cut = new Map<string, number>();
      const halve = (a: number, b: number) => {
        const tag = a < b ? `${a}:${b}` : `${b}:${a}`;
        const hit = cut.get(tag);
        if (hit !== undefined) return hit;
        const mid = onShell([
          (pts[a][0] + pts[b][0]) / 2,
          (pts[a][1] + pts[b][1]) / 2,
          (pts[a][2] + pts[b][2]) / 2,
        ]);
        const made = pts.push(mid) - 1;
        cut.set(tag, made);
        return made;
      };

      const next: number[][] = [];
      tris.forEach(([a, b, c]) => {
        const ab = halve(a, b);
        const bc = halve(b, c);
        const ca = halve(c, a);
        next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      });
      tris = next;
    }

    tris.forEach(([a, b, c]) => {
      link(a, b);
      link(b, c);
      link(c, a);
    });
  }

  const live = new Map<number, number>();
  const heads: number[] = [];
  const tails: number[] = [];
  const degree = new Map<number, number>();

  pairs.forEach((tag) => {
    const [a, b] = tag.split(":").map(Number);
    [a, b].forEach((m) => {
      if (!live.has(m)) live.set(m, live.size);
      degree.set(m, (degree.get(m) ?? 0) + 1);
    });
    heads.push(a);
    tails.push(b);
  });

  const gain = HOUSE_RADIUS / shell;
  const seats = new Float32Array(live.size * 3);
  const weights = new Float32Array(live.size);
  live.forEach((slot, m) => {
    seats[slot * 3] = pts[m][0] * gain;
    seats[slot * 3 + 1] = pts[m][1] * gain;
    seats[slot * 3 + 2] = pts[m][2] * gain;
    weights[slot] = degree.get(m) ?? 0;
  });

  const head = new Float32Array(heads.length * 3);
  const tail = new Float32Array(heads.length * 3);
  heads.forEach((m, i) => {
    const s = live.get(m)! * 3;
    head[i * 3] = seats[s];
    head[i * 3 + 1] = seats[s + 1];
    head[i * 3 + 2] = seats[s + 2];
  });
  tails.forEach((m, i) => {
    const s = live.get(m)! * 3;
    tail[i * 3] = seats[s];
    tail[i * 3 + 1] = seats[s + 1];
    tail[i * 3 + 2] = seats[s + 2];
  });

  return {
    seats,
    weights,
    head,
    tail,
    nodeCount: live.size,
    edgeCount: heads.length,
  };
};

const quadCorners = () => {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute(
    "corner",
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
  return geo;
};

interface LatticeProps extends Required<
  Omit<
    WireframeBallProps,
    | "className"
    | "style"
    | "children"
    | "backgroundColor"
    | "cursorInteraction"
    | "cursorTilt"
    | "dragToSpin"
    | "spinFriction"
    | "dpr"
  >
> {
  readDrift: () => DriftState;
}

interface DriftState {
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  tiltX: number;
  tiltY: number;
  aimX: number;
  aimY: number;
  dragging: boolean;
  friction: number;
}

const Lattice = ({
  shape,
  detail,
  stretch,
  zoom,
  speed,
  wobble,
  showEdges,
  edgeColor,
  edgeGlow,
  edgeThickness,
  showVertices,
  vertexColor,
  vertexSize,
  vertexGlow,
  depthColor,
  depthTint,
  depthFade,
  brightness,
  opacity,
  adaptiveQuality,
  targetFps,
  paused,
  readDrift,
}: LatticeProps) => {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);
  const ratio = useThree((s) => s.viewport.dpr);

  const lattice = useMemo(
    () => buildLattice(shape, clamp(Math.round(detail), 0, 3), stretch),
    [shape, detail, stretch],
  );

  const strandGeo = useMemo(() => {
    const geo = quadCorners();
    geo.setAttribute(
      "aHead",
      new THREE.InstancedBufferAttribute(lattice.head, 3),
    );
    geo.setAttribute(
      "aTail",
      new THREE.InstancedBufferAttribute(lattice.tail, 3),
    );
    geo.instanceCount = lattice.edgeCount;
    return geo;
  }, [lattice]);

  const nodeGeo = useMemo(() => {
    const geo = quadCorners();
    geo.setAttribute(
      "aSeat",
      new THREE.InstancedBufferAttribute(lattice.seats, 3),
    );
    geo.setAttribute(
      "aWeight",
      new THREE.InstancedBufferAttribute(lattice.weights, 1),
    );
    geo.instanceCount = lattice.nodeCount;
    return geo;
  }, [lattice]);

  const strandUniforms = useMemo(
    () => ({
      uFrame: { value: new THREE.Matrix3() },
      uProject: { value: new THREE.Vector2(1, 1) },
      uReach: { value: 0.2 },
      uInk: { value: new THREE.Color("#ffffff") },
      uDepthInk: { value: new THREE.Color("#ffffff") },
      uYield: { value: 0.0008 },
      uCore: { value: 0.02 },
      uTint: { value: 0 },
      uRecede: { value: 0 },
      uShell: { value: HOUSE_RADIUS },
    }),
    [],
  );

  const nodeUniforms = useMemo(
    () => ({
      uFrame: { value: new THREE.Matrix3() },
      uProject: { value: new THREE.Vector2(1, 1) },
      uReach: { value: 0.032 },
      uInk: { value: new THREE.Color("#ffffff") },
      uDepthInk: { value: new THREE.Color("#ffffff") },
      uGrain: { value: 0.032 },
      uYield: { value: 0.148 },
      uTint: { value: 0 },
      uRecede: { value: 0 },
      uShell: { value: HOUSE_RADIUS },
    }),
    [],
  );

  const strandMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const nodeMatRef = useRef<THREE.ShaderMaterial | null>(null);

  const inkEdge = useMemo(() => readHex(edgeColor, "#ffffff"), [edgeColor]);
  const inkNode = useMemo(() => readHex(vertexColor, "#ffffff"), [vertexColor]);
  const inkFar = useMemo(() => readHex(depthColor, "#7aa2ff"), [depthColor]);

  useEffect(
    () => () => {
      strandGeo.dispose();
      nodeGeo.dispose();
    },
    [strandGeo, nodeGeo],
  );

  const still = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const probe = window.matchMedia("(prefers-reduced-motion: reduce)");
    still.current = probe.matches;
    const sync = () => {
      still.current = probe.matches;
    };
    probe.addEventListener("change", sync);
    return () => probe.removeEventListener("change", sync);
  }, []);

  const clock = useRef(0.8);
  const budget = useRef({
    since: 0,
    frames: 0,
    scale: 1,
    good: 0,
    roof: Infinity,
    warm: 0,
  });

  useFrame((state, delta) => {
    const step = Math.min(delta, 0.05);
    if (!paused && !still.current) clock.current += step * speed;

    const t = clock.current;
    const px = Math.sin(t / 3.14);
    const py = Math.sin(t / 1.28);
    const pz = Math.sin(t / 5.12);
    const pLen = Math.hypot(px, py, pz);
    const p =
      pLen < 1e-5 ? [0.577, 0.577, 0.577] : [px / pLen, py / pLen, pz / pLen];
    const guide = [1, 1, 1];
    let q = cross(p, guide);
    let qLen = norm(q);
    if (qLen < 1e-5) {
      q = cross(p, [0, 1, 0]);
      qLen = norm(q) || 1;
    }
    q = [q[0] / qLen, q[1] / qLen, q[2] / qLen];
    const r = cross(q, p);

    const d = readDrift();
    if (d) {
      if (!d.dragging) {
        d.yaw += d.yawRate * step * 60;
        d.pitch += d.pitchRate * step * 60;
        const decay = Math.pow(clamp(d.friction, 0.5, 0.999), step * 60);
        d.yawRate *= decay;
        d.pitchRate *= decay;
      }
      const ease = 1 - Math.pow(0.001, step);
      d.tiltX += (d.aimX - d.tiltX) * ease;
      d.tiltY += (d.aimY - d.tiltY) * ease;
    }

    const yaw = (d?.yaw ?? 0) + (d?.tiltX ?? 0);
    const pitch = (d?.pitch ?? 0) + (d?.tiltY ?? 0);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);
    const sp = Math.sin(pitch);
    const cp = Math.cos(pitch);

    const spin = (v: number[]) => {
      const x = v[0] * cy + v[2] * sy;
      const z = -v[0] * sy + v[2] * cy;
      const y = v[1] * cp - z * sp;
      return [x, y, v[1] * sp + z * cp];
    };

    const P = spin(p);
    const Q = spin(q);
    const R = spin(r);

    const breathe = 1 + Math.sin(t * 0.37) * wobble;
    const shell = HOUSE_RADIUS * breathe;
    const span = 6 / Math.max(zoom, 0.05);
    const floor = Math.min(size.width, size.height) || 1;
    const projX = (2 * floor) / (Math.max(size.width, 1) * span);
    const projY = (2 * floor) / (Math.max(size.height, 1) * span);

    const gain = brightness * opacity * breathe;
    const k = 0.0008 * edgeGlow * gain;
    const reach = clamp(k / EDGE_CUTOFF - edgeThickness, 0.03, 2.5);

    const sU = strandMatRef.current?.uniforms;
    const nU = nodeMatRef.current?.uniforms;
    if (!sU || !nU) return;

    const frame = sU.uFrame.value;
    frame.set(
      P[0] * breathe,
      Q[0] * breathe,
      R[0] * breathe,
      P[1] * breathe,
      Q[1] * breathe,
      R[1] * breathe,
      P[2] * breathe,
      Q[2] * breathe,
      R[2] * breathe,
    );
    nU.uFrame.value.copy(frame);

    sU.uProject.value.set(projX, projY);
    nU.uProject.value.set(projX, projY);
    sU.uReach.value = reach;
    sU.uYield.value = k;
    sU.uCore.value = Math.max(edgeThickness, 1e-4);
    sU.uTint.value = depthTint;
    sU.uRecede.value = depthFade;
    sU.uShell.value = shell;
    sU.uInk.value.copy(inkEdge);
    sU.uDepthInk.value.copy(inkFar);

    nU.uReach.value = Math.max(vertexSize, 1e-4);
    nU.uGrain.value = Math.max(vertexSize, 1e-4);
    nU.uYield.value = vertexGlow * gain;
    nU.uTint.value = depthTint;
    nU.uRecede.value = depthFade;
    nU.uShell.value = shell;
    nU.uInk.value.copy(inkNode);
    nU.uDepthInk.value.copy(inkFar);

    if (adaptiveQuality) {
      const b = budget.current;
      b.warm += step;
      if (b.warm > 0.5) {
        b.frames += 1;
        b.since += step;
        if (b.since >= 0.75) {
          const fps = b.frames / b.since;
          if (fps < targetFps * 0.85 && b.scale > 0.5) {
            b.roof = Math.min(b.roof, b.scale);
            b.scale = Math.max(0.5, b.scale * 0.75);
            b.good = 0;
            setDpr(ratio * b.scale);
          } else if (fps > targetFps * 0.95) {
            b.good += 1;
            const lift = Math.min(1, b.scale * 1.25);
            if (b.good >= 3 && lift < b.roof && b.scale < 1) {
              b.scale = lift;
              b.good = 0;
              setDpr(ratio * b.scale);
            }
          }
          b.frames = 0;
          b.since = 0;
        }
      }
    }

    invalidate();
    void state;
  });

  return (
    <>
      <mesh
        frustumCulled={false}
        geometry={strandGeo}
        renderOrder={0}
        visible={showEdges}
      >
        <shaderMaterial
          ref={strandMatRef}
          vertexShader={strandVertex}
          fragmentShader={strandFragment}
          uniforms={strandUniforms}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.CustomBlending}
          blendSrc={THREE.OneFactor}
          blendDst={THREE.OneFactor}
          blendSrcAlpha={THREE.OneFactor}
          blendDstAlpha={THREE.OneFactor}
        />
      </mesh>
      <mesh
        frustumCulled={false}
        geometry={nodeGeo}
        renderOrder={1}
        visible={showVertices}
      >
        <shaderMaterial
          ref={nodeMatRef}
          vertexShader={nodeVertex}
          fragmentShader={nodeFragment}
          uniforms={nodeUniforms}
          transparent
          depthTest={false}
          depthWrite={false}
          blending={THREE.CustomBlending}
          blendSrc={THREE.OneFactor}
          blendDst={THREE.OneFactor}
          blendSrcAlpha={THREE.OneFactor}
          blendDstAlpha={THREE.OneFactor}
        />
      </mesh>
    </>
  );
};

const watchScreen = () => () => {};

const readScreenDpr = () => window.devicePixelRatio || 1;

const WireframeBall = ({
  shape = "icosahedron",
  detail = 0,
  stretch = 1.28,
  zoom = 1,
  speed = 1,
  wobble = 0,
  showEdges = true,
  edgeColor = "currentColor",
  edgeGlow = 1,
  edgeThickness = 0.02,
  showVertices = true,
  vertexColor = "currentColor",
  vertexSize = 0.032,
  vertexGlow = 0.148,
  depthColor = "#7aa2ff",
  depthTint = 0,
  depthFade = 0,
  backgroundColor = "transparent",
  brightness = 1,
  opacity = 1,
  cursorInteraction = true,
  cursorTilt = 0.35,
  dragToSpin = true,
  spinFriction = 0.94,
  adaptiveQuality = true,
  targetFps = 60,
  dpr = 2,
  paused = false,
  className,
  style,
  children,
}: WireframeBallProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const grip = useRef({ active: false, x: 0, y: 0, id: -1 });
  const drift = useRef<DriftState>({
    yaw: 0,
    pitch: 0,
    yawRate: 0,
    pitchRate: 0,
    tiltX: 0,
    tiltY: 0,
    aimX: 0,
    aimY: 0,
    dragging: false,
    friction: 0.94,
  });
  const [awake, setAwake] = useState(false);
  const [inheritedInk, setInheritedInk] = useState("#ffffff");
  const screenDpr = useSyncExternalStore(watchScreen, readScreenDpr, () => 1);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const watch = new IntersectionObserver(
      ([entry]) => setAwake(entry.isIntersecting),
      { rootMargin: "200px" },
    );
    watch.observe(node);
    return () => watch.disconnect();
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let pending = 0;
    const sync = () => {
      const tone = window.getComputedStyle(node).color;
      if (tone) setInheritedInk(tone);
    };
    const schedule = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(sync);
    };
    schedule();
    const watch = new MutationObserver(schedule);
    watch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    return () => {
      cancelAnimationFrame(pending);
      watch.disconnect();
    };
  }, []);

  const inherit = useCallback(
    (tone: string) =>
      tone === "currentColor" || tone === "auto" ? inheritedInk : tone,
    [inheritedInk],
  );

  const readDrift = useCallback(() => drift.current, []);

  const aimAt = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const node = rootRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const nx = (event.clientX - box.left) / Math.max(box.width, 1) - 0.5;
      const ny = (event.clientY - box.top) / Math.max(box.height, 1) - 0.5;
      const d = drift.current;

      if (grip.current.active) {
        const dx = event.clientX - grip.current.x;
        const dy = event.clientY - grip.current.y;
        grip.current.x = event.clientX;
        grip.current.y = event.clientY;
        const yawStep = (dx / Math.max(box.width, 1)) * Math.PI * 2;
        const pitchStep = (dy / Math.max(box.height, 1)) * Math.PI * 2;
        d.yaw += yawStep;
        d.pitch += pitchStep;
        d.yawRate = yawStep * 0.5;
        d.pitchRate = pitchStep * 0.5;
        return;
      }

      if (!cursorInteraction) return;
      d.aimX = nx * cursorTilt;
      d.aimY = ny * cursorTilt;
    },
    [cursorInteraction, cursorTilt],
  );

  const release = useCallback(() => {
    const d = drift.current;
    d.aimX = 0;
    d.aimY = 0;
  }, []);

  const seize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragToSpin) return;
      grip.current = {
        active: true,
        x: event.clientX,
        y: event.clientY,
        id: event.pointerId,
      };
      drift.current.dragging = true;
      drift.current.yawRate = 0;
      drift.current.pitchRate = 0;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [dragToSpin],
  );

  const loosen = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!grip.current.active) return;
    grip.current.active = false;
    drift.current.dragging = false;
    event.currentTarget.releasePointerCapture?.(grip.current.id);
  }, []);

  useEffect(() => {
    drift.current.friction = spinFriction;
  }, [spinFriction]);

  const ceiling = useMemo(
    () => clamp(Math.min(screenDpr, dpr), 0.5, 2),
    [screenDpr, dpr],
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundColor,
        touchAction: dragToSpin ? "none" : undefined,
        ...style,
      }}
      onPointerMove={aimAt}
      onPointerLeave={release}
      onPointerDown={seize}
      onPointerUp={loosen}
      onPointerCancel={loosen}
    >
      <div className="absolute inset-0">
        {awake ? (
          <Canvas
            dpr={ceiling}
            frameloop="always"
            gl={{
              alpha: true,
              antialias: false,
              premultipliedAlpha: true,
              powerPreference: "high-performance",
            }}
          >
            <Lattice
              shape={shape}
              detail={detail}
              stretch={stretch}
              zoom={zoom}
              speed={speed}
              wobble={wobble}
              showEdges={showEdges}
              edgeColor={inherit(edgeColor)}
              edgeGlow={edgeGlow}
              edgeThickness={edgeThickness}
              showVertices={showVertices}
              vertexColor={inherit(vertexColor)}
              vertexSize={vertexSize}
              vertexGlow={vertexGlow}
              depthColor={depthColor}
              depthTint={depthTint}
              depthFade={depthFade}
              brightness={brightness}
              opacity={opacity}
              adaptiveQuality={adaptiveQuality}
              targetFps={targetFps}
              paused={paused}
              readDrift={readDrift}
            />
          </Canvas>
        ) : null}
      </div>
      {children ? (
        <div className="relative z-10 h-full w-full">{children}</div>
      ) : null}
    </div>
  );
};

export default WireframeBall;
