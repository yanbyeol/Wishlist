/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['wishmate.p-e.kr'],

  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
