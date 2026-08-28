"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type AIBlackHoleZeroProps = {
  paused?: boolean;
  fusionPass?: boolean;
  lensEnabled?: boolean;
  theme?: "dark" | "light" | "graphite" | "chromatic";
  chromaticMode?: "mono" | "spectrum";
  color?: string;
  className?: string;
};

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

/*
 * This shader deliberately has only two source vocabularies:
 * - ReactBits AI Blob: rng/perlin/fractal, spherical projection, rotating noise,
 *   four-colour material, internal light and edge shading.
 * - ReactBits Black Hole: mirror(), reciprocal orbit field, colour cycling and
 *   pointer gravity.
 *
 * The Black Hole field deforms the coordinates used by AI Blob before its
 * shape, normals, colour and alpha are evaluated. They are one material, not
 * two canvases composited on top of each other.
 */
const fragmentShader = `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform float uCursorActive;
  uniform float uFusionPass;
  uniform float uLensEnabled;
  uniform float uCleanLight;
  uniform vec2 uClickOrigin;
  uniform float uClickAge;
  uniform float uClickActive;
  uniform float uSurfaceMode;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform vec3 uColor3;
  uniform vec3 uColor4;

  #define PI_TWO 6.28318530718
  const float PI = 3.14159265;

  float rng(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
  }

  float perlin(vec2 p) {
    vec2 ip = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    float res = mix(
      mix(rng(ip), rng(ip + vec2(1.0, 0.0)), u.x),
      mix(rng(ip + vec2(0.0, 1.0)), rng(ip + vec2(1.0, 1.0)), u.x),
      u.y
    );
    return res * res;
  }

  float fractal(vec2 p, int octaves) {
    float s = 0.0;
    float m = 0.0;
    float a = 0.5;

    s += a * perlin(p);
    m += a;
    a *= 0.5;
    p *= 2.0;

    if (octaves >= 2) {
      s += a * perlin(p);
      m += a;
    }

    return s / m;
  }

  float brightness(vec3 color) {
    return dot(color, vec3(0.299, 0.587, 0.114));
  }

  mat3 rotateX(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
  }

  mat3 rotateY(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
  }

  mat3 rotateZ(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
  }

  vec2 mirror(vec2 p, float seg) {
    float a = atan(p.y, p.x);
    a = ((a / PI) + 1.0) * 0.5;
    a = mod(a, 1.0 / seg) * seg;
    a = -abs(2.0 * a - 1.0) + 1.0;
    float r = length(p);
    a *= r;
    return vec2(a, r);
  }

  void main() {
    float minRes = min(uResolution.x, uResolution.y);
    vec2 sceneUnit = (gl_FragCoord.xy * 2.0 - uResolution.xy) / minRes;
    float time = uTime * uSpeed;

    // ReactBits Cursor Wave supplies the expanding single-front model; Minimal
    // Ripple supplies the sine-eased crest and decay. Orb uses it as liquid
    // refraction, while Viewport turns the same event into volumetric fog.
    vec2 clickPoint = (uClickOrigin * 2.0 - 1.0) * uResolution.xy / minRes;
    vec2 fromClick = sceneUnit - clickPoint;
    float clickDistance = length(fromClick);
    vec2 clickDirection = normalize(fromClick + vec2(0.0001));
    float clickFront = uClickAge * 0.72;
    float clickWidth = mix(0.2, 0.1, smoothstep(0.0, 1.5, uClickAge));
    float clickDelta = clickDistance - clickFront;
    float clickProfile = clamp(
      1.0 - abs(clickDelta) / max(clickWidth, 0.001),
      0.0,
      1.0
    );
    float clickLead = pow(sin(clickProfile * PI), 1.35);
    float clickUndertowProfile = clamp(
      1.0 - abs(clickDelta + clickWidth * 0.82) / (clickWidth * 1.45),
      0.0,
      1.0
    );
    float clickUndertow = sin(clickUndertowProfile * PI) * 0.26;
    float clickFade = exp(-uClickAge * 0.56)
      * smoothstep(0.025, 0.14, clickFront)
      * uClickActive;
    float orbRipple = (clickLead - clickUndertow)
      * clickFade
      * uLensEnabled;

    float fogProgress = 1.0 - exp(-uClickAge * 1.18);
    float fogScale = 0.62 + fogProgress * 1.08;
    float fogNoise = fractal(
      fromClick * 1.85 / fogScale + vec2(time * 0.11, -time * 0.075),
      2
    );
    float fogRadius = 0.08 + fogProgress * 1.08;
    float fogSoftness = 0.16 + fogProgress * 0.34;
    float fogDistance = clickDistance + (fogNoise - 0.5) * (0.2 + fogProgress * 0.28);
    float fogFill = 1.0 - smoothstep(
      fogRadius - fogSoftness,
      fogRadius + fogSoftness,
      fogDistance
    );
    float fogBreakup = smoothstep(
      0.12 + fogProgress * 0.16,
      0.86,
      fogNoise + fogFill * 0.28
    );
    float viewportFog = clamp(
      fogFill
      * mix(0.48 + fogNoise * 0.68, fogBreakup, fogProgress * 0.72)
      * exp(-uClickAge * 0.58)
      * smoothstep(0.02, 0.18, uClickAge)
      * uClickActive
      * (1.0 - uLensEnabled)
      * 1.48,
      0.0,
      1.0
    );

    sceneUnit += clickDirection * orbRipple * 0.034;

    // The orb and the media lens remain separate components. This only borrows
    // the media lens' directional rim deformation: the orb's own material is
    // pulled around its edge from the upper-right toward the lower-left.
    const float contentRadius = 0.635;
    const float lensRadius = 0.72;
    const float lensStrength = 1.18;
    vec2 lensP = sceneUnit / lensRadius;
    float lensNormalizedRadius = length(lensP);
    float lensDistance = length(sceneUnit);
    vec2 lensDirection = lensP / max(lensNormalizedRadius, 0.001);
    vec2 lensTangent = vec2(-lensDirection.y, lensDirection.x);
    float lensAnnulus = smoothstep(0.79, 0.96, lensNormalizedRadius)
      * (1.0 - smoothstep(0.995, 1.018, lensNormalizedRadius))
      * uLensEnabled;

    vec2 lensGravityPoint = vec2(-0.28, -0.92);
    vec2 lensGravityVector = lensGravityPoint - lensP;
    float lensGravityDistance = max(length(lensGravityVector), 0.08);
    vec2 lensGravityDirection = normalize(lensGravityVector + 0.001);
    vec2 lensFlowDirection = normalize(vec2(-0.58, -1.0));
    float lensUpperRight = smoothstep(
      -0.5,
      0.82,
      dot(lensP, normalize(vec2(1.0, 1.0)))
    );

    vec2 lensPointer = (uPointer * 2.0 - 1.0)
      * vec2(uResolution.x / uResolution.y, 1.0)
      / lensRadius;
    vec2 lensPointerVector = lensPointer - lensP;
    float lensPointerInfluence = smoothstep(
      1.15,
      0.05,
      length(lensPointerVector)
    ) * uCursorActive;

    vec2 refractedP = lensP;
    float lensWarp = lensAnnulus * (0.09 + lensUpperRight * 0.075)
      / (0.78 + lensGravityDistance * 0.46);
    refractedP += lensGravityDirection * lensWarp * lensStrength;
    refractedP += lensFlowDirection
      * lensAnnulus
      * (0.038 + lensUpperRight * 0.07)
      * lensStrength;
    float lensDirectionalShear = dot(lensP, lensTangent);
    refractedP += lensGravityDirection
      * lensAnnulus
      * (0.026 + lensUpperRight * 0.034)
      * lensStrength;
    refractedP += lensTangent
      * lensAnnulus
      * lensDirectionalShear
      * 0.035
      * lensStrength;
    refractedP *= 1.0 - lensAnnulus * 0.082 * lensStrength;
    refractedP += normalize(lensPointerVector + 0.001)
      * lensPointerInfluence
      * lensAnnulus
      * 0.012
      * lensStrength;

    vec2 refractedUnit = refractedP * lensRadius;
    float warpedLensDistance = length(refractedUnit);
    vec2 unit = refractedUnit;

    // ReactBits Black Hole coordinate field and pointer gravity.
    const float blackZoom = 1.68;
    const float blackCount = 18.0;
    const float blackOrbSize = 0.74;
    const float blackGlow = 0.068;
    const float blackDistFade = 0.29;
    const float blackSplits = 3.0;

    vec2 st = unit * blackZoom;
    float dist = max(length(st), 0.035);
    vec2 warpSt = st * mirror(st, blackSplits);

    vec2 pointerPos = (uPointer * 2.0 - 1.0)
      * vec2(uResolution.x / uResolution.y, 1.0)
      * blackZoom;
    float cursorDist = length(st - pointerPos);
    float cursorInfluence = smoothstep(2.5, 0.0, cursorDist) * uCursorActive * 0.9;
    vec2 pullDir = normalize(pointerPos - warpSt + 0.001);
    warpSt += pullDir * cursorInfluence * 0.15;

    float localGlow = blackGlow + cursorInfluence * blackGlow * 0.5;
    float localDistFade = blackDistFade + cursorInfluence * 0.08;
    vec3 blackRaw = vec3(0.0);

    for (float i = 0.0; i < 30.0; i++) {
      if (i >= blackCount) break;
      float orbitTime = time * 0.5
        - i * PI / blackCount * cos(time * 0.5 / max(i, 0.0001));
      vec2 orb = vec2(cos(orbitTime), sin(orbitTime))
        / sin(i / blackCount * PI / dist + time * 0.5);
      vec3 hue = cos(
        vec3(-5.1, -0.55, 2.3) * PI_TWO / PI
        + PI * (time * 0.5 / (i + 1.0) * 0.24)
      ) * localGlow + localGlow;
      blackRaw += dist * localDistFade
        / max(length(warpSt - orb * blackOrbSize), 0.008)
        * hue;
    }

    float rawEnergy = brightness(max(blackRaw, 0.0));
    float fieldEnergy = smoothstep(0.045, 0.46, rawEnergy);
    vec3 blackField = pow(max(blackRaw, 0.0), vec3(3.15));
    blackField += cursorInfluence * 0.03;
    float fieldLum = brightness(blackField);
    float fieldVisibility = clamp(fieldLum * 5.0, 0.0, 1.0);

    // The Black Hole field changes AI Blob's coordinate system first. That
    // single coordinate then drives silhouette, normals, material and alpha.
    vec2 warpDelta = clamp(warpSt - st, vec2(-0.5), vec2(0.5));
    vec2 blobUv = unit * 1.62;
    blobUv += warpDelta * (0.04 + fieldEnergy * 0.04);
    blobUv += pullDir * cursorInfluence * 0.035;

    float l = dot(blobUv, blobUv);
    float z = sqrt(max(0.0, 1.0 - min(l, 1.0)));
    vec3 noisePos = normalize(vec3(blobUv.x, blobUv.y, z));

    // ReactBits AI Blob's original compound rotation.
    float angleX = sin(time * 0.23) * 1.5 + cos(time * 0.37) * 0.6;
    float angleY = sin(time * 0.19) * 1.3 + cos(time * 0.41) * 0.7;
    float angleZ = sin(time * 0.31) * 1.1 + cos(time * 0.29) * 0.5;
    noisePos = rotateX(angleX) * noisePos;
    noisePos = rotateY(angleY) * noisePos;
    noisePos = rotateZ(angleZ) * noisePos;

    const float noiseScale = 3.25;
    vec2 mirroredNoise = mirror(warpSt, blackSplits);
    vec2 coupledNoise = noisePos.xy + mirroredNoise * fieldEnergy * 0.045;
    float nx = fractal(coupledNoise * 2.0 * noiseScale / 3.0 + time * 0.4 + 25.69, 2);
    float ny = fractal(coupledNoise * 2.0 * noiseScale / 3.0 + time * 0.4 + 86.31, 2);
    float n = fractal(coupledNoise * noiseScale + 2.0 * vec2(nx, ny), 2);
    n = mix(n, smoothstep(0.08, 0.76, n), 0.28 * uFusionPass);

    float radius = length(blobUv);
    float extraction = fieldEnergy
      * smoothstep(0.22, 1.08, radius)
      * uFusionPass;
    float coreTransfer = fieldEnergy
      * (1.0 - smoothstep(0.05, 0.72, radius))
      * uFusionPass;

    // AI Blob noise and Black Hole energy now define the volume boundary
    // together. The wide transition intentionally avoids a closed circular rim.
    float fluidSurface = l
      + (n - 0.42) * 0.46
      + (nx - ny) * 0.12
      + fieldEnergy * 0.16
      + extraction * 0.11;
    fluidSurface -= viewportFog * 0.4;
    float sm = smoothstep(1.30, 0.58, fluidSurface);
    float d = sm * l * l * l * 2.0;
    vec3 norm = normalize(vec3(blobUv.x, blobUv.y, 0.7 - d));
    vec3 col = vec3(n * 0.5 + 0.25);

    float angularPhase = atan(noisePos.y, noisePos.x) / PI_TWO + time * 0.1;
    float flowPhase = n * 0.34
      + nx * 0.27
      + ny * 0.19
      + dot(noisePos, vec3(0.17, -0.11, 0.13))
      + time * 0.035;
    vec2 angularVector = vec2(
      cos(angularPhase * PI_TWO),
      sin(angularPhase * PI_TWO)
    );
    vec2 flowVector = vec2(
      cos(flowPhase * PI_TWO),
      sin(flowPhase * PI_TWO)
    );
    float angularWeight = smoothstep(0.16, 0.58, length(noisePos.xy));
    vec2 hueVector = normalize(
      mix(flowVector, angularVector, angularWeight) + vec2(0.0001)
    );
    float gradPos = fract(
      atan(hueVector.y, hueVector.x) / PI_TWO
      + 1.0
      + mirroredNoise.x * fieldEnergy * 0.035
    );

    float colorWeight1 = pow(0.5 + 0.5 * cos(PI_TWO * gradPos), 3.0);
    float colorWeight2 = pow(0.5 + 0.5 * cos(PI_TWO * (gradPos - 0.25)), 3.0);
    float colorWeight3 = pow(0.5 + 0.5 * cos(PI_TWO * (gradPos - 0.5)), 3.0);
    float colorWeight4 = pow(0.5 + 0.5 * cos(PI_TWO * (gradPos - 0.75)), 3.0);
    float colorWeightSum = max(
      colorWeight1 + colorWeight2 + colorWeight3 + colorWeight4,
      0.001
    );
    vec3 gradientColor = (
      uColor1 * colorWeight1
      + uColor2 * colorWeight2
      + uColor3 * colorWeight3
      + uColor4 * colorWeight4
    ) / colorWeightSum;

    col *= gradientColor;
    col *= 2.0 * 1.12 * 1.25;
    vec3 cd = abs(col);
    vec3 c = col * d;

    float lightDot = max(0.0, dot(norm, vec3(0.0, 0.0, -1.0)));
    c += (c * 0.5 + vec3(1.0) - brightness(c))
      * vec3(pow(lightDot, 5.0) * 3.0);

    float aiEdgeLight = pow(max(
      (1.0 - smoothstep(1.0, 0.98, l)
      - pow(max(0.0, length(blobUv) - 1.0), 0.2)) * 2.0,
      0.0
    ), 4.0);
    col = c + col * min(aiEdgeLight, 0.35);
    col += gradientColor
      * (0.13 + uFusionPass * 0.04 + n * (0.35 + uFusionPass * 0.08))
      * sm;
    col += gradientColor * viewportFog * sm * 0.38;

    float f = fractal(coupledNoise * 2.0 + time, 2) + 0.1;
    vec2 innerOrigin = blobUv
      - pullDir * (coreTransfer * 0.075 + extraction * 0.035);
    vec2 innerUV = innerOrigin * (f + 0.1) * 0.5 / 1.18;
    float innerL = dot(innerUV, innerUV);
    vec3 ins = normalize(cd) + 0.1;
    float ind = 0.2 + pow(smoothstep(0.0, 1.5, sqrt(innerL)) * 48.0, 0.25);
    ind *= ind * ind * ind;
    ind = 1.0 / ind;
    ins *= ind;
    vec3 aiCoreLight = ins * ins * sm * smoothstep(0.7, 1.0, ind)
      * 1.12
      * (1.0 - coreTransfer * 0.2);
    col += aiCoreLight;

    // The Black Hole particles pass through the same body material. Inside
    // they relight it; outside they remain the original orbit field.
    vec3 blackRelight = blackField / (vec3(1.0) + blackField);
    col += blackRelight * sm * (0.18 + 0.3 * fieldEnergy);
    col *= 1.0
      - fieldEnergy * sm * 0.08
      - extraction * sm * 0.12
      - coreTransfer * sm * 0.06;
    col = col / (vec3(0.58 - uFusionPass * 0.1) + col);
    col *= 1.18;
    float colBrightness = brightness(col);
    float blobAlpha = sm
      * clamp(colBrightness * (1.24 + uFusionPass * 0.1), 0.0, 1.0)
      * (1.0 - extraction * 0.1);

    float orbitRange = smoothstep(2.55, 0.76, length(blobUv));
    float orbitStructure = smoothstep(0.18, 0.62, fieldVisibility);
    float orbitAlpha = (1.0 - sm) * orbitRange * orbitStructure * 0.86;
    vec3 blackVisual = blackField / (vec3(1.0) + blackField * 0.28);
    blackVisual *= mix(vec3(1.0), gradientColor * 1.45, 0.56);
    blackVisual += gradientColor
      * extraction
      * fieldVisibility
      * 0.3;
    vec3 result = mix(blackVisual * 0.88, col, sm);
    float fogAlpha = viewportFog * (0.28 + fieldEnergy * 0.36);
    float alpha = clamp(blobAlpha + orbitAlpha + fogAlpha, 0.0, 1.0);

    result = pow(max(result, 0.0), vec3(0.95));
    float sourceAlpha = alpha;

    if (uSurfaceMode > 0.5 && uSurfaceMode < 1.5) {
      float sourceLum = brightness(clamp(result, 0.0, 1.0));
      float bodyFlow = clamp(
        smoothstep(0.08, 0.76, n) * 0.68 + sourceLum * 0.32,
        0.0,
        1.0
      );
      float coreMask = (1.0 - smoothstep(0.025, 0.3, innerL)) * sm;
      bodyFlow = mix(
        bodyFlow,
        clamp(0.84 + n * 0.06, 0.0, 1.0),
        coreMask * 0.9
      );
      vec3 graphite = mix(
        vec3(0.11, 0.125, 0.155),
        vec3(0.46, 0.48, 0.53),
        bodyFlow
      );

      float orbitInk = fieldVisibility * (1.0 - sm);
      vec3 coolGraphite = vec3(0.105, 0.19, 0.205);
      result = mix(graphite, coolGraphite, orbitInk * 0.32);
      float lightBodyAlpha = max(alpha, sm * 0.74);
      alpha = mix(alpha * 0.34, lightBodyAlpha, sm);
    } else if (uSurfaceMode > 1.5 || uCleanLight > 0.5) {
      float chromaticShape = clamp(
        sm + (n - 0.48) * 0.13 - extraction * 0.08,
        0.0,
        1.0
      );
      float liquidVeil = smoothstep(0.025, 0.48, chromaticShape);
      float bodyMask = smoothstep(0.16, 0.86, chromaticShape);
      float surfaceBand = liquidVeil
        * (1.0 - smoothstep(0.5, 0.96, chromaticShape));
      float orbitFilament = pow(fieldVisibility, 2.05)
        * orbitRange
        * (1.0 - bodyMask);
      float edgeBridge = surfaceBand
        * (fieldEnergy * 0.34 + extraction * 0.72);

      vec3 surfaceColor = gradientColor;
      float surfaceLum = brightness(surfaceColor);
      surfaceColor = mix(vec3(surfaceLum), surfaceColor, 0.92);
      surfaceColor = mix(surfaceColor, vec3(0.97, 0.98, 1.0), 0.13);

      float pigmentDensity = 0.98 + n * 0.25;
      vec3 chromaticShadow = mix(surfaceColor, uColor2, 0.12);
      vec3 chromaticInk = chromaticShadow * pigmentDensity;
      chromaticInk += surfaceColor
        * brightness(blackRelight)
        * fieldEnergy
        * 0.26;

      float fluidRim = pow(
        1.0 - clamp(abs(norm.z), 0.0, 1.0),
        1.45
      );
      vec3 rimColor = mix(surfaceColor, uColor1, smoothstep(-0.45, 0.5, norm.x) * 0.32);
      chromaticInk += rimColor
        * fluidRim
        * (0.22 + fieldEnergy * 0.28 + edgeBridge * 0.3);
      chromaticInk += surfaceColor * edgeBridge * 0.56;
      chromaticInk = mix(
        chromaticInk,
        surfaceColor * 0.9,
        extraction * bodyMask * 0.08
      );
      chromaticInk = pow(clamp(chromaticInk, 0.0, 1.0), vec3(0.94));
      float inkLum = brightness(chromaticInk);
      chromaticInk = clamp(
        mix(vec3(inkLum), chromaticInk, 1.1),
        0.0,
        1.0
      );
      float cleanLightFloor = 0.62
        + n * 0.05
        + fluidRim * 0.03;
      float inkLift = max(
        1.0,
        cleanLightFloor / max(brightness(chromaticInk), 0.001)
      );
      chromaticInk *= mix(1.0, inkLift, 0.92);
      chromaticInk = clamp(chromaticInk, 0.0, 1.0);

      float orbitEnergy = clamp(brightness(blackVisual) * 1.45, 0.0, 1.0);
      vec3 orbitBase = mix(
        vec3(0.97, 0.98, 1.0),
        surfaceColor,
        0.52
      );
      vec3 orbitChromatic = orbitBase
        + surfaceColor * orbitEnergy * 0.48;
      orbitChromatic += surfaceColor
        * orbitFilament
        * (0.56 + fieldEnergy * 0.42);
      orbitChromatic += rimColor * edgeBridge * 0.34;
      result = mix(orbitChromatic, chromaticInk, liquidVeil);
      float liquidTransition = 1.0 - abs(liquidVeil * 2.0 - 1.0);
      vec3 liquidEdgeColor = mix(surfaceColor, rimColor, 0.55);
      liquidEdgeColor = mix(liquidEdgeColor, vec3(0.98, 0.99, 1.0), 0.2);
      result = mix(
        result,
        max(result, liquidEdgeColor),
        liquidTransition * surfaceBand * 0.58
      );
      float diffusionBand = clamp(
        surfaceBand * 1.35 + edgeBridge * 0.65,
        0.0,
        1.0
      );
      float diffusionLift = max(
        1.0,
        0.76 / max(brightness(result), 0.001)
      );
      result *= mix(1.0, diffusionLift, diffusionBand * 0.86);
      result = clamp(result, 0.0, 1.0);
      result = pow(result, vec3(0.84));

      float chromaticBodyAlpha = clamp(
        bodyMask * 0.94 + surfaceBand * 0.32,
        0.0,
        1.0
      );
      float chromaticOrbitAlpha = clamp(
        orbitFilament * 0.64 + edgeBridge * 0.52,
        0.0,
        0.92
      );
      float chromaticAlpha = max(chromaticBodyAlpha, chromaticOrbitAlpha);
      alpha = mix(chromaticAlpha, sourceAlpha, uCleanLight);

      float contentDistance = lensDistance + lensWarp * 0.34;
      float contentContainment = mix(
        1.0,
        1.0 - smoothstep(
          contentRadius - 0.024,
          contentRadius + 0.018,
          contentDistance
        ),
        uLensEnabled
      );
      float lensSource = clamp(
        fieldVisibility * 0.72
          + edgeBridge * 0.86
          + orbitFilament * 0.48,
        0.0,
        1.0
      );
      float lensFlux = lensAnnulus
        * (0.14
          + lensUpperRight * 0.2
          + max(-lensDirection.y, 0.0) * 0.1)
        * (0.5 + lensSource * 0.44);
      float pointerCaustic = lensAnnulus
        * lensPointerInfluence
        * pow(max(
          dot(
            normalize(lensPointerVector + 0.001),
            lensTangent
          ) * 0.5 + 0.5,
          0.0
        ), 4.0);
      vec3 lensColor = mix(
        surfaceColor,
        vec3(0.985, 0.99, 1.0),
        0.46
      );
      vec3 lensedField = max(
        result,
        lensColor * (0.54 + lensSource * 0.54)
      );
      result = mix(
        result,
        lensedField,
        clamp(lensFlux * 0.62 + pointerCaustic * 0.24, 0.0, 0.68)
      );
      result += lensColor * pointerCaustic * 0.16;
      result = clamp(result, 0.0, 1.0);

      float activeContainment = mix(contentContainment, 1.0, uCleanLight);
      float containedContentAlpha = alpha * activeContainment;
      alpha = containedContentAlpha;
    }

    if (uSurfaceMode < 1.5) {
      float sharedLensEnergy = lensAnnulus
        * (0.08 + fieldVisibility * 0.3 + lensUpperRight * 0.1);
      vec3 sharedLensColor = mix(
        gradientColor,
        vec3(0.985, 0.99, 1.0),
        uSurfaceMode > 0.5 ? 0.56 : 0.24
      );
      result = mix(
        result,
        max(result, sharedLensColor * (0.48 + fieldVisibility * 0.38)),
        clamp(sharedLensEnergy * 0.72, 0.0, 0.62)
      );
    }

    result += mix(gradientColor, vec3(0.98, 0.99, 1.0), 0.35)
      * viewportFog
      * 0.32;
    alpha = max(alpha, viewportFog * (0.3 + fieldEnergy * 0.14));

    vec2 screenUv = gl_FragCoord.xy / uResolution.xy;
    float frameDistance = min(
      min(screenUv.x, 1.0 - screenUv.x),
      min(screenUv.y, 1.0 - screenUv.y)
    );
    alpha *= smoothstep(0.0, 0.075, frameDistance);
    gl_FragColor = vec4(result, alpha);
  }
`;

