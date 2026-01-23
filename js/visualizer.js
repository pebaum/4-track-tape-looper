// Visualizer Module - Optimized for Performance
// Handles VU meters with throttled 30fps updates

class Visualizer {
    constructor(analyser, audioContext) {
        this.analyser = analyser;
        this.ctx = audioContext;

        // VU meter elements
        this.vuCanvasLeft = null;
        this.vuCanvasRight = null;
        this.vuCtxLeft = null;
        this.vuCtxRight = null;

        // Animation state
        this.animationFrameId = null;
        this.lastFrameTime = 0;
        this.targetFPS = 30;
        this.frameInterval = 1000 / this.targetFPS;

        // Cached data array for performance
        this.dataArray = null;

        // Peak hold state
        this.peakLeft = 0;
        this.peakRight = 0;
        this.peakDecay = 0.95;

        // Colors (Bauhaus grayscale)
        this.colors = {
            background: '#0D0D0D',
            meter: '#F5F5F5',
            meterDim: 'rgba(245, 245, 245, 0.4)',
            peak: '#A3A3A3',
            clip: '#D32F2F',
            border: '#404040'
        };

        this.init();
    }

    init() {
        // Get VU meter canvases
        this.vuCanvasLeft = document.getElementById('vu-left');
        this.vuCanvasRight = document.getElementById('vu-right');

        if (this.vuCanvasLeft && this.vuCanvasRight) {
            this.vuCtxLeft = this.vuCanvasLeft.getContext('2d');
            this.vuCtxRight = this.vuCanvasRight.getContext('2d');
        }

        // Configure analyser for performance (smaller FFT)
        if (this.analyser) {
            this.analyser.fftSize = 256; // Smaller for performance
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }

        // Initial clear
        this.clearVUMeters();
    }

    start() {
        if (!this.analyser) return;
        this.animate();
    }

    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.clearVUMeters();
    }

    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        // Throttle to target FPS
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;

        if (elapsed < this.frameInterval) return;

        this.lastFrameTime = now - (elapsed % this.frameInterval);
        this.updateVUMeters();
    }

    updateVUMeters() {
        if (!this.analyser || !this.dataArray) return;

        // Get time domain data
        this.analyser.getByteTimeDomainData(this.dataArray);

        // Calculate RMS level (simplified stereo simulation)
        let sumLeft = 0;
        let sumRight = 0;
        const halfLength = this.dataArray.length / 2;

        for (let i = 0; i < halfLength; i++) {
            const normalizedLeft = (this.dataArray[i] - 128) / 128;
            const normalizedRight = (this.dataArray[i + halfLength] - 128) / 128;
            sumLeft += normalizedLeft * normalizedLeft;
            sumRight += normalizedRight * normalizedRight;
        }

        const rmsLeft = Math.sqrt(sumLeft / halfLength);
        const rmsRight = Math.sqrt(sumRight / halfLength);

        // Scale to 0-1 range with some amplification
        const levelLeft = Math.min(1, rmsLeft * 3);
        const levelRight = Math.min(1, rmsRight * 3);

        // Update peak hold
        if (levelLeft > this.peakLeft) {
            this.peakLeft = levelLeft;
        } else {
            this.peakLeft *= this.peakDecay;
        }

        if (levelRight > this.peakRight) {
            this.peakRight = levelRight;
        } else {
            this.peakRight *= this.peakDecay;
        }

        // Draw meters
        this.drawVUMeter(this.vuCtxLeft, this.vuCanvasLeft, levelLeft, this.peakLeft);
        this.drawVUMeter(this.vuCtxRight, this.vuCanvasRight, levelRight, this.peakRight);
    }

    drawVUMeter(ctx, canvas, level, peak) {
        if (!ctx || !canvas) return;

        const width = canvas.width;
        const height = canvas.height;

        // Clear with background color
        ctx.fillStyle = this.colors.background;
        ctx.fillRect(0, 0, width, height);

        // Clamp values
        level = Math.max(0, Math.min(1, level));
        peak = Math.max(0, Math.min(1, peak));

        // Calculate meter height (bottom to top)
        const meterHeight = height * level;
        const peakY = height - (height * peak);

        // Draw meter bar
        if (level > 0.9) {
            // Clipping - use accent color
            ctx.fillStyle = this.colors.clip;
        } else if (level > 0.6) {
            // High level - bright
            ctx.fillStyle = this.colors.meter;
        } else {
            // Normal level - dimmer
            ctx.fillStyle = this.colors.meterDim;
        }

        ctx.fillRect(0, height - meterHeight, width, meterHeight);

        // Draw peak indicator
        if (peak > 0.01) {
            ctx.fillStyle = this.colors.peak;
            ctx.fillRect(0, peakY, width, 2);
        }

        // Draw level markers
        ctx.strokeStyle = this.colors.border;
        ctx.lineWidth = 1;

        // -6dB mark (75%)
        const mark6db = height * 0.25;
        ctx.beginPath();
        ctx.moveTo(0, mark6db);
        ctx.lineTo(width * 0.3, mark6db);
        ctx.stroke();

        // -12dB mark (50%)
        const mark12db = height * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, mark12db);
        ctx.lineTo(width * 0.3, mark12db);
        ctx.stroke();

        // -24dB mark (25%)
        const mark24db = height * 0.75;
        ctx.beginPath();
        ctx.moveTo(0, mark24db);
        ctx.lineTo(width * 0.3, mark24db);
        ctx.stroke();
    }

    clearVUMeters() {
        if (this.vuCtxLeft && this.vuCanvasLeft) {
            this.vuCtxLeft.fillStyle = this.colors.background;
            this.vuCtxLeft.fillRect(0, 0, this.vuCanvasLeft.width, this.vuCanvasLeft.height);
        }

        if (this.vuCtxRight && this.vuCanvasRight) {
            this.vuCtxRight.fillStyle = this.colors.background;
            this.vuCtxRight.fillRect(0, 0, this.vuCanvasRight.width, this.vuCanvasRight.height);
        }

        this.peakLeft = 0;
        this.peakRight = 0;
    }

    // Legacy method compatibility
    initVUMeters() {
        // Already initialized in constructor
    }

    startVUAnimation(analyser) {
        if (analyser) {
            this.analyser = analyser;
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.8;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
        this.start();
    }

    stopVUAnimation() {
        this.stop();
    }

    // Unused waveform methods removed for cleanup
    clearWaveform() {
        // No-op for compatibility
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Visualizer;
}
