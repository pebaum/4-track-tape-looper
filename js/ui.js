// UI Controller for Vertical Console Mixer
// Handles all user interactions and wires up the interface

let recorder = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupDoubleClickInput();
    setupKnobVisuals();
    setupStartButton();
});

// Setup double-click text input for all controls
function setupDoubleClickInput() {
    // For all knobs
    document.querySelectorAll('.knob-container input[type="range"]').forEach(input => {
        const container = input.parentElement;

        // Create value display element
        const valueDisplay = document.createElement('div');
        valueDisplay.className = 'knob-value-display';
        valueDisplay.style.position = 'absolute';
        valueDisplay.style.bottom = '-20px';
        valueDisplay.style.left = '50%';
        valueDisplay.style.transform = 'translateX(-50%)';
        valueDisplay.style.fontSize = '9px';
        valueDisplay.style.color = '#888';
        valueDisplay.style.cursor = 'pointer';
        container.appendChild(valueDisplay);

        // Update value display
        const updateDisplay = () => {
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || 100;
            const value = parseFloat(input.value);

            // For EQ controls, show actual dB value
            if (input.classList.contains('eq-low') || input.classList.contains('eq-mid') ||
                input.classList.contains('eq-high') || input.classList.contains('master-eq-low') ||
                input.classList.contains('master-eq-mid') || input.classList.contains('master-eq-high')) {
                valueDisplay.textContent = value > 0 ? `+${value}` : value;
            } else {
                // Normalize to 0-100 for other controls
                const normalized = Math.round(((value - min) / (max - min)) * 100);
                valueDisplay.textContent = normalized;
            }
        };

        // Initial display
        updateDisplay();
        input.addEventListener('input', updateDisplay);

        // Double-click to edit
        container.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = 'value-input';
            inputEl.value = valueDisplay.textContent;

            container.appendChild(inputEl);
            inputEl.select();
            inputEl.focus();

            const finishEdit = () => {
                const newValue = parseFloat(inputEl.value) || 0;
                const min = parseFloat(input.min) || 0;
                const max = parseFloat(input.max) || 100;

                // For EQ controls, use direct value
                if (input.classList.contains('eq-low') || input.classList.contains('eq-mid') ||
                    input.classList.contains('eq-high') || input.classList.contains('master-eq-low') ||
                    input.classList.contains('master-eq-mid') || input.classList.contains('master-eq-high')) {
                    input.value = Math.max(min, Math.min(max, newValue));
                } else {
                    // Convert 0-100 to actual range
                    const actualValue = min + (Math.max(0, Math.min(100, newValue)) / 100) * (max - min);
                    input.value = actualValue;
                }

                input.dispatchEvent(new Event('input'));
                inputEl.remove();
                updateDisplay();
            };

            inputEl.addEventListener('blur', finishEdit);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finishEdit();
                } else if (e.key === 'Escape') {
                    inputEl.remove();
                }
            });
        });
    });

    // For vertical faders
    document.querySelectorAll('.vertical-fader').forEach(fader => {
        const container = fader.parentElement;
        const valueDisplay = container.querySelector('.fader-value');

        // Update fader value display
        const updateFaderDisplay = () => {
            const value = Math.round((parseFloat(fader.value) / 100) * 100);
            valueDisplay.textContent = value;
        };

        fader.addEventListener('input', updateFaderDisplay);

        // Double-click to edit fader value
        valueDisplay.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const inputEl = document.createElement('input');
            inputEl.type = 'text';
            inputEl.className = 'value-input';
            inputEl.value = valueDisplay.textContent;
            inputEl.style.position = 'static';
            inputEl.style.transform = 'none';

            valueDisplay.style.display = 'none';
            container.appendChild(inputEl);
            inputEl.select();
            inputEl.focus();

            const finishEdit = () => {
                const newValue = parseInt(inputEl.value) || 0;
                fader.value = Math.max(0, Math.min(100, newValue));
                fader.dispatchEvent(new Event('input'));
                inputEl.remove();
                valueDisplay.style.display = 'block';
                updateFaderDisplay();
            };

            inputEl.addEventListener('blur', finishEdit);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finishEdit();
                } else if (e.key === 'Escape') {
                    inputEl.remove();
                    valueDisplay.style.display = 'block';
                }
            });
        });
    });
}

// Setup visual knob rotation indicators
function setupKnobVisuals() {
    document.querySelectorAll('.knob-container input[type="range"]').forEach(input => {
        const container = input.parentElement;

        // Update knob rotation
        const updateKnob = () => {
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || 100;
            const value = parseFloat(input.value);

            // Calculate percentage (0-1)
            const percent = (value - min) / (max - min);

            // Convert to rotation angle (-135deg to +135deg, 270 degree range)
            const angle = -135 + (percent * 270);

            // Update the ::after pseudo-element rotation using CSS variable
            container.style.setProperty('--knob-rotation', `${angle}deg`);
        };

        // Initial update and listen for changes
        updateKnob();
        input.addEventListener('input', updateKnob);
    });
}

