# JARVIS

JARVIS is a local assistant for a gaming PC or gaming laptop. It reads CPU, GPU, memory, and temperature on the computer it is running on, then answers with a free settings plan and a paid hardware plan. Spending money is optional.

On a Mac, or on a ThinkPad without a separate gaming GPU, it is a readings window. It can show CPU, GPU, memory, and fan speed when the operating system exposes them. It cannot tune a Mac graphics chip, and it cannot overclock a laptop that has no discrete GPU.

## Download

Downloads are on the [latest release](https://github.com/liamadam1122/JARVIS-Project/releases/latest).

Mac: download `JARVIS-mac.zip` or `JARVIS.dmg`. Unzip the zip, or open the disk image. Double-click JARVIS. If it is not in Applications yet, it says to drag JARVIS to Applications. Open it from Applications after that. Node is already inside the app. If macOS says it cannot check the developer, right-click the Applications copy, choose Open, then Open again.

Windows gaming PC: download `JARVIS-gaming-pc.zip`.

Windows gaming laptop: download `JARVIS-gaming-laptop.zip`.

Any other Windows computer: download `JARVIS-windows-computer.zip`.

Those three Windows files are the same app. Pick the name that matches the computer. Unzip the folder, then double-click `JARVIS.cmd`. Node is already inside the zip. You do not install Node.js separately, and you do not open the `app` folder.

The source in this repository also runs without those downloads. From source on Windows, Mac browser mode, or Linux, you still need [Node.js 20 or newer](https://nodejs.org/en/download).

Windows, from a release zip: double-click `JARVIS.cmd`. From this repo folder: double-click `jarvis/start-windows.bat`.

Mac, browser version: double-click `jarvis/start-mac.command`. If macOS blocks it, right-click the file, choose Open, then Open again.

Linux: `chmod +x jarvis/start-linux.sh` and run `./jarvis/start-linux.sh`.

The page opens at http://127.0.0.1:4173. Readings stay on that computer. Chat can use a cloud model only when the operator has already configured a key on that machine. Keys live in `jarvis/data/` and are not part of this download.

The app is free. Pay the maker is in the sidebar. It opens PayPal, the payer chooses the amount in euros, and PayPal keeps a small fee. The payment goes to liamadam1122@gmail.com, so that address needs a PayPal account before any money can arrive.

## Mac app

`jarvis/macos/build-mac.sh` builds `JARVIS.app`, `jarvis/macos/dist/JARVIS-mac.zip`, and `jarvis/macos/dist/JARVIS.dmg`. The app is a universal Mac binary and includes its own Node, so the person who downloads it does not install Node. Opening the zip gives you the app. Opening the disk image shows JARVIS and an Applications folder. Drag JARVIS onto Applications. The first double-click, while the app is still in Downloads, only shows "Drag JARVIS to Applications" and opens those two folders. After it is in Applications, opening it starts JARVIS.

The app is ad-hoc signed. It has no Apple Team ID, so macOS may say it cannot check the developer. Right-click the copy in Applications, choose Open, then Open again. It cannot be submitted to the Mac App Store. `start-mac.command` still opens the browser version.

## How to film an ad

From `jarvis`, `npm run record` saves a real session to `jarvis/data/demo-session.json` with usernames, paths, and hardware addresses removed. `npm run demo` replays that file and shows a Demo replay pill. `?clean=1` only moves the pill. `?layout=vertical` hides the Pay the maker button and the operator key fields. The replay never invents a sensor value that was not recorded.

## What a gaming PC can actually change

Windows graphics settings, the NVIDIA App or AMD Software, the power plan, and the laptop maker's own performance mode (Lenovo Vantage, Legion Toolkit, Armoury Crate, MSI Center, or PredatorSense). JARVIS does not install unknown optimizer tools and it does not change settings by itself.
