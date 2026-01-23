// Cassette Tape Bus - Realistic tape emulation for master section
// Simulates: saturation, wow, flutter, dropouts, hiss, and tape age

class CassetteTapeBus {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.bypassed = false;
        this.dropoutSchedulerId = null;
        this.dropoutIntensity = 0;

        this.createNodes();
        this.connectNodes();
        this.initDefaults();
    }

    createNodes() {
        // Input/Output gain nodes for bypass and level management
        this.input = this.ctx.createGain();
        this.output = this.ctx.createGain();
        this.bypassGain = this.ctx.createGain();
        this.wetGain = this.ctx.createGain();

        // Head Bump - Low frequency resonance from tape head (~80Hz)
        this.headBump = this.ctx.createBiquadFilter();
        this.headBump.type = 'peaking';
        this.headBump.frequency.value = 80;
        this.headBump.Q.value = 1.5;
        this.headBump.gain.value = 0;

        // Pre-Emphasis - Boost highs before saturation (cassette recording EQ)
        this.preEmphasis = this.ctx.createBiquadFilter();
        this.preEmphasis.type = 'highshelf';
        this.preEmphasis.frequency.value = 3000;
        this.preEmphasis.gain.value = 0;

        // Saturation - Waveshaper with tanh curve for soft clipping
        this.saturation = this.ctx.createWaveShaper();
        this.saturation.oversample = '2x';
        this.saturationAmount = 0;
        this.updateSaturationCurve(0);

        // De-Emphasis - Cut highs after saturation (cassette playback EQ)
        this.deEmphasis = this.ctx.createBiquadFilter();
        this.deEmphasis.type = 'highshelf';
        this.deEmphasis.frequency.value = 3000;
        this.deEmphasis.gain.value = 0;

        // HF Rolloff - Limited cassette bandwidth (age control)
        this.hfRolloff = this.ctx.createBiquadFilter();
        this.hfRolloff.type = 'lowpass';
        this.hfRolloff.frequency.value = 18000;
        this.hfRolloff.Q.value = 0.7;

        // Wow - Slow pitch/time variation (0.5-2Hz)
        // Using modulated delay for pitch variation
        this.wowDelay = this.ctx.createDelay(0.1);
        this.wowDelay.delayTime.value = 0.025; // 25ms base delay

        this.wowLFO = this.ctx.createOscillator();
        this.wowLFO.type = 'sine';
        this.wowLFO.frequency.value = 1.0; // 1Hz default

        this.wowDepth = this.ctx.createGain();
        this.wowDepth.gain.value = 0; // No wow by default

        // Flutter - Fast pitch variation (4-15Hz)
        this.flutterDelay = this.ctx.createDelay(0.05);
        this.flutterDelay.delayTime.value = 0.015; // 15ms base delay

        this.flutterLFO = this.ctx.createOscillator();
        this.flutterLFO.type = 'triangle';
        this.flutterLFO.frequency.value = 8.0; // 8Hz default

        this.flutterDepth = this.ctx.createGain();
        this.flutterDepth.gain.value = 0; // No flutter by default

        // Dropout Gate - Random brief signal losses
        this.dropoutGain = this.ctx.createGain();
        this.dropoutGain.gain.value = 1.0;

        // Hiss Generator - Tape noise floor
        this.hissGain = this.ctx.createGain();
        this.hissGain.gain.value = 0; // No hiss by default

        // Bandpass filter for hiss character (~5kHz center, cassette-like)
        this.hissFilter = this.ctx.createBiquadFilter();
        this.hissFilter.type = 'bandpass';
        this.hissFilter.frequency.value = 5000;
        this.hissFilter.Q.value = 0.5;

        // Create noise source buffer
        this.createHissBuffer();

        // Start LFOs
        this.wowLFO.start();
        this.flutterLFO.start();
    }

    createHissBuffer() {
        // Create 2-second noise buffer
        const bufferSize = this.ctx.sampleRate * 2;
        this.hissBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = this.hissBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    startHissSource() {
        if (this.hissSource) {
            try {
                this.hissSource.stop();
            } catch (e) {
                // Ignore if already stopped
            }
        }

        this.hissSource = this.ctx.createBufferSource();
        this.hissSource.buffer = this.hissBuffer;
        this.hissSource.loop = true;
        this.hissSource.connect(this.hissFilter);
        this.hissSource.start();
    }

    connectNodes() {
        // Main signal chain:
        // input -> headBump -> preEmphasis -> saturation -> deEmphasis
        //       -> hfRolloff -> wowDelay -> flutterDelay -> dropoutGain -> wetGain -> output

        this.input.connect(this.headBump);
        this.headBump.connect(this.preEmphasis);
        this.preEmphasis.connect(this.saturation);
        this.saturation.connect(this.deEmphasis);
        this.deEmphasis.connect(this.hfRolloff);
        this.hfRolloff.connect(this.wowDelay);
        this.wowDelay.connect(this.flutterDelay);
        this.flutterDelay.connect(this.dropoutGain);
        this.dropoutGain.connect(this.wetGain);
        this.wetGain.connect(this.output);

        // Bypass path
        this.input.connect(this.bypassGain);
        this.bypassGain.connect(this.output);

        // LFO modulation connections
        this.wowLFO.connect(this.wowDepth);
        this.wowDepth.connect(this.wowDelay.delayTime);

        this.flutterLFO.connect(this.flutterDepth);
        this.flutterDepth.connect(this.flutterDelay.delayTime);

        // Hiss chain (additive)
        this.hissFilter.connect(this.hissGain);
        this.hissGain.connect(this.wetGain);

        // Start hiss source
        this.startHissSource();
    }

    initDefaults() {
        // All effects at 0 = pristine new tape (transparent)
        this.wetGain.gain.value = 1.0;
        this.bypassGain.gain.value = 0;
        this.bypassed = false;
    }

    // Generate tanh saturation curve with variable drive
    updateSaturationCurve(amount) {
        const samples = 8192;
        const curve = new Float32Array(samples);

        // amount: 0-1, where 0 = clean, 1 = heavy saturation
        const drive = 1 + amount * 10; // 1x to 11x drive

        for (let i = 0; i < samples; i++) {
            const x = (i * 2 / samples) - 1; // -1 to 1
            if (amount === 0) {
                curve[i] = x; // Linear (no saturation)
            } else {
                // Soft clipping with tanh
                curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
            }
        }

        this.saturation.curve = curve;
    }

    // === Public Control Methods ===

    // Saturation: 0-100 -> warm soft clipping
    setSaturation(value) {
        const normalized = value / 100;
        this.saturationAmount = normalized;

        // Update waveshaper curve
        this.updateSaturationCurve(normalized);

        // Pre-emphasis increases with saturation (frequency-dependent saturation)
        // +0dB at 0%, +6dB at 100%
        this.preEmphasis.gain.value = normalized * 6;

        // De-emphasis compensates
        this.deEmphasis.gain.value = -normalized * 6;
    }

    // Wow: 0-100 -> slow pitch variation (0-40 cents)
    setWow(value) {
        const normalized = value / 100;

        // LFO rate: 0.5Hz at 100% (slower = more noticeable)
        // At low settings, faster but subtle
        this.wowLFO.frequency.value = 2.0 - (normalized * 1.5); // 2Hz -> 0.5Hz

        // Depth: 0ms to ~3ms variation = ~40 cents pitch
        // 3ms at 44.1kHz ≈ 40 cents
        this.wowDepth.gain.value = normalized * 0.003;
    }

    // Flutter: 0-100 -> fast pitch variation (0-25 cents)
    setFlutter(value) {
        const normalized = value / 100;

        // LFO rate: varies between 4-12Hz for realism
        this.flutterLFO.frequency.value = 4 + (normalized * 8); // 4Hz -> 12Hz

        // Depth: 0ms to ~1.5ms variation = ~25 cents pitch
        this.flutterDepth.gain.value = normalized * 0.0015;
    }

    // Dropouts: 0-100 -> random signal loss frequency
    setDropouts(value) {
        this.dropoutIntensity = value / 100;

        // Clear existing scheduler
        if (this.dropoutSchedulerId) {
            clearTimeout(this.dropoutSchedulerId);
            this.dropoutSchedulerId = null;
        }

        if (this.dropoutIntensity > 0) {
            this.scheduleDropout();
        }
    }

    scheduleDropout() {
        if (this.dropoutIntensity <= 0 || this.bypassed) return;

        // Interval: 15000ms at low intensity, 3000ms at high
        const baseInterval = 15000 - (this.dropoutIntensity * 12000);
        const interval = baseInterval + Math.random() * 5000;

        this.dropoutSchedulerId = setTimeout(() => {
            this.triggerDropout();
            this.scheduleDropout();
        }, interval);
    }

    triggerDropout() {
        if (this.bypassed) return;

        const now = this.ctx.currentTime;

        // Dropout duration: 10-80ms based on intensity
        const duration = 0.01 + (Math.random() * 0.07 * this.dropoutIntensity);

        // Dropout depth: partial to full signal loss
        const depth = 0.1 + (Math.random() * 0.6 * this.dropoutIntensity);

        // Quick fade down
        this.dropoutGain.gain.setValueAtTime(1.0, now);
        this.dropoutGain.gain.linearRampToValueAtTime(1 - depth, now + 0.002);

        // Hold
        this.dropoutGain.gain.setValueAtTime(1 - depth, now + duration - 0.002);

        // Quick fade back up
        this.dropoutGain.gain.linearRampToValueAtTime(1.0, now + duration);
    }

    // Hiss: 0-100 -> tape noise floor (-70dB to -40dB)
    setHiss(value) {
        const normalized = value / 100;

        // -70dB at 0%, -40dB at 100%
        // dB to linear: 10^(dB/20)
        const minDb = -70;
        const maxDb = -40;
        const db = minDb + (normalized * (maxDb - minDb));

        if (normalized === 0) {
            this.hissGain.gain.value = 0;
        } else {
            this.hissGain.gain.value = Math.pow(10, db / 20);
        }
    }

    // Age: 0-100 -> combined HF rolloff + head bump + hiss boost
    setAge(value) {
        const normalized = value / 100;

        // HF Rolloff: 18kHz at 0% -> 4kHz at 100%
        const hfFreq = 18000 - (normalized * 14000); // 18kHz -> 4kHz
        this.hfRolloff.frequency.value = hfFreq;

        // Head Bump: 0dB at 0% -> +6dB at 100%
        this.headBump.gain.value = normalized * 6;

        // Also slightly shift head bump frequency lower with age
        this.headBump.frequency.value = 80 - (normalized * 20); // 80Hz -> 60Hz
    }

    // Bypass: toggle between wet and dry
    setBypass(bypassed) {
        this.bypassed = bypassed;

        const now = this.ctx.currentTime;
        const fadeTime = 0.02; // 20ms crossfade

        if (bypassed) {
            this.wetGain.gain.linearRampToValueAtTime(0, now + fadeTime);
            this.bypassGain.gain.linearRampToValueAtTime(1, now + fadeTime);

            // Stop dropout scheduling
            if (this.dropoutSchedulerId) {
                clearTimeout(this.dropoutSchedulerId);
                this.dropoutSchedulerId = null;
            }
        } else {
            this.wetGain.gain.linearRampToValueAtTime(1, now + fadeTime);
            this.bypassGain.gain.linearRampToValueAtTime(0, now + fadeTime);

            // Resume dropout scheduling if intensity > 0
            if (this.dropoutIntensity > 0) {
                this.scheduleDropout();
            }
        }
    }

    // Get input node for connecting signal
    getInput() {
        return this.input;
    }

    // Get output node for connecting to next stage
    getOutput() {
        return this.output;
    }

    // Cleanup
    dispose() {
        if (this.dropoutSchedulerId) {
            clearTimeout(this.dropoutSchedulerId);
        }

        try {
            this.wowLFO.stop();
            this.flutterLFO.stop();
            if (this.hissSource) {
                this.hissSource.stop();
            }
        } catch (e) {
            // Ignore errors from already stopped sources
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CassetteTapeBus;
}
