import type { MetadataRoute } from "next";
import { CITIES } from "@/lib/cities";

export const dynamic = "force-static";

const siteUrl = "https://deerspotter.github.io/osiris-v2/aeris";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    ...CITIES.map((city) => ({
      url: `${siteUrl}/city/${city.iata.toLowerCase()}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
