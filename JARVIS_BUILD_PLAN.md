# JARVIS Assistant — Build Plan

## Goal
Build JARVIS as a local-first system intelligence assistant that understands the user's computer and explains it with evidence. Helping people build apps is not the product's core.

## Product distinction
The long-term target is a personal, local computer twin for Liam's real workflows (school, coding, and app development). It learns a privacy-preserving baseline for each chosen workflow, connects changes across hardware, processes, storage, network, and installed extensions, and explains likely causes with sources, timestamps, and confidence.

Its optimization loop should propose one reversible change at a time, state the expected benefit and risk, ask Liam before applying it, then measure before/after under a comparable workload and show whether it helped. No silent cleanup or unverified "speed up" claims. This is a differentiation target, not a claim of proven novelty: system monitors and diagnostic assistants already exist, including NVIDIA's G-Assist on supported RTX systems, so do not promise that nobody has built anything similar.

## Product and business direction
- Target MacBooks and Windows laptops first, including gaming laptops; Chromebooks are out of scope. Keep the UI and reading contract shared, with separate local providers for macOS, Windows, and Linux.
- The current Mac prototype uses local, rule-based answers grounded in the detected model and readings. Optional AI can come later, with a clear preview and opt-in before any device data leaves the laptop.
- Keep basic local inventory and safety guidance useful for free. Treat about €10/month as a pricing hypothesis to validate, potentially for opt-in AI, saved workflow baselines, and supported optimization hand-offs—not a promise or a requirement for basic diagnostics.
- Prefer first-party or free supported tools. For Windows RTX laptops, NVIDIA's own app provides automatic tuning on supported GPUs; later JARVIS can explain and link to a vendor tool rather than silently changing power, voltage, firmware, or fan controls.
- Never promise a generic GPU unlock or 2× performance gain. Results depend on the exact laptop, GPU, cooling, power limits, workload, and game settings.

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
- All detected mounted-volume capacity entries are shown. A user-confirmed scan walks every accessible mounted volume, including hidden paths and mounted removable or network volumes; it reads names and size metadata only, skips symbolic links and nested mount boundaries, and does not read contents or upload/save the inventory. macOS-protected paths may produce a partial scan. File-size sums are approximate; APFS volume figures may overlap.
- Voltage input/output and physical board-pin readings remain unavailable until a compatible, documented meter and safe pin map are supported.
- No API key is needed for telemetry. Keep secrets out of Git; never add fan controls or arbitrary shell/device access.

## Next chapters
1. Add process-level CPU, memory, disk I/O, and network attribution with documented macOS APIs; connect resource spikes to apps without guessing.
2. Learn separate local baselines for school, coding, and idle sessions only when Liam chooses those labels; let him inspect and delete the stored history.
3. Build the first optimization experiment: state a measured issue, offer one reversible change, ask first, and compare fresh before/after readings.
4. Add supported extension/plugin and startup-item inventory with explicit permission states.
5. Validate the local inventory and available readings on this Mac, then add a read-only Windows gaming-laptop adapter and verify it on real Intel/AMD/NVIDIA hardware; add Linux after that. Report missing vendor sensors without elevation or workarounds.
6. Add voltage-meter support only for a documented, calibrated device and pin map.
7. Decide separately whether to keep the local HTML app or migrate frameworks. Do not connect a model API until secure server-side key handling and data minimization are planned.
