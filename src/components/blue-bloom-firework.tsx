"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface BlueBloomFireworkProps {
  color?: string;
  backgroundColor?: string;
  lightSurface?: boolean;
  particleCount?: number;
  cycleDuration?: number;
  paused?: boolean;
  restartSignal?: number;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  className?: string;
}

const PETAL_COUNT = 14;

const petalVertexShader = `
precision highp float;

uniform float uTime;
uniform float uCycle;
uniform float uIndex;
uniform float uCount;

varying vec3 vWorldPosition;
varying float vProgress;
varying float vSide;
varying float vDepth;
varying float vEnergy;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float smoother(float value) {
  value = clamp(value, 0.0, 1.0);
  return value * value * value * (value * (value * 6.0 - 15.0) + 10.0);
}

float poweredBloom(float phase) {
  if (phase < 0.16) {
    return mix(0.28, 0.33, smoother(phase / 0.16));
  }
  if (phase < 0.34) {
    float release = (phase - 0.16) / 0.18;
    return mix(0.33, 1.0, 1.0 - pow(1.0 - release, 3.8));
  }
  if (phase < 0.68) {
    float suspension = (phase - 0.34) / 0.34;
    return 1.0 - 0.035 * smoother(suspension);
  }
  float recoil = (phase - 0.68) / 0.32;
  return mix(0.965, 0.28, smoother(recoil));
}

void main() {
  float phase = mod(uTime, max(uCycle, 0.1)) / max(uCycle, 0.1);
  float loopAngle = phase * TAU;
  float bloom = poweredBloom(phase);
  float t = uv.x;
  float side = (uv.y - 0.5) * 2.0;
  float layer = mod(uIndex, 2.0);
  float ringIndex = floor(uIndex * 0.5);
  float theta = (ringIndex / (uCount * 0.5)) * TAU
    + layer * 0.39
    + 0.31
    + sin(loopAngle) * 0.045;
  float depth = 0.5 + 0.5 * sin(theta);
  float spread = mix(0.2, 1.0, bloom);

  vec3 root = vec3(0.14, 0.1, -0.02);
  vec3 axis = normalize(vec3(-0.72, -0.6, -0.34));
  vec3 across = normalize(vec3(0.58, -0.81, 0.0));
  vec3 forward = normalize(cross(axis, across));

  vec3 radialDirection = normalize(
    axis * cos(theta)
      + across * sin(theta) * 0.84
      + forward * sin(theta) * 0.18
  );
  float lowerLeftBias = 0.5 + 0.5 * cos(theta);
  vec3 openDirection = normalize(
    radialDirection + axis * 0.12 * lowerLeftBias
  );
  vec3 closedDirection = normalize(
    openDirection * 0.58 + forward * (0.86 - depth * 0.16)
  );
  vec3 petalDirection = normalize(mix(
    closedDirection,
    openDirection,
    smoother(bloom)
  ));
  float lengthVariation = (0.47
    + lowerLeftBias * 0.34
    + 0.045 * sin(uIndex * 2.17)
    + 0.025 * cos(uIndex * 1.31))
    * mix(1.0, 0.76, layer);
  float petalLength = lengthVariation * mix(0.86, 1.0, bloom);

  float releaseEnergy = smoothstep(0.13, 0.2, phase)
    * (1.0 - smoothstep(0.36, 0.5, phase));
  float releaseFront = mix(-0.08, 1.08, bloom);
  float travellingForce = exp(-pow(t - releaseFront, 2.0) * 72.0)
    * releaseEnergy;

  vec3 centerline = root + petalDirection * petalLength * t;
  centerline += forward
    * sin(PI * t)
    * (0.025 + 0.045 * spread)
    * (0.72 + 0.28 * sin(theta * 2.0));
  centerline += forward
    * sin(PI * t)
    * (0.035 * sin(loopAngle + theta) + travellingForce * 0.075);
  vec3 tangentSide = normalize(
    -axis * sin(theta) + across * cos(theta) * 0.84
  );
  centerline += tangentSide
    * smoothstep(0.62, 1.0, t)
    * sin(loopAngle + theta * 1.7)
    * mix(0.014, 0.026, bloom);
  float petalBody = pow(max(sin(PI * t), 0.0), 0.68);
  float petalWidth = (0.006 + petalBody * (0.125 + depth * 0.028))
    * mix(1.0, 0.86, layer)
    * mix(0.9, 1.0, bloom);
  float cup = (1.0 - side * side) * sin(PI * t);

  vec3 displaced = centerline + tangentSide * side * petalWidth;
  float cupDepth = mix(0.13, 0.052, bloom) + depth * 0.034;
  displaced += forward
    * cup
    * (cupDepth + travellingForce * 0.045);
  displaced += radialDirection
    * travellingForce
    * (1.0 - side * side)
    * 0.055;
  displaced += forward
    * sin(t * 34.0 - loopAngle * 1.15 + theta)
    * petalBody
    * (1.0 - side * side)
    * 0.006;

  vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
  vWorldPosition = worldPosition.xyz;
  vProgress = t;
  vSide = side;
  vDepth = depth;
  vEnergy = travellingForce;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const petalFragmentShader = `
precision highp float;

uniform vec3 uSky;
uniform vec3 uMint;
uniform vec3 uLavender;
uniform vec3 uIce;
uniform vec3 uAccent;
uniform float uIndex;
uniform float uTime;
uniform float uCycle;

