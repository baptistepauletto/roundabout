// Main entry point - orchestrates simulations

import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';

class TrafficSimulator {
    constructor() {
        this.roundaboutCanvas = document.getElementById('roundabout-canvas');
        this.trafficLightCanvas = document.getElementById('traffic-light-canvas');
        
        this.setupCanvases();
        
        // Create simulations
        this.roundaboutSim = new Simulation('roundabout');
        this.trafficLightSim = new Simulation('traffic-light');
        
        // Create renderers
        this.roundaboutRenderer = new Renderer(this.roundaboutCanvas);
        this.trafficLightRenderer = new Renderer(this.trafficLightCanvas);
        
        // Bind controls
        this.setupControls();
        
        // Start animation loop
        this.animate();
    }
    
    setupCanvases() {
        const resizeCanvas = () => {
            const container = document.querySelector('.simulation-container');
            const width = container.clientWidth / 2 - 20;
            const height = container.clientHeight - 40;
            
            this.roundaboutCanvas.width = width;
            this.roundaboutCanvas.height = height;
            this.trafficLightCanvas.width = width;
            this.trafficLightCanvas.height = height;
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupControls() {
        // Speed slider
        const speedSlider = document.getElementById('speed-slider');
        const speedValue = document.getElementById('speed-value');
        speedSlider.addEventListener('input', (e) => {
            const speed = parseFloat(e.target.value);
            speedValue.textContent = speed.toFixed(1) + 'x';
            this.roundaboutSim.setSimulationSpeed(speed);
            this.trafficLightSim.setSimulationSpeed(speed);
        });
        
        // Spawn rate slider
        const spawnSlider = document.getElementById('spawn-slider');
        const spawnValue = document.getElementById('spawn-value');
        spawnSlider.addEventListener('input', (e) => {
            const rate = parseFloat(e.target.value);
            spawnValue.textContent = rate.toFixed(1) + '/s';
            this.roundaboutSim.setSpawnRate(rate);
            this.trafficLightSim.setSpawnRate(rate);
        });
        
        // Traffic light timing slider
        const lightSlider = document.getElementById('light-slider');
        const lightValue = document.getElementById('light-value');
        lightSlider.addEventListener('input', (e) => {
            const duration = parseInt(e.target.value);
            lightValue.textContent = (duration / 1000).toFixed(1) + 's';
            this.trafficLightSim.setGreenDuration(duration);
        });
        
        // Play/Pause button
        const playPauseBtn = document.getElementById('play-pause-btn');
        playPauseBtn.addEventListener('click', () => {
            const isPaused = !this.roundaboutSim.paused;
            this.roundaboutSim.setPaused(isPaused);
            this.trafficLightSim.setPaused(isPaused);
            playPauseBtn.textContent = isPaused ? '▶ Play' : '⏸ Pause';
            playPauseBtn.classList.toggle('paused', isPaused);
        });
        
        // Reset button
        const resetBtn = document.getElementById('reset-btn');
        resetBtn.addEventListener('click', () => {
            this.roundaboutSim.reset();
            this.trafficLightSim.reset();
        });
    }
    
    animate() {
        // Update simulations
        this.roundaboutSim.update();
        this.trafficLightSim.update();
        
        // Render roundabout
        this.roundaboutRenderer.clear();
        this.roundaboutRenderer.drawTitle('ROUNDABOUT');
        this.roundaboutRenderer.drawRoundabout(this.roundaboutSim.intersection);
        this.roundaboutRenderer.drawVehicles(this.roundaboutSim.vehicles);
        this.roundaboutRenderer.drawStats(this.roundaboutSim.stats, 10, this.roundaboutCanvas.height - 90);
        
        // Render traffic light
        this.trafficLightRenderer.clear();
        this.trafficLightRenderer.drawTitle('TRAFFIC LIGHTS');
        this.trafficLightRenderer.drawTrafficLightIntersection(this.trafficLightSim.intersection);
        this.trafficLightRenderer.drawVehicles(this.trafficLightSim.vehicles);
        this.trafficLightRenderer.drawStats(this.trafficLightSim.stats, 10, this.trafficLightCanvas.height - 90);
        
        // Update stats display
        this.updateStatsDisplay();
        
        requestAnimationFrame(() => this.animate());
    }
    
    updateStatsDisplay() {
        // Roundabout stats
        document.getElementById('roundabout-throughput').textContent = this.roundaboutSim.stats.throughput;
        document.getElementById('roundabout-wait').textContent = this.roundaboutSim.stats.avgWaitTime.toFixed(1) + 's';
        document.getElementById('roundabout-efficiency').textContent = this.roundaboutSim.stats.efficiency.toFixed(0) + '%';
        
        // Traffic light stats
        document.getElementById('traffic-throughput').textContent = this.trafficLightSim.stats.throughput;
        document.getElementById('traffic-wait').textContent = this.trafficLightSim.stats.avgWaitTime.toFixed(1) + 's';
        document.getElementById('traffic-efficiency').textContent = this.trafficLightSim.stats.efficiency.toFixed(0) + '%';
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TrafficSimulator();
});

