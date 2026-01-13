# JABP - Just A Beautiful Player
<img width="1472" height="748" alt="image" src="https://github.com/user-attachments/assets/ec9bb8d6-8e2a-43d4-8040-3c592c54edec" />

A minimalist music player with a spinning CD interface. Drag the disc to scrub through tracks like vinyl.

## Features

- **Spinning CD** - Visual feedback that responds to playback and interaction
- **Drag to seek** - Spin the disc clockwise to seek forward, counter-clockwise to rewind
- **Click to play/pause** - Single tap toggles playback
- **Double-click to swap disc** - Changes the CD artwork
- **Local audio** - Upload files from your device
- **YouTube support** - Paste any video or playlist link
- **Native haptics** - Vinyl groove feel on macOS (Tauri build)
- **Glitch effects** - Audio scratching sounds while scrubbing
- **Default track** - Plays "Mondays Thoughts" on first launch

## Setup

### Prerequisites

- Node.js 18+
- For native app: Rust toolchain (`rustup`)

### Install

```bash
npm install
```

### Run (Web)

```bash
npm run dev
```

Opens at `http://localhost:5173`

### Run (Native macOS)

```bash
npm run tauri:dev
```

### Build Native App

```bash
npm run tauri:build
```

Output in `src-tauri/target/release/bundle/`

### Install from Releases (macOS)

Download the `.dmg` from [Releases](https://github.com/solomonshalom/JABP/releases), then run:

```bash
xattr -cr /Applications/JABP.app
```

This removes the quarantine flag since the app isn't code-signed.

## Controls

| Action | Effect |
|--------|--------|
| Click CD | Play/Pause |
| Double-click CD | Change disc image |
| Drag CD | Seek through track |
| Space / K | Play/Pause |
| Arrow Left/Right | Skip 5 seconds |
| Esc | Close dialogs |

## Tech

- Vite
- Tauri v2
- youtube-player
- Web Audio API
- NSHapticFeedbackManager (macOS)
