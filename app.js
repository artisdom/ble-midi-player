const MIDI_SERVICE_UUID = "03b80e5a-ede8-4b33-a751-6ce34ec4c700";
const MIDI_CHARACTERISTIC_UUID = "7772e5fd-3868-4112-a1a9-f2669d106bf3";

const builtInTracks = [
    {
        name: "Twinkle Twinkle Little Star",
        file: "assets/midi/twinkle.mid",
        description: "Key of C · 96 BPM · 1 track",
    },
    {
        name: "C Major Scale",
        file: "assets/midi/c_major_scale.mid",
        description: "Ascending scale · 110 BPM · 1 track",
    },
];

const state = {
    device: null,
    server: null,
    characteristic: null,
    midi: null,
    events: [],
    channels: new Set(),
    playbackRate: 1,
    activePlaybackRate: 1,
    playing: false,
    startTime: 0,
    durationMs: 0,
    timers: [],
    progressTimer: null,
    activeNotes: new Map(),
    selectedTrack: null,
};

const elements = {
    connectBtn: document.getElementById("connect-btn"),
    disconnectBtn: document.getElementById("disconnect-btn"),
    playBtn: document.getElementById("play-btn"),
    stopBtn: document.getElementById("stop-btn"),
    builtinSelect: document.getElementById("builtin-select"),
    fileInput: document.getElementById("file-input"),
    tempoSlider: document.getElementById("tempo-slider"),
    tempoValue: document.getElementById("tempo-value"),
    deviceStatus: document.getElementById("device-status"),
    trackInfo: document.getElementById("track-info"),
    playbackStatus: document.getElementById("playback-status"),
    progressBar: document.getElementById("progress-bar"),
    log: document.getElementById("log"),
    clearLogBtn: document.getElementById("clear-log-btn"),
};

function init() {
    if (!("bluetooth" in navigator)) {
        const msg = "Web Bluetooth is not supported in this browser.";
        updateStatus(msg, "status--error");
        logMessage(msg, "error");
        elements.connectBtn.disabled = true;
    }

    const midiLib = window.Midi;
    if (!midiLib || typeof midiLib.fromArrayBuffer !== "function") {
        const msg = "Failed to load MIDI parser library.";
        updateStatus(msg, "status--error");
        logMessage(msg, "error");
        elements.playBtn.disabled = true;
    }

    populateBuiltInTracks();
    registerEventHandlers();
    updateControls();
}

function populateBuiltInTracks() {
    builtInTracks.forEach((track) => {
        const option = document.createElement("option");
        option.value = track.file;
        option.textContent = track.name;
        elements.builtinSelect.appendChild(option);
    });
}

function registerEventHandlers() {
    elements.connectBtn.addEventListener("click", connectToDevice);
    elements.disconnectBtn.addEventListener("click", disconnectDevice);
    elements.playBtn.addEventListener("click", startPlayback);
    elements.stopBtn.addEventListener("click", stopPlayback);
    elements.builtinSelect.addEventListener("change", handleBuiltInSelection);
    elements.fileInput.addEventListener("change", handleFileSelection);
    elements.tempoSlider.addEventListener("input", handleTempoChange);
    elements.clearLogBtn.addEventListener("click", () => {
        elements.log.innerHTML = "";
    });
}

function handleTempoChange() {
    const value = Number(elements.tempoSlider.value);
    state.playbackRate = value / 100;
    elements.tempoValue.textContent = `${value}%`;
    if (state.playing) {
        elements.playbackStatus.textContent = "Tempo change will apply after playback restarts.";
    }
}

async function connectToDevice() {
    try {
        updateStatus("Requesting Bluetooth device...", "status--idle");
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [MIDI_SERVICE_UUID] }],
        });
        state.device = device;
        state.device.addEventListener("gattserverdisconnected", handleDisconnect);

        updateStatus("Connecting to GATT server...", "status--idle");
        const server = await device.gatt.connect();
        state.server = server;

        const service = await server.getPrimaryService(MIDI_SERVICE_UUID);
        state.characteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC_UUID);

        logMessage(`Connected to ${device.name || "Unnamed device"}`);
        updateStatus(`Connected: ${device.name || "Unnamed device"}`, "status--connected");
        elements.disconnectBtn.disabled = false;
        updateControls();
    } catch (error) {
        logMessage(`Connection failed: ${error.message}`, "error");
        updateStatus("Not connected", "status--idle");
        cleanupConnection();
    }
}

function disconnectDevice() {
    if (state.device && state.device.gatt.connected) {
        state.device.gatt.disconnect();
    } else {
        cleanupConnection();
    }
}

function handleDisconnect() {
    logMessage("Device disconnected");
    updateStatus("Not connected", "status--idle");
    stopPlayback();
    cleanupConnection();
    updateControls();
}

function cleanupConnection() {
    state.device = null;
    state.server = null;
    state.characteristic = null;
    elements.disconnectBtn.disabled = true;
    updateControls();
}

