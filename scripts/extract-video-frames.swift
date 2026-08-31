import AVFoundation
import AppKit
import Foundation

guard CommandLine.arguments.count >= 3 else {
  fputs("Usage: extract-video-frames <video> <output-directory>\n", stderr)
  exit(2)
}

let videoURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
let fileManager = FileManager.default
try? fileManager.removeItem(at: outputURL)
try fileManager.createDirectory(at: outputURL, withIntermediateDirectories: true)

let asset = AVURLAsset(url: videoURL)
let duration = asset.duration.seconds
guard duration.isFinite, duration > 0 else {
  fputs("Unable to read video duration.\n", stderr)
  exit(3)
}

if let track = asset.tracks(withMediaType: .video).first {
  let transformedSize = track.naturalSize.applying(track.preferredTransform)
  print(
    "duration=\(String(format: "%.3f", duration))s "
    + "size=\(Int(abs(transformedSize.width)))x\(Int(abs(transformedSize.height))) "
    + "fps=\(String(format: "%.3f", track.nominalFrameRate)) "
    + "bitrate=\(Int(track.estimatedDataRate))"
  )
}

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let sampleCount = 16
for index in 0..<sampleCount {
  let seconds = duration * Double(index) / Double(sampleCount - 1)
  let requestedTime = CMTime(seconds: min(seconds, duration - 0.001), preferredTimescale: 600)
  var actualTime = CMTime.zero
  let image = try generator.copyCGImage(at: requestedTime, actualTime: &actualTime)
  let representation = NSBitmapImageRep(cgImage: image)
  guard let png = representation.representation(using: .png, properties: [:]) else {
    continue
  }
  let name = String(format: "frame-%02d-%05.2fs.png", index, actualTime.seconds)
  try png.write(to: outputURL.appendingPathComponent(name))
}
