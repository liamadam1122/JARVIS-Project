# JARVIS local telemetry

This is an optional, read-only local bridge for the JARVIS demo. It does not use a model API or require an API key.

## Run

Requirements: Node.js 20 or newer and pnpm. Install a current Node.js LTS release from [nodejs.org](https://nodejs.org/en/download) and follow the [pnpm installation guide](https://pnpm.io/installation) if `node -v` or `pnpm -v` is unavailable.

```sh
cd jarvis
pnpm install --frozen-lockfile
pnpm start
```

Open http://127.0.0.1:4173 in a browser. Stop the bridge with Control+C.

The server binds only to `127.0.0.1`, serves this page and one read-only telemetry endpoint, and rejects other hosts and cross-origin requests.

## What it can report

- On Apple Silicon Macs, CPU/GPU temperature, fan RPM, and macOS thermal pressure when the local provider exposes them.
- Live transfer rates from the primary external network interface. These are current traffic rates, not the maximum speed of the internet connection.
- Input/output voltage remain unavailable until a supported voltage meter is connected. Charger state and power draw are not voltage measurements.

Unavailable, unsupported, and failed readings stay labeled as such. Old readings change to stale. JARVIS does not control fans, run a speed test, or send sensor data to an external service.

The Mac temperature/fan provider uses undocumented Apple sensor interfaces through an MIT-licensed package. macOS updates or hardware differences may make those readings unavailable; the dashboard must continue to show that honestly.
