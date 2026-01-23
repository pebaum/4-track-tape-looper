// Track Class
// Handles individual track recording, playback, and loop modes
// Includes bipolar speed control with reverse playback support

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
        this.reversedBuffer = null; // Pre-reversed buffer for compatibility
        this.source = null;

        // Playback state
        this.isPlaying = false;
        this.isMuted = false;
        this.isSolo = false;
        this.mode = 'loop'; // 'normal' or 'loop'
        this.loopLength = 4.0; // seconds
        this.playbackRate = 1.0;
        this.isReversed = false;
        this.startTime = 0;
        this.pausedAt = 0;

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
        this.gainBoost.gain.value = 1.0;

        // 3-band EQ
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
        this.channelFader.gain.value = 0.8;
    }

    setupTapeEffects() {
        // LA-2A style compressor
        this.la2aCompressor = this.ctx.createDynamicsCompressor();
        this.la2aCompressor.threshold.value = -24;
        this.la2aCompressor.knee.value = 12;
        this.la2aCompressor.ratio.value = 4;
        this.la2aCompressor.attack.value = 0.010;
        this.la2aCompressor.release.value = 0.100;

        // LA-2A makeup gain
        this.la2aMakeupGain = this.ctx.createGain();
        this.la2aMakeupGain.gain.value = 1.0;

        // Wow/flutter LFO
        this.wowFlutterLFO = this.ctx.createOscillator();
        this.wowFlutterGain = this.ctx.createGain();
        this.wowFlutterLFO.frequency.value = 0.3 + (Math.random() * 0.2);
        this.wowFlutterLFO.type = 'sine';
        this.wowFlutterGain.gain.value = 0;
        this.wowFlutterLFO.connect(this.wowFlutterGain);
        this.wowFlutterLFO.start();

        // Reverb send gain
        this.reverbSendGain = this.ctx.createGain();
        this.reverbSendGain.gain.value = 0;

        // Signal chain
        this.trimGain.connect(this.gainBoost);
        this.gainBoost.connect(this.la2aCompressor);
        this.la2aCompressor.connect(this.la2aMakeupGain);
        this.la2aMakeupGain.connect(this.eqLow);
        this.eqLow.connect(this.eqMid);
        this.eqMid.connect(this.eqHigh);
        this.eqHigh.connect(this.channelFader);
        this.channelFader.connect(this.masterDestination);

        // Reverb send (parallel path)
        this.eqHigh.connect(this.reverbSendGain);
        this.reverbSendGain.connect(this.reverbSend);
    }

    async startRecording(stream) {
        if (this.isRecording) return;

        this.isRecording = true;
        this.recordedChunks = [];

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
            this.loopLength = this.audioBuffer.duration;

            // Pre-generate reversed buffer for browser compatibility
            this.reversedBuffer = this.createReversedBuffer(this.audioBuffer);

            this.updateAudioIndicator(true);
        } catch (error) {
            console.error('Error decoding audio:', error);
        }
    }

    // Create a reversed version of the audio buffer
    createReversedBuffer(buffer) {
        const reversed = this.ctx.createBuffer(
            buffer.numberOfChannels,
            buffer.length,
            buffer.sampleRate
        );

        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const originalData = buffer.getChannelData(channel);
            const reversedData = reversed.getChannelData(channel);

            for (let i = 0; i < buffer.length; i++) {
                reversedData[i] = originalData[buffer.length - 1 - i];
            }
        }

        return reversed;
    }

    play(when = 0) {
        if (!this.audioBuffer || this.isPlaying) return;

        this.stop();

        this.source = this.ctx.createBufferSource();

        // Use reversed buffer if playing in reverse
        if (this.isReversed && this.reversedBuffer) {
            this.source.buffer = this.reversedBuffer;
            this.source.playbackRate.value = Math.abs(this.playbackRate);
        } else {
            this.source.buffer = this.audioBuffer;
            this.source.playbackRate.value = Math.abs(this.playbackRate);
        }

        // Connect wow/flutter if enabled
        if (this.wowFlutterGain.gain.value > 0) {
            this.wowFlutterGain.connect(this.source.detune);
        }

        // Connect to effects chain
        this.source.connect(this.trimGain);

        if (this.mode === 'loop') {
            this.source.loop = true;
            this.source.loopStart = 0;
            this.source.loopEnd = Math.min(this.loopLength, this.audioBuffer.duration);
        } else {
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
        this.reversedBuffer = null;
        this.recordedChunks = [];
        this.updateAudioIndicator(false);
    }

    updateAudioIndicator(isLoaded) {
        const indicator = document.querySelector(`.audio-indicator[data-track="${this.trackNumber}"]`);
        if (indicator) {
            indicator.classList.toggle('loaded', isLoaded);
        }
    }

    // Control methods
    setTrimGain(value) {
        this.trimGain.gain.value = value;
    }

    setFader(value) {
        this.channelFader.gain.value = value;
    }

    setGainBoost(value) {
        this.gainBoost.gain.value = value * 2;
    }

    // Bipolar speed control: -100 to +100
    // Center (0) = normal speed (1x)
    // Right (+100) = forward up to 4x
    // Left (-100) = reverse up to 4x
    setSpeed(normalizedValue) {
        // normalizedValue is -100 to +100 (from knob with min=-100, max=100, center=0)
        const wasPlaying = this.isPlaying;

        if (normalizedValue === 0) {
            // Center position = 1x forward
            this.playbackRate = 1.0;
            this.isReversed = false;
        } else if (normalizedValue > 0) {
            // Right side: forward, exponential curve up to 4x
            // Map 0-100 to 1-4 using exponential curve
            const normalized = normalizedValue / 100; // 0 to 1
            this.playbackRate = Math.pow(4, normalized); // 1 to 4
            this.isReversed = false;
        } else {
            // Left side: reverse, exponential curve up to 4x
            // Map -100 to 0 -> 4x to 1x reverse
            const normalized = Math.abs(normalizedValue) / 100; // 0 to 1
            this.playbackRate = Math.pow(4, normalized); // 1 to 4
            this.isReversed = true;
        }

        // Update currently playing source
        if (this.source && this.isPlaying) {
            // Check if we need to switch buffers (forward <-> reverse)
            const needsBufferSwitch = wasPlaying && (
                (this.isReversed && this.source.buffer === this.audioBuffer) ||
                (!this.isReversed && this.source.buffer === this.reversedBuffer)
            );

            if (needsBufferSwitch) {
                // Restart with new direction
                this.stop();
                this.play();
            } else {
                // Just update rate
                this.source.playbackRate.value = Math.abs(this.playbackRate);
            }
        }
    }

    // Legacy speed control (0-1 range) for backward compatibility
    setSpeedLegacy(value) {
        this.playbackRate = value;
        this.isReversed = false;
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
        const threshold = -10 - (amount * 30);
        this.la2aCompressor.threshold.value = threshold;
        const ratio = 3 + (amount * 5);
        this.la2aCompressor.ratio.value = ratio;
    }

    setLA2AGain(amount) {
        const gainDb = amount * 20;
        const gainLinear = Math.pow(10, gainDb / 20);
        this.la2aMakeupGain.gain.value = gainLinear;
    }

    setReverbSend(amount) {
        this.reverbSendGain.gain.value = amount;
    }

    setWowFlutter(amount) {
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

    getCurrentTime() {
        if (!this.isPlaying || !this.source) return 0;

        const elapsed = this.ctx.currentTime - this.startTime;
        const adjustedTime = elapsed * Math.abs(this.playbackRate);

        if (this.mode === 'loop' && this.audioBuffer) {
            return adjustedTime % Math.min(this.loopLength, this.audioBuffer.duration);
        }

        return adjustedTime;
    }

    getAudioBuffer() {
        return this.audioBuffer;
    }

    // Get current speed display value
    getSpeedDisplay() {
        const rate = Math.abs(this.playbackRate).toFixed(2);
        const direction = this.isReversed ? 'REV' : 'FWD';
        return `${rate}x ${direction}`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Track;
}
