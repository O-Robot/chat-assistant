import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portfolio Chat Admin",
    short_name: "Chat Admin",
    description: "Secure portfolio chat support workspace.",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    theme_color: "#7c3aed",
    background_color: "#ffffff",
    icons: [{ src: "/images/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" }],
  };
}
