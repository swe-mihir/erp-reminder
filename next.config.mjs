/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["postgres", "nodemailer", "bcryptjs"],
};
export default nextConfig;
