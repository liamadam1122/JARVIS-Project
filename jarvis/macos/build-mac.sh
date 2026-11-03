#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p JARVIS.app/Contents/MacOS JARVIS.app/Contents/Resources
cp Info.plist JARVIS.app/Contents/Info.plist
cp PrivacyInfo.xcprivacy JARVIS.app/Contents/Resources/PrivacyInfo.xcprivacy
swiftc -parse-as-library JarvisMain.swift -O -o JARVIS.app/Contents/MacOS/JARVIS -framework Cocoa -framework WebKit
# Ad-hoc signature only. The sandbox entitlement is not applied: a sandboxed
# App Store binary cannot launch Node, and this build has no Apple Team ID.
codesign --force --sign - JARVIS.app
echo "Built macos/JARVIS.app for this Mac. It is not an App Store submission."
