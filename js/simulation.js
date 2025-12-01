// Core simulation engine

import { TrafficLightVehicle, RoundaboutVehicle } from './vehicle.js';
import { TrafficLightIntersection, Roundabout, generateTrafficLightPath } from './road.js';
import { randomRange } from './utils.js';

export class Simulation {
    constructor(type = 'roundabout') {
        this.type = type;
        this.vehicles = [];
        this.intersection = null;
        
        this.spawnRate = 1.5; // vehicles per second
        this.spawnTimer = 0;
        this.simulationSpeed = 1;
        this.paused = false;
        
        this.stats = {
            throughput: 0,
            avgWaitTime: 0,
            queueLength: 0,
            efficiency: 100,
            totalVehicles: 0,
            completedVehicles: 0,
            totalWaitTime: 0
        };
        
        this.throughputWindow = [];
        this.throughputWindowSize = 60000; // 1 minute window
        
        this.lastUpdate = Date.now();
        
        this.initIntersection();
    }
    
    initIntersection() {
        if (this.type === 'roundabout') {
            this.intersection = new Roundabout(0, 0, 70, 30);
        } else {
            this.intersection = new TrafficLightIntersection(0, 0, 60);
        }
    }
    
    update() {
        if (this.paused) return;
        
        const now = Date.now();
        const deltaTime = (now - this.lastUpdate) * this.simulationSpeed;
        this.lastUpdate = now;
        
        // Update intersection
        this.intersection.update(deltaTime);
        
        // Spawn vehicles
        this.spawnTimer += deltaTime;
        const spawnInterval = 1000 / this.spawnRate;
        
        while (this.spawnTimer >= spawnInterval) {
            this.spawnTimer -= spawnInterval;
            this.spawnVehicle();
        }
        
        // Update vehicles
        for (const vehicle of this.vehicles) {
            vehicle.update(deltaTime, this.vehicles, this.intersection);
            
            // Track roundabout vehicles
            if (this.type === 'roundabout' && vehicle.inRoundabout) {
                this.intersection.registerVehicle(vehicle);
            }
        }
        
        // Remove completed vehicles and track stats
        const completedNow = this.vehicles.filter(v => v.completed);
        for (const v of completedNow) {
            this.stats.completedVehicles++;
            this.stats.totalWaitTime += v.totalWaitTime;
            
            // Track throughput
            this.throughputWindow.push(now);
            
            // Unregister from roundabout
            if (this.type === 'roundabout') {
                this.intersection.unregisterVehicle(v);
            }
        }
        
        this.vehicles = this.vehicles.filter(v => !v.completed);
        
        // Clean old throughput entries
        this.throughputWindow = this.throughputWindow.filter(
            t => now - t < this.throughputWindowSize
        );
        
        // Update stats
        this.updateStats();
    }
    
    spawnVehicle() {
        const directions = ['north', 'south', 'east', 'west'];
        const entryDir = directions[Math.floor(Math.random() * directions.length)];
        
        // Pick exit direction (different from entry)
        const exitDirs = directions.filter(d => d !== entryDir);
        const exitDir = exitDirs[Math.floor(Math.random() * exitDirs.length)];
        
        let vehicle;
        let path;
        
        if (this.type === 'roundabout') {
            path = this.intersection.generatePath(entryDir, exitDir);
            const startPos = path[0];
            const angle = Math.atan2(path[1].y - startPos.y, path[1].x - startPos.x);
            
            vehicle = new RoundaboutVehicle(
                startPos.x, startPos.y, angle, path, entryDir
            );
        } else {
            path = generateTrafficLightPath(this.intersection, entryDir, exitDir);
            const startPos = path[0];
            const angle = Math.atan2(path[1].y - startPos.y, path[1].x - startPos.x);
            
            vehicle = new TrafficLightVehicle(
                startPos.x, startPos.y, angle, path, entryDir
            );
        }
        
        this.vehicles.push(vehicle);
        this.stats.totalVehicles++;
    }
    
    updateStats() {
        // Throughput (vehicles per minute)
        this.stats.throughput = this.throughputWindow.length;
        
        // Average wait time
        if (this.stats.completedVehicles > 0) {
            this.stats.avgWaitTime = (this.stats.totalWaitTime / this.stats.completedVehicles) / 1000;
        }
        
        // Queue length (vehicles currently waiting)
        this.stats.queueLength = this.vehicles.filter(v => v.speed < 0.5).length;
        
        // Efficiency (ratio of moving vs waiting)
        const moving = this.vehicles.filter(v => v.speed > 0.5).length;
        const total = this.vehicles.length;
        this.stats.efficiency = total > 0 ? (moving / total) * 100 : 100;
    }
    
    reset() {
        this.vehicles = [];
        this.spawnTimer = 0;
        this.stats = {
            throughput: 0,
            avgWaitTime: 0,
            queueLength: 0,
            efficiency: 100,
            totalVehicles: 0,
            completedVehicles: 0,
            totalWaitTime: 0
        };
        this.throughputWindow = [];
        this.lastUpdate = Date.now();
        this.initIntersection();
    }
    
    setSpawnRate(rate) {
        this.spawnRate = rate;
    }
    
    setSimulationSpeed(speed) {
        this.simulationSpeed = speed;
    }
    
    setPaused(paused) {
        this.paused = paused;
        if (!paused) {
            this.lastUpdate = Date.now();
        }
    }
    
    setGreenDuration(duration) {
        if (this.type === 'traffic-light' && this.intersection) {
            this.intersection.setGreenDuration(duration);
        }
    }
}

