// Main Recorder Class
// Coordinates all tracks and manages the master bus

class Recorder {
    constructor() {
        this.ctx = null;
        this.tracks = [];
        this.microphone = null;
        this.micStream = null;

        // Audio source management
        this.audioSourceType = 'none';  // 'none', 'microphone', 'tab'
        this.activeStream = null;       // Keep reference for cleanup

        // Master bus
        this.masterGain = null;
        this.masterAnalyser = null;

        // Master tape effects
        this.tapeEffects = null;
        this.masterTapeSaturation = null;
        this.masterTapeCompression = null;
        this.masterTapeAge = null;

        // Playback state
        this.isPlaying = false;
        this.playStartTime = 0;

        // Visualizer
        this.visualizer = new Visualizer();
    }

    async init() {
        // Create audio context
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Resume if suspended
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        // Create master bus
        this.createMasterBus();

        // Create 4 tracks (with master EQ input and reverb send bus)
        for (let i = 0; i < 4; i++) {
            const track = new Track(this.ctx, i, this.masterEQLow, this.reverbSendBus);
            this.tracks.push(track);
        }

        // Initialize visualizer (only VU meters, no waveforms)
        this.visualizer.initVUMeters();

        // Audio source will be set by user selection (no automatic mic request)

        // Start VU meter animation
        this.visualizer.startVUAnimation(this.masterAnalyser);

        console.log('Recorder initialized');
    }

