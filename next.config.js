/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.CAMPUSVOICE_DIST_DIR || ".next",
};

module.exports = nextConfig;
