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
uniform vec2 uClick;
uniform float uTime;
uniform float uMotion;
uniform float uClickPulse;

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

float smoothUnion(float a, float b, float radius) {
  float safeRadius = max(radius, 0.0001);
  float blend = clamp(
    0.5 + 0.5 * (b - a) / safeRadius,
    0.0,
    1.0
  );
  return mix(b, a, blend) - safeRadius * blend * (1.0 - blend);
}

float capsuleField(vec3 point, vec3 start, vec3 end, float radius) {
  vec3 segment = end - start;
  float along = clamp(
    dot(point - start, segment) / max(dot(segment, segment), 0.0001),
    0.0,
    1.0
  );
  return length(point - (start + segment * along)) - radius;
}

float taperedCapsuleField(
  vec3 point,
  vec3 start,
  vec3 end,
  float startRadius,
  float endRadius
) {
  vec3 segment = end - start;
  float along = clamp(
    dot(point - start, segment) / max(dot(segment, segment), 0.0001),
    0.0,
    1.0
  );
  float localRadius = mix(startRadius, endRadius, smoother(along));
  return length(point - (start + segment * along)) - localRadius;
}

vec3 fieldGravityAxis(float time) {
  vec2 pointerVector = (uPointer - 0.5) * vec2(
    2.0 * uResolution.x / max(uResolution.y, 1.0),
    -2.0
  );
  float pointerActive = smoothstep(0.045, 0.22, length(pointerVector));
  vec3 autonomousAxis = normalize(vec3(
    sin(time * 0.29 + 0.6),
    cos(time * 0.24 - 0.4),
    0.58 + sin(time * 0.17) * 0.18
  ));
  vec3 pointerAxis = normalize(vec3(pointerVector * 0.92, 0.44));
  return normalize(mix(
    autonomousAxis,
    pointerAxis,
    smoother(pointerActive) * 0.90
  ));
}

float emissionSource3D(vec3 direction, vec3 axis, float time) {
  direction = normalize(direction + vec3(0.0001));
  axis = normalize(axis + vec3(0.0001));
  vec3 reference = abs(axis.z) < 0.88
    ? vec3(0.0, 0.0, 1.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(reference, axis));
  vec3 bitangent = normalize(cross(axis, tangent));
  float facing = smoother(max(dot(direction, axis), 0.0));
  float u = dot(direction, tangent);
  float v = dot(direction, bitangent);
  float broadFold = 0.5 + 0.5 * sin(
    u * 4.8 + v * 2.9 - time * 0.42
  );
  float sourceNoise = noise3(
    direction * 2.65 + axis * 1.4 + vec3(0.0, 0.0, time * 0.14)
  );
  float sourceMass = smoother(clamp(
    broadFold * 0.34 + sourceNoise * 0.86 - 0.35,
    0.0,
    1.0
  ));
  // Keep the source broad and coherent. Fine noise modulates one energy lobe;
  // it must not fragment the surface into unrelated sparkling islands.
  return pow(facing, 1.20) * (0.48 + sourceMass * 0.52);
}

