#!/bin/bash
# EduSync iOS IPA Build and Export Script (For macOS)
set -e

echo "=== 1. Building Web Assets ==="
npm run build

echo "=== 2. Syncing Capacitor iOS ==="
npx cap sync ios

cd ios/App

echo "=== 3. Installing CocoaPods ==="
pod install

echo "=== 4. Building Xcode Project ==="
xcodebuild -workspace App.xcworkspace \
           -scheme App \
           -configuration Release \
           -sdk iphoneos \
           -derivedDataPath build \
           CODE_SIGNING_ALLOWED=NO \
           CODE_SIGNING_REQUIRED=NO \
           CODE_SIGN_IDENTITY="" \
           clean build

echo "=== 5. Packaging into IPA ==="
rm -rf Payload EduSync-v1.0.ipa
mkdir -p Payload
cp -r build/Build/Products/Release-iphoneos/App.app Payload/EduSync.app
zip -r EduSync-v1.0.ipa Payload
rm -rf Payload

echo "=================================================="
echo " SUCCESS! IPA created at: ios/App/EduSync-v1.0.ipa"
echo "=================================================="
