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

## Cloudflare connected Git deploy settings

Use these settings in Cloudflare Workers Builds:

```txt
Root directory: workers/osiris-flight-proxy
Build command: 
Deploy command: npx wrangler deploy
Production branch: master
```

Leave the build command blank. This folder has a tiny matching `package.json` and `package-lock.json` with no install-time dependencies, so Cloudflare's automatic `npm clean-install` step should complete without resolving the full OSIRIS app dependency tree. The deploy command uses `npx wrangler deploy`.

If the build log still lists root app dependencies such as `next`, `react`, `deck.gl`, or `maplibre-gl`, Cloudflare is building an older commit or the root path is still wrong. Retry the latest deployment after this commit, or re-save the path as `workers/osiris-flight-proxy`.

Last deploy trigger marker: 2026-06-14T21:50Z.

## Manual deploy

```bash
cd workers/osiris-flight-proxy
npx wrangler login
npx wrangler deploy
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
