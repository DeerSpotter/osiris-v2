import type { Metadata } from "next";
import { FlightTracker } from "@/components/flight-tracker";
import { isAirspaceConfigured } from "@/lib/airspace-config";
import { CITIES } from "@/lib/cities";
import { buildCanonicalCityPath, findCityByCode } from "@/lib/city-routing";

const siteUrl = "https://deerspotter.github.io/osiris-v2/aeris";

const PRESET_IATAS = CITIES.map((city) => city.iata.toLowerCase());

export async function generateStaticParams() {
  return PRESET_IATAS.map((code) => ({ code }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const city = findCityByCode(code);

  if (!city) {
    return {
      title: "Aeris",
      robots: { index: false, follow: false },
    };
  }

  const iata = city.iata.toUpperCase();
  const canonicalPath = buildCanonicalCityPath(city);
  const title = `Aeris ${city.name} (${iata})`;
  const description = `Aeris 3D airspace view for ${city.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}${canonicalPath}` },
    openGraph: {
      type: "website",
      locale: "en_US",
      url: `${siteUrl}${canonicalPath}`,
      siteName: "Aeris",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const city = findCityByCode(code) ?? CITIES[0];
  const airspaceAvailable = isAirspaceConfigured();

  return <FlightTracker airspaceAvailable={airspaceAvailable} initialCity={city} />;
}
