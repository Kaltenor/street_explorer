# Player Character Asset

The active player character is an original hand-inked cartographer generated for Street Explorer with OpenAI's built-in image generation tool.

- Source sheet: `cartographer-sheet.png`
- Direction rows: east, north, south, west
- Frame columns: idle plus three restrained walking frames
- Costume: navy coat, gold trim, parchment hood/hat, and red scarf
- Runtime assets: twenty transparent 64 x 64 PNGs covering idle, walking, and desaturated stale-GPS poses
- Processing: `scripts/process-cartographer-sprites.py` removes no additional content from the transparent source, crops each generated cell, and fits it consistently inside the native marker canvas

The earlier CC0 pixel sheet and small extracted frames remain in this directory as inactive source history. They are not used by the current native annotation.

All twenty current frames stay pre-mounted inside one persistent MapKit marker. Direction, walking cadence, and stale status change only layer opacity, preserving the stable geographic anchoring needed by iOS MapKit.

Generation prompt summary: production 4 x 4 character sprite sheet in a refined hand-inked antique-atlas style; exact directional rows and motion columns; transparent-ready flat chroma background; no text, shadows, pixel art, gradients, or extra props.
