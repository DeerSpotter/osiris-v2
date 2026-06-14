# OSIRIS Flight Proxy

Cloudflare Worker used by OSIRIS v2 when the app is hosted as a static GitHub Pages site.

The Worker exposes a public read-only flight feed:

```txt
https://osiris-v2.spotterdeer.workers.dev/flights
```

It fetches readsb-compatible ADS-B data from:

1. `airplanes.live`
2. `adsb.lol`

Then it returns the same grouped payload shape used by the OSIRIS Next route:

```json
{
  "commercial_flights": [],
  "private_flights": [],
  "private_jets": [],
  "military_flights": [],
  "gps_jamming": [],
  "total": 0,
  "rendered_total": 0,
  "timestamp": "...",
  "source": "cloudflare worker airplanes.live/adsb.lol readsb /point feed"
}
```

## Deploy

```bash
cd workers/osiris-flight-proxy
npm install
npx wrangler login
npm run deploy
```

After deployment, test:

```txt
https://osiris-v2.spotterdeer.workers.dev/health
https://osiris-v2.spotterdeer.workers.dev/flights
```

## Optional custom feed center

```txt
https://osiris-v2.spotterdeer.workers.dev/flights?lat=40.3&lon=-75&dist=250
```

Radius is clamped to 250 NM to match readsb provider behavior.

## Aeris-compatible proxy mode

```txt
https://osiris-v2.spotterdeer.workers.dev/flights?path=/point/40.3000/-75.0000/250&provider=airplanes
```

Supported providers:

```txt
airplanes
adsb
```

## CORS

The Worker returns public CORS headers so GitHub Pages can call it directly from the browser.
