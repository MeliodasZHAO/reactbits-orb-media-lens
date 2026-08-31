import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public preview tunnels proxy the dev server through a different hostname.
  // Without this, Next can serve the HTML while blocking dev-only client requests,
  // leaving the preview visible but not interactive.
  allowedDevOrigins: [
    "192.168.31.102",
    "*.lhr.life",
    "*.localhost.run",
    "*.serveousercontent.com",
  ],
};

export default nextConfig;
