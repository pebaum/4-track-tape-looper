// Tape Effects Module
// Provides authentic tape recorder effects: saturation, compression, age, wow/flutter

class TapeEffects {
    constructor(audioContext) {
        this.ctx = audioContext;
    }

    // Create tape saturation (warm distortion)
    createSaturation(amount = 0.2) {
        const saturation = this.ctx.createWaveShaper();
        saturation.curve = this.generateSaturationCurve(amount);
        saturation.oversample = '4x';
        return saturation;
    }

    // Generate saturation curve using tanh
    generateSaturationCurve(amount) {
        const samples = 65536;
        const curve = new Float32Array(samples);
        const intensity = 1 + (amount * 4); // 0-100% maps to 1-5x drive

        for (let i = 0; i < samples; i++) {
            const x = (i * 2 / samples) - 1;
            curve[i] = Math.tanh(x * intensity) * 0.9;
        }

        return curve;
    }

    // Update saturation curve dynamically
    updateSaturation(saturator, amount) {
        saturator.curve = this.generateSaturationCurve(amount);
    }

    // Create tape compression
    createCompression(amount = 0.3) {
        const compressor = this.ctx.createDynamicsCompressor();

        // Musical compression settings that scale with amount
        const ratio = 1 + (amount * 11); // 1:1 to 12:1
        const threshold = -40 + (amount * 20); // -40dB to -20dB
        const knee = 6 + (amount * 24); // 6dB to 30dB

        compressor.threshold.value = threshold;
        compressor.knee.value = knee;
        compressor.ratio.value = ratio;
        compressor.attack.value = 0.005;
        compressor.release.value = 0.15;

        return compressor;
    }

    // Update compression settings
    updateCompression(compressor, amount) {
        const ratio = 1 + (amount * 11);
        const threshold = -40 + (amount * 20);
        const knee = 6 + (amount * 24);

        compressor.threshold.value = threshold;
        compressor.knee.value = knee;
        compressor.ratio.value = ratio;
    }

    // Create tape age effect (high-frequency rolloff + subtle noise)
    createAgeFilter(amount = 0.4) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';

        // Frequency range: 15kHz (pristine) to 3kHz (very aged)
        const frequency = 15000 - (amount * 12000);
        filter.frequency.value = Math.max(frequency, 2000);
        filter.Q.value = 0.7;

        return filter;
    }

    // Update age filter
    updateAgeFilter(filter, amount) {
        const frequency = 15000 - (amount * 12000);
        filter.frequency.value = Math.max(frequency, 2000);
    }

    // Create wow and flutter effect (pitch variation)
    createWowFlutter(amount = 0.3) {
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();

        // Wow: slow pitch variation (0.3Hz)
        lfo.frequency.value = 0.3 + (Math.random() * 0.2);
        lfo.type = 'sine';

        // Flutter amount in cents (0-15 cents variation)
        lfoGain.gain.value = amount * 15;

        lfo.connect(lfoGain);
        lfo.start();

        return { lfo, lfoGain };
    }

    // Create tape hiss noise (subtle background noise)
    createTapeHiss(amount = 0.02) {
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(2, bufferSize, this.ctx.sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const output = noiseBuffer.getChannelData(channel);
            for (let i = 0; i < bufferSize; i++) {
                // Pink-ish noise for more natural tape hiss
                output[i] = (Math.random() * 2 - 1) * amount * 0.03;
            }
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        // Filter the noise to be more realistic
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.value = 4000;
        noiseFilter.Q.value = 0.5;

        noise.connect(noiseFilter);

        return { noise, noiseFilter };
    }

    // Create a complete tape effects chain
    createTapeChain(settings = {}) {
        const {
            saturationAmount = 0.2,
            compressionAmount = 0.3,
            ageAmount = 0.4,
            wowFlutterAmount = 0.3
        } = settings;

        const chain = {
            saturation: this.createSaturation(saturationAmount),
            compression: this.createCompression(compressionAmount),
            ageFilter: this.createAgeFilter(ageAmount),
            wowFlutter: this.createWowFlutter(wowFlutterAmount),
            input: this.ctx.createGain(),
            output: this.ctx.createGain()
        };

        // Connect chain: input → saturation → compression → age filter → output
        chain.input.connect(chain.saturation);
        chain.saturation.connect(chain.compression);
        chain.compression.connect(chain.ageFilter);
        chain.ageFilter.connect(chain.output);

        return chain;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TapeEffects;
}
