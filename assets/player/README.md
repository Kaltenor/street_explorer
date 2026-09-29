# Player Character Asset

The active cartographer was recreated for version 0.35.10 with OpenAI's built-in image generation tool, using the previous design as a costume reference. Natural adult proportions replace the oversized head; the navy coat, brass trim, tan hat, red scarf and boots remain.

- Source: cartographer-sheet.png, genuine transparent alpha.
- Rows: east, north, south, west. Columns: idle and three walking poses.
- Runtime: twenty transparent 64 x 64 PNGs including muted stale-GPS variants.
- Build: python scripts/process-cartographer-sprites.py (requires Pillow).
- All poses use one shared scale and boot baseline y=60; maximum subject size 56 pixels. Hat tops may vary slightly with the pose; speech offset remains fixed.
- [Exact generation prompt](GENERATION_PROMPT.md).

Frames remain pre-mounted inside one persistent native marker. The earlier CC0 pixel source and extracted frames are inactive history, not the current character.
