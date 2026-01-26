// UI Controller for 4-Track Tape Looper
// Handles all user interactions with DOM caching and event delegation

let recorder = null;

// DOM Cache - populated at init for performance
const domCache = {
    // Transport
    playAll: null,
    stopAll: null,
    clearAll: null,
    exportMix: null,
    loadFiles: null,
    fileInput: null,
    audioSourceSelect: null,
    tempoControl: null,
    tempoValue: null,

    // Track elements (arrays indexed by track number)
    recBtns: [],
    modeBtns: [],
    muteBtns: [],
    soloBtns: [],
    clearBtns: [],
    audioIndicators: [],

    // Knobs (arrays indexed by track number)
    compInputKnobs: [],
    compReductionKnobs: [],
    eqLowKnobs: [],
    eqMidKnobs: [],
    eqHighKnobs: [],
    reverbSendKnobs: [],
    speedKnobs: [],
    revBtns: [],
    channelFaders: [],
    faderValues: [],

    // Master controls
    masterEQLow: null,
    masterEQMid: null,
    masterEQHigh: null,
    masterCompThreshold: null,
    masterCompMakeup: null,
    masterReverbSize: null,
    masterReverbMix: null,
    masterFader: null,
    masterFaderValue: null,

    // Tape bus controls
    tapeSaturation: null,
    tapeWow: null,
    tapeFlutter: null,
    tapeDropouts: null,
    tapeHiss: null,
    tapeAge: null,
    tapeBypassBtn: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    cacheDOM();
    setupKnobManager();
    setupInputModal();
});

// Cache all DOM elements at init for performance
function cacheDOM() {
    // Transport
    domCache.playAll = document.getElementById('play-all');
    domCache.stopAll = document.getElementById('stop-all');
    domCache.clearAll = document.getElementById('clear-all');
    domCache.exportMix = document.getElementById('export-mix');
    domCache.loadFiles = document.getElementById('load-files');
    domCache.fileInput = document.getElementById('file-input');
    domCache.audioSourceSelect = document.getElementById('audioSourceSelect');
    domCache.tempoControl = document.getElementById('tempo-control');
    domCache.tempoValue = document.getElementById('tempo-value');

    // Track elements
    for (let i = 0; i < 4; i++) {
        domCache.recBtns[i] = document.querySelector(`.rec-btn[data-track="${i}"]`);
        domCache.modeBtns[i] = document.querySelector(`.mode-btn[data-track="${i}"]`);
        domCache.muteBtns[i] = document.querySelector(`.mute-btn[data-track="${i}"]`);
        domCache.soloBtns[i] = document.querySelector(`.solo-btn[data-track="${i}"]`);
        domCache.clearBtns[i] = document.querySelector(`.clear-btn[data-track="${i}"]`);
        domCache.audioIndicators[i] = document.querySelector(`.channel-strip[data-track="${i}"] .audio-indicator`);

        domCache.compInputKnobs[i] = document.querySelector(`.comp-input[data-track="${i}"]`);
        domCache.compReductionKnobs[i] = document.querySelector(`.comp-reduction[data-track="${i}"]`);
        domCache.eqLowKnobs[i] = document.querySelector(`.eq-low[data-track="${i}"]`);
        domCache.eqMidKnobs[i] = document.querySelector(`.eq-mid[data-track="${i}"]`);
        domCache.eqHighKnobs[i] = document.querySelector(`.eq-high[data-track="${i}"]`);
        domCache.reverbSendKnobs[i] = document.querySelector(`.reverb-send[data-track="${i}"]`);
        domCache.speedKnobs[i] = document.querySelector(`.speed[data-track="${i}"]`);
        domCache.revBtns[i] = document.querySelector(`.rev-btn[data-track="${i}"]`);
        domCache.channelFaders[i] = document.querySelector(`.channel-fader[data-track="${i}"]`);
        domCache.faderValues[i] = domCache.channelFaders[i]?.parentElement?.querySelector('.fader-value');
    }

    // Master controls
    domCache.masterEQLow = document.querySelector('.master-eq-low');
    domCache.masterEQMid = document.querySelector('.master-eq-mid');
    domCache.masterEQHigh = document.querySelector('.master-eq-high');
    domCache.masterCompThreshold = document.querySelector('.master-comp-threshold');
    domCache.masterCompMakeup = document.querySelector('.master-comp-makeup');
    domCache.masterReverbSize = document.querySelector('.master-reverb-size');
    domCache.masterReverbMix = document.querySelector('.master-reverb-mix');
    domCache.masterFader = document.querySelector('.master-fader');
    domCache.masterFaderValue = domCache.masterFader?.parentElement?.querySelector('.fader-value');

    // Tape bus controls
    domCache.tapeSaturation = document.querySelector('.tape-saturation');
    domCache.tapeWow = document.querySelector('.tape-wow');
    domCache.tapeFlutter = document.querySelector('.tape-flutter');
    domCache.tapeDropouts = document.querySelector('.tape-dropouts');
    domCache.tapeHiss = document.querySelector('.tape-hiss');
    domCache.tapeAge = document.querySelector('.tape-age');
    domCache.tapeBypassBtn = document.querySelector('.tape-bypass-btn');
}

