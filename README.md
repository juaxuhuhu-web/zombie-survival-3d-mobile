# Deadzone: Last Light

A mobile-first, third-person open-world survival RPG prototype. This rebuild replaces wave-based arena play with persistent infected, forest-to-town exploration, survival vitals, finite scavenging, and primitive crafting. Gameplay runs offline once installed.

## Play

Run `npm install`, `npm run dev`, then open the printed address. Move with the lower-left joystick and aim with the lower-right look stick; pinch the play area to zoom. Gather nearby resources with **USE**, crouch to quiet your movement, and use melee only when infected close in. Select food or water in the field pack and tap **USE** to consume it. Craft a stone-tipped spear or campfire kit from gathered materials. Desktop controls are WASD/arrows to move, Shift to sprint, C to crouch, E to gather, Space to strike, F to use the selected item, and number keys to select inventory slots.

There are no waves or round-based spawns. Infected are placed in the world and investigate nearby sight and sound; bites cause wounds and infection. Hunger, thirst, stamina, temperature, and infection change during play. Progress saves locally on the device.

## Android APK

The repository includes a Capacitor Android wrapper and a GitHub Actions build. Pushing a version tag such as `v1.0.0` builds the APK and publishes it as an asset on the matching GitHub Release. Download `app-debug.apk` from the release page and install it on your phone. Android may ask you to allow installation from that source.

Pushing to `main` or manually running **Build Android APK** from the repository's **Actions** tab creates an Actions artifact named `deadzone-last-light-debug-apk` instead; open the workflow run to download it.

The APK is a debug build, suitable for testing and sideloading, not Play Store release. A release build needs a signing key. GitHub Actions builds the APK when a version tag is pushed.

## Build locally

Requires Node.js 20+, JDK 21, and Android SDK platform 35/build-tools 35.0.0 with licenses accepted.

```sh
npm ci
npm run build
npm run android
cd android && ./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

## Survival architecture

See [GAME_ARCHITECTURE.md](./GAME_ARCHITECTURE.md) for the open-world streaming, ecology, sensory AI, progression, combat, and staged rebuild design. The current playable slice implements its initial persistent forest-to-town survival loop; the full multi-biome world and later technology tiers remain future work.

Run simulation tests with:

```sh
npm test
```
