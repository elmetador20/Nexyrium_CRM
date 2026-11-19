import type { MetadataRoute } from "next";

/** Web app manifest so NEXYRIUM can be installed to a phone or desktop home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/dashboard",
    name: "NEXYRIUM Business OS",
    short_name: "NEXYRIUM",
    description: "CRM, finance and operations for Nexyrium.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F9F8",
    theme_color: "#245B45",
    categories: ["business", "productivity", "finance"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Leads", url: "/crm/leads", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Pipeline", url: "/crm/pipeline", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add expense", url: "/expenses/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