// Update knob rotation CSS
const style = document.createElement('style');
style.textContent = `
    .knob-container::after {
        transform: translateX(-50%) rotate(var(--knob-rotation, 0deg));
    }
`;
document.head.appendChild(style);

// Setup start button to initialize audio context
function setupStartButton() {
    // Check if we need to create a start button
    if (!document.getElementById('start-audio')) {
        const startBtn = document.createElement('button');
        startBtn.id = 'start-audio';
        startBtn.textContent = 'START MIXER';
        startBtn.style.position = 'fixed';
        startBtn.style.top = '50%';
        startBtn.style.left = '50%';
        startBtn.style.transform = 'translate(-50%, -50%)';
        startBtn.style.fontSize = '24px';
        startBtn.style.padding = '20px 40px';
        startBtn.style.background = '#e50914';
        startBtn.style.color = 'white';
        startBtn.style.border = 'none';
        startBtn.style.cursor = 'pointer';
        startBtn.style.zIndex = '1000';
        document.body.appendChild(startBtn);

        startBtn.addEventListener('click', async () => {
            startBtn.remove();
            await initializeRecorder();
        });
    }
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

// Setup transport bar controls
function setupTransportControls() {
    // Play All button
    const playAllBtn = document.getElementById('play-all');
    playAllBtn?.addEventListener('click', () => {
        recorder.playAll();
        playAllBtn.textContent = '❚❚ PAUSE';
    });

    // Stop All button
    const stopAllBtn = document.getElementById('stop-all');
    stopAllBtn?.addEventListener('click', () => {
        recorder.stopAll();
        document.getElementById('play-all').textContent = '▶ PLAY';
    });

    // Clear All button
    const clearAllBtn = document.getElementById('clear-all');
    clearAllBtn?.addEventListener('click', () => {
        if (confirm('Clear all tracks? This cannot be undone.')) {
            recorder.clearAll();
        }
    });

    // Export Mix button
    const exportBtn = document.getElementById('export-mix');
    exportBtn?.addEventListener('click', () => {
        recorder.exportMix();
    });

    // Load Files button
    const loadFilesBtn = document.getElementById('load-files');
    const fileInput = document.getElementById('file-input');

    loadFilesBtn?.addEventListener('click', () => {
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (let i = 0; i < Math.min(files.length, 4); i++) {
            await recorder.loadFileToTrack(i, files[i]);
            updateTrackIndicator(i, true);
        }
    });

    // Audio source selector
    const audioSourceSelect = document.getElementById('audioSourceSelect');
    audioSourceSelect?.addEventListener('change', async (e) => {
        await recorder.setAudioSource(e.target.value);
    });
}

// Setup controls for all tracks
function setupTrackControls() {
    for (let i = 0; i < 4; i++) {
        setupTrackButtons(i);
        setupTrackKnobs(i);
        setupTrackFader(i);
    }
}

// Setup track buttons
function setupTrackButtons(trackNumber) {
    const track = recorder.getTrack(trackNumber);

    // REC button
    const recBtn = document.querySelector(`.rec-btn[data-track="${trackNumber}"]`);
    recBtn?.addEventListener('click', async () => {
        if (track.isRecording) {
            track.stopRecording();
            recBtn.classList.remove('active');
            recBtn.textContent = 'REC';
        } else {
            await recorder.recordTrack(trackNumber);
            recBtn.classList.add('active');
            recBtn.textContent = 'STOP';
        }
    });

    // Mode button (Loop/Normal)
    const modeBtn = document.querySelector(`.mode-btn[data-track="${trackNumber}"]`);
    modeBtn?.addEventListener('click', () => {
        const newMode = track.mode === 'normal' ? 'loop' : 'normal';
        track.setMode(newMode);

        if (newMode === 'loop') {
            modeBtn.classList.add('active');
            modeBtn.textContent = 'LOOP';
        } else {
            modeBtn.classList.remove('active');
            modeBtn.textContent = 'NORMAL';
        }
    });

    // Mute button
    const muteBtn = document.querySelector(`.mute-btn[data-track="${trackNumber}"]`);
    muteBtn?.addEventListener('click', () => {
        track.isMuted = !track.isMuted;
        track.setMute(track.isMuted);
        muteBtn.classList.toggle('active', track.isMuted);
    });

    // Solo button
    const soloBtn = document.querySelector(`.solo-btn[data-track="${trackNumber}"]`);
    soloBtn?.addEventListener('click', () => {
        recorder.handleSolo(trackNumber);
        soloBtn.classList.toggle('active', track.isSolo);

        // Update other solo buttons
        for (let i = 0; i < 4; i++) {
            if (i !== trackNumber) {
                const otherSoloBtn = document.querySelector(`.solo-btn[data-track="${i}"]`);
                otherSoloBtn?.classList.toggle('active', recorder.getTrack(i).isSolo);
            }
        }
    });

    // Clear button
    const clearBtn = document.querySelector(`.clear-btn[data-track="${trackNumber}"]`);
    clearBtn?.addEventListener('click', () => {
        track.clear();
        updateTrackIndicator(trackNumber, false);
    });
}

// Setup track knob controls
function setupTrackKnobs(trackNumber) {
    const track = recorder.getTrack(trackNumber);

    // Trim
    const trimKnob = document.querySelector(`.trim[data-track="${trackNumber}"]`);
    trimKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setTrimGain(value);
    });

    // Gain Boost
    const gainBoostKnob = document.querySelector(`.gain-boost[data-track="${trackNumber}"]`);
    gainBoostKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setGainBoost(value);
    });

    // Compressor Input (threshold)
    const compInputKnob = document.querySelector(`.comp-input[data-track="${trackNumber}"]`);
    compInputKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setLA2APeakReduction(value);
    });

    // Compressor Reduction (makeup gain)
    const compReductionKnob = document.querySelector(`.comp-reduction[data-track="${trackNumber}"]`);
    compReductionKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setLA2AGain(value);
    });

    // EQ Low
    const eqLowKnob = document.querySelector(`.eq-low[data-track="${trackNumber}"]`);
    eqLowKnob?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        track.setEQLow(value);
    });

    // EQ Mid
    const eqMidKnob = document.querySelector(`.eq-mid[data-track="${trackNumber}"]`);
    eqMidKnob?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        track.setEQMid(value);
    });

    // EQ High
    const eqHighKnob = document.querySelector(`.eq-high[data-track="${trackNumber}"]`);
    eqHighKnob?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        track.setEQHigh(value);
    });

    // Reverb Send
    const reverbSendKnob = document.querySelector(`.reverb-send[data-track="${trackNumber}"]`);
    reverbSendKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setReverbSend(value);
    });

    // Speed
    const speedKnob = document.querySelector(`.speed[data-track="${trackNumber}"]`);
    speedKnob?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setSpeed(value);
    });
}

