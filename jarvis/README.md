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

The server binds only to `127.0.0.1`, serves this page and a read-only telemetry endpoint. A separate same-origin `POST` runs the fixed, user-confirmed speed test. It rejects other hosts and cross-origin requests.

## What it can report

- On Apple Silicon, CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap use and power; Neural Engine power; and each fan RPM when the provider reports them. Device model and core counts are shown as inventory metadata.
- Live receive/send traffic for all detected network interfaces, with the default interface highlighted. These rates are current traffic, not an internet speed test or the connection's maximum capacity.
- A separate internet speed check runs only when you press its button and confirm. It sends up to 6 MiB of test payload (5 MiB download, 1 MiB upload) through Cloudflare; protocol overhead can add a little. It has a 15-second timeout and a one-minute cooldown. Cloudflare says it collects completed measurements for aggregated connection insights. Avoid running it on metered data. Results are shown in the page and are not saved by JARVIS.
- Input/output voltage and board-pin readings remain unavailable until a compatible, documented meter and pin map are supported. Charger status and power draw are not voltage measurements.

Unavailable, unsupported, and failed readings stay labeled as such. Old readings change to stale. JARVIS does not control fans or send sensor readings to an external service; the optional speed test sends only its test traffic and result to Cloudflare.

The Mac sensor provider uses undocumented Apple sensor interfaces through an MIT-licensed package. macOS updates or hardware differences may make readings unavailable; the dashboard must continue to show that honestly. It only reports metrics exposed by the allowlisted provider and does not probe unknown pins or control fans.
