# JARVIS Assistant — Build Plan

## Goal
Build JARVIS as a local-first system intelligence assistant that understands the user's computer and explains it with evidence. Helping people build apps is not the product's core.

## Product distinction
The target is a time-aware, explainable computer model connecting hardware readings, processes, storage, network activity, and later installed extensions. Findings show their source, sample time, and coverage limits. JARVIS distinguishes facts from hypotheses and never claims overall health from incomplete evidence. Similar monitors and diagnostic assistants already exist, so do not claim nobody has built anything comparable. Differentiate through privacy-first operation, traceable evidence, change-over-time context, and user-approved actions.

## First version (MVP)
- A local system map for hardware, storage, and network readings.
- Plain-language answers grounded in measurements, scan results, and timestamps.
- Explicit unavailable, stale, unsupported, partial-scan, and permission-denied states.
- Read-only inspection by default; ask before changing files, settings, or devices.
- No model API key in the current local inventory chapter.

## Later versions
1. Voice input and spoken replies
2. Saved conversations
3. User-approved tools and app integrations
4. Optional proactive features, with clear controls and permissions

## Suggested beginner stack
- Next.js + TypeScript for the web app
- Tailwind CSS for styling
- A model API called from a server-side route
- GitHub for version history

## Safety rules
- Never put API keys, passwords, or private tokens in source code or GitHub.
- Start with read-only integrations; ask before sending messages, deleting files, spending money, or changing accounts.
- Do not give the assistant unrestricted access to the computer.
- Test each feature before adding the next one.

## First milestone
Run a basic app locally on the Mac before adding AI, voice, or account integrations.

## Current chapter — local telemetry foundation
- Keep `jarvis/index.html` as the existing demo; its replies are still hardcoded and no model is connected.
- `jarvis/server.mjs` is an optional local bridge bound to `127.0.0.1`. It serves the page, read-only telemetry, a user-confirmed fixed speed test, and a user-confirmed storage scan; it exposes no arbitrary file or shell operations.
- On supported Apple Silicon Macs, the bridge reports every metric exposed by the installed provider: CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap usage and power; Neural Engine power; and each reported fan RPM. It also shows SoC model and core counts.
- Network counters cover all detected interfaces, with the default interface highlighted. They show live traffic, distinct from the optional manually started Cloudflare speed test, which sends up to 6 MiB of test payload after a confirmation notice.
- All detected mounted-volume capacity entries are shown. A user-confirmed scan reads names and size metadata under the home folder, including hidden entries, but does not read contents or upload/save the inventory. macOS-protected paths may produce a partial scan. File-size sums are approximate; APFS volume figures may overlap.
- Voltage input/output and physical board-pin readings remain unavailable until a compatible, documented meter and safe pin map are supported.
- No API key is needed for telemetry. Keep secrets out of Git; never add fan controls or arbitrary shell/device access.

## Next chapters
1. Add process-level CPU, memory, disk I/O, and network attribution with documented macOS APIs; connect resource spikes to apps without guessing.
2. Compare local snapshots over time and explain what changed, with an evidence trail and no automatic cleanup.
3. Add supported extension/plugin and startup-item inventory with explicit permission states.
4. Validate hardware coverage on supported Mac models; add separate Windows/Linux adapters only where data sources and permissions are documented.
5. Add voltage-meter support only for a documented, calibrated device and pin map.
6. Decide separately whether to keep the local HTML app or migrate frameworks. Do not connect a model API until secure server-side key handling and data minimization are planned.