function updateStatus(text, className) {
    elements.deviceStatus.textContent = text;
    elements.deviceStatus.className = `status ${className}`;
}

function logMessage(message, type = "info") {
    const entry = document.createElement("li");
    entry.dataset.type = type;
    const timestamp = document.createElement("time");
    timestamp.dateTime = new Date().toISOString();
    timestamp.textContent = new Date().toLocaleTimeString();
    entry.appendChild(timestamp);
    entry.appendChild(document.createTextNode(` ${message}`));
    elements.log.prepend(entry);
}

async function handleBuiltInSelection() {
    const selectedFile = elements.builtinSelect.value;
    if (!selectedFile) {
        return;
    }

    try {
        const track = builtInTracks.find((item) => item.file === selectedFile);
        state.selectedTrack = track;
        elements.trackInfo.textContent = "Loading built-in track...";
        const response = await fetch(selectedFile);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        await loadMidiBuffer(buffer, track.name, track.description);
        logMessage(`Loaded built-in track: ${track.name}`);
    } catch (error) {
        logMessage(`Failed to load built-in track: ${error.message}`, "error");
        elements.trackInfo.textContent = "Unable to load the selected built-in track.";
    }
}

async function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) {
        return;
    }

    try {
        state.selectedTrack = { name: file.name, description: "Custom upload" };
        elements.trackInfo.textContent = "Reading MIDI file...";
        const buffer = await file.arrayBuffer();
        await loadMidiBuffer(buffer, file.name, "Uploaded file");
        logMessage(`Loaded MIDI from upload: ${file.name}`);
    } catch (error) {
        logMessage(`Failed to read MIDI file: ${error.message}`, "error");
        elements.trackInfo.textContent = "Unable to load the uploaded file.";
    } finally {
        // Reset to allow re-uploading the same file
        event.target.value = "";
    }
}

async function loadMidiBuffer(arrayBuffer, label, description) {
    const Midi = window.Midi;
    if (!Midi) {
        throw new Error("MIDI library unavailable");
    }

    if (state.playing) {
        stopPlayback();
    }

    try {
        const midi = await Midi.fromArrayBuffer(arrayBuffer);
        state.midi = midi;
        const { events, duration, channels, noteCount } = extractPlaybackEvents(midi);
        state.events = events;
        state.channels = channels;
        state.durationMs = duration * 1000;
        state.selectedTrack = { name: label, description };
        state.playbackRate = Number(elements.tempoSlider.value) / 100;

        updateTrackInfo(label, description, midi, noteCount);
        elements.playbackStatus.textContent = `Ready: ${label}`;
        logMessage(`Prepared track "${label}" (${noteCount} notes)`);
        updateControls();
    } catch (error) {
        throw new Error(`Unable to parse MIDI: ${error.message}`);
    }
}

function extractPlaybackEvents(midi) {
    const events = [];
    const channels = new Set();
    let noteCount = 0;

    midi.tracks.forEach((track) => {
        const channel = typeof track.channel === "number" ? track.channel : 0;
        track.notes.forEach((note) => {
            const velocity = Math.max(1, Math.min(127, Math.round((note.velocity || 0.7) * 127)));
            const offVelocity = Math.max(0, Math.min(127, Math.round((note.noteOffVelocity || 0.5) * 127)));

            events.push({
                type: "noteOn",
                time: note.time,
                channel,
                midi: note.midi,
                velocity,
            });

            events.push({
                type: "noteOff",
                time: note.time + note.duration,
                channel,
                midi: note.midi,
                velocity: offVelocity,
            });

            channels.add(channel);
            noteCount += 1;
        });
    });

    events.sort((a, b) => a.time - b.time);
    const lastEvent = events.length ? events[events.length - 1] : null;
    const duration = midi.duration || (lastEvent ? lastEvent.time : 0);

    return { events, duration, channels, noteCount };
}

function updateTrackInfo(name, description, midi, noteCount) {
    const trackCount = midi.tracks.length;
    const durationSeconds = (state.durationMs / 1000).toFixed(1);
    const tempoEvents = midi.header.tempos;
    const hasTempo = Array.isArray(tempoEvents) && tempoEvents.length > 0;
    const bpm = hasTempo ? tempoEvents.map((t) => t.bpm).map((n) => Math.round(n)) : [];
    const tempoString = hasTempo
        ? bpm.length === 1
            ? `${bpm[0]} BPM`
            : `${Math.min(...bpm)}-${Math.max(...bpm)} BPM`
        : "Default tempo";

    elements.trackInfo.textContent = `${name} · ${description} · ${tempoString} · ${trackCount} track${trackCount > 1 ? "s" : ""} · ${noteCount} notes · ${durationSeconds}s`;
}