// Setup track fader
function setupTrackFader(trackNumber) {
    const track = recorder.getTrack(trackNumber);

    // Channel Fader
    const channelFader = document.querySelector(`.channel-fader[data-track="${trackNumber}"]`);
    const faderValue = channelFader?.parentElement?.querySelector('.fader-value');

    channelFader?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        track.setFader(value);
        if (faderValue) {
            faderValue.textContent = Math.round(e.target.value);
        }
    });
}

// Setup master controls
function setupMasterControls() {
    // Master EQ Low
    const masterEQLow = document.querySelector('.master-eq-low');
    masterEQLow?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        recorder.setMasterEQLow(value);
    });

    // Master EQ Mid
    const masterEQMid = document.querySelector('.master-eq-mid');
    masterEQMid?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        recorder.setMasterEQMid(value);
    });

    // Master EQ High
    const masterEQHigh = document.querySelector('.master-eq-high');
    masterEQHigh?.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        recorder.setMasterEQHigh(value);
    });

    // Master Compressor Threshold
    const masterCompThreshold = document.querySelector('.master-comp-threshold');
    masterCompThreshold?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        recorder.setMasterLA2APeakReduction(value);
    });

    // Master Compressor Makeup
    const masterCompMakeup = document.querySelector('.master-comp-makeup');
    masterCompMakeup?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        recorder.setMasterLA2AGain(value);
    });

    // Master Reverb Size
    const masterReverbSize = document.querySelector('.master-reverb-size');
    masterReverbSize?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        recorder.setMasterReverbSize(value * 45); // 0-45 seconds
    });

    // Master Reverb Mix
    const masterReverbMix = document.querySelector('.master-reverb-mix');
    masterReverbMix?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        recorder.setMasterReverbAmount(value);
    });

    // Master Fader
    const masterFader = document.querySelector('.master-fader');
    const masterFaderValue = masterFader?.parentElement?.querySelector('.fader-value');

    masterFader?.addEventListener('input', (e) => {
        const value = e.target.value / 100;
        recorder.setMasterVolume(value);
        if (masterFaderValue) {
            masterFaderValue.textContent = Math.round(e.target.value);
        }
    });
}

// Update track audio indicator
function updateTrackIndicator(trackNumber, hasAudio) {
    const indicator = document.querySelector(`.channel-strip[data-track="${trackNumber}"] .audio-indicator`);
    if (indicator) {
        if (hasAudio) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    }
}

// Export for use in other modules
window.updateTrackIndicator = updateTrackIndicator;