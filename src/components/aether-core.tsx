"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

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
uniform float uTime;
uniform float uMotion;

const float TAU = 6.28318530718;
const float PI = 3.14159265359;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.52;
  mat3 drift = mat3(
    0.80, 0.60, 0.00,
   -0.48, 0.64, 0.60,
    0.36,-0.48, 0.80
  );
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise3(p);
    p = drift * p * 1.92 + vec3(0.17, -0.11, 0.09);
    amplitude *= 0.5;
  }
  return value;
}

mat2 rot(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

vec2 mirrorFold(vec2 point, float segments) {
  float angle = atan(point.y, point.x);
  float normalized = ((angle / PI) + 1.0) * 0.5;
  normalized = mod(normalized, 1.0 / segments) * segments;
  normalized = -abs(2.0 * normalized - 1.0) + 1.0;
  float radius = length(point);
  return vec2(normalized * radius, radius);
}

float specterRim(vec3 normal, vec3 viewRay, vec3 axis) {
  float lean = sqrt(max(dot(normal, axis), 0.0)) * 1.5
    - dot(normal, -viewRay);
  return pow(max(lean, 0.0), 3.0);
}

float smoother(float value) {
  value = clamp(value, 0.0, 1.0);
  return value * value * (3.0 - 2.0 * value);
}

vec3 cleanPalette(float value) {
  float scaled = fract(value) * 6.0;
  float blend = smoother(fract(scaled));
  vec3 mint = vec3(0.28, 0.96, 0.78);
  vec3 sky = vec3(0.24, 0.70, 1.00);
  vec3 lavender = vec3(0.61, 0.43, 1.00);
  vec3 rose = vec3(1.00, 0.53, 0.64);
  vec3 peach = vec3(1.00, 0.69, 0.37);
  vec3 lime = vec3(0.74, 0.94, 0.40);

  if (scaled < 1.0) return mix(mint, sky, blend);
  if (scaled < 2.0) return mix(sky, lavender, blend);
  if (scaled < 3.0) return mix(lavender, rose, blend);
  if (scaled < 4.0) return mix(rose, peach, blend);
  if (scaled < 5.0) return mix(peach, lime, blend);
  return mix(lime, mint, blend);
}

vec3 softClip(vec3 color) {
  vec3 falloff = exp(-2.0 * max(color, 0.0));
  return (1.0 - falloff) / (1.0 + falloff);
}

float auraRidges(vec3 point) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 3; i++) {
    vec3 folded = cos(point);
    sum += weight * abs(folded.x + folded.y + folded.z) * 0.3333;
    point = point * 1.87 + vec3(1.7, -2.3, 0.9);
    weight *= 0.55;
  }
  return sum;
}

float shapeShell(vec3 point, float time) {
  vec3 samplePoint = point + vec3(0.0, 0.0, time * 0.32);
  float shell = 0.0;
  float amplitude = 1.0;

  for (int i = 0; i < 3; i++) {
    shell += noise3(samplePoint) * amplitude;
    samplePoint *= 2.0;
    amplitude *= 0.5;
  }
  return shell / 1.75;
}

float orbField(vec3 point, float time) {
  return length(point) - 0.35 - shapeShell(point, time) * 0.38;
}

vec3 orbNormal(vec3 point, float time) {
  const float epsilon = 0.0032;
  float center = orbField(point, time);
  return normalize(vec3(
    center - orbField(point - vec3(epsilon, 0.0, 0.0), time),
    center - orbField(point - vec3(0.0, epsilon, 0.0), time),
    center - orbField(point - vec3(0.0, 0.0, epsilon), time)
  ));
}

