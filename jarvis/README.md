# JARVIS local system inventory

JARVIS is being built as a local-first computer intelligence assistant, not a generic app-building chatbot. This chapter has no model API and requires no API key.

## Run

Requirements: Node.js 20 or newer and pnpm. Install a current Node.js LTS release from [nodejs.org](https://nodejs.org/en/download) and follow the [pnpm installation guide](https://pnpm.io/installation) if `node -v` or `pnpm -v` is unavailable.

```sh
cd jarvis
pnpm install --frozen-lockfile
pnpm start
```

Open http://127.0.0.1:4173 in a browser. Stop the bridge with Control+C.

The server binds only to `127.0.0.1`. It serves the page and read-only telemetry, plus same-origin actions for a fixed, user-confirmed speed test and a user-confirmed mounted-volume metadata scan. It rejects other hosts, cross-origin requests, arbitrary paths, and shell commands.

## What it can report

- Capacity and used/free space for detected mounted volumes. APFS volumes may share capacity, so entries can overlap.
- Largest files and folders across accessible mounted volumes after you confirm a scan, including hidden entries and any mounted removable or network volumes. It skips symbolic links, virtual filesystems, and nested mount boundaries, and reports protected paths as inaccessible. JARVIS reads names and size metadata only; it does not open contents or upload/save the inventory. Nested folder totals overlap, and file-size sums are approximate logical sizes.

- On Apple Silicon, CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap use and power; Neural Engine power; and each fan RPM when the provider reports them. Device model and core counts are shown as inventory metadata.
- Live receive/send traffic for all detected network interfaces, with the default interface highlighted. These rates are current traffic, not an internet speed test or the connection's maximum capacity.
- A separate internet speed check runs only when you press its button and confirm. It sends up to 6 MiB of test payload (5 MiB download, 1 MiB upload) through Cloudflare; protocol overhead can add a little. It has a 15-second timeout and a one-minute cooldown. Cloudflare says it collects completed measurements for aggregated connection insights. Avoid running it on metered data. Results are shown in the page and are not saved by JARVIS.
- Input/output voltage and board-pin readings remain unavailable until a compatible, documented meter and pin map are supported. Charger status and power draw are not voltage measurements.

The chat can answer a small set of questions from fresh local readings and the latest scan; it reports when process attribution or broader diagnosis is not connected. Unavailable, unsupported, and failed readings stay labeled as such. Old readings change to stale. JARVIS does not control fans or send sensor readings to an external service; the optional speed test sends only its test traffic and result to Cloudflare.

The Mac sensor provider uses undocumented Apple sensor interfaces through an MIT-licensed package. macOS updates or hardware differences may make readings unavailable; the dashboard must continue to show that honestly. It only reports metrics exposed by the allowlisted provider and does not probe unknown pins or control fans.
