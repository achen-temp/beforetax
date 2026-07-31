import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these native/worker-based libs out of the server bundle so they load
  // from node_modules at runtime. pdfjs-dist (via pdf-to-img) otherwise can't
  // resolve its pdf.worker file when webpack/turbopack bundles it.
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'sharp', 'heic-convert', 'tesseract.js'],
};

export default nextConfig;