varying vec3 vWorldPosition;
varying float vProgress;
varying float vSide;
varying float vDepth;
varying float vEnergy;

const float TAU = 6.28318530718;

void main() {
  float phase = mod(uTime, max(uCycle, 0.1)) / max(uCycle, 0.1);
  float loopAngle = phase * TAU;
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  if (!gl_FrontFacing) normal *= -1.0;
  vec3 lightDirection = normalize(vec3(0.42, 0.72, 1.0));
  float diffuse = 0.86 + max(dot(normal, lightDirection), 0.0) * 0.14;
  float fresnel = pow(1.0 - abs(normal.z), 2.2);

  float family = 0.5 + 0.5 * sin(uIndex * 1.73 + 0.4);
  vec3 color = mix(uSky, uMint, family * 0.72);
  color = mix(
    color,
    uLavender,
    (0.5 + 0.5 * cos(uIndex * 1.19 + vProgress * 2.8)) * 0.42
  );

  float ridge = exp(-vSide * vSide * 7.5);
  float silk = pow(0.5 + 0.5 * sin(
    vProgress * (31.0 + uIndex * 0.7)
      - vSide * 5.0
      - loopAngle * 0.85
      + uIndex
  ), 7.0);
  float flowingCaustic = pow(0.5 + 0.5 * sin(
    vProgress * 15.0
      - vSide * 3.2
      + sin(vProgress * 6.0 - loopAngle) * 1.25
      + loopAngle * 0.42
  ), 8.0);

  color *= diffuse;
  color = mix(color, uIce, ridge * (0.12 + 0.08 * vDepth));
  color = mix(color, uIce, silk * 0.14 + flowingCaustic * 0.1);
  color = mix(color, uAccent, fresnel * 0.14);
  color = mix(color, uIce, vEnergy * 0.44);

  float sideFade = smoothstep(1.0, 0.92, abs(vSide));
  float rootFade = smoothstep(0.0, 0.025, vProgress);
  float alpha = sideFade * rootFade * (0.92 + ridge * 0.07);
  gl_FragColor = vec4(color, alpha);
}
`;

interface SilkBloomProps {
  color: string;
  cycleDuration: number;
  paused: boolean;
  restartSignal: number;
}

function SilkBloom({
  color,
  cycleDuration,
  paused,
  restartSignal,
}: SilkBloomProps) {
  const materialRefs = useRef<Array<THREE.ShaderMaterial | null>>([]);
  const elapsedRef = useRef(0);
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(1, 1, 96, 28),
    [],
  );
  const uniforms = useMemo(() => Array.from({ length: PETAL_COUNT }, (_, index) => ({
    uTime: { value: 0 },
    uCycle: { value: cycleDuration },
    uIndex: { value: index },
    uCount: { value: PETAL_COUNT },
    uSky: { value: new THREE.Color(color) },
    uMint: { value: new THREE.Color("#9ce8dc") },
    uLavender: { value: new THREE.Color("#c7bdf0") },
    uIce: { value: new THREE.Color("#f8fdff") },
    uAccent: { value: new THREE.Color("#69bee3") },
  })), [color, cycleDuration]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    elapsedRef.current = 0;
  }, [restartSignal]);

  useEffect(() => {
    const main = new THREE.Color(color);
    materialRefs.current.forEach((material) => {
      if (!material) return;
      material.uniforms.uSky.value.copy(main).lerp(new THREE.Color("#d9f4ff"), 0.18);
      material.uniforms.uMint.value.copy(main).lerp(new THREE.Color("#9ce8dc"), 0.9);
      material.uniforms.uLavender.value.copy(main).lerp(new THREE.Color("#c7bdf0"), 0.92);
      material.uniforms.uIce.value.set("#f8fdff");
      material.uniforms.uAccent.value.copy(main).lerp(new THREE.Color("#69bee3"), 0.62);
    });
  }, [color]);

  useFrame((_, delta) => {
    if (!paused) elapsedRef.current += Math.min(delta, 0.05);
    const displayTime = paused ? cycleDuration * 0.46 : elapsedRef.current;
    materialRefs.current.forEach((material) => {
      if (!material) return;
      material.uniforms.uTime.value = displayTime;
      material.uniforms.uCycle.value = cycleDuration;
    });
  });

  return (
    <group rotation={[-0.04, -0.08, 0.02]} scale={1.24}>
      {uniforms.map((petalUniforms, index) => (
        <mesh key={index} geometry={geometry} renderOrder={index}>
          <shaderMaterial
            ref={(material) => {
              materialRefs.current[index] = material;
            }}
            vertexShader={petalVertexShader}
            fragmentShader={petalFragmentShader}
            uniforms={petalUniforms}
            transparent
            side={THREE.DoubleSide}
            depthTest
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function BlueBloomFirework({
  color = "#a9def3",
  backgroundColor = "#f8fbfd",
  cycleDuration = 6,
  paused = false,
  restartSignal = 0,
  onCanvasReady,
  className,
}: BlueBloomFireworkProps) {
  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <Canvas
        camera={{ position: [0, 0, 4.0], fov: 38, near: 0.1, far: 20 }}
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
      >
        <color attach="background" args={[backgroundColor]} />
        <SilkBloom
          color={color}
          cycleDuration={cycleDuration}
          paused={paused}
          restartSignal={restartSignal}
        />
      </Canvas>
    </div>
  );
}
