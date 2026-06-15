import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OSIRIS Aeris - Real-Time 3D Flight Tracking",
    short_name: "Aeris",
    description:
      "Track live flights in 3D over selected airspaces using the OSIRIS Aeris deployment.",
    start_url: "/osiris-v2/aeris/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/osiris-v2/aeris/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    categories: ["travel", "navigation", "utilities"],
  };
}
