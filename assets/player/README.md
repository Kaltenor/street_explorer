# Player Character Asset

The animated player character is adapted from **Pixel Art Character** by acasas / TheGameAssetsMine.

- Source: https://opengameart.org/content/pixel-art-character
- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- Original format: 640 x 640 PNG sprite sheet with 64 x 64 frames
- Imported frames: four idle directions and three walking frames per direction
- Native annotation assets: twenty precomposed 64 x 64 PNGs covering idle, walking, and retained stale variants; v0.6.3 actively swaps only the sixteen idle/walking images and keeps the last rendered image when GPS ages out

The original downloaded sheet is retained as `source-sheet.png`. The smaller source frames remain available for rebuilding the native marker images. Attribution is not required by CC0, but this file preserves the asset provenance.

The persistent marker also uses a stable MapKit identifier. Stale status is exposed through the accessible last-known-location label without replacing the native bitmap during Stop.
