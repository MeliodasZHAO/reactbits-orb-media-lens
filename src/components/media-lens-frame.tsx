"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import * as THREE from "three";

export type MediaLensShape = "circle" | "rounded";
export type MediaLensKind = "image" | "gif" | "video";

export interface MediaLensFrameProps {
  src: string;
  sourceCanvas?: HTMLCanvasElement | null;
  kind?: MediaLensKind;
  shape?: MediaLensShape;
  borderWidth?: number;
  cornerRadius?: number;
  refraction?: number;
  mediaScale?: number;
  mediaOffsetX?: number;
  mediaOffsetY?: number;
  mediaRotation?: number;
  lensAngle?: number;
  alt?: string;
  className?: string;
}

type LensStyle = CSSProperties & {
  "--lens-radius": string;
};

type RippleState = {
  origin: THREE.Vector2;
  age: number;
  active: number;
};

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uViewportAspect;
  uniform float uMediaAspect;
  uniform float uMediaScale;
  uniform vec2 uMediaOffset;
  uniform float uMediaRotation;
  uniform float uLensAngle;
  uniform float uRefraction;
  uniform float uEdgeWidth;
  uniform float uShape;
  uniform float uRoundness;
  uniform vec2 uPointer;
  uniform vec2 uRippleOrigin;
  uniform float uRippleAge;
  uniform float uRippleActive;

  const float TAU = 6.28318530718;

  vec2 rotateVector(vec2 point, float angle) {
    float sine = sin(angle);
    float cosine = cos(angle);
    return vec2(
      cosine * point.x - sine * point.y,
      sine * point.x + cosine * point.y
    );
  }

  vec2 transformMediaUv(vec2 uv) {
    vec2 scaled = (uv - 0.5) / max(uMediaScale, 0.01);
    // UVs move opposite to the requested visual rotation.
    vec2 rotated = rotateVector(scaled, -uMediaRotation);
    return rotated + 0.5 + vec2(-uMediaOffset.x, uMediaOffset.y);
  }

  vec2 coverUv(vec2 uv) {
    vec2 scale = vec2(1.0);
    if (uMediaAspect > uViewportAspect) {
      scale.x = uViewportAspect / uMediaAspect;
    } else {
      scale.y = uMediaAspect / uViewportAspect;
    }
    vec2 fitted = (uv - 0.5) * scale + 0.5;
    return transformMediaUv(fitted);
  }

  float superRadius(vec2 p, float exponent) {
    vec2 q = pow(abs(p), vec2(exponent));
    return pow(q.x + q.y, 1.0 / exponent);
  }

  vec3 sampleChromatic(vec2 uv, vec2 direction, float amount) {
    vec2 safeDirection = normalize(direction + vec2(0.0001));
    vec2 uvR = uv + safeDirection * amount;
    vec2 uvB = uv - safeDirection * amount;
    uvR = vec2(fract(uvR.x), clamp(uvR.y, 0.001, 0.999));
    uvB = vec2(fract(uvB.x), clamp(uvB.y, 0.001, 0.999));
    vec2 uvG = vec2(fract(uv.x), clamp(uv.y, 0.001, 0.999));
    float r = texture2D(uTexture, uvR).r;
    float g = texture2D(uTexture, uvG).g;
    float b = texture2D(uTexture, uvB).b;
    return vec3(r, g, b);
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float exponent = mix(11.0, 2.45, uRoundness);
    float radius = uShape < 0.5 ? length(p) : superRadius(p, exponent);
    float alpha = 1.0 - smoothstep(0.978, 1.018, radius);

    if (alpha <= 0.001) discard;

    float z = sqrt(max(0.0, 1.0 - min(radius * radius, 1.0)));
    vec3 normal = normalize(vec3(p * 0.88, max(z, 0.045)));

    // The final 8–12% of the silhouette is the only gravitational lens zone.
    // Ordinary media keeps its topology; true 2:1 panoramas can still become
    // a tiny planet farther below.
    vec2 planetP = p;
    float lensStart = 1.0 - clamp(uEdgeWidth * 0.65, 0.2, 0.28);
    float outerLens = smoothstep(lensStart, 0.96, radius)
      * (1.0 - smoothstep(0.995, 1.018, radius));

    // ReactBits Black Hole-inspired pull, deliberately restricted to the rim.
    float breathe = 0.5 + 0.5 * sin(uTime * 0.58);
    // Rotate the complete authored pull field around the rim. At 45 degrees
    // these vectors exactly reproduce the original upper-right treatment.
    float fieldRotation = uLensAngle - 0.78539816339;
    vec2 gravityPoint = rotateVector(
      vec2(-0.28, -0.92) + vec2(0.014, 0.018) * breathe,
      fieldRotation
    );
    vec2 toGravity = gravityPoint - p;
    float gravityDistance = max(length(toGravity), 0.08);
    vec2 lensDirection = rotateVector(normalize(vec2(1.0, 1.0)), fieldRotation);
    float lensEmphasis = smoothstep(-0.5, 0.82, dot(p, lensDirection));
    float gravityPull = outerLens * (0.105 + lensEmphasis * 0.13)
      / (0.78 + gravityDistance * 0.46);
    planetP += normalize(toGravity) * gravityPull * uRefraction;

    vec2 flowDirection = rotateVector(normalize(vec2(-0.58, -1.0)), fieldRotation);
    planetP += flowDirection * outerLens * (0.05 + lensEmphasis * 0.12) * uRefraction;

    // A dedicated outer gravitational lens. It compresses and shears the
    // panorama before the silhouette ends, so it reads as bent content rather
    // than as a decorative ring placed over the image.
    vec2 gravityDirection = normalize(toGravity + vec2(0.0001));
    vec2 gravityTangent = vec2(-gravityDirection.y, gravityDirection.x);
    float directionalShear = dot(p, gravityTangent);
    planetP += gravityDirection * outerLens * (0.032 + lensEmphasis * 0.055) * uRefraction;
    planetP += gravityTangent * outerLens * directionalShear * 0.045 * uRefraction;
    planetP *= 1.0 - outerLens * 0.1 * uRefraction;

    vec2 pointerP = (uPointer - 0.5) * 2.0;
    vec2 toPointer = pointerP - p;
    float pointerReach = exp(-dot(toPointer, toPointer) * 4.2);
    planetP += normalize(toPointer + vec2(0.0001))
      * pointerReach * outerLens * 0.012 * uRefraction;

    // ReactBits Cursor Wave × Minimal Ripple: one eased liquid front with a
    // broad undertow, rather than a stack of decorative concentric rings.
    vec2 ripplePoint = (uRippleOrigin - 0.5) * 2.0;
    vec2 fromRipple = p - ripplePoint;
    float rippleDistance = length(fromRipple);
    vec2 rippleDirection = normalize(fromRipple + vec2(0.0001));
    float rippleFront = uRippleAge * 0.72;
    float rippleDelta = rippleDistance - rippleFront;
    float rippleWidth = mix(0.22, 0.115, smoothstep(0.0, 1.45, uRippleAge));
    float rippleProfile = clamp(
      1.0 - abs(rippleDelta) / max(rippleWidth, 0.001),
      0.0,
      1.0
    );
    float rippleLead = pow(sin(rippleProfile * TAU * 0.5), 1.35);
    float undertowProfile = clamp(
      1.0 - abs(rippleDelta + rippleWidth * 0.82) / (rippleWidth * 1.45),
      0.0,
      1.0
    );
    float rippleUndertow = sin(undertowProfile * TAU * 0.5) * 0.26;
    float rippleFade = exp(-uRippleAge * 0.56)
      * smoothstep(0.025, 0.14, rippleFront)
      * uRippleActive;
    float rippleWave = (rippleLead - rippleUndertow) * rippleFade;
    planetP += rippleDirection * rippleWave * 0.034;
    normal = normalize(normal + vec3(rippleDirection * rippleWave * 0.08, 0.0));

    float planetRadius = clamp(length(planetP), 0.0, 1.0);

    // Normal images and videos stay completely undistorted through the centre.
    // Spherical compression blends in only inside the outer lens band.
    float sphereCompression = mix(
      0.58,
      0.94,
      pow(planetRadius, 1.55)
    );
    vec2 compressedSphereP = planetP * sphereCompression;
    vec2 sphereP = mix(planetP, compressedSphereP, outerLens);
    vec3 incident = normalize(vec3(0.0, 0.0, -1.0));
    vec3 refracted = refract(incident, normal, 1.0 / 1.43);
    sphereP += refracted.xy * outerLens * 0.052 * uRefraction;
    vec2 sphereUv = coverUv(sphereP * 0.5 + 0.5);

    // Only source media that is genuinely close to the 2:1 equirectangular
    // format receives the polar tiny-planet projection.
    float panoramaMix = smoothstep(1.86, 1.98, uMediaAspect);
    float longitude = atan(planetP.y, planetP.x);
    float stereoAngle = 2.0 * atan(planetRadius * 1.18);
    float stereoMax = 2.0 * atan(1.18);
    float latitude = clamp(stereoAngle / stereoMax, 0.0, 1.0);

    // Put the inevitable panorama seam at the lower-left, where the reference
    // naturally carries its strongest compression and shadow.
    vec2 planetUv = vec2(
      fract(longitude / TAU + 0.375),
      0.985 - latitude * 0.97
    );
    planetUv = transformMediaUv(planetUv);
    planetUv = vec2(fract(planetUv.x), clamp(planetUv.y, 0.001, 0.999));

    float aberration = (
      outerLens * 0.0038
      + abs(rippleWave) * 0.00045
    ) * uRefraction;
    vec3 sphereColor = sampleChromatic(sphereUv, planetP, aberration);
    vec3 panoramaColor = sampleChromatic(planetUv, vec2(0.0, 1.0), aberration);
    vec3 color = mix(sphereColor, panoramaColor, panoramaMix);

    vec3 lightDirection = normalize(vec3(0.58, 0.7, 0.54));
    float light = max(dot(normal, lightDirection), 0.0);
    float broadHighlight = pow(light, 4.2);
    float sharpHighlight = pow(light, 28.0);
    float fresnel = pow(1.0 - z, 2.35);
    float lowerLeft = exp(-dot(p - gravityPoint, p - gravityPoint) * 4.1);

    vec3 prism = 0.5 + 0.5 * cos(TAU * (fresnel * 0.82 + vec3(0.03, 0.36, 0.69)));
    float surfaceLight = mix(0.82, 1.075, smoothstep(-0.72, 0.85, dot(normal.xy, vec2(0.55, 0.72))));
    color *= mix(1.0, surfaceLight, outerLens);
    color += vec3(1.0, 0.985, 0.97) * broadHighlight * outerLens * 0.16 * uRefraction;
    color += vec3(1.0) * sharpHighlight * outerLens * 0.46 * uRefraction;
    color += prism * fresnel * (0.012 + outerLens * 0.04) * uRefraction;
    color += vec3(0.12, 0.45, 0.54) * lowerLeft * outerLens * 0.025 * uRefraction;
    color += prism * outerLens * 0.016 * uRefraction;
    color += vec3(0.94, 0.985, 1.0) * max(rippleWave, 0.0) * 0.012;

    // The silhouette emerges from compression, Fresnel colour and shadow,
    // rather than from a separately drawn outline.
    color = mix(color, color * vec3(0.82, 0.84, 0.89), fresnel * 0.09);

    gl_FragColor = vec4(color, alpha);
  }
