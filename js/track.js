// Track Class
// Handles individual track recording, playback, and loop modes

class Track {
    constructor(audioContext, trackNumber, masterDestination, reverbSend) {
        this.ctx = audioContext;
        this.trackNumber = trackNumber;
        this.masterDestination = masterDestination;
        this.reverbSend = reverbSend;

        // Recording state
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.audioBuffer = null;
        this.source = null;

        // Playback state
        this.isPlaying = false;
        this.isMuted = false;
        this.isSolo = false;
        this.mode = 'loop'; // 'normal' or 'loop'
        this.loopLength = 4.0; // seconds
        this.playbackRate = 1.0;
        this.startTime = 0;

        // Audio nodes
        this.createAudioNodes();

        // Tape effects
        this.tapeEffects = new TapeEffects(this.ctx);
        this.setupTapeEffects();
    }

    createAudioNodes() {
        // Trim gain (first in chain, default 50% = 0.5)
        this.trimGain = this.ctx.createGain();
        this.trimGain.gain.value = 0.5;

        // Gain boost (pre-compressor)
        this.gainBoost = this.ctx.createGain();
        this.gainBoost.gain.value = 1.0; // Unity gain by default

        // 3-band EQ (will be connected AFTER compressor)
        this.eqLow = this.ctx.createBiquadFilter();
        this.eqLow.type = 'lowshelf';
        this.eqLow.frequency.value = 200;
        this.eqLow.gain.value = 0;

        this.eqMid = this.ctx.createBiquadFilter();
        this.eqMid.type = 'peaking';
        this.eqMid.frequency.value = 1000;
        this.eqMid.Q.value = 0.7;
        this.eqMid.gain.value = 0;

        this.eqHigh = this.ctx.createBiquadFilter();
        this.eqHigh.type = 'highshelf';
        this.eqHigh.frequency.value = 3000;
        this.eqHigh.gain.value = 0;

        // Channel fader (final gain stage)
        this.channelFader = this.ctx.createGain();
        this.channelFader.gain.value = 0.8; // Default fader position

        // Note: Pan removed per requirements
        // Signal chain will be connected in setupTapeEffects()
    }

    setupTapeEffects() {
        // LA-2A style compressor (smooth, musical, program-dependent)
        this.la2aCompressor = this.ctx.createDynamicsCompressor();
        this.la2aCompressor.threshold.value = -24; // dB
        this.la2aCompressor.knee.value = 12; // Soft knee for smooth compression
        this.la2aCompressor.ratio.value = 4; // 4:1 ratio
        this.la2aCompressor.attack.value = 0.010; // 10ms attack (tube-style)
        this.la2aCompressor.release.value = 0.100; // 100ms release (program-dependent feel)

        // LA-2A makeup gain (after compressor for gain reduction compensation)
        this.la2aMakeupGain = this.ctx.createGain();
        this.la2aMakeupGain.gain.value = 1.0; // Unity gain by default (0dB)

        // Wow/flutter (detune oscillator) - for tape speed variations
        this.wowFlutterLFO = this.ctx.createOscillator();
        this.wowFlutterGain = this.ctx.createGain();
        this.wowFlutterLFO.frequency.value = 0.3 + (Math.random() * 0.2);
        this.wowFlutterLFO.type = 'sine';
        this.wowFlutterGain.gain.value = 0; // Start with no wow/flutter
        this.wowFlutterLFO.connect(this.wowFlutterGain);
        this.wowFlutterLFO.start();

        // Reverb send gain (post-EQ, pre-fader)
        this.reverbSendGain = this.ctx.createGain();
        this.reverbSendGain.gain.value = 0; // Start with no reverb send

        // NEW SIGNAL CHAIN:
        // 1. Trim → 2. Gain Boost → 3. Compressor → 4. Makeup Gain →
        // 5. EQ (Low→Mid→High) → 6. Reverb Send (parallel) → 7. Channel Fader → Master

        // Connect main signal path
        this.trimGain.connect(this.gainBoost);
        this.gainBoost.connect(this.la2aCompressor);
        this.la2aCompressor.connect(this.la2aMakeupGain);
        this.la2aMakeupGain.connect(this.eqLow);
        this.eqLow.connect(this.eqMid);
        this.eqMid.connect(this.eqHigh);
        this.eqHigh.connect(this.channelFader);
        this.channelFader.connect(this.masterDestination);

        // Reverb send (parallel path from post-EQ, pre-fader)
        this.eqHigh.connect(this.reverbSendGain);
        this.reverbSendGain.connect(this.reverbSend);
    }

