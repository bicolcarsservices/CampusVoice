/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.CAMPUSVOICE_DIST_DIR || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
};

module.exports = nextConfig;
