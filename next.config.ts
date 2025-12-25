import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  // ✅ ปิด ESLint ตอน build (แก้ error circular JSON จาก .eslintrc.json)
  eslint: {
    ignoreDuringBuilds: true,
  },

  reactStrictMode: true,
  compress: true,

  // Add empty turbopack config to silence warning
  turbopack: {},

  // ✅ Next 15 ใช้อันนี้แทน experimental.serverComponentsExternalPackages
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        port: "",
        pathname: "/**",
      },
    ],
  },

  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: "all",
          cacheGroups: {
            default: false,
            vendors: false,
            commons: {
              name: "commons",
              chunks: "all",
              minChunks: 2,
            },
            recharts: {
              name: "recharts",
              test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
              priority: 10,
            },
            lucide: {
              name: "lucide",
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 10,
            },
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
