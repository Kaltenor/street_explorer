# Development Build

Development builds are required for realistic background-location testing. Expo Go is useful for quick foreground testing, but it does not fully represent an app with native background location permissions.

## Why This Matters

Street Explorer needs a development build to test:

- recording while the iPhone is locked
- iOS background location permission
- iOS background location indicator
- recovery after background recording
- native modules such as `expo-task-manager` and `expo-dev-client`

## Prerequisites

- Expo account
- EAS CLI
- Apple Developer Program membership for physical iPhone builds
- iPhone registered for internal distribution if EAS asks for it

Expo's docs note that installing a development build on a physical iOS device requires an active Apple Developer Program subscription.

## Profiles

Configured in `eas.json`:

- `development`: physical iOS development build
- `development-simulator`: iOS simulator development build
- `preview`: internal distribution
- `production`: production build placeholder

## Build For Physical iPhone

```powershell
cd W:\street_explorer
npx eas-cli login
npx eas-cli build --platform ios --profile development
```

EAS will guide you through Apple credentials and device registration.

After the build finishes, install it on the iPhone using the QR/link from Expo.

Then start the Metro server for the dev client:

```powershell
npx expo start --dev-client
```

Open the installed Street Explorer development build on the iPhone and connect to the local dev server.

## Build For iOS Simulator

This does not test real locked-screen iPhone behavior, but it can validate that the dev client builds.

```powershell
cd W:\street_explorer
npx eas-cli build --platform ios --profile development-simulator
```

## What To Test

1. Install the development build on the iPhone.
2. Start the app from the development build, not Expo Go.
3. Start a Walk recording.
4. Grant foreground and background location permissions if prompted.
5. Lock the phone for several minutes while moving.
6. Reopen the app.
7. Confirm:
   - points increased
   - distance increased
   - explored cells increased
   - Stop saves the route
   - recovery appears if the app was closed mid-recording

## Expected Limitation

If running in Expo Go, the app may show that background tracking is unavailable. That is expected. Use the development build for real background testing.