    createMasterBus() {
        // Create reverb send bus (all tracks send to this)
        this.reverbSendBus = this.ctx.createGain();
        this.reverbSendBus.gain.value = 1.0;

        // Master reverb - supports up to 45 second decay (Deep Listening style)
        this.masterReverb = this.ctx.createConvolver();
        this.masterReverbSize = 7.0; // 7 second decay default
        // Start with tiny 0.5s buffer to avoid blocking UI, worker will generate real one
        this.masterReverb.buffer = this.generateReverbImpulse(0.5, 0.5);

        // Initialize reverb web worker for generating large impulses without freezing
        this.reverbWorker = new Worker('js/reverb-worker.js');
        this.reverbWorker.onmessage = (e) => {
            const { leftChannel, rightChannel, length } = e.data;
            const buffer = this.ctx.createBuffer(2, leftChannel.length, this.ctx.sampleRate);
            buffer.copyToChannel(new Float32Array(leftChannel), 0);
            buffer.copyToChannel(new Float32Array(rightChannel), 1);
            this.masterReverb.buffer = buffer;

            // Cache it
            const cacheKey = length.toFixed(1);
            this.reverbCache.set(cacheKey, buffer);
            if (this.reverbCache.size > 5) {
                const firstKey = this.reverbCache.keys().next().value;
                this.reverbCache.delete(firstKey);
            }
        };

        // Request real reverb buffer from worker (non-blocking)
        this.reverbWorker.postMessage({
            decay: this.masterReverbSize,
            length: this.masterReverbSize,
            sampleRate: this.ctx.sampleRate
        });

        // Reverb wet/dry mix
        this.reverbMix = this.ctx.createGain();
        this.reverbMix.gain.value = 0.15; // Default 15% reverb mix (lower for massive space)

        // Reverb dry signal
        this.reverbDry = this.ctx.createGain();
        this.reverbDry.gain.value = 0.85; // Default 85% dry

        // Connect reverb: reverbSendBus → reverb → reverbMix
        this.reverbSendBus.connect(this.masterReverb);
        this.masterReverb.connect(this.reverbMix);
        this.reverbSendBus.connect(this.reverbDry);

        // Master 3-band EQ
        this.masterEQLow = this.ctx.createBiquadFilter();
        this.masterEQLow.type = 'lowshelf';
        this.masterEQLow.frequency.value = 200;
        this.masterEQLow.gain.value = 0;

        this.masterEQMid = this.ctx.createBiquadFilter();
        this.masterEQMid.type = 'peaking';
        this.masterEQMid.frequency.value = 1000;
        this.masterEQMid.Q.value = 0.7;
        this.masterEQMid.gain.value = 0;

        this.masterEQHigh = this.ctx.createBiquadFilter();
        this.masterEQHigh.type = 'highshelf';
        this.masterEQHigh.frequency.value = 3000;
        this.masterEQHigh.gain.value = 0;

        // Connect EQ chain
        this.masterEQLow.connect(this.masterEQMid);
        this.masterEQMid.connect(this.masterEQHigh);

        // Master LA-2A style compressor
        this.masterLA2A = this.ctx.createDynamicsCompressor();
        this.masterLA2A.threshold.value = -24; // dB
        this.masterLA2A.knee.value = 12; // Soft knee for smooth compression
        this.masterLA2A.ratio.value = 4; // 4:1 ratio
        this.masterLA2A.attack.value = 0.010; // 10ms attack (tube-style)
        this.masterLA2A.release.value = 0.100; // 100ms release (program-dependent feel)

        // Master LA-2A makeup gain
        this.masterLA2AMakeupGain = this.ctx.createGain();
        this.masterLA2AMakeupGain.gain.value = 1.0; // Unity gain by default (0dB)

        // Cassette Tape Bus - inserted after LA-2A, before master gain
        this.cassetteTapeBus = new CassetteTapeBus(this.ctx);

        // Master gain (master fader)
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Master brick-wall limiter (to prevent clipping)
        this.masterLimiter = this.ctx.createDynamicsCompressor();
        this.masterLimiter.threshold.value = -0.5; // dB (just below 0dB to prevent any clipping)
        this.masterLimiter.knee.value = 0; // Hard knee for brick-wall limiting
        this.masterLimiter.ratio.value = 20; // 20:1 ratio (effectively infinity for limiting)
        this.masterLimiter.attack.value = 0.001; // 1ms attack (very fast to catch peaks)
        this.masterLimiter.release.value = 0.010; // 10ms release (fast but not too fast to avoid pumping)

        // Master analyser for VU meters
        this.masterAnalyser = this.ctx.createAnalyser();
        this.masterAnalyser.fftSize = 2048;
        this.masterAnalyser.smoothingTimeConstant = 0.8;

        // Connect master chain: tracks → EQ → LA-2A → LA-2A Makeup Gain → Cassette Tape Bus → gain + (reverb wet + dry) → limiter → analyser → output
        this.masterEQLow.connect(this.masterEQMid);
        this.masterEQMid.connect(this.masterEQHigh);
        this.masterEQHigh.connect(this.masterLA2A);
        this.masterLA2A.connect(this.masterLA2AMakeupGain);
        this.masterLA2AMakeupGain.connect(this.cassetteTapeBus.getInput());
        this.cassetteTapeBus.getOutput().connect(this.masterGain);
        this.reverbMix.connect(this.masterGain);
        this.reverbDry.connect(this.masterGain);
        this.masterGain.connect(this.masterLimiter);
        this.masterLimiter.connect(this.masterAnalyser);
        this.masterAnalyser.connect(this.ctx.destination);

        // Impulse cache for performance
        this.reverbCache = new Map();
    }

    // Generate reverb impulse (used for initial small buffer only)
    // Large buffers use the web worker instead
    generateReverbImpulse(decay, length) {
        const sampleRate = this.ctx.sampleRate;
        const lengthSamples = Math.floor(sampleRate * length);
        const impulse = this.ctx.createBuffer(2, lengthSamples, sampleRate);

        const decayRate = 1 / (sampleRate * decay);
        const decayMultiplier = Math.exp(-decayRate);

        for (let channel = 0; channel < 2; channel++) {
            const data = impulse.getChannelData(channel);
            const stereoShift = channel === 0 ? 0.9 : 1.1;
            let envelope = 1.0;

            for (let i = 0; i < lengthSamples; i++) {
                data[i] = (Math.random() * 2 - 1) * envelope * stereoShift * 0.4;
                envelope *= decayMultiplier;
            }
        }

        return impulse;
    }

