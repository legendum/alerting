# Publishing the Alert PWA as an Android app (Google Play)

The simplest way to get this app on the Google Play Store is to wrap the existing PWA in a **Trusted Web Activity (TWA)**. The Android “app” is a small shell that opens your PWA in a full-screen Chrome tab with no browser UI, so it feels like a native app.

## Prerequisites

1. **Your PWA must be served over HTTPS** at a public URL (e.g. `https://alerting.app`).
2. **Web app manifest** — The project includes a minimal `src/web/manifest.json` (served at `/manifest.json`). It uses the app name from `config/alerting.yaml` (`app_name`). You still need to add **icons** so the PWA is valid:
   - Put `logo-192.png` (192×192) and `logo-512.png` (512×512) in `src/web/`. They are served at `/logo-192.png` and `/logo-512.png`.
   - Use any PNG (e.g. your logo). Tools like [RealFaviconGenerator](https://realfavicongenerator.net/) or [PWA Asset Generator](https://github.com/onderceylan/pwa-asset-generator) can generate these from one image.
3. **Optional but recommended:** A service worker so the app works offline / installs like a PWA.

## Option A: PWABuilder (no Android Studio required)

1. **Package the PWA**
   - Go to [PWABuilder](https://www.pwabuilder.com/).
   - Enter your live PWA URL (e.g. `https://alerting.app`).
   - Click “Start” and fix any issues it reports (usually manifest and icons).
   - Open **“Package for stores”** → choose **Android**.
   - Download the generated Android package (or the Android Studio project).

2. **Build a signed app bundle (AAB)**
   - If PWABuilder gave you a project: open it in Android Studio, create a signing key, then **Build → Generate Signed Bundle / APK** and choose **Android App Bundle**.
   - If you prefer the command line, use the project’s Gradle wrapper to build and sign (see Android docs).

3. **Upload to Google Play**
   - Create a [Google Play Developer account](https://play.google.com/console) (one-time fee).
   - Create a new app, fill in store listing (name, description, screenshots, etc.).
   - In **Release → Production** (or testing track), upload the `.aab` file.
   - Complete content rating and any other required forms, then submit for review.

## Option B: Bubblewrap (TWA from the command line)

Bubblewrap is Google’s CLI for generating a TWA Android project.

1. **Install and init**
   ```bash
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest https://alerting.app/manifest.json
   ```
   Answer the prompts (package name, app name, etc.). This creates an Android project.

2. **Build**
   ```bash
   cd your-twa-project
   ./gradlew bundleRelease
   ```
   You’ll need a keystore for release signing (create one with `keytool` or use Android Studio).

3. **Upload the generated `.aab`** to the Play Console as in Option A step 3.

## Summary

| Step | What to do |
|------|------------|
| 1 | Deploy the PWA over HTTPS and add a web app manifest (and icons). |
| 2 | Use **PWABuilder** or **Bubblewrap** to turn the PWA into an Android TWA project. |
| 3 | Build a signed Android App Bundle (`.aab`). |
| 4 | In the Play Console, create the app, upload the AAB, fill the store listing, and submit. |

The app in the store will open your existing web app in a full-screen Chrome TWA; no separate Android codebase to maintain. For push notifications, ensure FCM is configured (see [FCM.md](./FCM.md)) and that the same origin is used in the TWA and in your web app.
