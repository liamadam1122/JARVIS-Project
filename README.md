# JARVIS

JARVIS is a local assistant for a gaming PC or gaming laptop. It reads CPU, GPU, memory, and temperature on the computer it is running on, then answers with a free settings plan and a paid hardware plan. Spending money is optional.

On a Mac, or on a ThinkPad without a separate gaming GPU, it is a readings window. It can show CPU, GPU, memory, and fan speed when the operating system exposes them. It cannot tune a Mac graphics chip, and it cannot overclock a laptop that has no discrete GPU.

## Download

This folder is the download. You need [Node.js 20 or newer](https://nodejs.org/en/download).

Windows: double-click `jarvis/start-windows.bat`.

Mac: double-click `jarvis/start-mac.command`. If macOS blocks it, right-click the file, choose Open, then Open again.

Linux: `chmod +x jarvis/start-linux.sh` and run `./jarvis/start-linux.sh`.

The page opens at http://127.0.0.1:4173. Readings stay on that computer. Chat can use a cloud model only when the operator has already configured a key on that machine. Keys live in `jarvis/data/` and are not part of this download.

The app is free. Pay the maker is in the sidebar. It opens PayPal, the payer chooses the amount in euros, and PayPal keeps a small fee. The payment goes to liamadam1122@gmail.com, so that address needs a PayPal account before any money can arrive.

## Mac app

`jarvis/macos/build-mac.sh` builds a local `JARVIS.app` for the Mac you are on. That app is ad-hoc signed. It has no Apple Team ID, it does not include a sandboxed Node server, and the sensor path on Apple silicon uses undocumented interfaces. That combination cannot be submitted to the Mac App Store. The downloadable way to run JARVIS on a Mac is `start-mac.command`.

## What a gaming PC can actually change

Windows graphics settings, the NVIDIA App or AMD Software, the power plan, and the laptop maker's own performance mode (Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense). JARVIS does not install unknown optimizer tools and it does not change settings by itself.