    async startRecording(stream) {
        if (this.isRecording) return;

        this.isRecording = true;
        this.recordedChunks = [];

        // Create MediaRecorder
        this.mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm'
        });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = async () => {
            const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
            await this.loadAudioFromBlob(blob);
            this.isRecording = false;
        };

        this.mediaRecorder.start();
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
        }
    }

    async loadAudioFromBlob(blob) {
        const arrayBuffer = await blob.arrayBuffer();

        try {
            this.audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            // Auto-set loop length to 100% of recording
            this.loopLength = this.audioBuffer.duration;

            // Update audio loaded indicator
            this.updateAudioIndicator(true);
        } catch (error) {
            console.error('Error decoding audio:', error);
        }
    }

    play(when = 0) {
        if (!this.audioBuffer || this.isPlaying) return;

        this.stop(); // Stop any existing playback

        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.playbackRate.value = this.playbackRate;

        // Connect wow/flutter to detune if enabled
        if (this.wowFlutterGain.gain.value > 0) {
            this.wowFlutterGain.connect(this.source.detune);
        }

        // Connect to effects chain (starts at trim gain)
        this.source.connect(this.trimGain);

        if (this.mode === 'loop') {
            // Loop mode: set loop points based on loopLength
            this.source.loop = true;
            this.source.loopStart = 0;
            this.source.loopEnd = Math.min(this.loopLength, this.audioBuffer.duration);
        } else {
            // Normal mode: play once
            this.source.loop = false;
        }

        const startTime = when || this.ctx.currentTime;
        this.source.start(startTime);
        this.startTime = startTime;
        this.isPlaying = true;

        this.source.onended = () => {
            if (!this.source.loop) {
                this.isPlaying = false;
            }
        };
    }

    stop() {
        if (this.source) {
            try {
                this.source.stop();
                this.source.disconnect();
            } catch (e) {
                // Already stopped
            }
            this.source = null;
        }
        this.isPlaying = false;
    }

    clear() {
        this.stop();
        this.audioBuffer = null;
        this.recordedChunks = [];

        // Update audio loaded indicator
        this.updateAudioIndicator(false);
    }

    updateAudioIndicator(isLoaded) {
        const indicator = document.querySelector(`.audio-indicator[data-track="${this.trackNumber}"]`);
        if (indicator) {
            if (isLoaded) {
                indicator.classList.add('loaded');
            } else {
                indicator.classList.remove('loaded');
            }
        }
    }

    // Control methods
    setTrimGain(value) {
        // value is 0-1, where 0.5 = 50% = original level
        this.trimGain.gain.value = value;
    }

    setFader(value) {
        // Channel fader control (0-1)
        this.channelFader.gain.value = value;
    }

    setGainBoost(value) {
        // Gain boost control (0-1 maps to 0-2x gain)
        this.gainBoost.gain.value = value * 2;
    }

    setSpeed(value) {
        this.playbackRate = value;
        if (this.source) {
            this.source.playbackRate.value = value;
        }
    }

    setEQLow(value) {
        this.eqLow.gain.value = value;
    }

    setEQMid(value) {
        this.eqMid.gain.value = value;
    }

    setEQHigh(value) {
        this.eqHigh.gain.value = value;
    }

    setLA2APeakReduction(amount) {
        // amount is 0-1, controls LA-2A compressor threshold
        // 0 = no compression (-10dB threshold)
        // 1 = max compression (-40dB threshold)
        const threshold = -10 - (amount * 30); // -10dB to -40dB
        this.la2aCompressor.threshold.value = threshold;

        // Also adjust ratio for program-dependent feel (3:1 to 8:1)
        const ratio = 3 + (amount * 5);
        this.la2aCompressor.ratio.value = ratio;
    }

    setLA2AGain(amount) {
        // amount is 0-1, controls makeup gain
        // 0 = 0dB (unity), 1 = +20dB
        const gainDb = amount * 20;
        const gainLinear = Math.pow(10, gainDb / 20);
        this.la2aMakeupGain.gain.value = gainLinear;
    }

    setReverbSend(amount) {
        // amount is 0-1
        this.reverbSendGain.gain.value = amount;
    }

    setWowFlutter(amount) {
        // Amount in cents (0-15)
        this.wowFlutterGain.gain.value = amount * 15;
    }

    setMute(muted) {
        this.isMuted = muted;
        this.channelFader.gain.value = muted ? 0 : 0.8;
    }

    setSolo(solo) {
        this.isSolo = solo;
    }

    setMode(mode) {
        this.mode = mode;
        if (this.isPlaying) {
            // Restart playback in new mode
            this.stop();
            this.play();
        }
    }

    setLoopLength(length) {
        this.loopLength = length;
        if (this.mode === 'loop' && this.source) {
            this.source.loopEnd = Math.min(length, this.audioBuffer.duration);
        }
    }

    // Get current playback position
    getCurrentTime() {
        if (!this.isPlaying || !this.source) return 0;

        const elapsed = this.ctx.currentTime - this.startTime;
        const adjustedTime = elapsed * this.playbackRate;

        if (this.mode === 'loop' && this.audioBuffer) {
            return adjustedTime % Math.min(this.loopLength, this.audioBuffer.duration);
        }

        return adjustedTime;
    }

    // Get audio buffer for visualization
    getAudioBuffer() {
        return this.audioBuffer;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Track;
}
