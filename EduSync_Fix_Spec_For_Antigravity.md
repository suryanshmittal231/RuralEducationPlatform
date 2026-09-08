# EduSync — Mandatory Fix Specification (Read Before Touching Any Code)

## 0. Purpose of This Document

This document exists because the current build of EduSync **does not actually work** the way it appears to. The core "sync between two phones" feature is fake — it only looks like it works when testing on one device with two browser tabs open. It has never actually sent data between two separate physical phones.

This document is a strict instruction set. It is not a suggestion list. Every "MUST" and "MUST NOT" below is a hard requirement. If something cannot be done exactly as specified, **stop and explain why in plain language** instead of quietly building a fake/simulated version that looks similar.

The person reading your output (Arjit) does not know how to code. He cannot tell the difference between real working code and code that only *looks* like it works. That means the burden of honesty is entirely on you. Do not rely on him to catch a fake implementation — he can't.

---

## 1. What Is Currently Broken (Confirmed by Direct Inspection)

The repository was unzipped and every file was manually inspected. Findings:

1. **The repo is a plain static website only.** There is no `package.json`, no Capacitor configuration, no Android project folder. It cannot become an installable app in its current state — it can only run in a browser.

2. **The "device-to-device sync" feature is completely fake.** In `js/transport.js`, the only working communication method is the browser's `BroadcastChannel` API. `BroadcastChannel` can only pass messages between tabs/windows open in the **same browser, on the same physical device**. It has **zero ability** to communicate with a separate phone. There is no Bluetooth code, no WiFi code, no WebRTC code anywhere in the codebase — despite comments in the code and the original build spec (`EduSync_Antigravity_Build_Spec.md`) claiming these exist.

3. **A previously generated APK (`app-debug.apk`) confirmed this.** Its bundled `capacitor.config.json` was empty (`{}`) and `capacitor.plugins.json` was empty (`[]`) — meaning it was produced by a generic "wrap a website into an APK" tool, not a real Capacitor/native build. Two phones running this APK could never find or sync with each other.

**In short: the flagship feature of this app — the entire reason it exists — has never been tested or proven to work between two real devices, because it is architecturally incapable of doing so right now.**

---

## 2. Non-Negotiable Rules for This Fix

These rules exist specifically to prevent silent faking. Follow them exactly.

### RULE 1 — No same-device-only transports allowed as the "real" solution
`BroadcastChannel`, `localStorage` events, or any other mechanism that only works within one device/browser is **banned** as the actual sync transport. It may only be used, if at all, as a labeled fallback for local testing, and must be clearly marked in code comments as "TEST ONLY — DOES NOT WORK BETWEEN DEVICES."

### RULE 2 — The chosen transport must be demonstrated on two separate physical Android phones
Not two emulators. Not two browser tabs. Not two windows on a laptop. **Two actual phones**, in airplane mode with WiFi/mobile data behavior exactly as specified in the chosen approach below. If this hasn't been tested on two real phones, it is not done — no matter how confident the code looks.

### RULE 3 — No pretend/mocked network calls
Do not write code that simulates a successful connection, a fake "peer found" event, or a hardcoded successful transfer for demo purposes, and present it as functioning. If a demo needs to fall back to a simulated mode because real device sync isn't ready in time, that fallback **must be visibly labeled in the UI** (e.g., a small "DEMO MODE — simulated" badge) — never silently swapped in.

### RULE 4 — Explain trade-offs honestly, every time
Before writing code for a milestone, state in plain language: what will work, what won't, what could go wrong, and how confident you are that it will work on two real phones. Do not say something "works" unless it has actually been run and observed working.

### RULE 5 — One working thing beats five fake things
If time is short, deliver fewer features that are real over more features that are fake. A working WiFi-based sync between two phones is a success. A "Bluetooth" sync that never actually pairs two devices is a failure, even if the UI looks finished.

---

## 3. Transport Approach: Bluetooth Is Primary, WiFi Is Fallback Only

This is not an either/or choice. Priority order, decided in advance:

1. **Bluetooth (Option A below) is the required primary transport.** Build this first and treat it as the real deliverable. This is also what the original build spec asked for, and what actually fits the "zero infrastructure, works anywhere" pitch of this app.
2. **WiFi/local network sync (Option B below) is a fallback only** — something to fall back to only if Bluetooth genuinely cannot be made to work reliably in the time available, or as a secondary transport for larger files if BLE proves too slow for full chapter/video transfers. It is not a shortcut to skip Bluetooth. Do not quietly build the WiFi path first and call it "done" instead of Bluetooth.

Do not half-build both at the same time. Get Bluetooth fully working and tested on two real phones first. Only after that, if there's time left or a specific real need (e.g. BLE is too slow for big files), add WiFi as a secondary path — and make it clear in the UI which transport is actually being used for a given sync, so nobody mistakes a WiFi-fallback demo for the real Bluetooth feature.

### OPTION A — Real Bluetooth Low Energy (PRIMARY — build and finish this first)

