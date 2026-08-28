/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: isProd ? "export" : undefined,
  distDir: "dist",
  assetPrefix: isProd ? "./" : undefined,
  images: { unoptimized: true }
};

module.exports = nextConfig;
