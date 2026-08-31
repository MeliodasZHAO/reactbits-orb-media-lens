import AVFoundation
import AppKit
import CoreImage
import Foundation

guard CommandLine.arguments.count >= 3 else {
  fputs("Usage: make-seamless-video <input-video> <output-video> [output-fps]\n", stderr)
  exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let requestedFrameRate = CommandLine.arguments.count >= 4
  ? Int32(CommandLine.arguments[3])
  : 60
guard let outputFrameRate = requestedFrameRate,
      (24...120).contains(outputFrameRate) else {
  fputs("output-fps must be an integer from 24 through 120.\n", stderr)
  exit(2)
}
try? FileManager.default.removeItem(at: outputURL)

let asset = AVURLAsset(url: inputURL)
guard let track = asset.tracks(withMediaType: .video).first else {
  fputs("No video track found.\n", stderr)
  exit(3)
}

let duration = asset.duration.seconds
let sourceFrameRate = max(1, Double(track.nominalFrameRate))
let transformedSize = track.naturalSize.applying(track.preferredTransform)
let sourceWidth = Int(abs(transformedSize.width))
let sourceHeight = Int(abs(transformedSize.height))
let sourceBounds = CGRect(x: 0, y: 0, width: sourceWidth, height: sourceHeight)
let outputWidth = 960
let outputHeight = 960
let outputBounds = CGRect(x: 0, y: 0, width: outputWidth, height: outputHeight)

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

// The final generated frames push the lower-left petals outside the 640px
// source. Stop at the last fully composed bloom instead of preserving a hard
// crop that no later scaling operation can recover.
let usableSourceDuration = duration * 0.87
let sourceFrameCount = max(2, Int(floor(usableSourceDuration * sourceFrameRate)))
var sourceFrames: [CIImage] = []
sourceFrames.reserveCapacity(sourceFrameCount)

for frame in 0..<sourceFrameCount {
  let seconds = min(Double(frame) / sourceFrameRate, duration - 0.001)
  let time = CMTime(seconds: seconds, preferredTimescale: 600)
  let image = try generator.copyCGImage(at: time, actualTime: nil)
  sourceFrames.append(CIImage(cgImage: image))
}

// H.264 has no alpha channel. Replace only the bright, low-chroma generated
// backdrop with exact white. A tone curve was previously used here, but it
// also raised the flower highlights and visibly overexposed the subject. This
// keyed treatment leaves saturated blue/green detail untouched while making
// the source edge identical to the larger white safety canvas.
let backgroundWhitenKernel = CIColorKernel(source: """
kernel vec4 whitenGeneratedBackground(
  __sample pixel,
  float sourceMaximumX,
  float sourceMaximumY
) {
  vec2 coordinate = destCoord();
  float maximum = max(pixel.r, max(pixel.g, pixel.b));
  float minimum = min(pixel.r, min(pixel.g, pixel.b));
  float chroma = maximum - minimum;
  float luminance = dot(pixel.rgb, vec3(0.2126, 0.7152, 0.0722));
  float brightBackground = smoothstep(0.82, 0.93, luminance);
  float neutralBackground = 1.0 - smoothstep(0.02, 0.09, chroma);
  float replacement = smoothstep(
    0.55,
    0.82,
    brightBackground * neutralBackground
  );
  float edgeDistance = min(
    min(coordinate.x, sourceMaximumX - coordinate.x),
    min(coordinate.y, sourceMaximumY - coordinate.y)
  );
  float edgeContinuity = smoothstep(1.5, 14.0, edgeDistance);
  vec3 keyedColor = mix(pixel.rgb, vec3(1.0), replacement);
  return vec4(mix(vec3(1.0), keyedColor, edgeContinuity), 1.0);
}
""")!

sourceFrames = sourceFrames.map { frame in
  backgroundWhitenKernel.apply(
    extent: sourceBounds,
    arguments: [
      frame,
      CGFloat(sourceWidth - 1),
      CGFloat(sourceHeight - 1),
    ]
  )!.cropped(to: sourceBounds)
}

let outputDuration = 6.0
let outputFrameCount = Int(outputDuration * Double(outputFrameRate))
let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let writerInput = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: outputWidth,
    AVVideoHeightKey: outputHeight,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 7_500_000,
      AVVideoExpectedSourceFrameRateKey: outputFrameRate,
      AVVideoMaxKeyFrameIntervalKey: outputFrameRate * 2,
      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
  ]
)
writerInput.expectsMediaDataInRealTime = false

