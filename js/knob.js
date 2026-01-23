// Knob Class - Ableton-style vertical drag interaction
// Handles all knob controls with vertical drag, shift for fine control, double-click reset

class Knob {
    constructor(element, options = {}) {
        this.element = element;
        this.container = element.parentElement;

        // Configuration
        this.min = parseFloat(element.min) || 0;
        this.max = parseFloat(element.max) || 100;
        this.defaultValue = options.defaultValue ?? parseFloat(element.value);
        this.sensitivity = options.sensitivity || 100; // pixels for full range
        this.fineSensitivity = 10; // 10x more precise with shift
        this.isBipolar = options.bipolar || false;
        this.centerValue = options.centerValue ?? (this.min + this.max) / 2;
        this.onChange = options.onChange || null;

        // State
        this.isDragging = false;
        this.startY = 0;
        this.startValue = 0;

        // Bind methods
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.handleWheel = this.handleWheel.bind(this);

        this.init();
    }

    init() {
        // Remove default input behavior
        this.element.style.cursor = 'grab';

        // Add event listeners
        this.container.addEventListener('mousedown', this.handleMouseDown);
        this.container.addEventListener('dblclick', this.handleDoubleClick);
        this.container.addEventListener('wheel', this.handleWheel, { passive: false });

        // Touch support
        this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.container.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // Initial visual update
        this.updateVisual();

        // Mark bipolar knobs
        if (this.isBipolar) {
            this.container.classList.add('bipolar');
        }
    }

    handleMouseDown(e) {
        if (e.button !== 0) return; // Only left mouse button

        e.preventDefault();
        this.isDragging = true;
        this.startY = e.clientY;
        this.startValue = parseFloat(this.element.value);

        this.element.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const deltaY = this.startY - e.clientY; // Inverted: drag up = increase
        const sensitivity = e.shiftKey ? this.sensitivity * this.fineSensitivity : this.sensitivity;
        const range = this.max - this.min;
        const deltaValue = (deltaY / sensitivity) * range;

        let newValue = this.startValue + deltaValue;
        newValue = Math.max(this.min, Math.min(this.max, newValue));

        this.setValue(newValue);
    }

    handleMouseUp() {
        this.isDragging = false;
        this.element.style.cursor = 'grab';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleDoubleClick(e) {
        e.preventDefault();
        e.stopPropagation();
        this.setValue(this.defaultValue);
    }

    handleWheel(e) {
        e.preventDefault();

        const sensitivity = e.shiftKey ? 0.1 : 1;
        const range = this.max - this.min;
        const step = (range / 100) * sensitivity;

        let newValue = parseFloat(this.element.value);
        newValue += e.deltaY < 0 ? step : -step;
        newValue = Math.max(this.min, Math.min(this.max, newValue));

        this.setValue(newValue);
    }

    // Touch support
    handleTouchStart(e) {
        if (e.touches.length !== 1) return;

        e.preventDefault();
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startValue = parseFloat(this.element.value);
    }

    handleTouchMove(e) {
        if (!this.isDragging || e.touches.length !== 1) return;

        e.preventDefault();
        const deltaY = this.startY - e.touches[0].clientY;
        const range = this.max - this.min;
        const deltaValue = (deltaY / this.sensitivity) * range;

        let newValue = this.startValue + deltaValue;
        newValue = Math.max(this.min, Math.min(this.max, newValue));

        this.setValue(newValue);
    }

    handleTouchEnd() {
        this.isDragging = false;
    }

    setValue(value) {
        const oldValue = parseFloat(this.element.value);
        this.element.value = value;

        if (oldValue !== value) {
            this.element.dispatchEvent(new Event('input', { bubbles: true }));
            this.updateVisual();

            if (this.onChange) {
                this.onChange(value);
            }
        }
    }

    getValue() {
        return parseFloat(this.element.value);
    }

    updateVisual() {
        const value = parseFloat(this.element.value);
        const percent = (value - this.min) / (this.max - this.min);

        // Convert to rotation angle (-135deg to +135deg, 270 degree range)
        const angle = -135 + (percent * 270);
        this.container.style.setProperty('--knob-rotation', `${angle}deg`);

        // Update bipolar direction indicator
        if (this.isBipolar) {
            const isReverse = value < this.centerValue;
            this.container.setAttribute('data-direction', isReverse ? 'reverse' : 'forward');
        }
    }

    // Reset to default value
    reset() {
        this.setValue(this.defaultValue);
    }

    // Destroy and clean up
    destroy() {
        this.container.removeEventListener('mousedown', this.handleMouseDown);
        this.container.removeEventListener('dblclick', this.handleDoubleClick);
        this.container.removeEventListener('wheel', this.handleWheel);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
}

// KnobManager - Handles all knobs with event delegation for performance
class KnobManager {
    constructor() {
        this.knobs = new Map();
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Initialize all knobs
        document.querySelectorAll('.knob-container input[type="range"]').forEach(input => {
            this.registerKnob(input);
        });

        this.initialized = true;
    }

    registerKnob(element, options = {}) {
        // Determine if this is a bipolar speed knob
        const isBipolar = element.classList.contains('speed');
        const defaultOptions = {
            bipolar: isBipolar,
            centerValue: isBipolar ? 0 : undefined,
            defaultValue: isBipolar ? 0 : undefined
        };

        const knob = new Knob(element, { ...defaultOptions, ...options });
        this.knobs.set(element, knob);
        return knob;
    }

    getKnob(element) {
        return this.knobs.get(element);
    }

    destroyAll() {
        this.knobs.forEach(knob => knob.destroy());
        this.knobs.clear();
        this.initialized = false;
    }
}

// Global knob manager instance
const knobManager = new KnobManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Knob, KnobManager, knobManager };
}
