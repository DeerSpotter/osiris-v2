import { FlightTracker } from "@/components/flight-tracker";
import { isAirspaceConfigured } from "@/lib/airspace-config";
import { CITIES } from "@/lib/cities";
import { findCityByCode } from "@/lib/city-routing";

export function generateStaticParams() {
  return CITIES.map((city) => ({ city: city.iata.toLowerCase() }));
}

type CityPageProps = {
  params: Promise<{ city: string }> | { city: string };
};

export default async function CityPage({ params }: CityPageProps) {
  const resolvedParams = await params;
  const initialCity = findCityByCode(resolvedParams.city) ?? undefined;
  const airspaceAvailable = isAirspaceConfigured();

  return (
    <FlightTracker
      airspaceAvailable={airspaceAvailable}
      initialCity={initialCity}
    />
  );
}
