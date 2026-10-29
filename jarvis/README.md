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

- On Apple Silicon, CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap use and power; Neural Engine power; and each fan RPM when the provider reports them. Device model and core counts are shown as inventory metadata.
- Live receive/send traffic for all detected network interfaces, with the default interface highlighted. These rates are current traffic, not an internet speed test or the connection's maximum capacity.
- Input/output voltage and board-pin readings remain unavailable until a compatible, documented meter and pin map are supported. Charger status and power draw are not voltage measurements.

Unavailable, unsupported, and failed readings stay labeled as such. Old readings change to stale. JARVIS does not control fans, run a speed test, or send sensor data to an external service.

The Mac sensor provider uses undocumented Apple sensor interfaces through an MIT-licensed package. macOS updates or hardware differences may make readings unavailable; the dashboard must continue to show that honestly. It only reports metrics exposed by the allowlisted provider and does not probe unknown pins or control fans.
