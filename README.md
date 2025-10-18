# BLE MIDI Player

Single-page Web Bluetooth app that streams Standard MIDI Files to a Bluetooth Low Energy (BLE) MIDI instrument. Pick from bundled demos or upload your own `.mid` files, then play them straight into a connected device.

## Features
- Web Bluetooth connect/disconnect flow for the BLE MIDI service (`03B80E5A-EDE8-4B33-A751-6CE34EC4C700`).
- Built-in library (Twinkle Twinkle, C-major scale) plus drag-and-drop uploads.
- Tempo slider (50–150%) with real-time progress indicator and event log.
- Automatic note-off cleanup to avoid stuck notes when stopping early or on disconnect.

## Prerequisites
- A Chromium-based browser with Web Bluetooth enabled (Chrome, Edge, Opera). Safari and Firefox do not yet support the required APIs.
- HTTPS origin (or `http://localhost`) – Web Bluetooth will reject plain HTTP file URLs.
- A BLE MIDI peripheral (keyboard, controller, synth) advertising the standard service UUID.

## Quick Start
```bash
# from the repository root
python -m http.server 8080
# or use any static file server (npx serve, http-server, etc.)
```

Then open `http://localhost:8080/` in a supported browser.

## Usage
1. **Connect** – Click *Connect to BLE MIDI Device*. Choose your instrument from the system picker. The status badge will switch to “Connected”.  
2. **Select Music** – Either choose a built-in track from the dropdown or use *Upload a MIDI file* to select your own `.mid`. Track metadata appears underneath.  
3. **Play** – Set the tempo slider if desired (changes apply on the next playback) and click *Play*. Progress shows in the meter and events stream into the log.  
4. **Stop / Disconnect** – Click *Stop* to halt playback early (this also sends “All Notes Off”), or *Disconnect* to drop the BLE link.

## Notes & Limitations
- Uploads remain in memory only; refreshing the page forgets them.
- Web Bluetooth requires a user gesture for every connection request.
- Tempo automation and non-note MIDI events (e.g., CC envelopes) are not yet forwarded; only note on/off messages are sent.
- Some browsers throttle timers in the background. Keep the tab active during playback for best timing.

## Structure
```
index.html          # UI layout and script wiring
styles.css          # Light/dark responsive styles
app.js              # Web Bluetooth, MIDI parsing, playback scheduler
assets/midi/*.mid   # Built-in demo songs
vendor/ToneMidi...  # @tonejs/midi parser bundle
```

Feel free to expand the built-in library by dropping more `.mid` files into `assets/midi/` and updating the `builtInTracks` array in `app.js`.

## Credits
- [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT) for the lightweight Standard MIDI parser bundled in `vendor/ToneMidi.min.js`.