const colors = ["#ff6687", "#8d64ff", "#31d9ff", "#67ffc3"] as const;
const cleanLightColors = ["#ff9eaf", "#aa98ff", "#68e5ff", "#8af4ce"] as const;

function toRgb(hex: string) {
  const color = new THREE.Color(hex);
  return new THREE.Vector3(color.r, color.g, color.b);
}

function monochromePalette(hex: string) {
  const source = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  source.getHSL(hsl);
  const saturation = Math.min(0.86, Math.max(0, hsl.s * 1.05));
  const levels = [0.72, 0.62, 0.78, 0.68];

  return levels.map((lightness) => {
    const tone = new THREE.Color().setHSL(hsl.h, saturation, lightness);
    return `#${tone.getHexString()}`;
  });
}

export default function AIBlackHoleZero({
  paused = false,
  fusionPass = true,
  lensEnabled = false,
  theme = "dark",
  chromaticMode = "mono",
  color = "#6978ff",
  className,
}: AIBlackHoleZeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      stencil: false,
      depth: false,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pointerTarget = new THREE.Vector2(0.5, 0.5);
    const pointerSmooth = new THREE.Vector2(0.5, 0.5);
    const clickOrigin = new THREE.Vector2(0.5, 0.5);
    let cursorTarget = 0;
    let cursorSmooth = 0;
    let clickAge = 10;
    let clickActive = 0;

    const palette = theme === "graphite"
      ? ["#858b98", "#777685", "#748b91", "#87948f"] as const
      : theme === "chromatic"
        ? chromaticMode === "spectrum"
          ? cleanLightColors
          : monochromePalette(color)
        : theme === "light"
          ? cleanLightColors
          : colors;

    const surfaceMode = theme === "graphite" ? 1 : theme === "chromatic" ? 2 : 0;
    const cleanLightSurface = theme === "light" || theme === "chromatic";

    const uniforms = {
      uTime: { value: 0 },
      uSpeed: { value: paused ? 0 : 0.82 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPointer: { value: pointerSmooth },
      uCursorActive: { value: 0 },
      uFusionPass: { value: fusionPass ? 1 : 0 },
      uLensEnabled: { value: lensEnabled ? 1 : 0 },
      uCleanLight: { value: theme === "light" ? 1 : 0 },
      uClickOrigin: { value: clickOrigin },
      uClickAge: { value: clickAge },
      uClickActive: { value: clickActive },
      uSurfaceMode: { value: surfaceMode },
      uColor1: { value: toRgb(palette[0]) },
      uColor2: { value: toRgb(palette[1]) },
      uColor3: { value: toRgb(palette[2]) },
      uColor4: { value: toRgb(palette[3]) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: !cleanLightSurface,
      blending: cleanLightSurface
        ? THREE.NoBlending
        : THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const onPointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointerTarget.set(
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      );
    };
    const onPointerEnter = () => {
      cursorTarget = 1;
    };
    const onPointerLeave = () => {
      cursorTarget = 0;
      pointerTarget.set(0.5, 0.5);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (paused) return;
      const rect = container.getBoundingClientRect();
      clickOrigin.set(
        (event.clientX - rect.left) / rect.width,
        1 - (event.clientY - rect.top) / rect.height,
      );
      clickAge = 0;
      clickActive = 1;
    };
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerenter", onPointerEnter);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("pointerdown", onPointerDown);

    const timer = new THREE.Timer();
    timer.connect(document);
    let frame = 0;
    const animate = (timestamp?: number) => {
      frame = requestAnimationFrame(animate);
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      const elapsed = timer.getElapsed();
      const ease = 1 - Math.exp(-delta / 0.15);
      pointerSmooth.lerp(pointerTarget, ease);
      cursorSmooth += (cursorTarget - cursorSmooth) * ease;
      if (!paused && clickActive > 0) {
        clickAge += delta;
        if (clickAge > 3.4) clickActive = 0;
      }
      uniforms.uTime.value = elapsed;
      uniforms.uSpeed.value = paused ? 0 : 0.82;
      uniforms.uCursorActive.value = paused ? 0 : cursorSmooth;
      uniforms.uClickAge.value = clickAge;
      uniforms.uClickActive.value = paused ? 0 : clickActive;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      timer.dispose();
      resizeObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointerdown", onPointerDown);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [chromaticMode, color, fusionPass, lensEnabled, paused, theme]);

  return (
    <div
      ref={containerRef}
      className={`cursor-pointer touch-manipulation ${className ?? ""}`}
      aria-label="AI Blob and Black Hole fused WebGL study"
    />
  );
}