void main() {
  vec2 frag = vUv * 2.0 - 1.0;
  frag.x *= uResolution.x / max(uResolution.y, 1.0);

  float t = uTime * uMotion;
  vec2 pointer = (uPointer - 0.5) * vec2(0.38, -0.30);
  vec2 p = frag - pointer * 0.13;

  vec3 backdrop = vec3(0.004, 0.007, 0.017);
  float vignette = smoothstep(1.55, 0.12, length(frag));
  backdrop += vec3(0.014, 0.020, 0.046) * vignette;

  vec2 starGrid = floor((frag + 2.0) * 92.0);
  vec2 starCell = fract((frag + 2.0) * 92.0) - 0.5;
  float starSeed = hash21(starGrid);
  float star = smoothstep(0.040, 0.0, length(starCell)) * step(0.988, starSeed);
  backdrop += star * cleanPalette(starSeed) * 0.32;

  float angle = atan(p.y, p.x);
  vec2 circleDir = vec2(cos(angle), sin(angle));
  vec3 eye = vec3(0.0, 0.0, -1.65);
  vec3 ray = normalize(vec3(p, 1.55));
  float boundRadius = 0.74;
  float towardCenter = dot(eye, ray);
  float root = towardCenter * towardCenter
    - (dot(eye, eye) - boundRadius * boundRadius);
  float nearestField = 1.0;
  float travel = 0.0;
  float travelLimit = 0.0;
  float fieldDistance = 1.0;
  bool struck = false;
  vec3 landed = vec3(0.0, 0.0, -0.565);

  if (root > 0.0) {
    float reach = sqrt(root);
    travel = max(-towardCenter - reach, 0.0);
    travelLimit = -towardCenter + reach;

    for (int i = 0; i < 52; i++) {
      vec3 point = eye + ray * travel;
      fieldDistance = orbField(point, t);
      nearestField = min(nearestField, max(fieldDistance, 0.0));
      if (fieldDistance < 0.0024) {
        struck = true;
        landed = point;
        break;
      }
      travel += max(fieldDistance * 0.76, 0.0026);
      if (travel > travelLimit) break;
    }
  }

  float body = struck ? 1.0 : 0.0;
  vec3 geometricNormal = orbNormal(landed, t);
  vec3 sampleNormal = geometricNormal;

  float rollX = sin(t / 3.14) * 0.54 + pointer.y * 0.30;
  float rollY = sin(t / 1.28) * 0.43 + pointer.x * 0.36;
  float rollZ = sin(t / 5.12) * 0.34;
  sampleNormal.yz *= rot(rollX);
  sampleNormal.xz *= rot(rollY);
  sampleNormal.xy *= rot(rollZ);

  vec3 slowFlow = vec3(t * 0.085, -t * 0.060, t * 0.044);
  float warpX = fbm(sampleNormal * 1.42 + slowFlow + 11.7);
  float warpY = fbm(sampleNormal.yzx * 1.54 - slowFlow * 0.72 + 37.2);
  vec3 flowNormal = normalize(
    sampleNormal + vec3(warpX - 0.5, warpY - 0.5, warpX - warpY) * 0.46
  );

  float broadFlow = fbm(flowNormal * 1.88 + slowFlow * 1.20);
  float innerFlow = fbm(flowNormal.zxy * 2.55 - slowFlow * 0.84 + 5.4);

  vec3 swirlPoint = flowNormal * 1.24;
  float swirl = 0.0;
  float swirlWeight = 0.54;
  float swirlNorm = 0.0;
  for (int i = 0; i < 4; i++) {
    float layer = float(i) + 1.0;
    swirlPoint.xy *= rot(swirlPoint.z * 0.82 + t * 0.24 / layer);
    swirlPoint.xz *= rot(swirlPoint.y * 0.58 - t * 0.17 / layer);
    float ribbon = 0.5 + 0.5 * sin(
      swirlPoint.x * 2.05 + swirlPoint.y * 1.62 + swirlPoint.z * 1.36
    );
    swirl += ribbon * swirlWeight;
    swirlNorm += swirlWeight;
    swirlPoint = swirlPoint * 1.27 + vec3(0.19, -0.14, 0.11);
    swirlWeight *= 0.56;
  }
  swirl /= max(swirlNorm, 0.001);

  float spatialPhase = dot(
    flowNormal,
    normalize(vec3(0.67, 0.49, 0.56))
  ) * 0.5 + 0.5;
  float colorPhase = fract(
    0.06
    + spatialPhase * 0.58
    + broadFlow * 0.50
    + swirl * 0.19
    + t * 0.027
  );
  vec3 spectrum = cleanPalette(colorPhase);
  vec3 adjacent = cleanPalette(colorPhase + 0.115);

  vec3 viewDirection = vec3(0.0, 0.0, -1.0);
  vec3 keyLight = normalize(vec3(
    -0.48 + sin(t * 0.19) * 0.20,
    0.72 + cos(t * 0.16) * 0.12,
    -0.86
  ));
  vec3 fillLight = normalize(vec3(
    0.72 + cos(t * 0.14) * 0.15,
    -0.30 + sin(t * 0.18) * 0.16,
    -0.48
  ));
  float diffuse = max(dot(geometricNormal, keyLight), 0.0);
  float fill = max(dot(geometricNormal, fillLight), 0.0);
  float fresnel = pow(1.0 - max(dot(geometricNormal, viewDirection), 0.0), 2.15);
  float specular = pow(
    max(dot(reflect(-keyLight, geometricNormal), viewDirection), 0.0),
    42.0
  );
  vec3 halfLight = normalize(keyLight + viewDirection);
  float broadSheen = pow(
    max(dot(geometricNormal, halfLight), 0.0),
    7.0
  );

  float ribbonMask = smoothstep(0.48, 0.78, swirl);
  float internalPulse = 0.88 + 0.12 * sin(t * 1.05 + innerFlow * TAU);
  float auraBreath = 1.0 + 0.075 * sin(t * 0.52);
  float wrappedKey = pow(0.5 + 0.5 * dot(geometricNormal, keyLight), 0.72);
  float wrappedFill = pow(0.5 + 0.5 * dot(geometricNormal, fillLight), 0.88);
  vec3 orb = spectrum * (0.30 + wrappedKey * 0.54 + diffuse * 0.16);
  orb += adjacent * wrappedFill * 0.16;
  orb = mix(orb, adjacent * 0.96, ribbonMask * 0.46);
  orb += cleanPalette(colorPhase + 0.22) * innerFlow * 0.24 * internalPulse;
  orb += cleanPalette(colorPhase + 0.34) * pow(swirl, 2.0) * 0.15;
  float shellLightA = auraRidges(
    sampleNormal * 3.15 + vec3(t * 0.11, -t * 0.08, t * 0.07)
  );
  float shellLightB = auraRidges(
    sampleNormal.yzx * 3.75 + vec3(-t * 0.07, t * 0.10, -t * 0.06) + 4.2
  );
  float shellCells = smoother(clamp(
    shellLightA * 0.72 + shellLightB * 0.38 - 0.18,
    0.0,
    1.0
  ));
  float shellCaustic = min(
    exp(-abs(shellLightA - 0.46) * 15.0) * 0.72
      + exp(-abs(shellLightB - 0.43) * 17.0) * 0.52,
    1.0
  );
  orb *= 0.72 + shellCells * 0.42;
  orb += mix(spectrum, vec3(0.88, 0.98, 1.0), 0.76)
    * shellCells * shellCells * 0.27;
  orb += mix(adjacent, vec3(0.90, 0.98, 1.0), 0.82)
    * shellCaustic * 0.16;
  vec3 rimAxis = normalize(vec3(0.707 + pointer.x, 0.707 + pointer.y, 0.0));
  orb += cleanPalette(colorPhase + 0.12)
    * specterRim(geometricNormal, ray, rimAxis) * 0.26;
  orb += cleanPalette(colorPhase + 0.58)
    * specterRim(geometricNormal, ray, -rimAxis) * 0.22;
  orb += vec3(0.94, 1.00, 0.98) * specular * 0.62;
  orb += mix(vec3(0.94, 1.00, 0.98), adjacent, 0.58) * broadSheen * 0.20;
  orb += mix(spectrum, vec3(0.92, 1.00, 0.98), 0.48) * fresnel * 0.56;

  float innerLens = exp(-dot(p, p) * 4.2) * (0.50 + innerFlow * 0.50);
  orb += adjacent * innerLens * 0.21 * internalPulse;
  orb = softClip(orb * 1.44 * auraBreath);
  float orbLuma = dot(orb, vec3(0.2126, 0.7152, 0.0722));
  orb = max(mix(vec3(orbLuma), orb, 1.20), 0.0);

  float outerDistance = nearestField;
  vec2 auraDirection = rot(t * 0.075) * circleDir;
  float ridge = auraRidges(vec3(auraDirection * 1.82, t * 0.12));
  float shellHull = outerDistance * 1.75 + 0.038 + ridge * 0.016;
  float inverseGlow = min(0.0085 / shellHull, 0.20);
  float closeGlow = exp(-outerDistance * 45.0) * 0.165;
  float wideGlow = exp(-outerDistance * 16.0) * 0.030;
  float glowTexture = mix(0.82, 1.10, smoother(ridge));
  float auraEnergy = (inverseGlow + closeGlow + wideGlow)
    * glowTexture * auraBreath * (1.0 - body);
  vec3 auraColorA = mix(
    cleanPalette(fract(colorPhase + 0.08)),
    vec3(0.66, 0.90, 1.0),
    0.58
  );
  vec3 auraColorB = mix(
    cleanPalette(fract(colorPhase + 0.22)),
    vec3(0.94, 0.98, 1.0),
    0.66
  );
  vec3 auraColor = mix(auraColorA, auraColorB, smoother(ridge));
  float auraMask = smoothstep(0.94, 0.34, length(p));

  vec2 pointerField = (uPointer - 0.5)
    * vec2(2.0 * uResolution.x / max(uResolution.y, 1.0), -2.0);
  float pointerActivation = smoothstep(0.035, 0.30, length(pointerField));
  vec2 foldedGravity = p * mirrorFold(rot(t * 0.035) * p, 3.0) * 1.45;
  vec2 gravityPlane = mix(p, foldedGravity, 0.18);
  vec2 pointerPull = pointerField - gravityPlane;
  float gravityInfluence = exp(-length(pointerPull) * 2.4)
    * pointerActivation;
  gravityPlane += normalize(pointerPull + vec2(0.001))
    * gravityInfluence * 0.085;

  vec3 gravityAccent = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float index = float(i);
    float orbitTime = t * (0.38 + index * 0.012)
      + index * TAU / 7.0
      + sin(t * 0.17 + index) * 0.22;
    float orbitRadius = 0.65 + sin(t * 0.23 + index * 1.71) * 0.075;
    vec2 particle = rot(-0.28 + index * 0.09)
      * vec2(cos(orbitTime), sin(orbitTime) * (0.61 + index * 0.025))
      * orbitRadius;
    float particleDistance = length(gravityPlane - particle);
    float spark = exp(-particleDistance * particleDistance * 3200.0);
    float softTrail = exp(-particleDistance * particleDistance * 650.0) * 0.040;
    vec3 particleColor = mix(
      cleanPalette(fract(colorPhase + index * 0.115)),
      vec3(0.88, 0.97, 1.0),
      0.62
    );
    gravityAccent += particleColor * (spark * 0.34 + softTrail);
  }

  vec2 filamentSpace = rot(0.34 + sin(t * 0.13) * 0.11) * gravityPlane;
  float filamentCurve = filamentSpace.y
    - 0.56
    - sin(filamentSpace.x * 4.2 - t * 0.62) * 0.065;
  float filamentWindow = smoothstep(0.78, 0.24, abs(filamentSpace.x))
    * (0.24 + 0.76 * pow(
      0.5 + 0.5 * sin(filamentSpace.x * 5.0 + t * 0.41),
      5.0
    ));
  float filament = exp(-abs(filamentCurve) * 175.0)
    * filamentWindow * 0.110;
  gravityAccent += mix(
    cleanPalette(fract(colorPhase + 0.27)),
    vec3(0.80, 0.95, 1.0),
    0.70
  ) * filament;
  float gravityZone = smoothstep(0.42, 0.54, length(p))
    * smoothstep(0.98, 0.82, length(p));
  gravityAccent *= gravityZone;

  vec3 color = backdrop;
  color += auraColor * auraEnergy * auraMask;
  color += vec3(0.82, 0.96, 1.0)
    * exp(-outerDistance * 58.0)
    * (1.0 - body) * 0.110;
  color += gravityAccent * (1.0 - body * 0.88);
  color = mix(color, orb, body);
  color += gravityAccent * body * 0.055;

  float grain = hash21(gl_FragCoord.xy + floor(t * 18.0)) - 0.5;
  color += grain * 0.012 * (0.25 + body * 0.75);
  color *= smoothstep(1.58, 0.28, length(frag)) * 0.42 + 0.58;
  color = pow(max(color, 0.0), vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
`;

type PointerState = {
  current: THREE.Vector2;
  target: THREE.Vector2;
};

function AetherScene({
  pointer,
  paused,
}: {
  pointer: RefObject<PointerState>;
  paused: boolean;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const elapsed = useRef(0);
  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uMotion: { value: paused ? 0 : 1 },
    }),
    [paused],
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    if (!paused) elapsed.current += Math.min(delta, 0.05);
    pointer.current.current.lerp(pointer.current.target, 0.065);
    material.uniforms.uTime.value = elapsed.current;
    material.uniforms.uMotion.value = paused ? 0 : 1;
    material.uniforms.uPointer.value.copy(pointer.current.current);
    material.uniforms.uResolution.value.set(
      gl.domElement.width,
      gl.domElement.height,
    );
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

export type AetherCoreProps = {
  className?: string;
  paused?: boolean;
};

export default function AetherCore({
  className,
  paused = false,
}: AetherCoreProps) {
  const pointer = useRef<PointerState>({
    current: new THREE.Vector2(0.5, 0.5),
    target: new THREE.Vector2(0.5, 0.5),
  });

  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current.target.set(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      onPointerMove={updatePointer}
      onPointerLeave={() => pointer.current.target.set(0.5, 0.5)}
      role="img"
      aria-label="Aether Core, an interactive prismatic fluid orb with a softly layered aura and subtle gravitational trails"
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], left: -1, right: 1, top: 1, bottom: -1 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <AetherScene pointer={pointer} paused={paused} />
      </Canvas>
    </div>
  );
}