// Setup knob manager with vertical drag behavior
function setupKnobManager() {
    // Initialize all knobs with the new Knob class
    document.querySelectorAll('.knob-container input[type="range"]').forEach(input => {
        const container = input.parentElement;

        // Speed knobs are now unipolar (0-100, center=50 for 1x)
        const isSpeedKnob = input.classList.contains('speed');

        // Create value display
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'knob-value-display';
        container.appendChild(valueDisplay);

        // Determine default value and options
        const options = {
            bipolar: false, // Speed is now unipolar
            centerValue: isSpeedKnob ? 50 : undefined,
            defaultValue: parseFloat(input.value),
            onChange: () => updateKnobDisplay(input, valueDisplay)
        };

        // Register with knob manager
        if (typeof knobManager !== 'undefined') {
            knobManager.registerKnob(input, options);
        }

        // Initial display update
        updateKnobDisplay(input, valueDisplay);

        // Listen for input changes (from knob or other sources)
        input.addEventListener('input', () => updateKnobDisplay(input, valueDisplay));
    });

    // Setup fader interactions
    document.querySelectorAll('.vertical-fader').forEach(fader => {
        const container = fader.parentElement;
        const valueDisplay = container.querySelector('.fader-value');

        fader.addEventListener('input', () => {
            if (valueDisplay) {
                valueDisplay.textContent = Math.round(fader.value);
            }
        });

        // Double-click to reset fader to 80
        container.addEventListener('dblclick', (e) => {
            e.preventDefault();
            fader.value = 80;
            fader.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

// Update knob display value
function updateKnobDisplay(input, valueDisplay) {
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const value = parseFloat(input.value);

    // Speed knob (unipolar: 0=0.25x, 50=1x, 100=4x)
    if (input.classList.contains('speed')) {
        const rate = Math.pow(2, (value - 50) / 25);
        if (rate < 1) {
            valueDisplay.textContent = rate.toFixed(2) + 'x';
        } else {
            valueDisplay.textContent = rate.toFixed(1) + 'x';
        }
        return;
    }

    // EQ controls (show dB)
    if (input.classList.contains('eq-low') || input.classList.contains('eq-mid') ||
        input.classList.contains('eq-high') || input.classList.contains('master-eq-low') ||
        input.classList.contains('master-eq-mid') || input.classList.contains('master-eq-high')) {
        valueDisplay.textContent = value > 0 ? `+${value}` : value;
        return;
    }

    // Default: normalize to 0-100
    const normalized = Math.round(((value - min) / (max - min)) * 100);
    valueDisplay.textContent = normalized;

    // Update knob rotation
    const container = input.parentElement;
    const percent = (value - min) / (max - min);
    const angle = -135 + (percent * 270);
    container.style.setProperty('--knob-rotation', `${angle}deg`);
}

// Setup input source modal
function setupInputModal() {
    const modal = document.getElementById('input-modal');
    if (!modal) return;

    const options = modal.querySelectorAll('.modal-option');
    options.forEach(option => {
        option.addEventListener('click', async () => {
            const source = option.dataset.source;

            // Hide modal immediately
            modal.classList.add('hidden');

            // Initialize audio system (requires user gesture - this click satisfies it)
            await initializeRecorder();

            // Set the selected audio source
            if (source !== 'none') {
                await recorder.setAudioSource(source);
                // Update the dropdown to match
                if (domCache.audioSourceSelect) {
                    domCache.audioSourceSelect.value = source;
                }
            }
        });
    });
}

// Initialize the recorder and setup controls
async function initializeRecorder() {
    recorder = new Recorder();
    await recorder.init();

    setupTransportControls();
    setupTrackControls();
    setupMasterControls();

    // Setup visualizer
    const visualizer = new Visualizer(recorder.masterAnalyser, recorder.ctx);
    visualizer.start();
}

// Setup transport bar controls with cached DOM
function setupTransportControls() {
    domCache.playAll?.addEventListener('click', () => {
        recorder.playAll();
    });

    domCache.stopAll?.addEventListener('click', () => {
        recorder.stopAll();
    });

    domCache.clearAll?.addEventListener('click', () => {
        if (confirm('Clear all tracks?')) {
            recorder.clearAll();
        }
    });

    domCache.exportMix?.addEventListener('click', () => {
        recorder.exportMix();
    });

    domCache.loadFiles?.addEventListener('click', () => {
        domCache.fileInput?.click();
    });

    domCache.fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (let i = 0; i < Math.min(files.length, 4); i++) {
            await recorder.loadFileToTrack(i, files[i]);
            updateTrackIndicator(i, true);
        }
    });

    domCache.audioSourceSelect?.addEventListener('change', async (e) => {
        await recorder.setAudioSource(e.target.value);
    });
}

// Setup controls for all tracks using event delegation
function setupTrackControls() {
    // Use event delegation for buttons
    document.querySelector('.mixer-console')?.addEventListener('click', handleMixerClick);

    // Setup individual track knob/fader listeners
    for (let i = 0; i < 4; i++) {
        setupTrackKnobs(i);
        setupTrackFader(i);
    }
}

// Event delegation handler for mixer clicks
function handleMixerClick(e) {
    const target = e.target;
    const trackNumber = parseInt(target.dataset.track);

    if (isNaN(trackNumber) && !target.classList.contains('clear-all')) return;

    // Record button
    if (target.classList.contains('rec-btn')) {
        handleRecordClick(trackNumber);
        return;
    }

    // Mode button
    if (target.classList.contains('mode-btn')) {
        handleModeClick(trackNumber);
        return;
    }

    // Mute button
    if (target.classList.contains('mute-btn')) {
        handleMuteClick(trackNumber);
        return;
    }

    // Solo button
    if (target.classList.contains('solo-btn')) {
        handleSoloClick(trackNumber);
        return;
    }

    // Clear button
    if (target.classList.contains('clear-btn')) {
        handleClearClick(trackNumber);
        return;
    }
}

function handleRecordClick(trackNumber) {
    const track = recorder.getTrack(trackNumber);
    const recBtn = domCache.recBtns[trackNumber];

    if (track.isRecording) {
        track.stopRecording();
        recBtn?.classList.remove('active');
        recBtn.textContent = 'REC';
    } else {
        recorder.recordTrack(trackNumber);
        recBtn?.classList.add('active');
        recBtn.textContent = 'STOP';
    }
}

function handleModeClick(trackNumber) {
    const track = recorder.getTrack(trackNumber);
    const modeBtn = domCache.modeBtns[trackNumber];
    const newMode = track.mode === 'normal' ? 'loop' : 'normal';

    track.setMode(newMode);

    if (newMode === 'loop') {
        modeBtn?.classList.add('active');
        modeBtn.textContent = 'LOOP';
    } else {
        modeBtn?.classList.remove('active');
        modeBtn.textContent = 'NORM';
    }
}

function handleMuteClick(trackNumber) {
    const track = recorder.getTrack(trackNumber);
    const muteBtn = domCache.muteBtns[trackNumber];

    track.isMuted = !track.isMuted;
    track.setMute(track.isMuted);
    muteBtn?.classList.toggle('active', track.isMuted);
}

function handleSoloClick(trackNumber) {
    const soloBtn = domCache.soloBtns[trackNumber];

    recorder.handleSolo(trackNumber);

    // Update all solo buttons
    for (let i = 0; i < 4; i++) {
        const btn = domCache.soloBtns[i];
        const track = recorder.getTrack(i);
        btn?.classList.toggle('active', track.isSolo);
    }
}

function handleClearClick(trackNumber) {
    const track = recorder.getTrack(trackNumber);
    track.clear();
    updateTrackIndicator(trackNumber, false);
}

// Setup track knob controls
function setupTrackKnobs(trackNumber) {
    const track = () => recorder.getTrack(trackNumber);

    // Compressor Input
    domCache.compInputKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setLA2APeakReduction(e.target.value / 100);
    });

    // Compressor Reduction
    domCache.compReductionKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setLA2AGain(e.target.value / 100);
    });

    // EQ
    domCache.eqLowKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setEQLow(parseFloat(e.target.value));
    });

    domCache.eqMidKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setEQMid(parseFloat(e.target.value));
    });

    domCache.eqHighKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setEQHigh(parseFloat(e.target.value));
    });

    // Reverb Send
    domCache.reverbSendKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setReverbSend(e.target.value / 100);
    });

    // Speed (unipolar: 0 to 100, center=50 for 1x)
    domCache.speedKnobs[trackNumber]?.addEventListener('input', (e) => {
        track().setSpeed(parseFloat(e.target.value));
    });

    // Reverse toggle button
    domCache.revBtns[trackNumber]?.addEventListener('click', () => {
        const t = track();
        const revBtn = domCache.revBtns[trackNumber];
        const isReversed = !t.isReversed;
        t.setReverse(isReversed);
        revBtn?.classList.toggle('active', isReversed);
    });
}