function updateControls() {
    const isConnected = Boolean(state.characteristic);
    const hasTrack = Boolean(state.events.length);

    elements.playBtn.disabled = !(isConnected && hasTrack && !state.playing);
    elements.stopBtn.disabled = !state.playing;
    elements.disconnectBtn.disabled = !isConnected;
}

function startPlayback() {
    if (!state.characteristic) {
        logMessage("Connect to a BLE MIDI device before playing.", "error");
        return;
    }
    if (!state.events.length) {
        logMessage("Load a MIDI track before playing.", "error");
        return;
    }

    clearTimers();
    state.playing = true;
    state.activePlaybackRate = state.playbackRate || 1;
    state.startTime = performance.now();
    state.activeNotes.clear();
    elements.playbackStatus.textContent = `Playing: ${state.selectedTrack?.name ?? "Track"}`;

    scheduleEvents();
    state.progressTimer = setInterval(updateProgress, 100);
    updateControls();
}

function stopPlayback() {
    if (!state.playing) {
        clearTimers();
        return;
    }

    state.playing = false;
    clearTimers();
    flushActiveNotes();
    elements.progressBar.style.width = "0%";
    elements.playbackStatus.textContent = "Playback stopped.";
    updateControls();
}

function clearTimers() {
    state.timers.forEach((timerId) => clearTimeout(timerId));
    state.timers = [];
    if (state.progressTimer) {
        clearInterval(state.progressTimer);
        state.progressTimer = null;
    }
}

function scheduleEvents() {
    const playbackRate = state.activePlaybackRate || 1;
    const start = state.startTime;

    state.events.forEach((event) => {
        const targetTime = start + (event.time * 1000) / playbackRate;
        const delay = Math.max(0, targetTime - performance.now());
        const timerId = setTimeout(() => {
            if (!state.playing) {
                return;
            }
            dispatchEvent(event);
        }, delay);
        state.timers.push(timerId);
    });

    const endDelay = Math.max(0, (state.durationMs / playbackRate) + 50);
    const endTimer = setTimeout(() => {
        if (!state.playing) {
            return;
        }
        flushActiveNotes();
        elements.progressBar.style.width = "100%";
        elements.playbackStatus.textContent = "Playback finished.";
        state.playing = false;
        updateControls();
    }, endDelay);
    state.timers.push(endTimer);
}

function dispatchEvent(event) {
    if (!state.characteristic) {
        return;
    }

    if (event.type === "noteOn") {
        noteOn(event.channel, event.midi, event.velocity);
    } else if (event.type === "noteOff") {
        noteOff(event.channel, event.midi, event.velocity);
    }
}

function noteOn(channel, noteNumber, velocity) {
    if (!state.activeNotes.has(channel)) {
        state.activeNotes.set(channel, new Set());
    }
    state.activeNotes.get(channel).add(noteNumber);
    sendBleMidiMessage(0x90 | (channel & 0x0f), [noteNumber & 0x7f, velocity & 0x7f]);
}

function noteOff(channel, noteNumber, velocity) {
    const notes = state.activeNotes.get(channel);
    if (notes) {
        notes.delete(noteNumber);
    }
    sendBleMidiMessage(0x80 | (channel & 0x0f), [noteNumber & 0x7f, velocity & 0x7f]);
}

function flushActiveNotes() {
    state.channels.forEach((channel) => {
        sendBleMidiMessage(0xb0 | (channel & 0x0f), [123, 0]); // All Notes Off
    });
    state.activeNotes.clear();
}

function sendBleMidiMessage(status, dataBytes) {
    if (!state.characteristic) {
        return;
    }

    const timestamp = 0;
    const packet = new Uint8Array(3 + dataBytes.length);
    packet[0] = 0x80 | ((timestamp >> 7) & 0x3f);
    packet[1] = 0x80 | (timestamp & 0x7f);
    packet[2] = status & 0xff;
    dataBytes.forEach((byte, index) => {
        packet[3 + index] = byte & 0x7f;
    });

    const characteristic = state.characteristic;
    const writer = characteristic.writeValueWithoutResponse?.bind(characteristic) ?? characteristic.writeValue.bind(characteristic);

    try {
        const result = writer(packet);
        if (result && typeof result.catch === "function") {
            result.catch((error) => {
                logMessage(`Failed to send MIDI message: ${error.message}`, "error");
                stopPlayback();
            });
        }
    } catch (error) {
        logMessage(`Failed to send MIDI message: ${error.message}`, "error");
        stopPlayback();
    }
}

function updateProgress() {
    if (!state.playing) {
        elements.progressBar.style.width = "0%";
        return;
    }

    const elapsed = performance.now() - state.startTime;
    const playbackRate = state.activePlaybackRate || 1;
    const adjustedDuration = state.durationMs / playbackRate;
    const progress = Math.min(100, (elapsed / adjustedDuration) * 100);
    elements.progressBar.style.width = `${progress}%`;
}

document.addEventListener("DOMContentLoaded", init);
