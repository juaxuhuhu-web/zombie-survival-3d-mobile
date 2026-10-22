# Deadzone: Last Light

A mobile-first, third-person 3D zombie survival game. The street, buildings, props, player, zombies, and weapons are built from real-time 3D geometry; gameplay runs offline once installed.

## Play

Run `npm install` and `npm run dev`, then open the printed address in a mobile browser. On a phone, move with the lower-left joystick, hold sprint, drag on the right side of the screen to aim, and use the fire, melee, reload, and weapon buttons. On desktop, use WASD or arrow keys to move, Shift to sprint, right-mouse drag to aim, Space to fire, E to melee, R to reload, and Q to switch weapons.

Survive escalating waves of walkers, fast runners, and armored brutes. Aim for headshots, use melee when enemies close in, manage stamina and ammunition, and collect medical, armor, and ammo drops to stay alive.

## Android APK

The repository includes a Capacitor Android wrapper and a GitHub Actions build. Pushing a version tag such as `v1.0.0` builds the APK and publishes it as an asset on the matching GitHub Release. Download `app-debug.apk` from the release page and install it on your phone. Android may ask you to allow installation from that source.

Pushing to `main` or manually running **Build Android APK** from the repository's **Actions** tab creates an Actions artifact named `deadzone-last-light-debug-apk` instead; open the workflow run to download it.

The APK is a debug build, suitable for testing and sideloading, not Play Store release. A release build needs a signing key. The development container does not have the Android SDK installed, so it cannot produce the APK locally; the workflow provides the build environment.

## Build locally

Requires Node.js 20+, JDK 21, and Android SDK platform 35/build-tools 35.0.0 with licenses accepted.

```sh
npm ci
npm run build
npm run android
cd android && ./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
