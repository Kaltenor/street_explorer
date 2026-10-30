# Player Character Asset

The active cartographer was recreated for version 0.35.10 with OpenAI's built-in image generation tool, using the previous design as a costume reference. Natural adult proportions replace the oversized head; the navy coat, brass trim, tan hat, red scarf and boots remain.

- Source: cartographer-sheet.png, genuine transparent alpha.
- Rows: east, north, south, west. Columns: idle and three walking poses.
- Runtime: twenty transparent 64 x 64 PNGs including muted stale-GPS variants.
- Build: python scripts/process-cartographer-sprites.py (requires Pillow).
- All poses use one shared scale and boot baseline y=60; maximum subject size 56 pixels. Hat tops may vary slightly with the pose; speech offset remains fixed.
- [Exact generation prompt](GENERATION_PROMPT.md).

Frames remain pre-mounted inside one persistent native marker. The earlier inactive CC0 pixel source and extracted frames were removed in 0.36.5. The active cartographer source and all twenty native runtime frames remain. EAS excludes the authoring sheet from upload; local sprite regeneration still uses it.

Since 0.35.13, the marker renders these transparent frames without the former dark circular background or its shadow.

In 0.36.6 the native PNG frames were recompressed losslessly; dimensions and every decoded RGBA pixel remain identical. Regenerated frames can be optimized with python scripts/optimize-images-lossless.py.
