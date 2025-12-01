// Utility functions for coordinate transforms and helpers

// Isometric projection constants
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

// Convert world coordinates to isometric screen coordinates
export function toIsometric(x, y) {
    return {
        screenX: (x - y) * TILE_WIDTH / 2,
        screenY: (x + y) * TILE_HEIGHT / 2
    };
}

// Convert screen coordinates back to world coordinates
export function fromIsometric(screenX, screenY) {
    return {
        x: (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 2)) / 2,
        y: (screenY / (TILE_HEIGHT / 2) - screenX / (TILE_WIDTH / 2)) / 2
    };
}

// Linear interpolation
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Clamp value between min and max
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Calculate distance between two points
export function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// Normalize angle to 0-2PI range
export function normalizeAngle(angle) {
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
}

// Get angle between two points
export function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

// Speed to color gradient (green -> yellow -> red)
export function speedToColor(speed, maxSpeed) {
    const ratio = clamp(speed / maxSpeed, 0, 1);
    
    if (ratio > 0.6) {
        // Green to cyan (fast)
        const t = (ratio - 0.6) / 0.4;
        return `rgb(${Math.round(lerp(0, 100, 1 - t))}, ${Math.round(lerp(200, 255, t))}, ${Math.round(lerp(150, 220, t))})`;
    } else if (ratio > 0.3) {
        // Yellow to green (medium)
        const t = (ratio - 0.3) / 0.3;
        return `rgb(${Math.round(lerp(255, 0, t))}, ${Math.round(lerp(200, 200, t))}, ${Math.round(lerp(50, 150, t))})`;
    } else {
        // Red to yellow (slow)
        const t = ratio / 0.3;
        return `rgb(255, ${Math.round(lerp(80, 200, t))}, ${Math.round(lerp(80, 50, t))})`;
    }
}

// Generate unique ID
let idCounter = 0;
export function generateId() {
    return ++idCounter;
}

// Random number in range
export function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

// Ease in-out function
export function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