`;

function useMediaTexture(
  src: string,
  kind: MediaLensKind,
  sourceCanvas?: HTMLCanvasElement | null,
) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    let video: HTMLVideoElement | null = null;
    let image: HTMLImageElement | null = null;
    let ownedTexture: THREE.Texture | null = null;
    let revealFrame = 0;
    const abortController = new AbortController();

    if (sourceCanvas) {
      const canvasTexture = new THREE.CanvasTexture(sourceCanvas);
      // The live WebGL canvas already contains display-referred output. Treat
      // its pixels as untagged here so the lens does not decode the same sRGB
      // values a second time and make the subject darker than the viewport.
      canvasTexture.colorSpace = THREE.NoColorSpace;
      canvasTexture.minFilter = THREE.LinearFilter;
      canvasTexture.magFilter = THREE.LinearFilter;
      canvasTexture.wrapS = THREE.ClampToEdgeWrapping;
      canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
      canvasTexture.generateMipmaps = false;
      ownedTexture = canvasTexture;
      revealFrame = window.requestAnimationFrame(() => {
        if (!disposed) setTexture(canvasTexture);
      });
    } else if (kind === "video") {
      video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";

      const videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.wrapS = THREE.ClampToEdgeWrapping;
      videoTexture.wrapT = THREE.ClampToEdgeWrapping;
      ownedTexture = videoTexture;
      const revealVideo = () => {
        if (!disposed) setTexture(videoTexture);
      };
      video.addEventListener("loadeddata", revealVideo, { once: true });
      void video.play().catch(() => undefined);
    } else if (kind === "gif") {
      void fetch(src, { signal: abortController.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`GIF request failed: ${response.status}`);
          return response.arrayBuffer();
        })
        .then((buffer) => {
          if (disposed) return;

          const parsedGif = parseGIF(buffer);
          const frames = decompressFrames(parsedGif, true);
          if (frames.length === 0) return;

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(parsedGif.lsd.width, 1);
          canvas.height = Math.max(parsedGif.lsd.height, 1);
          const context = canvas.getContext("2d", { alpha: true });
          const patchCanvas = document.createElement("canvas");
          const patchContext = patchCanvas.getContext("2d", { alpha: true });
          if (!context || !patchContext) return;

          let frameIndex = -1;
          let elapsedMs = 0;
          let restoreImage: ImageData | null = null;

          const drawFrame = (nextIndex: number) => {
            if (frameIndex >= 0) {
              const previous = frames[frameIndex];
              if (previous.disposalType === 2) {
                const { left, top, width, height } = previous.dims;
                context.clearRect(left, top, width, height);
              } else if (previous.disposalType === 3 && restoreImage) {
                context.putImageData(restoreImage, 0, 0);
              }
            }

            const frame: ParsedFrame = frames[nextIndex];
            const { left, top, width, height } = frame.dims;
            if (frame.disposalType === 3) {
              restoreImage = context.getImageData(0, 0, canvas.width, canvas.height);
            } else {
              restoreImage = null;
            }

            patchCanvas.width = width;
            patchCanvas.height = height;
            const imageData = patchContext.createImageData(width, height);
            imageData.data.set(frame.patch);
            patchContext.putImageData(imageData, 0, 0);
            context.drawImage(patchCanvas, left, top);
            frameIndex = nextIndex;
          };

          drawFrame(0);

          const gifTexture = new THREE.CanvasTexture(canvas);
          gifTexture.colorSpace = THREE.SRGBColorSpace;
          gifTexture.minFilter = THREE.LinearFilter;
          gifTexture.magFilter = THREE.LinearFilter;
          gifTexture.wrapS = THREE.ClampToEdgeWrapping;
          gifTexture.wrapT = THREE.ClampToEdgeWrapping;
          gifTexture.userData.frameCount = frames.length;
          gifTexture.userData.advanceFrame = (deltaSeconds: number) => {
            elapsedMs += deltaSeconds * 1000;
            let changed = false;
            let safety = 0;

            while (safety < frames.length) {
              const delay = Math.max(frames[frameIndex].delay || 100, 20);
              if (elapsedMs < delay) break;
              elapsedMs -= delay;
              drawFrame((frameIndex + 1) % frames.length);
              changed = true;
              safety += 1;
            }

            return changed;
          };
          ownedTexture = gifTexture;
          setTexture(gifTexture);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error("Unable to decode GIF", error);
        });
    } else {
      image = document.createElement("img");
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => {
        if (disposed || !image) return;

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(image.naturalWidth, 1);
        canvas.height = Math.max(image.naturalHeight, 1);
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) return;

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.minFilter = THREE.LinearFilter;
        canvasTexture.magFilter = THREE.LinearFilter;
        canvasTexture.wrapS = THREE.ClampToEdgeWrapping;
        canvasTexture.wrapT = THREE.ClampToEdgeWrapping;
        ownedTexture = canvasTexture;
        setTexture(canvasTexture);
      };
      image.src = src;
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(revealFrame);
      abortController.abort();
      ownedTexture?.dispose();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (image) {
        image.onload = null;
        image.removeAttribute("src");
      }
    };
  }, [kind, sourceCanvas, src]);

  return texture;
}

function textureAspect(texture: THREE.Texture) {
  const image = texture.image as
    | HTMLImageElement
    | HTMLVideoElement
    | { width?: number; height?: number };
  const width = "videoWidth" in image && image.videoWidth
    ? image.videoWidth
    : image.width ?? 1;
  const height = "videoHeight" in image && image.videoHeight
    ? image.videoHeight
    : image.height ?? 1;
  return height > 0 ? width / height : 1;
}

function LensPlane({
  src,
  sourceCanvas,
  kind,
  shape,
  edgeWidth,
  cornerRadius,
  refraction,
  mediaScale,
  mediaOffsetX,
  mediaOffsetY,
  mediaRotation,
  lensAngle,
  pointerRef,
  rippleRef,
}: {
  src: string;
  sourceCanvas?: HTMLCanvasElement | null;
  kind: MediaLensKind;
  shape: MediaLensShape;
  edgeWidth: number;
  cornerRadius: number;
  refraction: number;
  mediaScale: number;
  mediaOffsetX: number;
  mediaOffsetY: number;
  mediaRotation: number;
  lensAngle: number;
  pointerRef: RefObject<THREE.Vector2>;
  rippleRef: RefObject<RippleState>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const smoothPointer = useRef(new THREE.Vector2(0.5, 0.5));
  const texture = useMediaTexture(src, kind, sourceCanvas);
  const { size } = useThree();

  const uniforms = useMemo(
    () => ({
      uTexture: { value: texture },
      uTime: { value: 0 },
      uViewportAspect: { value: 1 },
      uMediaAspect: { value: 1 },
      uMediaScale: { value: 1 },
      uMediaOffset: { value: new THREE.Vector2(0, 0) },
      uMediaRotation: { value: 0 },
      uLensAngle: { value: Math.PI / 4 },
      uRefraction: { value: 1 },
      uEdgeWidth: { value: 0.3 },
      uShape: { value: 0 },
      uRoundness: { value: 0.5 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uRippleAge: { value: 10 },
      uRippleActive: { value: 0 },
    }),
    [texture],
  );

  // R3F render loops intentionally mutate Three.js GPU resources through refs.
  // eslint-disable-next-line react-hooks/immutability
  useFrame((state, delta) => {
    if (!texture || !meshRef.current || !materialRef.current) return;

    if (kind === "gif") {
      const advanceFrame = texture.userData.advanceFrame;
      if (typeof advanceFrame === "function" && advanceFrame(delta)) {
        // eslint-disable-next-line react-hooks/immutability
        texture.needsUpdate = true;
      }
    }

    if (sourceCanvas) {
      // A live R3F canvas is a dynamic TexImageSource. Upload its newest frame
      // before the refractive pass so the preview uses the actual animation.
      texture.needsUpdate = true;
    }

    const target = pointerRef.current ?? new THREE.Vector2(0.5, 0.5);
    const ease = 1 - Math.exp(-delta / 0.18);
    smoothPointer.current.lerp(target, ease);

    const liveUniforms = materialRef.current.uniforms;
    liveUniforms.uTime.value = state.clock.elapsedTime;
    liveUniforms.uViewportAspect.value = size.width / Math.max(size.height, 1);
    liveUniforms.uMediaAspect.value = textureAspect(texture);
    liveUniforms.uMediaScale.value = mediaScale;
    liveUniforms.uMediaOffset.value.set(mediaOffsetX / 100, mediaOffsetY / 100);
    liveUniforms.uMediaRotation.value = THREE.MathUtils.degToRad(mediaRotation);
    liveUniforms.uLensAngle.value = THREE.MathUtils.degToRad(lensAngle);
    liveUniforms.uRefraction.value = refraction;
    liveUniforms.uEdgeWidth.value = 0.14 + (edgeWidth / 44) * 0.34;
    liveUniforms.uShape.value = shape === "circle" ? 0 : 1;
    liveUniforms.uRoundness.value = THREE.MathUtils.clamp(
      (cornerRadius - 24) / 136,
      0,
      1,
    );
    liveUniforms.uPointer.value.copy(smoothPointer.current);

    const ripple = rippleRef.current;
    if (ripple) {
      if (ripple.active > 0) {
        ripple.age += delta;
        if (ripple.age > 2.35) ripple.active = 0;
      }
      liveUniforms.uRippleOrigin.value.copy(ripple.origin);
      liveUniforms.uRippleAge.value = ripple.age;
      liveUniforms.uRippleActive.value = ripple.active;
    }
  });

  if (!texture) return null;

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function MediaLensFrame({
  src,
  sourceCanvas,
  kind = "image",
  shape = "circle",
  borderWidth = 22,
  cornerRadius = 72,
  refraction = 0.9,
  mediaScale = 1,
  mediaOffsetX = 0,
  mediaOffsetY = 0,
  mediaRotation = 0,
  lensAngle = 45,
  alt = "Uploaded media inside a refractive glass frame",
  className,
}: MediaLensFrameProps) {
  const pointerRef = useRef(new THREE.Vector2(0.5, 0.5));
  const rippleRef = useRef<RippleState>({
    origin: new THREE.Vector2(0.5, 0.5),
    age: 10,
    active: 0,
  });
  const radius = shape === "circle" ? "9999px" : `${cornerRadius}px`;
  const lensRadians = THREE.MathUtils.degToRad(lensAngle);
  const lensHighlightX = 50 + Math.cos(lensRadians) * 36;
  const lensHighlightY = 50 - Math.sin(lensRadians) * 36;
  const lensShadowX = 50 - Math.cos(lensRadians) * 34;
  const lensShadowY = 50 + Math.sin(lensRadians) * 34;
  const frameStyle: LensStyle = {
    "--lens-radius": radius,
    borderRadius: radius,
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerRef.current.set(
      (event.clientX - bounds.left) / bounds.width,
      1 - (event.clientY - bounds.top) / bounds.height,
    );
  };

  const resetPointer = () => {
    pointerRef.current.set(0.5, 0.5);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = 1 - (event.clientY - bounds.top) / bounds.height;
    pointerRef.current.set(x, y);
    rippleRef.current.origin.set(x, y);
    rippleRef.current.age = 0;
    rippleRef.current.active = 1;
  };

  return (
    <div
      className={`media-lens-frame relative isolate cursor-pointer touch-manipulation overflow-hidden bg-white/12 shadow-[18px_28px_74px_rgba(31,45,96,0.24),-12px_-12px_42px_rgba(255,255,255,0.8)] ${className ?? ""}`}
      style={frameStyle}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerLeave={resetPointer}
      aria-label={alt}
    >
      <Canvas
        className="pointer-events-none absolute inset-0"
        dpr={[1, 2]}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        orthographic
        camera={{
          position: [0, 0, 1],
          zoom: 1,
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
        }}
      >
        <LensPlane
          src={src}
          sourceCanvas={sourceCanvas}
          kind={kind}
          shape={shape}
          edgeWidth={borderWidth}
          cornerRadius={cornerRadius}
          refraction={refraction}
          mediaScale={mediaScale}
          mediaOffsetX={mediaOffsetX}
          mediaOffsetY={mediaOffsetY}
          mediaRotation={mediaRotation}
          lensAngle={lensAngle}
          pointerRef={pointerRef}
          rippleRef={rippleRef}
        />
      </Canvas>

      <div
        className="pointer-events-none absolute inset-0 mix-blend-screen"
        style={{
          borderRadius: radius,
          background: `radial-gradient(ellipse 48% 30% at ${lensHighlightX}% ${lensHighlightY}%, rgba(255,255,255,.44), transparent 72%), radial-gradient(ellipse 28% 20% at ${lensShadowX}% ${lensShadowY}%, rgba(97,231,255,.2), transparent 76%)`,
          WebkitMaskImage:
            "radial-gradient(circle, transparent 0 68%, black 88%)",
          maskImage:
            "radial-gradient(circle, transparent 0 68%, black 88%)",
          opacity: 0.28 + refraction * 0.08,
        }}
      />
    </div>
  );
}
