# JARVIS Telemetry Design

## Purpose

JARVIS should show trustworthy, read-only device telemetry. It must distinguish a measured value from an estimate, an unsupported sensor, a failed read, and a reading that has gone stale. It must never invent a value to make the dashboard look complete.

## Shared reading contract

Every provider returns independent readings with this shape:

```ts
type ReadingStatus = "available" | "unavailable" | "unsupported" | "stale" | "error";

type Reading = {
  metric: string;
  value: number | null;
  unit: "V" | "°C" | "rpm" | "Mbps" | "%" | "W" | "MHz" | "GiB" | "level";
  status: ReadingStatus;
  source: string | null;
  sampledAt: string | null; // ISO 8601 timestamp
  detail: string;
};
```

Rules:

- A number is shown only when `status === "available"`, `value` is finite, and the source reports a valid sample timestamp.
- A reading older than its metric-specific maximum age changes to `stale`; the UI keeps the old number visibly marked stale or hides it, but never labels it live.
- Missing hardware, permission denial, unsupported models, and provider errors are separate outcomes. One failed sensor must not hide other readings.
- Keep sensor identity and unit with every value. Do not combine unlike sensors into one unlabeled number.
- Use UTC timestamps on the wire; localize them only in the display.

## Metric meanings

### Voltage input and output

- Keep input and output as separate metrics, with units and identified source hardware.
- Device telemetry may expose internal voltage rails on some models, but those rails are not the same as wall-power or USB-C input/output.
- Accurate external input/output voltage requires a compatible, calibrated measurement device and a documented protocol. Never infer it from charger status, battery percentage, or power draw.
- Physical motherboard or connector-pin readings also need a board-specific pin map and a compatible meter. JARVIS must never probe unknown pins.
- This first dashboard therefore reports both as unavailable until a supported source is connected.

### Temperature and fan speed

- macOS exposes a system thermal state that describes thermal pressure; it is not a numeric CPU/GPU temperature. See Apple's `ProcessInfo.thermalState` documentation: https://developer.apple.com/documentation/foundation/processinfo/thermalstate
- Raw temperature and fan RPM are best-effort, model-specific readings. A platform adapter must identify its source and report unsupported where it cannot read reliably.
- JARVIS is read-only for this feature. It must not set fan speed or change thermal policies.

### Network

- Separate live interface throughput (derived from byte-counter deltas over a known interval) from an internet speed test.
- A speed test runs only after the user starts it, names the test source, reports when it ran, and explains that it transfers data. Do not run one at startup or in the background.
- VPNs, virtual adapters, sleep, and counter resets can make throughput uncertain; surface the source/interface and return unavailable rather than a misleading result.

## Cross-platform provider architecture

Use one UI and shared reading contract, with capability-based adapters per operating system:

- macOS: public thermal-pressure state where available; raw sensors only through a read-only adapter that is compatible with the specific Mac and macOS version.
- Windows: use only sensors surfaced by supported system/hardware providers; missing vendor or driver support means unavailable.
- Linux: use supported kernel/device sensor interfaces when present and permitted; missing permissions or drivers means unavailable.
- External voltage instruments are separate device adapters, not assumptions inside any OS provider.

Discovery is explicit and read-only. Enumerate supported providers and their declared capabilities; do not issue arbitrary shell commands or probe unknown devices from the browser.

## Local security boundary

A browser-only HTML file cannot directly read host sensors. The current chapter adds a small local Node bridge bound only to loopback. It serves the JARVIS page and a single read-only telemetry endpoint, rejects unexpected Host and Origin headers, and exposes neither shell execution nor arbitrary device access. The Apple Silicon reader is optional; network counters remain independent if sensor support is missing. Stop the bridge with Control+C to end sensor access.

No model API is required for telemetry. No API keys, passwords, or persistent access tokens belong in the repository.

## Delivery sequence

1. **Local telemetry chapter (implemented):** keep the existing HTML demo; add the loopback-only bridge and display every metric the Apple Silicon provider reports: CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap use and power; Neural Engine power; individual fan RPM; device/core metadata; and every network interface, with the default interface highlighted. Keep unavailable readings explicit. This Mac reported CPU/GPU, memory and default-interface readings; it reported no fan RPM, voltage measurement or Neural Engine power. The provider does not expose thermal pressure.
2. **Reliability and portability:** verify provider behavior across supported macOS versions and models, and add Windows/Linux adapters only when their data source and permission behavior are documented.
3. **Internet speed test (implemented):** the user starts a short Cloudflare test and confirms a notice describing up to 6 MiB of test payload, possible connection overhead, and Cloudflare's collection of completed measurements for aggregate insights. A local endpoint uses fixed URLs, caps transfer, applies a timeout and cooldown, and does not save results. Do not run at startup or in the background.
4. **External voltage devices:** support only a specified, documented meter and validate input/output readings against a safe reference.

Every chapter keeps unavailable, stale, permission-denied, and error states visible and preserves the previous working demo.
