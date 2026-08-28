"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export interface GradientBlobProps {
  /** Width of the component in pixels or CSS value */
  width?: number | string;
  /** Height of the component in pixels or CSS value */
  height?: number | string;
  /** Animation speed multiplier */
  speed?: number;
  /** Primary blob color in hex format */
  primaryColor?: string;
  /** Secondary blob color in hex format */
  secondaryColor?: string;
  /** Accent highlight color in hex format */
  accentColor?: string;
  /** Base color for the blob in hex format */
  baseColor?: string;
  /** Blob size multiplier */
  size?: number;
  /** Morphing intensity (0-1) */
  morphIntensity?: number;
  /** Enable cursor-based morphing */
  enableCursorMorph?: boolean;
  /** Enable breathing animation effect */
  breathe?: boolean;
  /** Duration of one breath cycle in seconds */
  breatheDuration?: number;
  /** Delay between breath cycles in seconds */
  breatheDelay?: number;
  /** Enable parallax movement based on cursor */
  parallax?: boolean;
  /** Strength of parallax effect (0-1) */
  parallaxStrength?: number;
  /** Metallic surface appearance (0-1) */
  metallic?: number;
  /** Overall blob opacity (0-1) */
  opacity?: number;
  /** Rotation speed multiplier */
  rotationSpeed?: number;
  /** Enable automatic rotation */
  autoRotate?: boolean;
  /** Enable touch interaction on mobile */
  touchEnabled?: boolean;
  /** Quality preset for performance/visual tradeoff */
  quality?: "low" | "medium" | "high";
  /** Maximum frames per second cap */
  maxFPS?: number;
  /** Pause rendering when component is off-screen */
  pauseWhenOffscreen?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Content to render on top of the blob */
  children?: React.ReactNode;
}

