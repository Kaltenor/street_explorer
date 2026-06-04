# Project Overview

Street Explorer is a mobile exploration app built with Expo, React Native, TypeScript, and local SQLite storage.

The app records real-world movement and turns it into an exploration map. The goal is not to be a sport tracker. The goal is to feel like a real-life exploration game where streets and areas become visible as they are explored.

## Current Modes

- Walk: on-foot exploration.
- Wheel: EUC exploration.
- Car: car exploration.

Each mode has separate recordings, paths, stats, and history.

## Current Features

- Foreground GPS recording.
- Best-effort background tracking setup.
- Local SQLite persistence.
- Saved paths displayed on the map.
- Active recording path displayed live.
- 15m x 15m deduplicated explored cells.
- Gameplay-first closed-loop area fill based on enclosed explored cells.
- Mode-specific GPS quality filters.
- Route history with rename, delete, and highlight.
- Last selected mode persistence.
- Recording recovery for unfinished active sessions.
- Device step counts for Walk recordings.
- Icon layer controls for paths, cells, and markers.
- Full-screen Details, History, and Completion views with map back navigation.
- Completion screen with scope, zone, and mode selectors.
- OSM boundary loading and cached Country / City / District completion zones.
- Zone-specific completion stats and map focus.
- Objective HUD with selected zone, completion percentage, remaining cells, and today's added cells.
- Branded splash/loading screen and transparent map logo overlay.

## Current Limitations

- Background tracking is configured but may not fully work in Expo Go on iOS. A development build is likely required for real locked-screen recording.
- Explored cells are grid-based, not exact street geometry.
- OSM is no longer a primary visible gameplay overlay by default.
- District boundaries depend on what exists in OSM near the current location.
- Very large zone denominators may be skipped to keep the app responsive.
- There is no backend, account, cloud sync, social feature, or route suggestion system.
- OpenStreetMap data can be loaded nearby, but it is mainly used as hidden analysis data.
- Street-aware path inference is paused for normal gameplay rendering and explored-cell generation until it can be made reliable and debuggable.
