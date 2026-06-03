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
- Conservative closed-loop area fill for loops with little unwalked walkable street geometry inside.
- Mode-specific GPS quality filters.
- Route history with rename, delete, and highlight.
- Last selected mode persistence.
- Recording recovery for unfinished active sessions.
- Layer controls for paths, cells, markers, and optional OSM debug matching.
- Completion screen foundation with scope and mode selectors.

## Current Limitations

- Background tracking is configured but may not fully work in Expo Go on iOS. A development build is likely required for real locked-screen recording.
- Explored cells are grid-based, not exact street geometry.
- OSM is no longer a primary visible gameplay overlay by default.
- Country, city, and district boundary fetching is not implemented yet.
- There is no backend, account, cloud sync, social feature, or route suggestion system.
- OpenStreetMap data can be loaded nearby, but it is mainly used as hidden analysis data.