let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: writerInput,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: outputWidth,
    kCVPixelBufferHeightKey as String: outputHeight,
    kCVPixelBufferIOSurfacePropertiesKey as String: [:],
  ]
)

guard writer.canAdd(writerInput) else {
  fputs("Unable to add the video writer input.\n", stderr)
  exit(4)
}
writer.add(writerInput)
guard writer.startWriting() else {
  throw writer.error ?? NSError(domain: "VideoWriter", code: 1)
}
writer.startSession(atSourceTime: .zero)

let context = CIContext(options: [.cacheIntermediates: false])
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let background = CIImage(color: CIColor(red: 1, green: 1, blue: 1, alpha: 1))
  .cropped(to: outputBounds)
let sourcePadding: CGFloat = 4
let paddedSourceBounds = sourceBounds.insetBy(
  dx: -sourcePadding,
  dy: -sourcePadding
)
let paddedSourceBackground = CIImage(
  color: CIColor(red: 1, green: 1, blue: 1, alpha: 1)
).cropped(to: paddedSourceBounds)
let fitScale = min(
  CGFloat(outputWidth) / CGFloat(sourceWidth),
  CGFloat(outputHeight) / CGFloat(sourceHeight)
)
let safeScale = fitScale * 0.84
let safeTransform = CGAffineTransform(
  translationX: outputBounds.midX,
  y: outputBounds.midY
)
  .scaledBy(x: safeScale, y: safeScale)
  .translatedBy(x: -sourceBounds.midX, y: -sourceBounds.midY)

for outputFrame in 0..<outputFrameCount {
  while !writerInput.isReadyForMoreMediaData {
    Thread.sleep(forTimeInterval: 0.002)
  }

  // A cosine path goes from the first generated frame to the last and back.
  // Its velocity reaches zero at both ends, avoiding the snap of a triangular
  // ping-pong loop while keeping the middle of each movement decisive.
  let normalizedTime = Double(outputFrame) / Double(outputFrameCount)
  let motionProgress = 0.5 - 0.5 * cos(normalizedTime * 2 * Double.pi)
  let sourcePosition = motionProgress * Double(sourceFrames.count - 1)
  let lowerIndex = min(sourceFrames.count - 1, Int(floor(sourcePosition)))
  let upperIndex = min(sourceFrames.count - 1, lowerIndex + 1)
  let blend = sourcePosition - Double(lowerIndex)

  let dissolve = CIFilter(name: "CIDissolveTransition")!
  dissolve.setValue(sourceFrames[lowerIndex], forKey: kCIInputImageKey)
  dissolve.setValue(sourceFrames[upperIndex], forKey: kCIInputTargetImageKey)
  dissolve.setValue(blend, forKey: kCIInputTimeKey)
  // Give the keyed frame a small real white bleed before scaling. Otherwise
  // Core Image's linear sampler mixes its final pixel with transparent black,
  // which becomes a grey rectangle when the lens magnifies the result.
  let blended = (dissolve.outputImage ?? sourceFrames[lowerIndex])
    .cropped(to: sourceBounds)
    .composited(over: paddedSourceBackground)
    .cropped(to: paddedSourceBounds)
    .transformed(by: safeTransform)
    .cropped(to: outputBounds)
    .composited(over: background)
    .cropped(to: outputBounds)

  guard let pool = adaptor.pixelBufferPool else {
    fputs("Video pixel buffer pool is unavailable.\n", stderr)
    exit(5)
  }
  var optionalBuffer: CVPixelBuffer?
  let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &optionalBuffer)
  guard status == kCVReturnSuccess, let pixelBuffer = optionalBuffer else {
    fputs("Unable to allocate an output frame.\n", stderr)
    exit(6)
  }

  context.render(blended, to: pixelBuffer, bounds: outputBounds, colorSpace: colorSpace)
  let presentationTime = CMTime(value: Int64(outputFrame), timescale: outputFrameRate)
  guard adaptor.append(pixelBuffer, withPresentationTime: presentationTime) else {
    throw writer.error ?? NSError(domain: "VideoWriter", code: 2)
  }
}

writerInput.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting {
  semaphore.signal()
}
semaphore.wait()

guard writer.status == .completed else {
  throw writer.error ?? NSError(domain: "VideoWriter", code: 3)
}

print(
  "Wrote \(outputFrameCount) frames at \(outputFrameRate) FPS "
  + "to \(outputURL.path)"
)
