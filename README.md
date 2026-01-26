# 4-Track Tape Looper

A browser-based 4-track audio looper for live recording and layering.

## Features

- **4 independent tracks** with individual controls
- **Multiple input sources**: Microphone, browser tab audio, or file upload
- **Per-track controls**: Volume, pan, mute, solo
- **Transport controls**: Play all, stop all, clear all
- **Export mix** to audio file
- **Real-time waveform visualization**

## Usage

1. Open `index.html` in a modern browser
2. Select your input source (microphone, browser tab, or skip to load files)
3. Record on any track by clicking the record button
4. Layer multiple recordings
5. Export your mix when done

## Technical Details

- Built with Web Audio API
- Uses `getDisplayMedia` for browser tab capture
- No dependencies or build process
- Works offline

## Requirements

- Modern browser with Web Audio API support
- Microphone access (for mic recording)
- Screen capture permission (for tab audio capture)

---

Think this is cool and/or useful? [Buy me a coffee](https://ko-fi.com/plbaumgartner)