vec3 fluidParticleState(
  float index,
  float time,
  vec3 gravityAxis,
  out vec3 direction,
  out vec3 tangent,
  out float life,
  out float source,
  out float liquidRadius,
  out float attachment
) {
  float count = 5.0;
  life = fract(time * 0.082 + index / count);
  float pull = smoother(clamp(life / 0.76, 0.0, 1.0));
  float gravityAngle = atan(gravityAxis.y, gravityAxis.x);
  float offset = (index - 2.0) * 0.205
    + sin(index * 1.73 + time * 0.14) * 0.052;
  float particleAngle = gravityAngle + offset;
  direction = normalize(vec3(
    cos(particleAngle),
    sin(particleAngle),
    -0.11 + sin(index * 1.31 + time * 0.16) * 0.075
  ));
  tangent = normalize(vec3(
    -direction.y,
    direction.x,
    0.055 * cos(index * 1.17)
  ));
  float rawSource = emissionSource3D(direction, gravityAxis, time);
  source = smoother(clamp((rawSource - 0.14) / 0.48, 0.0, 1.0));
  float liquidSurvival = 1.0 - smoother(clamp(
    (life - 0.58) / 0.27,
    0.0,
    1.0
  ));
  liquidRadius = mix(0.054, 0.021, pull)
    * mix(0.16, 1.0, liquidSurvival);
  attachment = (1.0 - smoother(clamp(
    (life - 0.40) / 0.30,
    0.0,
    1.0
  ))) * source;
  float reach = mix(0.442, 0.680, pull);
  return direction * reach
    + tangent * sin(life * PI) * 0.052;
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
  vec3 samplePoint = point;
  samplePoint.xy *= rot(time * 0.105);
  samplePoint.yz *= rot(-time * 0.071);
  samplePoint += vec3(
    sin(time * 0.37) * 0.16,
    cos(time * 0.29) * 0.13,
    time * 0.27
  );
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
  vec3 direction = normalize(point + vec3(0.0001));
  float shell = shapeShell(point, time);
  vec3 gravityAxis3D = fieldGravityAxis(time);
  float gravityFacing3D = dot(direction, gravityAxis3D);

  // A travelling, asymmetric pulse gives the body a living cadence instead
  // of simply rotating a fixed noise volume.
  vec3 lifeAxis = normalize(vec3(
    sin(time * 0.41),
    cos(time * 0.37),
    sin(time * 0.29 + 1.4)
  ));
  float migratingLobe = pow(max(dot(direction, lifeAxis), 0.0), 4.0);
  float travellingPulse = sin(
    dot(direction, lifeAxis.yzx) * 4.1
      + dot(direction, lifeAxis.zxy) * 1.8
      + time * 0.92 + shell * 1.8
  );
  float breath = sin(time * 0.67) * 0.006
    + sin(time * 1.31 + 1.8) * 0.0025;

  // Black Hole's three-way mirror fold now changes the actual skin. Its
  // amplitude stays small, so it reads as refractive torsion rather than a
  // decorative star shape.
  float gravityAngle3D = atan(gravityAxis3D.y, gravityAxis3D.x);
  vec2 kaleidoDirection = rot(
    -gravityAngle3D + time * 0.042
  ) * direction.xy;
  float triFold = kaleidoDirection.x * (
    kaleidoDirection.x * kaleidoDirection.x
    - 3.0 * kaleidoDirection.y * kaleidoDirection.y
  );
  float kaleido = noise3(vec3(
    abs(kaleidoDirection) * 4.6,
    point.z * 2.1 + time * 0.21
  ));
  float silhouetteWeight = pow(clamp(
    length(point.xy) / max(length(point), 0.001),
    0.0,
    1.0
  ), 1.7);
  float surfaceReach = 0.46 + silhouetteWeight * 0.54;
  float kaleidoTorsion = triFold
    * (0.010 + (kaleido - 0.5) * 0.016)
    * surfaceReach;
  float gravityCrest = pow(smoother(clamp(
    kaleido * 1.34 - 0.34,
    0.0,
    1.0
  )), 2.0) * pow(max(gravityFacing3D, 0.0), 2.2);

  // The pointer becomes a three-dimensional gravity axis. The near hemisphere,
  // rear hemisphere and silhouette all share the same radial displacement, so
  // geometry, normals and highlights remain one coherent surface.
  vec2 pointerVector = (uPointer - 0.5) * vec2(
    2.0 * uResolution.x / max(uResolution.y, 1.0),
    -2.0
  );
  float pointerActive = smoothstep(0.045, 0.22, length(pointerVector));
  float gravityLobe = pow(max(gravityFacing3D, 0.0), 3.2)
    * pointerActive;
  float counterPressure = pow(max(-gravityFacing3D, 0.0), 3.0)
    * pointerActive;
  float gravityRipple = sin(
    dot(direction, gravityAxis3D.yzx) * 4.6
      + dot(direction, gravityAxis3D.zxy) * 2.2
      - time * 1.02
  ) * (0.34 + gravityLobe * 0.66) * 0.006;
  float gravityShear = sin(
    dot(direction, gravityAxis3D.yzx) * 5.2
      - time * 0.83 + shell * 2.4
  ) * pointerActive * 0.0045;
  float emissionSource = emissionSource3D(direction, gravityAxis3D, time);
  float emissionCycle = smoother(
    0.5 + 0.5 * sin(
      time * 0.44 - gravityFacing3D * 2.7 + shell * 1.35
    )
  );
  float emissionDrain = emissionSource * emissionCycle;
  float emissionPressure = emissionSource * (1.0 - emissionCycle);

  vec2 clickVector = (uClick - 0.5) * vec2(
    2.0 * uResolution.x / max(uResolution.y, 1.0),
    -2.0
  );
  vec2 clickDirection = normalize(clickVector + vec2(0.0001));
  vec3 clickAxis3D = normalize(vec3(clickDirection * 0.90, 0.58));
  float clickFacing = pow(max(dot(direction, clickAxis3D), 0.0), 4.5);
  float clickAge = 1.0 - uClickPulse;
  float clickRebound = sin(clickAge * TAU * 1.55)
    * uClickPulse;
  float centerPress = exp(-length(clickVector) * 4.0)
    * clickRebound;

  // Keep the average silhouette nearly unchanged while moving most of the
  // animation into local lobes instead of scaling the whole body in and out.
  float radius = 0.430 + (shell - 0.5) * 0.098;
  radius += breath * 0.72;
  radius += migratingLobe
    * (0.017 + travellingPulse * 0.007 * surfaceReach);
  radius += travellingPulse * 0.0090 * surfaceReach;
  radius += kaleidoTorsion;
  radius += gravityCrest
    * (0.006 + pointerActive * 0.014) * surfaceReach;
  radius += emissionPressure
    * (0.007 + pointerActive * 0.009) * surfaceReach;
  // AI Blob-style adhesion: emitted mass first stretches the actual 3D shell
  // into a lobe. Color can still drain from it, but geometry stays connected
  // to the external metaball bridge instead of opening an unrelated dent.
  radius += emissionDrain
    * (0.018 + pointerActive * 0.018) * surfaceReach;
  radius += (
    gravityLobe * 0.018
    - counterPressure * 0.010
    + gravityRipple
    + gravityShear
  );
  radius += clickFacing * clickRebound * 0.024;
  radius += centerPress * 0.008;

  float field = length(point) - radius;

  // Near Black Hole particles are not a second render layer. They are part of
  // the same 3D liquid SDF as the sphere, smoothly unioned through a neck that
  // thins with particle age. Once the neck reaches zero, the same field leaves
  // a detached droplet with identical normals and material response.
  for (int i = 0; i < 5; i++) {
    float index = float(i);
    vec3 particleDirection;
    vec3 particleTangent;
    float particleLife;
    float sourceVisibility;
    float particleRadius;
    float attached;
    vec3 particleCenter = fluidParticleState(
      index,
      time,
      gravityAxis3D,
      particleDirection,
      particleTangent,
      particleLife,
      sourceVisibility,
      particleRadius,
      attached
    );
    float droplet = length(point - particleCenter) - particleRadius;
    float gasPhase = smoother(clamp(
      (particleLife - 0.54) / 0.34,
      0.0,
      1.0
    ));
    droplet += (1.0 - sourceVisibility) * 0.34 + gasPhase * 0.24;

    vec3 edgeAnchor = particleDirection * (radius * 0.92);
    float rootRadius = mix(0.060, 0.008, smoother(particleLife))
      * attached;
    vec3 neckTip = particleCenter
      - particleDirection * particleRadius * 0.28;
    vec3 neckMid = mix(edgeAnchor, neckTip, 0.54)
      + particleTangent
        * sin(particleLife * PI + index * 0.71)
        * 0.055 * attached;
    float neckA = taperedCapsuleField(
      point,
      edgeAnchor,
      neckMid,
      rootRadius,
      rootRadius * 0.46
    );
    float neckB = taperedCapsuleField(
      point,
      neckMid,
      neckTip,
      rootRadius * 0.46,
      min(rootRadius * 0.82, particleRadius * 0.76)
    );
    float neck = smoothUnion(
      neckA,
      neckB,
      0.020 * attached * sourceVisibility
    );
    neck += (1.0 - sourceVisibility) * 0.34;
    field = smoothUnion(
      field,
      neck,
      0.034 * attached * sourceVisibility
    );
    field = smoothUnion(
      field,
      droplet,
      0.024 * sourceVisibility
    );
  }

  return field;
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
  vec2 pointerField = (uPointer - 0.5)
    * vec2(2.0 * uResolution.x / max(uResolution.y, 1.0), -2.0);
  float pointerActivation = smoothstep(0.045, 0.22, length(pointerField));
  vec2 clickField = (uClick - 0.5)
    * vec2(2.0 * uResolution.x / max(uResolution.y, 1.0), -2.0);
  float clickActivation = uClickPulse
    * smoothstep(0.035, 0.18, length(clickField));

  vec3 backdrop = vec3(0.004, 0.007, 0.017);
  float vignette = 1.0 - smoothstep(0.12, 1.55, length(frag));
  backdrop += vec3(0.014, 0.020, 0.046) * vignette;

  vec2 starGrid = floor((frag + 2.0) * 92.0);
  vec2 starCell = fract((frag + 2.0) * 92.0) - 0.5;
  float starSeed = hash21(starGrid);
  float star = (1.0 - smoothstep(0.0, 0.040, length(starCell)))
    * step(0.988, starSeed);
  backdrop += star * cleanPalette(starSeed) * 0.32;

  float angle = atan(p.y, p.x);
  vec2 circleDir = vec2(cos(angle), sin(angle));
  vec3 eye = vec3(0.0, 0.0, -1.65);
  vec3 ray = normalize(vec3(p, 1.55));
  float boundRadius = 0.86;
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

    for (int i = 0; i < 48; i++) {
      vec3 point = eye + ray * travel;
      fieldDistance = orbField(point, t);
      nearestField = min(nearestField, max(fieldDistance, 0.0));
      if (fieldDistance < 0.0018) {
        struck = true;
        landed = point;
        break;
      }
      travel += max(fieldDistance * 0.74, 0.0021);
      if (travel > travelLimit) break;
    }
  }

  float body = struck ? 1.0 : 0.0;
  vec3 geometricNormal = orbNormal(landed, t);
  vec3 sampleNormal = geometricNormal;
  float pixelFootprint = 2.0 / max(uResolution.y, 1.0);
  float grazing = struck
    ? abs(dot(geometricNormal, ray))
    : 0.0;
  float hitCoverage = body * smoothstep(0.010, 0.052, grazing);
  float missCoverage = (1.0 - body) * (
    1.0 - smoothstep(
      pixelFootprint * 0.30,
      pixelFootprint * 1.65 + 0.0004,
      nearestField
    )
  );

  // A continuously advancing roll avoids the old pendulum-like colour motion.
  // The small sine terms only vary the pace; their derivatives never reverse it.
  float rollX = t * 0.075 + sin(t * 0.21) * 0.16 + pointer.y * 0.30;
  float rollY = t * 0.094 + sin(t * 0.17) * 0.14 + pointer.x * 0.36;
  float rollZ = t * 0.051 + sin(t * 0.13) * 0.12;
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

  // AI Blob-inspired interior: rotate the sampling sphere on three uneven
  // rhythms, then use two broad noise fields to bend a third. Keeping the
  // frequencies low makes the result read as a few liquid masses instead of
  // scattered texture.
  vec3 aiSample = sampleNormal;
  aiSample.yz *= rot(t * 0.061 + sin(t * 0.17) * 0.11);
  aiSample.xz *= rot(t * 0.078 + sin(t * 0.14 + 1.7) * 0.10);
  aiSample.xy *= rot(t * 0.043 + sin(t * 0.11 + 3.1) * 0.09);
  vec3 aiDrift = vec3(t * 0.095, -t * 0.068, t * 0.052);
  float aiWarpX = fbm(aiSample * 1.12 + aiDrift + 25.69);
  float aiWarpY = fbm(aiSample.yzx * 1.18 - aiDrift * 0.74 + 86.31);
  vec3 aiDomain = aiSample + vec3(
    aiWarpX - 0.5,
    aiWarpY - 0.5,
    aiWarpX - aiWarpY
  ) * 0.68;
  float aiCloud = fbm(aiDomain * 1.34 + aiDrift * 0.72 + 13.7);
  float aiCloudPair = fbm(aiDomain.zxy * 1.47 - aiDrift * 0.58 + 42.3);
  float aiMass = smoother(clamp(
    aiCloud * 0.78 + aiCloudPair * 0.36 - 0.12,
    0.0,
    1.0
  ));
  float aiFold = smoother(1.0 - abs(aiCloud - aiCloudPair) * 2.35);

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
  vec3 gravityAxis3D = fieldGravityAxis(t);
  vec3 landedDirection = normalize(landed + vec3(0.0001));
  float surfaceEmission = hitCoverage
    * emissionSource3D(landedDirection, gravityAxis3D, t);
  float surfaceEmissionCycle = smoother(
    0.5 + 0.5 * sin(
      t * 0.44 - dot(landedDirection, gravityAxis3D) * 2.7
        + broadFlow * 1.35
    )
  );
  float surfaceLoss = surfaceEmission * surfaceEmissionCycle;

  float spatialPhase = dot(
    flowNormal,
    normalize(vec3(0.67, 0.49, 0.56))
  ) * 0.5 + 0.5;
  float colorPhase = fract(
    0.06
    + spatialPhase * 0.68
    + broadFlow * 0.18
    + swirl * 0.10
    + dot(flowNormal, gravityAxis3D) * 0.055
    + t * 0.035
  );
  vec3 spectrum = cleanPalette(colorPhase);
  vec3 adjacent = cleanPalette(colorPhase + 0.115);

  vec3 viewDirection = normalize(-ray);
  vec3 gravityLight = normalize(vec3(
    gravityAxis3D.xy,
    -abs(gravityAxis3D.z)
  ));
  vec3 animatedKeyLight = normalize(vec3(
    -0.48 + sin(t * 0.19) * 0.20,
    0.72 + cos(t * 0.16) * 0.12,
    -0.86
  ));
  vec3 animatedFillLight = normalize(vec3(
    0.72 + cos(t * 0.14) * 0.15,
    -0.30 + sin(t * 0.18) * 0.16,
    -0.48
  ));
  vec3 keyLight = normalize(mix(
    animatedKeyLight,
    gravityLight,
    0.18 + pointerActivation * 0.30
  ));
  vec3 fillLight = normalize(mix(
    animatedFillLight,
    -gravityLight,
    0.10 + pointerActivation * 0.14
  ));
  float keyFacing = dot(geometricNormal, keyLight);
  float fillFacing = dot(geometricNormal, fillLight);
  float diffuse = smoother((keyFacing + 0.08) / 1.08);
  float fill = smoother((fillFacing + 0.04) / 1.04);
  float viewFacing = max(dot(geometricNormal, viewDirection), 0.0);
  float volumeDepth = pow(viewFacing, 0.48);
  float fresnel = pow(1.0 - viewFacing, 2.35);
  float transmitted = pow(max(dot(-geometricNormal, keyLight), 0.0), 1.45)
    * pow(1.0 - viewFacing, 0.42);
  float specular = pow(
    max(dot(reflect(-keyLight, geometricNormal), viewDirection), 0.0),
    52.0
  ) * smoothstep(0.18, 0.82, diffuse);
  vec3 halfLight = normalize(keyLight + viewDirection);
  float broadSheen = pow(
    max(dot(geometricNormal, halfLight), 0.0),
    10.0
  ) * smoothstep(0.12, 0.72, diffuse);
  float gravitySheen = pow(
    0.5 + 0.5 * dot(geometricNormal, gravityLight),
    2.6
  );

  float ribbonMask = smoothstep(0.48, 0.78, swirl);
  float internalPulse = 0.88 + 0.12 * sin(t * 1.05 + innerFlow * TAU);
  float auraBreath = 1.0 + 0.035 * sin(t * 0.42);
  float wrappedKey = pow(0.5 + 0.5 * keyFacing, 0.86);
  float wrappedFill = pow(0.5 + 0.5 * fillFacing, 0.96);
  vec3 deepLiquid = mix(
    spectrum * vec3(0.30, 0.39, 0.58),
    adjacent * vec3(0.40, 0.31, 0.52),
    innerFlow
  );
  vec3 orb = deepLiquid * (0.34 + volumeDepth * 0.16);
  orb += spectrum * (wrappedKey * 0.38 + diffuse * 0.24);
  orb += adjacent * wrappedFill * 0.085;
  orb = mix(orb, adjacent * 0.96, ribbonMask * 0.46);
  orb += cleanPalette(colorPhase + 0.22) * innerFlow * 0.24 * internalPulse;
  orb += cleanPalette(colorPhase + 0.34) * pow(swirl, 2.0) * 0.15;

  // Let the broad AI-like masses sit beneath the glossy Aura shell. Their
  // hue follows the existing full-spectrum cycle, so the new motion adds
  // depth without introducing a second, unrelated palette.
  float aiAngular = atan(aiSample.y, aiSample.x) / TAU + 0.5;
  float aiColorPhase = fract(
    colorPhase * 0.72 + aiAngular * 0.16 + aiCloud * 0.06 + t * 0.012
  );
  vec3 aiColor = cleanPalette(aiColorPhase);
  vec3 aiColorPair = cleanPalette(aiColorPhase + 0.16);
  float aiPulse = 0.90 + 0.10 * sin(t * 0.92 + aiCloudPair * TAU);
  orb = mix(
    orb,
    orb * (0.86 + aiMass * 0.22) + aiColor * (0.20 + aiMass * 0.26),
    0.24
  );
  orb += mix(aiColor, aiColorPair, aiCloudPair)
    * aiFold * aiMass * 0.075 * aiPulse;
  vec3 emittedSurfaceColor = softClip(orb * 1.08);
  float preEmissionLuma = dot(orb, vec3(0.2126, 0.7152, 0.0722));
  orb *= 1.0 - surfaceLoss * 0.24;
  orb = mix(
    orb,
    mix(vec3(preEmissionLuma * 0.72), orb, 0.62),
    surfaceLoss * 0.28
  );
  orb += emittedSurfaceColor
    * surfaceEmission * (1.0 - surfaceEmissionCycle) * 0.045;
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
  float pointerEdgeFacing = pow(max(dot(
    normalize(geometricNormal.xy + vec2(0.0001)),
    normalize(pointerField + vec2(0.0001))
  ), 0.0), 5.0) * pointerActivation;
  float clickEdgeFacing = pow(max(dot(
    normalize(geometricNormal.xy + vec2(0.0001)),
    normalize(clickField + vec2(0.0001))
  ), 0.0), 6.0) * clickActivation;
  orb += mix(cleanPalette(colorPhase + 0.44), vec3(0.90, 0.98, 1.0), 0.62)
    * fresnel
    * (0.050 + pointerEdgeFacing * 0.18 + clickEdgeFacing * 0.25);
  orb += vec3(0.94, 1.00, 0.98) * specular * 0.48;
  orb += mix(vec3(0.94, 1.00, 0.98), adjacent, 0.58) * broadSheen * 0.13;
  orb += mix(spectrum, adjacent, 0.42)
    * gravitySheen * (0.035 + pointerActivation * 0.075);
  orb += mix(spectrum, vec3(0.92, 1.00, 0.98), 0.48) * fresnel * 0.39;
  orb += mix(adjacent, vec3(0.76, 0.95, 1.0), 0.46)
    * transmitted * 0.18;

  vec2 aiCoreOffset = vec2(
    sin(t * 0.37 + aiWarpX * 2.0),
    cos(t * 0.31 + aiWarpY * 2.2)
  ) * 0.030;
  float innerLens = exp(-dot(p - aiCoreOffset, p - aiCoreOffset)
    * (4.0 + aiCloud * 2.2)) * (0.42 + innerFlow * 0.34 + aiMass * 0.24);
  orb += mix(adjacent, aiColorPair, 0.38)
    * innerLens * 0.235 * internalPulse;
  orb += vec3(0.90, 0.98, 1.0)
    * innerLens * innerLens * aiFold * 0.060;
  orb *= 1.0 - surfaceLoss * 0.22;
  float lightEnvelope = clamp(
    0.46 + diffuse * 0.50 + fill * 0.11 + transmitted * 0.08,
    0.44,
    1.10
  );
  orb *= lightEnvelope;
  orb = softClip(orb * 1.42 * auraBreath);
  float orbLuma = dot(orb, vec3(0.2126, 0.7152, 0.0722));
  orb = max(mix(vec3(orbLuma), orb, 1.20), 0.0);

  float outerDistance = max(nearestField, 0.0);
  vec3 edgeEmissionDirection = normalize(vec3(circleDir, 0.08));
  float edgeEmissionSource = emissionSource3D(
    edgeEmissionDirection,
    gravityAxis3D,
    t
  );
  vec2 auraDirection = normalize(
    circleDir + gravityAxis3D.xy * edgeEmissionSource * 0.08
  );
  float ridge = auraRidges(vec3(auraDirection * 1.72, t * 0.085));
  vec3 auraColor = mix(
    emittedSurfaceColor,
    cleanPalette(fract(colorPhase + 0.075)),
    0.14 + smoother(ridge) * 0.08
  );
  float auraMask = 1.0 - smoothstep(0.54, 1.00, length(p));
  float gravityFieldAngle = atan(gravityAxis3D.y, gravityAxis3D.x);

  // One mass lifecycle drives both render domains. The raymarched SDF above
  // owns the liquid drop and its neck; these three samples per parent only
  // appear as that same mass loses density and becomes gas. Black Hole's
  // mirror fold distorts the gas density, never an independent circular layer.
  vec3 gasColor = vec3(0.0);
  float gasDensity = 0.0;
  float mirroredGas = 0.0;
  float phaseActivity = 0.0;
  for (int i = 0; i < 15; i++) {
    float index = float(i);
    float parentIndex = mod(index, 5.0);
    float strand = floor(index / 5.0);
    vec3 liquidDirection3D;
    vec3 liquidTangent3D;
    float particleLife;
    float sourceWeight;
    float particleRadius;
    float attached;
    vec3 liquidCenter3D = fluidParticleState(
      parentIndex,
      t,
      gravityAxis3D,
      liquidDirection3D,
      liquidTangent3D,
      particleLife,
      sourceWeight,
      particleRadius,
      attached
    );
    float gasPhase = smoother(clamp(
      (particleLife - 0.48) / 0.36,
      0.0,
      1.0
    ));
    float gasFade = 1.0 - smoother(clamp(
      (particleLife - 0.86) / 0.14,
      0.0,
      1.0
    ));
    float phaseWeight = gasPhase * gasFade * sourceWeight;
    float gasTravel = smoother(clamp(
      (particleLife - 0.48) / 0.50,
      0.0,
      1.0
    ));
    vec2 liquidDirection = normalize(liquidDirection3D.xy + vec2(0.0001));
    float curveAngle = (strand - 1.0) * 0.115
      + sin(particleLife * PI + parentIndex * 0.61) * 0.065;
    vec2 gasDirection = rot(curveAngle) * liquidDirection;
    vec2 gasTangent = vec2(-gasDirection.y, gasDirection.x);
    float strandOffset = strand - 1.0;
    vec2 gasCenter = liquidCenter3D.xy
      + liquidDirection * gasTravel * (0.115 + strand * 0.036)
      + gasTangent * strandOffset * (0.024 + gasTravel * 0.060)
      + gasTangent * sin(
        particleLife * PI + parentIndex * 0.87 + strand * 1.31
      ) * gasTravel * 0.056;
    gasCenter += gasDirection * clickActivation
      * (1.0 - gasTravel) * 0.045;
    vec2 gasDelta = p - gasCenter;
    float alongGas = dot(gasDelta, gasDirection);
    float acrossGas = dot(gasDelta, gasTangent);
    float gasWidth = mix(0.016, 0.092, gasPhase)
      * (0.82 + strand * 0.18);
    float gasLength = mix(0.052, 0.240, gasPhase)
      * (0.90 + strand * 0.12);
    float gasEnvelope = exp(
      -acrossGas * acrossGas / max(gasWidth * gasWidth, 0.0002)
      -alongGas * alongGas / max(gasLength * gasLength, 0.0003)
    );
    vec2 gasLocal = vec2(acrossGas, alongGas * 0.72);
    vec2 gasFold = mirrorFold(
      gasLocal + gasTangent * sin(t * 0.11 + index) * 0.012,
      3.0
    );
    float gasNoise = noise3(vec3(
      gasFold * mix(15.0, 6.2, gasPhase),
      t * 0.095 + index * 0.73
    ));
    float mirrorFilament = exp(-abs(
      gasFold.x
        - gasFold.y * (0.24 + sin(t * 0.13 + parentIndex) * 0.10)
    ) * 31.0);
    float orbitalFilament = exp(-abs(
      acrossGas
        - sin(
          alongGas * 14.0 - t * 0.38
            + parentIndex * 1.17 + strand * 1.91
        ) * gasWidth * 0.56
    ) / max(gasWidth * 0.16, 0.004));
    float gasTexture = 0.18 + smoother(clamp(
      gasNoise * 1.38 - 0.18,
      0.0,
      1.0
    )) * 0.28 + max(mirrorFilament, orbitalFilament) * 0.68;
    vec2 kernelCenter = gasCenter
      + gasDirection * sin(
        particleLife * TAU + parentIndex * 0.73 + strand
      ) * gasLength * 0.34
      + gasTangent * cos(
        particleLife * TAU * 1.23 + strand * 1.67
      ) * gasWidth * 0.52;
    float condensationKernel = exp(
      -dot(p - kernelCenter, p - kernelCenter) * 1450.0
    );
    float wispDensity = (
      gasEnvelope * gasTexture + condensationKernel * 0.34
    ) * phaseWeight;
    vec3 liquidMassColor = mix(
      emittedSurfaceColor,
      cleanPalette(fract(colorPhase + 0.045 + parentIndex * 0.018)),
      0.12
    );
    vec3 vaporColor = mix(
      liquidMassColor,
      mix(liquidMassColor, vec3(0.72, 0.92, 1.0), 0.26),
      gasPhase
    );
    gasColor += vaporColor * wispDensity * (0.140 + strand * 0.045);
    gasDensity += wispDensity * (0.36 + strand * 0.12);
    mirroredGas += wispDensity * max(
      pow(smoother(gasNoise), 2.4),
      mirrorFilament * 0.72
    );
    phaseActivity += phaseWeight * 0.0667;
  }
  phaseActivity = clamp(phaseActivity, 0.0, 1.0);
  gasDensity = clamp(gasDensity, 0.0, 1.0);
  mirroredGas = clamp(mirroredGas, 0.0, 1.0);

  // The close field is the thinning root of those same wisps. Its reach grows
  // only while mass is actually vaporising, which removes the old hard halo
  // boundary and the unrelated constant rotation.
  vec2 gravityFramedEdge = rot(-gravityFieldAngle) * p;
  vec2 foldedEdge = mirrorFold(gravityFramedEdge, 3.0);
  float edgeKaleido = fbm(vec3(foldedEdge * 4.2, t * 0.095 + 19.4));
  float rootReach = mix(0.026, 0.105, phaseActivity);
  float rootDensity = exp(-outerDistance / rootReach)
    * edgeEmissionSource
    * (0.18 + phaseActivity * 0.82)
    * (0.72 + smoother(edgeKaleido) * 0.28);
  float skinVapor = exp(-outerDistance * 26.0)
    * (0.58 + ridge * 0.24)
    * (0.62 + edgeEmissionSource * 0.38);
  float wideVapor = exp(-outerDistance * 7.2)
    * phaseActivity
    * edgeEmissionSource;
  float auraEnergy = (
    skinVapor * 0.090
      + rootDensity * 0.21
      + wideVapor * 0.040
  ) * auraBreath * auraMask;
  vec3 gravityHue = mix(emittedSurfaceColor, auraColor, 0.20);
  vec3 gravityFieldColor = gasColor * 3.10
    + gravityHue * gasDensity * 0.13
    + gravityHue * rootDensity * 0.19
    + mix(gravityHue, vec3(0.76, 0.94, 1.0), 0.28)
      * mirroredGas * 0.22;

  vec3 color = backdrop;
  color += auraColor * auraEnergy * (1.0 - hitCoverage);
  color += gravityFieldColor * auraMask
    * (1.0 - hitCoverage + hitCoverage * pow(fresnel, 0.55) * 0.28);
  color = mix(color, orb, hitCoverage);

  // At the phase boundary the surface loses exactly where the gas overlaps;
  // some gas remains visible over grazing liquid, so the transition has no
  // compositing seam even while the silhouette deforms.
  float massTransfer = hitCoverage
    * pow(fresnel, 0.48)
    * max(surfaceLoss, gasDensity * 0.46);
  color *= 1.0 - massTransfer * 0.075;
  color += gravityFieldColor * auraMask * hitCoverage
    * pow(fresnel, 0.62) * 0.20;
  vec3 edgeSkin = mix(orb, auraColor, 0.24)
    * (0.70 + smoother(ridge) * 0.12);
  color = mix(color, edgeSkin, missCoverage * 0.34);

  float grain = hash21(gl_FragCoord.xy + floor(t * 18.0)) - 0.5;
  color += grain * 0.012 * (0.25 + hitCoverage * 0.75);
  color *= (1.0 - smoothstep(0.28, 1.58, length(frag))) * 0.42 + 0.58;
  color = pow(max(color, 0.0), vec3(0.92));

  gl_FragColor = vec4(color, 1.0);
}
`;

type PointerState = {
  current: THREE.Vector2;
  target: THREE.Vector2;
};

type ClickState = {
  position: THREE.Vector2;
  sequence: number;
};

function AetherScene({
  pointer,
  click,
  paused,
}: {
  pointer: RefObject<PointerState>;
  click: RefObject<ClickState>;
  paused: boolean;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { gl } = useThree();
  const elapsed = useRef(0);
  const clickPosition = useRef(new THREE.Vector2(0.5, 0.5));
  const clickStrength = useRef(0);
  const clickSequence = useRef(0);
  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uClick: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uMotion: { value: paused ? 0 : 1 },
      uClickPulse: { value: 0 },
    }),
    [paused],
  );

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    if (!paused) elapsed.current += Math.min(delta, 0.05);
    pointer.current.current.lerp(pointer.current.target, 0.065);
    if (click.current.sequence !== clickSequence.current) {
      clickSequence.current = click.current.sequence;
      clickPosition.current.copy(click.current.position);
      clickStrength.current = 1;
    }
    if (!paused) {
      clickStrength.current *= Math.exp(-Math.min(delta, 0.05) * 2.15);
    }
    material.uniforms.uTime.value = elapsed.current;
    material.uniforms.uMotion.value = paused ? 0 : 1;
    material.uniforms.uPointer.value.copy(pointer.current.current);
    material.uniforms.uClick.value.copy(clickPosition.current);
    material.uniforms.uClickPulse.value = clickStrength.current;
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
  const click = useRef<ClickState>({
    position: new THREE.Vector2(0.5, 0.5),
    sequence: 0,
  });

  const updatePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current.target.set(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
    );
  };

  const triggerPulse = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    pointer.current.target.set(x, y);
    click.current.position.set(x, y);
    click.current.sequence += 1;
  };

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      onPointerMove={updatePointer}
      onPointerDown={triggerPulse}
      onPointerLeave={() => pointer.current.target.set(0.5, 0.5)}
      role="img"
      aria-label="Aether Core, a living prismatic fluid orb with kaleidoscopic edge refraction and pointer- and click-responsive gravity"
    >
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], left: -1, right: 1, top: 1, bottom: -1 }}
        dpr={[1, 1.6]}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <AetherScene pointer={pointer} click={click} paused={paused} />
      </Canvas>
    </div>
  );
}
