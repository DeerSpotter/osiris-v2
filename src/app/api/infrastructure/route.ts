import { NextResponse } from 'next/server';

/**
 * OSIRIS — Global Infrastructure API
 * Tracks critical global infrastructure points, currently focusing on active Nuclear Power Plants.
 * OSINT dashboards monitor these due to high strategic and environmental importance.
 */

const NUCLEAR_FACILITIES = [
  // Europe
  { id: 'nuc-ua-zaporizhzhia', name: 'Zaporizhzhia Nuclear Power Plant', city: 'Enerhodar', country: 'Ukraine', lat: 47.5113, lng: 34.5861, status: 'Active Conflict Zone', reactors: 6, capacityMW: 5700, owner: 'Energoatom (Russian controlled)' },
  { id: 'nuc-ua-rivne', name: 'Rivne Nuclear Power Plant', city: 'Varash', country: 'Ukraine', lat: 51.3278, lng: 25.8917, status: 'Operational', reactors: 4, capacityMW: 2835, owner: 'Energoatom' },
  { id: 'nuc-fr-gravelines', name: 'Gravelines Nuclear Power Station', city: 'Gravelines', country: 'France', lat: 51.0125, lng: 2.1363, status: 'Operational', reactors: 6, capacityMW: 5460, owner: 'EDF' },
  { id: 'nuc-fr-cattenom', name: 'Cattenom Nuclear Power Plant', city: 'Cattenom', country: 'France', lat: 49.4158, lng: 6.2181, status: 'Operational', reactors: 4, capacityMW: 5200, owner: 'EDF' },
  { id: 'nuc-uk-sizewell', name: 'Sizewell B Nuclear Power Station', city: 'Leiston', country: 'UK', lat: 52.2131, lng: 1.6186, status: 'Operational', reactors: 1, capacityMW: 1198, owner: 'EDF Energy' },
  
  // North America
  { id: 'nuc-us-palo-verde', name: 'Palo Verde Generating Station', city: 'Tonopah', country: 'US', lat: 33.3886, lng: -112.8617, status: 'Operational', reactors: 3, capacityMW: 3937, owner: 'APS' },
  { id: 'nuc-us-browns-ferry', name: 'Browns Ferry Nuclear Plant', city: 'Athens', country: 'US', lat: 34.7042, lng: -87.1186, status: 'Operational', reactors: 3, capacityMW: 3400, owner: 'TVA' },
  { id: 'nuc-us-south-texas', name: 'South Texas Project', city: 'Bay City', country: 'US', lat: 28.7950, lng: -96.0481, status: 'Operational', reactors: 2, capacityMW: 2560, owner: 'STP Nuclear' },
  { id: 'nuc-ca-bruce', name: 'Bruce Nuclear Generating Station', city: 'Tiverton', country: 'Canada', lat: 44.3253, lng: -81.5997, status: 'Operational', reactors: 8, capacityMW: 6503, owner: 'Bruce Power' },
  { id: 'nuc-ca-darlington', name: 'Darlington Nuclear Generating Station', city: 'Bowmanville', country: 'Canada', lat: 43.8719, lng: -78.7183, status: 'Operational', reactors: 4, capacityMW: 3512, owner: 'OPG' },

  // Asia
  { id: 'nuc-cn-hongyanhe', name: 'Hongyanhe Nuclear Power Plant', city: 'Dalian', country: 'China', lat: 39.7944, lng: 121.4800, status: 'Operational', reactors: 6, capacityMW: 6366, owner: 'CGN' },
  { id: 'nuc-cn-yangjiang', name: 'Yangjiang Nuclear Power Station', city: 'Yangjiang', country: 'China', lat: 21.7061, lng: 112.2597, status: 'Operational', reactors: 6, capacityMW: 6000, owner: 'CGN' },
  { id: 'nuc-cn-tianwan', name: 'Tianwan Nuclear Power Plant', city: 'Lianyungang', country: 'China', lat: 34.6869, lng: 119.4597, status: 'Operational', reactors: 6, capacityMW: 6050, owner: 'CNNC' },
  { id: 'nuc-jp-kashiwazaki', name: 'Kashiwazaki-Kariwa', city: 'Kashiwazaki', country: 'Japan', lat: 37.4286, lng: 138.5958, status: 'Suspended', reactors: 7, capacityMW: 7965, owner: 'TEPCO' },
  { id: 'nuc-jp-fukushima', name: 'Fukushima Daiichi (Decommissioning)', city: 'Okuma', country: 'Japan', lat: 37.4211, lng: 141.0328, status: 'Destroyed / Decommissioning', reactors: 6, capacityMW: 0, owner: 'TEPCO' },
  { id: 'nuc-kr-kori', name: 'Kori Nuclear Power Plant', city: 'Busan', country: 'South Korea', lat: 35.3197, lng: 129.2894, status: 'Operational', reactors: 7, capacityMW: 7489, owner: 'KHNP' },
  { id: 'nuc-kr-hanul', name: 'Hanul Nuclear Power Plant', city: 'Uljin', country: 'South Korea', lat: 37.0933, lng: 129.3831, status: 'Operational', reactors: 6, capacityMW: 5928, owner: 'KHNP' },
  
  // Middle East & Russia
  { id: 'nuc-ru-kursk', name: 'Kursk Nuclear Power Plant', city: 'Kurchatov', country: 'Russia', lat: 51.6742, lng: 35.6033, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ru-leningrad', name: 'Leningrad Nuclear Power Plant', city: 'Sosnovy Bor', country: 'Russia', lat: 59.8406, lng: 29.0433, status: 'Operational', reactors: 4, capacityMW: 4000, owner: 'Rosenergoatom' },
  { id: 'nuc-ir-bushehr', name: 'Bushehr Nuclear Power Plant', city: 'Bushehr', country: 'Iran', lat: 28.8292, lng: 50.8864, status: 'Operational', reactors: 1, capacityMW: 915, owner: 'AEOI' },
  { id: 'nuc-ae-barakah', name: 'Barakah Nuclear Power Plant', city: 'Al Dhafra', country: 'UAE', lat: 23.9686, lng: 52.2356, status: 'Operational', reactors: 4, capacityMW: 5380, owner: 'ENEC' },
];

export async function GET() {
  // We can easily expand this to fetch from a database or remote JSON.
  // For now, this curated static list provides immediate high-value OSINT data.
  return NextResponse.json({
    infrastructure: NUCLEAR_FACILITIES,
    total: NUCLEAR_FACILITIES.length,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=86400' } // Cache for 1 day
  });
}
