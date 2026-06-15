import type { MetadataRoute } from "next";
import { CITIES } from "@/lib/cities";

export const dynamic = "force-static";

const siteUrl = "https://deerspotter.github.io/osiris-v2/aeris";
const lastModified = new Date("2026-06-15T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...CITIES.map((city) => ({
      url: `${siteUrl}/city/${city.iata.toLowerCase()}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
