import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KanyaKanyaNa",
    short_name: "KanyaKanyaNa",
    description: "Your campus community",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6d28d9",
    icons: [{ src: "/kanyakanyana-mark.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