    async setupMicrophone() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });
            this.microphone = this.ctx.createMediaStreamSource(this.micStream);
            this.updateStatus('MICROPHONE CONNECTED');
            console.log('Microphone connected');
        } catch (error) {
            console.error('Error accessing microphone:', error);
            alert('Could not access microphone. Recording will not be available.');
            this.audioSourceType = 'none';
        }
    }

    async setupSystemAudio() {
        try {
            // Request display capture with audio
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1 },
                    height: { ideal: 1 }
                },
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Extract audio tracks
            const audioTracks = stream.getAudioTracks();

            if (audioTracks.length === 0) {
                throw new Error('No audio track available. Make sure to share tab audio.');
            }

            // Create audio-only stream
            this.micStream = new MediaStream(audioTracks);
            this.activeStream = stream; // Keep reference to stop later

            // Create Web Audio source
            this.microphone = this.ctx.createMediaStreamSource(this.micStream);

            // Handle stream end (user stops sharing)
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                this.setAudioSource('none');
            });

            this.updateStatus('TAB AUDIO CONNECTED');
            console.log('Tab audio connected');
        } catch (error) {
            console.error('Error capturing tab audio:', error);
            alert('Could not capture tab audio. Make sure to select "Share tab audio" in the permission dialog.');
            this.audioSourceType = 'none';
        }
    }

    async setAudioSource(sourceType) {
        // Clean up existing stream
        if (this.activeStream) {
            this.activeStream.getTracks().forEach(track => track.stop());
            this.activeStream = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        this.microphone = null;

        this.audioSourceType = sourceType;

        switch(sourceType) {
            case 'microphone':
                await this.setupMicrophone();
                break;
            case 'tab':
                await this.setupSystemAudio();
                break;
            case 'none':
            default:
                this.updateStatus('NO INPUT SELECTED');
                break;
        }
    }

    // Transport controls
    play() {
        if (this.isPlaying) return;

        this.isPlaying = true;
        this.playStartTime = this.ctx.currentTime;

        // Play all tracks that have audio
        this.tracks.forEach(track => {
            if (track.audioBuffer && !track.isMuted) {
                track.play();
            }
        });

        // Start tape reel animation
        this.startTapeAnimation();

        this.updateStatus('PLAYING');
    }

    stop() {
        if (!this.isPlaying) return;

        this.isPlaying = false;

        // Stop all tracks
        this.tracks.forEach(track => {
            track.stop();
        });

        // Stop tape reel animation
        this.stopTapeAnimation();

        this.updateStatus('STOPPED');
    }

    // Record on a specific track
    async recordTrack(trackNumber) {
        if (!this.micStream) {
            alert('No audio input selected. Please select an input source first.');
            return;
        }

        const track = this.tracks[trackNumber];

        if (track.isRecording) {
            track.stopRecording();
            this.updateStatus(`TRACK ${trackNumber + 1} RECORDED`);
        } else {
            await track.startRecording(this.micStream);
            this.updateStatus(`RECORDING TRACK ${trackNumber + 1}`);
        }
    }

    // Solo/mute handling
    handleSolo(trackNumber) {
        const track = this.tracks[trackNumber];
        track.setSolo(!track.isSolo);

        // Check if any track is solo
        const anySolo = this.tracks.some(t => t.isSolo);

        if (anySolo) {
            // Mute all non-solo tracks
            this.tracks.forEach((t, i) => {
                if (!t.isSolo) {
                    t.setMute(true);
                }
            });
        } else {
            // Restore all mutes to their original state
            this.tracks.forEach((t, i) => {
                // This would need to track original mute state
                t.setMute(t.isMuted);
            });
        }
    }

    // Clear all tracks
    clearAll() {
        this.stop();
        this.tracks.forEach(track => {
            track.clear();
        });
        // Clear all waveforms
        for (let i = 0; i < 4; i++) {
            this.visualizer.clearWaveform(i);
        }
        this.updateStatus('ALL TRACKS CLEARED');
    }

    // Waveforms removed for performance and space optimization
    // updateWaveforms() - REMOVED
    // startWaveformAnimation() - REMOVED

    // Master controls
    setMasterVolume(value) {
        this.masterGain.gain.value = value;
    }

    setMasterEQLow(value) {
        this.masterEQLow.gain.value = value;
    }

    setMasterEQMid(value) {
        this.masterEQMid.gain.value = value;
    }

    setMasterEQHigh(value) {
        this.masterEQHigh.gain.value = value;
    }

    setMasterLA2APeakReduction(amount) {
        // amount is 0-1, controls master LA-2A compressor threshold
        // 0 = no compression (-10dB threshold)
        // 1 = max compression (-40dB threshold)
        const threshold = -10 - (amount * 30); // -10dB to -40dB
        this.masterLA2A.threshold.value = threshold;

        // Also adjust ratio for program-dependent feel (3:1 to 8:1)
        const ratio = 3 + (amount * 5);
        this.masterLA2A.ratio.value = ratio;
    }

    setMasterLA2AGain(amount) {
        // amount is 0-1, controls master makeup gain
        // 0 = 0dB (unity), 1 = +20dB
        const gainDb = amount * 20;
        const gainLinear = Math.pow(10, gainDb / 20);
        this.masterLA2AMakeupGain.gain.value = gainLinear;
    }

    setMasterReverb(amount) {
        // amount is 0-1, controls wet/dry mix
        this.reverbMix.gain.value = amount;
        this.reverbDry.gain.value = 1 - amount;
    }

    setMasterReverbSize(amount) {
        // amount is 0-1, controls reverb decay time (0.5-45 seconds) - MASSIVE range
        const decayTime = 0.5 + (amount * 44.5); // 0.5s to 45s
        this.masterReverbSize = decayTime;

        // Check cache first for performance
        const cacheKey = decayTime.toFixed(1);
        if (this.reverbCache.has(cacheKey)) {
            this.masterReverb.buffer = this.reverbCache.get(cacheKey);
            return;
        }

        // Debounce: cancel any pending regeneration and wait 500ms after last change
        if (this._reverbSizeTimeout) {
            clearTimeout(this._reverbSizeTimeout);
        }

        this._reverbSizeTimeout = setTimeout(() => {
            // Use web worker for generation to prevent UI freeze
            this.reverbWorker.postMessage({
                decay: decayTime,
                length: decayTime,
                sampleRate: this.ctx.sampleRate
            });
        }, 500);
    }

    // Cassette Tape Bus Controls
    setTapeSaturation(value) {
        // value is 0-100
        this.cassetteTapeBus.setSaturation(value);
    }

    setTapeWow(value) {
        // value is 0-100
        this.cassetteTapeBus.setWow(value);
    }

    setTapeFlutter(value) {
        // value is 0-100
        this.cassetteTapeBus.setFlutter(value);
    }

    setTapeDropouts(value) {
        // value is 0-100
        this.cassetteTapeBus.setDropouts(value);
    }

    setTapeHiss(value) {
        // value is 0-100
        this.cassetteTapeBus.setHiss(value);
    }

    setTapeAge(value) {
        // value is 0-100
        this.cassetteTapeBus.setAge(value);
    }

    setTapeBypass(bypassed) {
        this.cassetteTapeBus.setBypass(bypassed);
    }

    // Tape reel animation
    startTapeAnimation() {
        const reels = document.querySelectorAll('.reel');
        reels.forEach(reel => reel.classList.add('spinning'));
    }

    stopTapeAnimation() {
        const reels = document.querySelectorAll('.reel');
        reels.forEach(reel => reel.classList.remove('spinning'));
    }

    // Update status display
    updateStatus(text) {
        const status = document.getElementById('status');
        if (status) {
            status.textContent = text;
        }
    }

    // Get track
    getTrack(trackNumber) {
        return this.tracks[trackNumber];
    }

    // Aliases for UI compatibility
    playAll() {
        return this.play();
    }

    stopAll() {
        return this.stop();
    }

    setMasterReverbAmount(amount) {
        return this.setMasterReverb(amount);
    }

    // Load audio file to specific track
    async loadFileToTrack(trackNumber, file) {
        if (trackNumber < 0 || trackNumber >= this.tracks.length) {
            console.error('Invalid track number');
            return;
        }

        const track = this.tracks[trackNumber];

        try {
            // Read file as array buffer
            const arrayBuffer = await file.arrayBuffer();

            // Decode audio data
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            // Set the buffer on the track
            track.audioBuffer = audioBuffer;
            track.loopLength = audioBuffer.duration;
            track.hasAudio = true;

            // Pre-generate reversed buffer for bipolar speed control
            track.reversedBuffer = track.createReversedBuffer(audioBuffer);

            // AUTO-PLAY: Start looping immediately after file load
            if (!track.isPlaying) {
                track.play();
            }

            this.updateStatus(`LOADED CH ${trackNumber + 1}`);
            console.log(`Loaded file to track ${trackNumber + 1}`);
        } catch (error) {
            console.error('Error loading file:', error);
            alert(`Could not load audio file: ${error.message}`);
        }
    }

    // Export current mix as WAV file
    async exportMix() {
        try {
            // Stop playback first
            this.stop();

            // Find the longest track duration
            let maxDuration = 0;
            this.tracks.forEach(track => {
                if (track.audioBuffer) {
                    maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
                }
            });

            if (maxDuration === 0) {
                alert('No audio to export. Please record or load some audio first.');
                return;
            }

            // Create offline context for rendering
            const sampleRate = 44100;
            const offlineCtx = new OfflineAudioContext(2, maxDuration * sampleRate, sampleRate);

            // Recreate master bus in offline context
            const offlineMasterGain = offlineCtx.createGain();
            offlineMasterGain.gain.value = this.masterGain.gain.value;

            const offlineLimiter = offlineCtx.createDynamicsCompressor();
            offlineLimiter.threshold.value = this.masterLimiter.threshold.value;
            offlineLimiter.knee.value = this.masterLimiter.knee.value;
            offlineLimiter.ratio.value = this.masterLimiter.ratio.value;
            offlineLimiter.attack.value = this.masterLimiter.attack.value;
            offlineLimiter.release.value = this.masterLimiter.release.value;

            offlineMasterGain.connect(offlineLimiter);
            offlineLimiter.connect(offlineCtx.destination);

            // Render each track
            this.tracks.forEach((track, index) => {
                if (track.audioBuffer && !track.isMuted) {
                    const source = offlineCtx.createBufferSource();
                    source.buffer = track.audioBuffer;

                    const trackGain = offlineCtx.createGain();
                    trackGain.gain.value = track.channelFader.gain.value;

                    source.connect(trackGain);
                    trackGain.connect(offlineMasterGain);
                    source.start(0);
                }
            });

            this.updateStatus('RENDERING MIX...');

            // Render the mix
            const renderedBuffer = await offlineCtx.startRendering();

            // Convert to WAV
            const wav = this.bufferToWav(renderedBuffer);

            // Create download link
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `mix_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(url);

            this.updateStatus('MIX EXPORTED');
        } catch (error) {
            console.error('Error exporting mix:', error);
            alert('Error exporting mix. Please try again.');
            this.updateStatus('EXPORT FAILED');
        }
    }

    // Convert AudioBuffer to WAV format
    bufferToWav(buffer) {
        const length = buffer.length * buffer.numberOfChannels * 2;
        const arrayBuffer = new ArrayBuffer(44 + length);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, buffer.numberOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * buffer.numberOfChannels * 2, true);
        view.setUint16(32, buffer.numberOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length, true);

        // Interleave channels and convert to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const sample = buffer.getChannelData(channel)[i];
                const clampedSample = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, clampedSample * 0x7FFF, true);
                offset += 2;
            }
        }

        return arrayBuffer;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Recorder;
}
