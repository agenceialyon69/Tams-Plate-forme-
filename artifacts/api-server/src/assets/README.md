# Assets Directory

This directory contains static assets for the API server.

## font.ttf

A TrueType font file used by FFmpeg for video text overlays.

### Why is this needed?

When generating videos with text (subtitles, titles), FFmpeg requires a font file.
Railway/Nixpacks environments may not have system fonts available.

### How to provide the font

Option 1: Use a bundled font (recommended for Railway)
```bash
# Download DejaVu Sans (free, open source)
curl -L -o artifacts/api-server/src/assets/font.ttf "https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf"
```

Option 2: Use Railway environment font
```bash
# In nixpacks.toml, fonts are installed via:
# aptPkgs = ["fontconfig", "fonts-dejavu-core"]
```

Option 3: Set FONT_PATH environment variable
```
FONT_PATH=/path/to/your/font.ttf
```

### What happens if no font?

The video generation will still work, but without text overlay.
The `drawTextFilter` function in `lib/video.ts` checks for font existence.

## Note

This README serves as a placeholder. The actual font.ttf should be downloaded
during CI/CD or included in the repository if small enough.
