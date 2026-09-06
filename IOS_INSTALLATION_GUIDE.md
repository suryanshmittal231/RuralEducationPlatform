# 📱 EduSync — iOS Installation & IPA Deployment Guide

This guide explains how to get the compiled **`.ipa`** file and install EduSync on your iPhone from Windows or Mac.

---

## ⚡ Method 1: Automated GitHub Actions Build + Sideloadly (Recommended for Windows)

Since native iOS compiling requires Apple's toolchain (macOS), we have set up an **automated GitHub Actions CI/CD workflow** (`.github/workflows/build-ios-ipa.yml`) that builds the `.ipa` in the cloud on Apple macOS machines for free.

### Step 1: Push Changes to GitHub
Run the following commands in your terminal:
```bash
git add .
git commit -m "Add iOS platform and automated IPA build pipeline"
git push origin main
```

### Step 2: Download the IPA from GitHub
1. Open your repository on GitHub: [`https://github.com/arjitsmalhi/RuralEducationPlatform`](https://github.com/arjitsmalhi/RuralEducationPlatform)
2. Click on the **Actions** tab at the top.
3. Click on the latest workflow run named **"Build iOS IPA (EduSync)"** (or click **"Run workflow"** if triggering manually).
4. Wait 2–3 minutes for the build to complete.
5. Under the **Artifacts** section at the bottom of the page, click on **`EduSync-iOS-IPA`** to download the zip file.
6. Extract the zip file on your PC to get `EduSync-v1.0.ipa`.

---

### Step 3: Sideload onto iPhone using Sideloadly (Free, 2 Minutes)
**Sideloadly** is a free, safe Windows tool to install IPAs onto any iPhone using your personal Apple ID (no paid Apple Developer account required).

1. **Download & Install Sideloadly** on your Windows PC:
   - Official website: [https://sideloadly.io](https://sideloadly.io)
   - Ensure iTunes/iCloud is installed from Apple (or Sideloadly's prompt).
2. **Connect your iPhone** to your Windows PC using a USB Lightning/Type-C cable.
3. Tap **"Trust this computer"** on your iPhone screen if prompted.
4. Open **Sideloadly**:
   - Drag and drop `EduSync-v1.0.ipa` into the IPA box.
   - Enter your Apple ID email in the "Apple ID" box.
   - Click **Start**.
5. Sideloadly will sign and install EduSync directly onto your iPhone in ~30 seconds!

---

### Step 4: Trust the Developer Certificate on iPhone
Before opening the app for the first time on iOS:
1. Open **Settings** on your iPhone.
2. Go to **General** > **VPN & Device Management** (or **Profiles & Device Management**).
3. Under **Developer App**, tap on your Apple ID email.
4. Tap **Trust "[Your Apple ID]"** and confirm.
5. If on iOS 16+, enable Developer Mode in **Settings > Privacy & Security > Developer Mode** and restart the phone.
6. Open **EduSync** from your home screen and enjoy!

---

## 🛠️ Method 2: AltStore / AltServer

1. Download **AltServer** for Windows from [https://altstore.io](https://altstore.io).
2. Install AltStore onto your iPhone following the on-screen setup.
3. AirDrop or iCloud Drive transfer `EduSync-v1.0.ipa` to your iPhone.
4. In the AltStore app on iPhone, tap the `+` button in **My Apps** and select `EduSync-v1.0.ipa`.

---

## 🍏 Method 3: Using a Mac with Xcode (Local Development)

If you or a team member have a Mac:
1. Clone the repo and run:
   ```bash
   npm install
   npm run sync:ios
   npx cap open ios
   ```
2. Xcode will open `ios/App/App.xcworkspace`.
3. In Xcode:
   - Select the **App** target -> **Signing & Capabilities**.
   - Select your personal Apple Team (Free or Developer).
   - Plug in your iPhone, select it as the run target at the top bar.
   - Click the **Play (Run)** button to install and launch directly on the device.

---

## 🌐 Method 4: Instant Web / PWA on iPhone (Zero Install Tools)

EduSync is also a Progressive Web App (PWA) with full offline caching:
1. Open Safari on your iPhone.
2. Navigate to your hosted EduSync URL (or local Wi-Fi IP).
3. Tap the **Share** button (box with upward arrow) at the bottom.
4. Scroll down and tap **"Add to Home Screen"**.
5. EduSync will appear as an app icon on your iOS home screen and run in fullscreen offline mode!
