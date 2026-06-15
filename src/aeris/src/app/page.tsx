import { FlightTracker } from "@/components/flight-tracker";
import { isAirspaceConfigured } from "@/lib/airspace-config";

const siteUrl = "https://deerspotter.github.io/osiris-v2/aeris";

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${siteUrl}/#app`,
    name: "OSIRIS Aeris",
    url: siteUrl,
    description:
      "Track live flights in 3D over selected airspaces using the OSIRIS Aeris deployment.",
    applicationCategory: "TravelApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires WebGL support",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/OnlineOnly",
    },
    author: {
      "@type": "Person",
      name: "DeerSpotter",
      url: "https://github.com/DeerSpotter/osiris-v2",
    },
    featureList: [
      "Real-time 3D flight tracking",
      "Altitude-aware color rendering",
      "Live ADS-B data from multiple sources",
      "3D aircraft models",
      "City-based airspace views",
      "Live ATC audio streaming",
      "Flight trail visualization",
      "Aircraft photo lookup",
      "Dark mode interface",
    ],
    screenshot:
      "https://github.com/user-attachments/assets/9d1f50ed-be4e-4ef5-95ac-257e9129f8c8",
    softwareVersion: "0.8.4-osiris",
    isAccessibleForFree: true,
    inLanguage: "en",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: "OSIRIS Aeris",
    url: siteUrl,
    description:
      "Real-time 3D flight tracking as an OSIRIS Aeris mode deployment.",
    inLanguage: "en",
    publisher: {
      "@type": "Person",
      name: "DeerSpotter",
      url: "https://github.com/DeerSpotter/osiris-v2",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "OSIRIS Aeris - Real-Time 3D Flight Tracking",
        item: siteUrl,
      },
    ],
  },
];

export default function Home() {
  const airspaceAvailable = isAirspaceConfigured();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <FlightTracker airspaceAvailable={airspaceAvailable} />
    </>
  );
}
