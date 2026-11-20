/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Expose only whether the server proxy is configured, never its upstream URL.
  env: { NEXT_PUBLIC_LAVA_RPC_PROXY: process.env.LAVA_RPC_URL ? "true" : "false" },
};

module.exports = nextConfig;
