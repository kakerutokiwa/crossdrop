import type { NextConfig } from "next";
import os from "os";

// Dynamically resolve local IPv4 addresses to allow access from other devices on the same network
const getLocalIPs = () => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // family === 'IPv4' or net.family === 4 in newer Node versions, net.family checks work well
      if ((net.family === "IPv4" || (net.family as unknown) === 4) && !net.internal) {
        ips.push(net.address);
        ips.push(`${net.address}:3000`);
      }
    }
  }
  return ips;
};

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Allow development server access from local network IPs (iPhone etc.)
  allowedDevOrigins: ["localhost", ...getLocalIPs(), "*.local", "*"],
};

export default nextConfig;

