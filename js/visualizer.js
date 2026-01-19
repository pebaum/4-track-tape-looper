// Visualizer Module
// Handles waveform displays and VU meters

class Visualizer {
    constructor() {
        this.waveformCanvases = [];
        this.waveformContexts = [];
        this.vuCanvases = { left: null, right: null };
        this.vuContexts = { left: null, right: null };
        this.animationFrameId = null;
    }

    // Initialize waveform canvases
    initWaveforms() {
        for (let i = 0; i < 4; i++) {
            const canvas = document.getElementById(`waveform${i}`);
            const ctx = canvas.getContext('2d');
            this.waveformCanvases[i] = canvas;
            this.waveformContexts[i] = ctx;

            // Initial clear
            this.clearWaveform(i);
        }
    }

    // Initialize VU meter canvases
    initVUMeters() {
        this.vuCanvases.left = document.getElementById('vuLeft');
        this.vuCanvases.right = document.getElementById('vuRight');
        this.vuContexts.left = this.vuCanvases.left.getContext('2d');
        this.vuContexts.right = this.vuCanvases.right.getContext('2d');

        this.clearVUMeters();
    }

    // Draw waveform from audio buffer
    drawWaveform(trackNumber, audioBuffer, currentTime = 0, isPlaying = false) {
        if (!audioBuffer) {
            this.clearWaveform(trackNumber);
            return;
        }

        const canvas = this.waveformCanvases[trackNumber];
        const ctx = this.waveformContexts[trackNumber];
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Get audio data
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        // Draw waveform
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < width; i++) {
            const min = Math.min(...Array.from({ length: step }, (_, j) => data[i * step + j] || 0));
            const max = Math.max(...Array.from({ length: step }, (_, j) => data[i * step + j] || 0));

            if (i === 0) {
                ctx.moveTo(i, amp + min * amp);
            }
            ctx.lineTo(i, amp + min * amp);
            ctx.lineTo(i, amp + max * amp);
        }

        ctx.stroke();

        // Draw playhead if playing
        if (isPlaying && currentTime > 0) {
            const progress = currentTime / audioBuffer.duration;
            const x = progress * width;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Draw loop marker if in loop mode
        if (audioBuffer.duration > 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // Draw loop region on waveform
    drawLoopRegion(trackNumber, audioBuffer, loopLength) {
        if (!audioBuffer) return;

        const canvas = this.waveformCanvases[trackNumber];
        const ctx = this.waveformContexts[trackNumber];
        const width = canvas.width;
        const height = canvas.height;

        const loopEnd = Math.min(loopLength, audioBuffer.duration);
        const loopEndX = (loopEnd / audioBuffer.duration) * width;

        // Draw loop region highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(0, 0, loopEndX, height);

        // Draw loop end marker
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(loopEndX, 0);
        ctx.lineTo(loopEndX, height);
        ctx.stroke();
    }

    // Clear waveform
    clearWaveform(trackNumber) {
        const canvas = this.waveformCanvases[trackNumber];
        const ctx = this.waveformContexts[trackNumber];

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }

    // Draw VU meters
    drawVUMeter(channel, level) {
        const canvas = this.vuCanvases[channel];
        const ctx = this.vuContexts[channel];
        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);

        // Clamp level between 0 and 1
        level = Math.max(0, Math.min(1, level));

        // Draw meter bar
        const barWidth = width * level;

        // Color gradient based on level
        if (level > 0.9) {
            ctx.fillStyle = 'rgba(255, 68, 68, 0.8)'; // Red for clipping
        } else if (level > 0.7) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; // Bright white
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Dim white
        }

        ctx.fillRect(0, 0, barWidth, height);

        // Draw tick marks
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0.25; i <= 1; i += 0.25) {
            const x = width * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    // Clear VU meters
    clearVUMeters() {
        this.drawVUMeter('left', 0);
        this.drawVUMeter('right', 0);
    }

    // Update VU meters with analyzer data
    updateVUMeters(analyser) {
        if (!analyser) {
            this.clearVUMeters();
            return;
        }

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);

        // Calculate RMS for both channels (simplified - treating as mono)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Convert to dB-like scale
        const level = Math.min(1, rms * 3);

        // Draw both meters (simplified - same level for both)
        this.drawVUMeter('left', level);
        this.drawVUMeter('right', level);
    }

    // Start animation loop for VU meters
    startVUAnimation(analyser) {
        const animate = () => {
            this.updateVUMeters(analyser);
            this.animationFrameId = requestAnimationFrame(animate);
        };
        animate();
    }

    // Stop animation loop
    stopVUAnimation() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.clearVUMeters();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Visualizer;
}