**How it works:** Phones discover each other over Bluetooth, without needing any WiFi network at all — genuinely works anywhere, including in classrooms with zero infrastructure. This is the transport the whole app is meant to be built around.

**What must be built:**
- A real Bluetooth Low Energy Capacitor plugin (e.g. `@capacitor-community/bluetooth-le` or equivalent) must be installed and used for actual scanning, advertising, pairing, and data transfer.
- Android runtime permission requests for Bluetooth and location (required by Android for BLE scanning) must be implemented and actually requested from the user, not skipped.
- Data transfer over BLE is slow and has small packet size limits — confirm the chunking logic in `js/syncEngine.js` is adapted to BLE's actual packet size limits, not assumed to work as-is.
- Replace all `BroadcastChannel` calls in `js/transport.js` with real BLE scanning, advertising, and data-channel logic.

**Acceptance test:** Turn off WiFi and mobile data on both phones. Confirm they discover each other via Bluetooth only, pair with the 4-digit code, and transfer at least one real chapter file, with the transfer visibly progressing and completing.

**Time warning:** BLE pairing and reliable data transfer across different Android phone brands is genuinely difficult to get right and often needs multiple rounds of real-device debugging. Budget real time for this — do not assume it will work on the first try, and do not switch to the WiFi fallback just because the first attempt didn't work. Debug it properly first.

### OPTION B — Local WiFi / Hotspot Sync (FALLBACK ONLY — do not build before Option A works)

**How it works:** Both phones join the same WiFi network or one phone's mobile hotspot (no internet required — just a shared local network). One phone (the "host," typically the teacher) runs a small local web server. The other phone (the "client," typically the student) connects to the host's IP address directly, or by scanning a QR code that contains the IP address so nobody has to type it manually.

**What must be built (only once Option A is real and tested):**
- A native capability to run a local WebSocket or HTTP server on-device. This requires a Capacitor plugin (e.g. a local-server plugin) — a plain webview **cannot** open a server by itself. Confirm a working plugin exists and is actually installed and imported before assuming this works.
- Real device discovery: since automatic discovery over plain WiFi is unreliable across Android versions, the fallback discovery method is: host phone displays its local IP address as both text and a QR code; client phone scans it (or types it in as a manual fallback) and connects directly.
- This should sit behind the same transport abstraction as Bluetooth, so `js/syncEngine.js` doesn't need to know which one is active — but the UI must clearly show the user (and Arjit, when testing) which transport is currently in use, so a WiFi-fallback sync is never mistaken for the real Bluetooth feature.

**Acceptance test:** Turn off internet/mobile data on both phones. Connect both to the same WiFi router or one phone's hotspot. Confirm the student phone visibly receives a chapter from the teacher phone with the app running as an installed APK, not in a browser, and that the UI clearly labels this as the WiFi fallback path.

---

## 4. Making the App Installable (Required Regardless of Which Option Is Chosen)

The repo currently cannot produce a real APK. This must be set up properly — not wrapped by a generic online tool.

Required steps, to be actually executed and confirmed working, not just described:

1. Initialize a proper Node.js project in the repo (`package.json`).
2. Install Capacitor (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`).
3. Run Capacitor's init process, correctly setting a real app ID (e.g. `com.ruraleducation.platform`) and app name — do not leave `capacitor.config.json` empty or default.
4. Add the Android platform (`npx cap add android`), which generates a real native Android project folder.
5. Install whichever plugin Option A or Option B requires.
6. Run `npx cap sync android` after any web code change, before rebuilding.
7. Build the actual APK through the generated Android project (via Android Studio or command-line Gradle) — not through any third-party "website to APK" converter tool.
8. Confirm the resulting `capacitor.config.json` inside the built APK is NOT empty, and that `capacitor.plugins.json` correctly lists whichever plugin was used.

---

## 5. Definition of Done (All Boxes Must Be True, Not Assumed)

- [ ] The app installs and runs as an APK on a real Android phone (not just in a browser).
- [ ] Two separate physical phones can discover and pair with each other over real Bluetooth — confirmed by direct observation, not code review alone.
- [ ] At least one educational resource visibly transfers from the teacher phone to the student phone over Bluetooth, with WiFi, mobile data, and internet all turned off on both devices.
- [ ] (Optional, only if built) If a WiFi fallback path was also added, it is clearly labeled as such in the UI and was never used as a substitute for getting Bluetooth working.
- [ ] The student can open that resource on their phone with the app fully offline afterward.
- [ ] A quiz result recorded on the student phone visibly syncs back to the teacher phone.
- [ ] No part of the working demo path relies on `BroadcastChannel`, `localStorage`, or any other same-device-only trick, unless explicitly labeled as a demo fallback in the UI.
- [ ] Every claim of "this works" in your responses is backed by something that was actually run and observed, not assumed from reading the code.

If any box above cannot be checked honestly, the fix is not finished — say so plainly, explain what's blocking it, and propose the next concrete step. Do not mark it done to avoid an awkward conversation.
