// Web Worker for generating large reverb impulse responses
// Runs in background thread to prevent UI freezing

self.onmessage = function(e) {
    const { decay, length, sampleRate } = e.data;

    // Generate the impulse response
    const lengthSamples = Math.floor(sampleRate * length);
    const leftChannel = new Float32Array(lengthSamples);
    const rightChannel = new Float32Array(lengthSamples);

    // Pre-compute decay constant
    const decayRate = 1 / (sampleRate * decay);
    const decayMultiplier = Math.exp(-decayRate);

    // Early reflections pattern
    const earlyReflections = [];
    const numEarlyReflections = 12;
    for (let i = 0; i < numEarlyReflections; i++) {
        earlyReflections.push({
            sampleStart: Math.floor((0.02 + i * 0.04) * sampleRate),
            sampleEnd: Math.floor((0.025 + i * 0.04) * sampleRate),
            amplitude: 0.5 * Math.exp(-i * 0.25),
            panL: (1 - (Math.random() * 1.6 - 0.8)) / 2,
            panR: (1 + (Math.random() * 1.6 - 0.8)) / 2
        });
    }

    // Generate left channel
    let envelope = 1.0;
    for (let i = 0; i < lengthSamples; i++) {
        let sample = 0;

        // Early reflections
        for (let r = 0; r < numEarlyReflections; r++) {
            const ref = earlyReflections[r];
            if (i >= ref.sampleStart && i < ref.sampleEnd) {
                sample += (Math.random() * 2 - 1) * ref.amplitude * ref.panL * 0.5;
            }
        }

        // Diffuse tail
        sample += (Math.random() * 2 - 1) * envelope * 0.9;
        leftChannel[i] = sample * 0.4;
        envelope *= decayMultiplier;
    }

    // Generate right channel
    envelope = 1.0;
    for (let i = 0; i < lengthSamples; i++) {
        let sample = 0;

        // Early reflections
        for (let r = 0; r < numEarlyReflections; r++) {
            const ref = earlyReflections[r];
            if (i >= ref.sampleStart && i < ref.sampleEnd) {
                sample += (Math.random() * 2 - 1) * ref.amplitude * ref.panR * 0.5;
            }
        }

        // Diffuse tail with slight stereo difference
        sample += (Math.random() * 2 - 1) * envelope * 1.1;
        rightChannel[i] = sample * 0.4;
        envelope *= decayMultiplier;
    }

    // Transfer buffers back (transferable for performance)
    self.postMessage({
        leftChannel,
        rightChannel,
        length,
        decay
    }, [leftChannel.buffer, rightChannel.buffer]);
};