// Setup track fader
function setupTrackFader(trackNumber) {
    const fader = domCache.channelFaders[trackNumber];
    const valueDisplay = domCache.faderValues[trackNumber];

    fader?.addEventListener('input', (e) => {
        const track = recorder.getTrack(trackNumber);
        track.setFader(e.target.value / 100);
        if (valueDisplay) {
            valueDisplay.textContent = Math.round(e.target.value);
        }
    });
}

// Setup master controls
function setupMasterControls() {
    // Master EQ
    domCache.masterEQLow?.addEventListener('input', (e) => {
        recorder.setMasterEQLow(parseFloat(e.target.value));
    });

    domCache.masterEQMid?.addEventListener('input', (e) => {
        recorder.setMasterEQMid(parseFloat(e.target.value));
    });

    domCache.masterEQHigh?.addEventListener('input', (e) => {
        recorder.setMasterEQHigh(parseFloat(e.target.value));
    });

    // Master Compressor
    domCache.masterCompThreshold?.addEventListener('input', (e) => {
        recorder.setMasterLA2APeakReduction(e.target.value / 100);
    });

    domCache.masterCompMakeup?.addEventListener('input', (e) => {
        recorder.setMasterLA2AGain(e.target.value / 100);
    });

    // Master Reverb
    domCache.masterReverbSize?.addEventListener('input', (e) => {
        recorder.setMasterReverbSize(e.target.value / 100 * 45);
    });

    domCache.masterReverbMix?.addEventListener('input', (e) => {
        recorder.setMasterReverbAmount(e.target.value / 100);
    });

    // Master Fader
    domCache.masterFader?.addEventListener('input', (e) => {
        recorder.setMasterVolume(e.target.value / 100);
        if (domCache.masterFaderValue) {
            domCache.masterFaderValue.textContent = Math.round(e.target.value);
        }
    });

    // Tape Bus Controls (debounced to prevent performance issues)
    let tapeSaturationTimeout, tapeWowTimeout, tapeFlutterTimeout;
    let tapeDropoutsTimeout, tapeHissTimeout, tapeAgeTimeout;

    domCache.tapeSaturation?.addEventListener('input', (e) => {
        clearTimeout(tapeSaturationTimeout);
        tapeSaturationTimeout = setTimeout(() => {
            recorder.setTapeSaturation(parseFloat(e.target.value));
        }, 150);
    });

    domCache.tapeWow?.addEventListener('input', (e) => {
        clearTimeout(tapeWowTimeout);
        tapeWowTimeout = setTimeout(() => {
            recorder.setTapeWow(parseFloat(e.target.value));
        }, 100);
    });

    domCache.tapeFlutter?.addEventListener('input', (e) => {
        clearTimeout(tapeFlutterTimeout);
        tapeFlutterTimeout = setTimeout(() => {
            recorder.setTapeFlutter(parseFloat(e.target.value));
        }, 100);
    });

    domCache.tapeDropouts?.addEventListener('input', (e) => {
        clearTimeout(tapeDropoutsTimeout);
        tapeDropoutsTimeout = setTimeout(() => {
            recorder.setTapeDropouts(parseFloat(e.target.value));
        }, 200);
    });

    domCache.tapeHiss?.addEventListener('input', (e) => {
        clearTimeout(tapeHissTimeout);
        tapeHissTimeout = setTimeout(() => {
            recorder.setTapeHiss(parseFloat(e.target.value));
        }, 100);
    });

    domCache.tapeAge?.addEventListener('input', (e) => {
        clearTimeout(tapeAgeTimeout);
        tapeAgeTimeout = setTimeout(() => {
            recorder.setTapeAge(parseFloat(e.target.value));
        }, 150);
    });

    // Tape Bypass Button
    domCache.tapeBypassBtn?.addEventListener('click', () => {
        const isActive = domCache.tapeBypassBtn.classList.toggle('active');
        recorder.setTapeBypass(!isActive);
        domCache.tapeBypassBtn.textContent = isActive ? 'ON' : 'OFF';
    });
}

// Update track audio indicator
function updateTrackIndicator(trackNumber, hasAudio) {
    const indicator = domCache.audioIndicators[trackNumber];
    if (indicator) {
        indicator.classList.toggle('active', hasAudio);
    }
}

// Export for use in other modules
window.updateTrackIndicator = updateTrackIndicator;
