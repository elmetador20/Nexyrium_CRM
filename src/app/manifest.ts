import type { MetadataRoute } from "next";

/** Web app manifest so NEXYRIUM can be installed to a phone or desktop home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "Nexyrium OS",
    short_name: "Nexyrium",
    description: "CRM, finance and operations for Nexyrium.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#EAF0E9",
    theme_color: "#CA4121",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/branding/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/branding/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/branding/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/branding/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Leads", url: "/crm/leads", icons: [{ src: "/branding/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pipeline", url: "/crm/pipeline", icons: [{ src: "/branding/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add expense", url: "/expenses/new", icons: [{ src: "/branding/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