const GradientBlob: React.FC<GradientBlobProps> = ({
  width = "100%",
  height = "100%",
  speed = 1.0,
  primaryColor = "#5227FF",
  secondaryColor = "#FF9FFC",
  accentColor = "#B19EEF",
  baseColor = "#27C5FF",
  size = 1.0,
  morphIntensity = 0.5,
  enableCursorMorph = true,
  breathe = false,
  breatheDuration = 2.0,
  breatheDelay = 0.5,
  parallax = false,
  parallaxStrength = 0.5,
  metallic = 0.0,
  opacity = 1.0,
  rotationSpeed = 1.0,
  autoRotate = true,
  touchEnabled = true,
  quality = "medium",
  maxFPS = 60,
  pauseWhenOffscreen = true,
  className,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2(0.5, 0.5));
  const parallaxOffsetRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const parallaxTargetRef = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const isVisibleRef = useRef<boolean>(true);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
          }
        : { r: 1, g: 1, b: 1 };
    };

    const primary = hexToRgb(primaryColor);
    const secondary = hexToRgb(secondaryColor);
    const accent = hexToRgb(accentColor);
    const base = hexToRgb(baseColor);

    const rect = container.getBoundingClientRect();
    const actualWidth = rect.width;
    const actualHeight = rect.height;

    const qualitySettings = {
      low: { pixelRatio: 1, marchSteps: 32, antialias: false },
      medium: {
        pixelRatio: Math.min(window.devicePixelRatio, 2),
        marchSteps: 64,
        antialias: true,
      },
      high: {
        pixelRatio: Math.min(window.devicePixelRatio, 3),
        marchSteps: 96,
        antialias: true,
      },
    };
    const settings = qualitySettings[quality];

    const renderer = new THREE.WebGLRenderer({
      antialias: settings.antialias,
      alpha: true,
      powerPreference: "high-performance",
      stencil: false,
      depth: false,
    });
    renderer.setClearColor(0x000000, 0);

    const pixelRatio = settings.pixelRatio;
    renderer.setSize(actualWidth, actualHeight, false);
    renderer.setPixelRatio(pixelRatio);

    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const bufferWidth = actualWidth * pixelRatio;
    const bufferHeight = actualHeight * pixelRatio;

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector3(bufferWidth, bufferHeight, 1.0) },
      iMouse: {
        value: new THREE.Vector2(bufferWidth * 0.5, bufferHeight * 0.5),
      },
      uPrimaryColor: {
        value: new THREE.Vector3(primary.r, primary.g, primary.b),
      },
      uSecondaryColor: {
        value: new THREE.Vector3(secondary.r, secondary.g, secondary.b),
      },
      uAccentColor: { value: new THREE.Vector3(accent.r, accent.g, accent.b) },
      uBaseColor: { value: new THREE.Vector3(base.r, base.g, base.b) },
      uBlobSize: { value: 3.0 * size },
      uMorphIntensity: { value: morphIntensity },
      uEnableCursorMorph: { value: enableCursorMorph ? 1.0 : 0.0 },
      uBreathe: { value: breathe ? 1.0 : 0.0 },
      uBreatheDuration: { value: breatheDuration },
      uBreatheDelay: { value: breatheDelay },
      uParallaxOffset: { value: new THREE.Vector2(0, 0) },
      uMetallic: { value: metallic },
      uOpacity: { value: opacity },
      uRotationSpeed: { value: rotationSpeed },
      uAutoRotate: { value: autoRotate ? 1.0 : 0.0 },
      uMaxSteps: { value: settings.marchSteps },
    };

    const vertexShader = `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float iTime;
      uniform vec3 iResolution;
      uniform vec2 iMouse;
      uniform vec3 uPrimaryColor;
      uniform vec3 uSecondaryColor;
      uniform vec3 uAccentColor;
      uniform vec3 uBaseColor;
      uniform float uBlobSize;
      uniform float uMorphIntensity;
      uniform float uEnableCursorMorph;
      uniform float uBreathe;
      uniform float uBreatheDuration;
      uniform float uBreatheDelay;
      uniform vec2 uParallaxOffset;
      uniform float uMetallic;
      uniform float uOpacity;
      uniform float uRotationSpeed;
      uniform float uAutoRotate;
      uniform int uMaxSteps;

      const vec3 LIGHT_POSITION = vec3(0.0, -5.0, -5.0);
      const vec3 CAMERA_POSITION = vec3(0.0, 0.0, 5.0);
      const float MAX_DISTANCE = 100.0;
      const float SURFACE_THRESHOLD = 0.001;

      float distanceToSphere(vec3 point, float radius) {
        return length(point) - radius;
      }

      vec3 rotatePoint(vec3 point, float timeValue) {
        if (uAutoRotate < 0.5) {
          return point;
        }

        float angleX = sin(timeValue * uRotationSpeed) * 0.3;
        float angleZ = angleX * 2.0;

        float cosX = cos(angleX);
        float sinX = sin(angleX);
        float cosZ = cos(angleZ);
        float sinZ = sin(angleZ);

        float rotatedX = point.x * cosX - point.y * sinX;
        float rotatedY = point.x * sinX + point.y * cosX;

        float rotatedZ = point.y * sinZ + point.z * cosZ;

        return vec3(rotatedX, rotatedY, rotatedZ);
      }

      float sceneDistance(vec3 point) {
        float baseDist = distanceToSphere(point, uBlobSize);

        vec2 normalizedMouse = iMouse / iResolution.xy;
        vec2 center = vec2(0.5, 0.5);
        float distanceFromCenter = length(normalizedMouse - center);

        float cursorInfluence = uEnableCursorMorph * clamp(
          distanceFromCenter * 0.5,
          0.05,
          0.25
        );

        vec3 scaledPoint = point * 2.0;
        float wave1 = cos(scaledPoint.x + iTime) * sin(scaledPoint.y + iTime * 0.5);
        float wave2 = sin(scaledPoint.z + iTime * 0.7) * cos(scaledPoint.x - iTime);
        float wave3 = cos(scaledPoint.y - iTime * 0.3) * sin(scaledPoint.z + iTime * 0.9);
        float displacement = (wave1 + wave2 + wave3) * 0.33 * cursorInfluence * uMorphIntensity;

        if (uBreathe > 0.5) {
          float cycleTime = uBreatheDuration + uBreatheDelay;
          float breathePhase = mod(iTime, cycleTime);
          float breatheAmount = 0.0;

          if (breathePhase < uBreatheDuration) {
            breatheAmount = sin(breathePhase / uBreatheDuration * 3.14159) * 0.15;
          }

          displacement += breatheAmount * uMorphIntensity;
        }

        return baseDist + displacement;
      }

      vec3 calculateNormal(vec3 point) {
        vec3 rotated = rotatePoint(point, iTime);

        const float h = 0.001;
        const vec2 k = vec2(1.0, -1.0);

        vec3 normal = normalize(
          k.xyy * sceneDistance(rotated + k.xyy * h) +
          k.yyx * sceneDistance(rotated + k.yyx * h) +
          k.yxy * sceneDistance(rotated + k.yxy * h) +
          k.xxx * sceneDistance(rotated + k.xxx * h)
        );

        return normal;
      }

      vec3 blendColorByNormal(vec3 normal) {
        vec3 color = mix(
          uPrimaryColor,
          uSecondaryColor,
          smoothstep(0.3, 0.7, normal.x + 0.45)
        );

        color = mix(
          color,
          uAccentColor,
          smoothstep(0.3, 0.7, normal.y + 0.3)
        );

        color = mix(
          color,
          uBaseColor,
          smoothstep(0.9, 1.2, normal.y + 0.3)
        );

        return color;
      }

      vec3 calculateGlowColor(vec3 samplePoint) {
        vec3 surfaceNormal = calculateNormal(samplePoint);

        vec3 glow = mix(
          uPrimaryColor,
          uSecondaryColor,
          smoothstep(-1.0, 1.0, surfaceNormal.x)
        );

        vec3 highlightBlend = mix(
          uAccentColor,
          uBaseColor,
          smoothstep(1.0, 3.0, surfaceNormal.y)
        );

        glow = mix(
          glow,
          highlightBlend,
          smoothstep(-1.0, 1.0, surfaceNormal.y)
        );

        return glow;
      }

      vec3 raymarch(vec3 rayOrigin, vec3 rayDirection) {
        vec3 glowSamplePoint = rayOrigin + rayDirection * 3.0;
        vec3 glowColor = calculateGlowColor(glowSamplePoint);

        float totalDistance = 0.0;
        float minStepSize = 0.001;

        for (int i = 0; i < uMaxSteps; i++) {
          vec3 currentPoint = rayOrigin + rayDirection * totalDistance;
          float dist = sceneDistance(currentPoint);

          if (dist < SURFACE_THRESHOLD) {
            vec3 surfaceNormal = calculateNormal(currentPoint);
            vec3 baseColor = blendColorByNormal(surfaceNormal);

            vec3 lightDirection = normalize(currentPoint - LIGHT_POSITION);
            float diffuse = max(0.0, dot(surfaceNormal, lightDirection));

            vec3 viewDirection = normalize(rayOrigin - currentPoint);
            vec3 reflectDirection = reflect(-lightDirection, surfaceNormal);
            float specular = pow(max(dot(viewDirection, reflectDirection), 0.0), 32.0);

            vec3 litColor = mix(
              baseColor * diffuse,
              baseColor * (diffuse + specular),
              uMetallic
            );

            float distanceToCenter = length(currentPoint.xy);
            if (distanceToCenter > 1.0) {
              return mix(
                litColor,
                glowColor,
                smoothstep(1.0, 2.3, distanceToCenter)
              );
            }

            return litColor;
          }

          totalDistance += max(dist, minStepSize);

          if (totalDistance > MAX_DISTANCE) break;
        }

        return glowColor;
      }

      void main() {
        vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

        uv += uParallaxOffset * 0.5;

        vec3 rayDirection = normalize(vec3(uv, -1.0));

        vec3 color = raymarch(CAMERA_POSITION, rayDirection);

        gl_FragColor = vec4(color, uOpacity);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: opacity < 1.0,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const handleMove = (x: number, y: number) => {
      const rect = container.getBoundingClientRect();
      const localX = x - rect.left;
      const localY = y - rect.top;

      if (enableCursorMorph) {
        mouseRef.current.set(localX, localY);
        uniforms.iMouse.value.set(localX, localY);
      }

      if (parallax) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetX = ((localX - centerX) / rect.width) * parallaxStrength;
        const offsetY = ((localY - centerY) / rect.height) * parallaxStrength;

        parallaxTargetRef.current.set(offsetX, -offsetY);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      handleMove(event.clientX, event.clientY);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 0) {
        handleMove(event.touches[0].clientX, event.touches[0].clientY);
      }
    };

    if (enableCursorMorph || parallax) {
      container.addEventListener("mousemove", handleMouseMove);
      if (touchEnabled) {
        container.addEventListener("touchmove", handleTouchMove, {
          passive: true,
        });
      }
    }

    let observer: IntersectionObserver | null = null;
    if (pauseWhenOffscreen) {
      observer = new IntersectionObserver(
        (entries) => {
          isVisibleRef.current = entries[0].isIntersecting;
        },
        { threshold: 0 },
      );
      observer.observe(container);
    }

    startTimeRef.current = performance.now();
    lastFrameTimeRef.current = performance.now();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      if (pauseWhenOffscreen && !isVisibleRef.current) {
        return;
      }

      const now = performance.now();
      const frameDuration = 1000 / maxFPS;
      if (now - lastFrameTimeRef.current < frameDuration) {
        return;
      }
      lastFrameTimeRef.current = now;

      const elapsed = (now - startTimeRef.current) / 1000;
      uniforms.iTime.value = elapsed * speed;

      if (parallax) {
        const dampingFactor = 0.1;
        parallaxOffsetRef.current.lerp(
          parallaxTargetRef.current,
          dampingFactor,
        );
        uniforms.uParallaxOffset.value.copy(parallaxOffsetRef.current);
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const newRect = container.getBoundingClientRect();
      const newWidth = newRect.width;
      const newHeight = newRect.height;

      renderer.setSize(newWidth, newHeight, false);

      const newBufferWidth = newWidth * pixelRatio;
      const newBufferHeight = newHeight * pixelRatio;
      uniforms.iResolution.value.set(newBufferWidth, newBufferHeight, 1.0);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (enableCursorMorph || parallax) {
        container.removeEventListener("mousemove", handleMouseMove);
        if (touchEnabled) {
          container.removeEventListener("touchmove", handleTouchMove);
        }
      }
      if (observer) {
        observer.disconnect();
      }
      cancelAnimationFrame(rafRef.current);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [
    speed,
    primaryColor,
    secondaryColor,
    accentColor,
    baseColor,
    size,
    morphIntensity,
    enableCursorMorph,
    breathe,
    breatheDuration,
    breatheDelay,
    parallax,
    parallaxStrength,
    metallic,
    opacity,
    rotationSpeed,
    autoRotate,
    touchEnabled,
    quality,
    maxFPS,
    pauseWhenOffscreen,
  ]);

  const widthStyle = typeof width === "number" ? `${width}px` : width;
  const heightStyle = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        width: widthStyle,
        height: heightStyle,
      }}
    >
      <div ref={containerRef} className="absolute inset-0" />
      {children && (
        <div className="relative z-10 w-full h-full pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
};

GradientBlob.displayName = "GradientBlob";

export default GradientBlob;
