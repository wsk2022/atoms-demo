/** @type {import('next').NextConfig} */
// 子路径部署：构建/运行时设 BASE_PATH=/atoms_demo，前端资源与路由挂到该前缀下。
const basePath = process.env.BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};
module.exports = nextConfig;
