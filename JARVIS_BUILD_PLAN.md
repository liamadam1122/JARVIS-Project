# JARVIS Assistant — Build Plan

## Goal
Build a futuristic personal AI assistant, starting as a small web app and adding capabilities safely one at a time.

## First version (MVP)
- A clean, futuristic chat interface
- Send a text message and show the assistant's reply
- Loading state and readable error messages
- API key kept in a local environment file, never committed to GitHub

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
- `jarvis/server.mjs` is an optional read-only bridge bound to `127.0.0.1`. It serves the page and telemetry endpoint only.
- On supported Apple Silicon Macs, the bridge reports every metric exposed by the installed provider: CPU/GPU utilization, temperature and power; GPU frequency; RAM/swap usage and power; Neural Engine power; and each reported fan RPM. It also shows SoC model and core counts.
- Network counters cover all detected interfaces, with the default interface highlighted. They show live traffic, not an internet speed test; a speed test must be explicitly started in a later step.
- Voltage input/output and physical board-pin readings remain unavailable until a compatible, documented meter and safe pin map are supported.
- No API key is needed for telemetry. Keep secrets out of Git; never add fan controls or arbitrary shell/device access.

## Next chapters
1. Validate the local bridge on supported macOS versions and models; add only documented sensor providers and keep each reading timestamped.
2. Add a user-started internet speed test with a clear data-transfer notice.
3. Add a documented external voltage meter adapter, if a compatible meter is available.
4. Add separate Windows/Linux providers only where their sensor sources and permission requirements are clear.
5. Decide separately whether to keep the local HTML app or migrate to Next.js; do not connect a model API until a secure server-side route and key handling are planned.
