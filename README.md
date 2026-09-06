# 📱 EduSync — Offline Rural Education Platform

> **"Learn Offline. Sync Anywhere."**  
> *Smart India Hackathon (SIH) Innovation for Rural & Low-Connectivity Education*

---

## 🌟 Overview

**EduSync** is an offline-first educational platform engineered specifically for rural schools and remote communities where internet connectivity is intermittent, slow, expensive, or completely unavailable. 

Rather than treating digital learning as an internet-dependent cloud service, EduSync enables **device-to-device synchronization of educational resources and student quiz progress** directly over local peer-to-peer transports (Bluetooth / Wi-Fi Direct / Local Mesh / WebRTC) with **zero internet required**.

---

## 🚀 Key Features

### 1. 📴 100% Offline-First Learning
- Pre-loaded NCERT/curriculum modules for Classes 6–10 across Mathematics, Science, English, and Social Science.
- Offline digital notes, interactive concept summaries, practice formulas, and low-bandwidth media.
- Built-in Service Worker and IndexedDB architecture for 100% offline persistence.

### 2. ⚡ Smart Differential Synchronization
- **Manifest Differential Engine**: When a teacher and student device connect, EduSync compares content manifests by cryptographic hashes and version IDs.
- **Transfers Only Missing Content**: If a student already has Chapters 1 and 3, only Chapter 2 is transferred. Zero redundant data usage.
- **Resumable Chunked Transfers**: Files are divided into discrete chunks with integrity checksums. If a connection drops midway, transfers resume seamlessly without starting over.

### 3. 🔄 Two-Way Synchronization Loop
- **Teacher ➡ Student**: Transmits missing lessons, curriculum updates, and offline practice quizzes.
- **Student ➡ Teacher**: Automatically syncs offline quiz scores, completed assignments, and student learning statistics back to the teacher's dashboard upon reconnecting.

### 4. ✍️ Offline Interactive Quiz System
- Students take structured practice quizzes offline with immediate score evaluation and feedback.
- Submissions are queued in local storage (`pending_sync`) and uploaded automatically when in proximity to the teacher.

### 5. 🌐 Instant Bilingual Support
- Built-in dynamic localization toggle between **English** and **Hindi (हिंदी)** with rural-accessible terminology.

---

## 🧭 SIH 10-Step Live Jury Demonstration Flow

1. **Simulate Zero Connectivity**: Turn off Wi-Fi and mobile data on test devices.
2. **Teacher Mode**: Open EduSync, select **Teacher**, and view available curriculum resources.
3. **Add Custom Lesson**: Teacher creates a new lesson (e.g. *Class 8 Science: Force and Pressure*).
4. **Student Mode**: Open EduSync in another window/device, select **Student**, and navigate to *My Learning*.
5. **Observe Missing Badges**: The student app identifies that Chapter 2 and Chapter 3 are not yet on the device.
6. **Device Discovery & 4-Digit Pairing**: Tap **Find Nearby Teachers**, locate the teacher's node, and verify with the 4-digit security code.
7. **Differential Sync**: The Sync Center calculates the delta (`2 resources missing`) and begins chunked transfer.
8. **Test Interrupted Transfer**: Interrupt or pause the sync at 60%, then click **Resume Transfer** to verify that progress continues without restarting from 0%.
9. **Offline Quiz**: Student opens *Microorganisms Quiz*, answers the questions offline, and saves the score (e.g. 4/5 - 80%).
10. **Two-Way Result Sync**: Tap **Sync with Teacher** — the teacher's dashboard updates instantly to reflect the student's quiz scorecard and class analytics.

---

## 💻 Quick Start & Trial Access

### Option 1: Run Locally
No heavy dependencies needed. You can run EduSync with any static server:

```bash
# Using npx serve (Node.js)
npx serve -p 3000

# OR using Python
python -m http.server 3000
```
Open **`http://localhost:3000`** in your browser.

---

### Option 2: Deploy & Install on iPhone (iOS IPA)
We support full iOS deployment with an automated cloud build workflow:
1. Push code to GitHub: `git push origin main`
2. Go to **Actions** ➡ **Build iOS IPA (EduSync)** ➡ Download the **`EduSync-iOS-IPA`** artifact.
3. Sideload onto iPhone using **Sideloadly** or **AltStore** in 2 minutes (no paid Apple Developer account needed).
👉 **See detailed instructions**: [IOS_INSTALLATION_GUIDE.md](file:///c:/Users/surya/Downloads/New%20folder/RuralEducationPlatform/IOS_INSTALLATION_GUIDE.md)

### Option 3: Deploy to GitHub Pages (For Peer & Jury Trials)
This repository is 100% static and ready to deploy with zero build steps:

1. Push this repository to your GitHub account:
   ```bash
   git add .
   git commit -m "feat: complete EduSync offline platform for SIH"
   git push origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** ➡ **Pages**.
   - Under **Build and deployment** ➡ **Branch**, select `main` branch and `/ (root)` folder.
   - Click **Save**.
3. Share the generated GitHub Pages URL with your friends, team, and judges! Anyone can open it on their phone, tap **"Add to Home Screen"**, and use it as a native offline PWA!

---

## 📂 Project Architecture

```text
RuralEducationPlatform/
├── index.html            # Main application shell with PWA meta tags & responsive UI
├── manifest.json         # Progressive Web App manifest for Android installability
├── sw.js                 # Service Worker for 100% offline asset caching
├── css/
│   └── styles.css        # Accessible rural design system (dark mode, large touch targets)
├── js/
│   ├── i18n.js           # Bilingual localization engine (English & Hindi)
│   ├── db.js             # IndexedDB persistent store & NCERT curriculum seed data
│   ├── transport.js      # Transport abstraction (P2P DataChannel, Broadcast mesh, chunking)
│   ├── syncEngine.js     # Smart differential manifest engine & 2-way sync protocol
│   └── app.js            # App router, quiz engine, lesson viewer & UI controller
├── assets/
│   └── icon.svg          # EduSync brand icon
├── EduSync_Antigravity_Build_Spec.md  # Original Antigravity build specification
└── README.md             # Project documentation & SIH guide
```

---

## 🛡️ Privacy & Reliability Philosophy

- **Zero Cloud Tracking**: No mandatory logins, no tracking cookies, and no cloud data collection.
- **Lightweight Footprint**: Zero heavy bloated frameworks. Entire bundle is under 150 KB.
- **Hardware Agnostic**: Optimized for budget Android smartphones ($50–$100 devices) commonly found in rural households.
