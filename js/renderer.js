// Canvas renderer

import { LightState } from './road.js';

// Helper to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class Renderer {
    constructor(canvas, offsetX = 0, offsetY = 0) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        
        this.scale = 1.8;
        
        this.backgroundColor = '#1a1a2e';
        this.roadColor = '#2d2d44';
        this.roadMarkingColor = '#4a4a6a';
        this.laneLineColor = '#3d3d5c';
        this.stopLineColor = '#ffffff';
        this.glowEnabled = true;
    }
    
    clear() {
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    worldToScreen(x, y) {
        return {
            x: x * this.scale + this.canvas.width / 2 + this.offsetX,
            y: y * this.scale + this.canvas.height / 2 + this.offsetY - 20
        };
    }
    
    // Draw 2-lane roundabout
    drawRoundabout(roundabout) {
        const center = this.worldToScreen(roundabout.x, roundabout.y);
        const outerR = roundabout.outerRadius * this.scale;
        const innerR = roundabout.innerRadius * this.scale;
        const laneLineR = ((roundabout.outerRadius + roundabout.innerRadius) / 2) * this.scale;
        
        // Draw approach roads first
        this.drawRoundaboutRoads(roundabout);
        
        // Outer edge of road
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, outerR, 0, Math.PI * 2);
        this.ctx.fillStyle = this.roadColor;
        this.ctx.fill();
        this.ctx.strokeStyle = this.roadMarkingColor;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Lane divider (dashed line between inner and outer lanes)
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, laneLineR, 0, Math.PI * 2);
        this.ctx.strokeStyle = this.laneLineColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([8, 8]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Inner island (grass/non-drivable area)
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, innerR, 0, Math.PI * 2);
        this.ctx.fillStyle = '#1e3a2f';
        this.ctx.fill();
        this.ctx.strokeStyle = '#2d5a4a';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // Center decoration
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, innerR * 0.5, 0, Math.PI * 2);
        this.ctx.fillStyle = '#2a4a3a';
        this.ctx.fill();
    }
    
    drawRoundaboutRoads(roundabout) {
        const roadWidth = 26 * this.scale;
        const roadLength = 100 * this.scale;
        
        const directions = [
            { angle: -Math.PI / 2 },  // north
            { angle: Math.PI / 2 },   // south
            { angle: 0 },              // east
            { angle: Math.PI }         // west
        ];
        
        for (const dir of directions) {
            const center = this.worldToScreen(roundabout.x, roundabout.y);
            const startDist = roundabout.outerRadius * this.scale;
            
            this.ctx.save();
            this.ctx.translate(center.x, center.y);
            this.ctx.rotate(dir.angle);
            
            // Road surface
            this.ctx.fillStyle = this.roadColor;
            this.ctx.fillRect(startDist, -roadWidth / 2, roadLength, roadWidth);
            
            // Center line (dashed - separates incoming/outgoing)
            this.ctx.strokeStyle = this.laneLineColor;
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([6, 6]);
            this.ctx.beginPath();
            this.ctx.moveTo(startDist, 0);
            this.ctx.lineTo(startDist + roadLength, 0);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Edge lines
            this.ctx.strokeStyle = this.roadMarkingColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(startDist, -roadWidth / 2);
            this.ctx.lineTo(startDist + roadLength, -roadWidth / 2);
            this.ctx.moveTo(startDist, roadWidth / 2);
            this.ctx.lineTo(startDist + roadLength, roadWidth / 2);
            this.ctx.stroke();
            
            this.ctx.restore();
        }
    }
    
    // Draw traffic light intersection with clear stop lines and lights
    drawTrafficLightIntersection(intersection) {
        // Draw roads first
        this.drawIntersectionRoads(intersection);
        
        const center = this.worldToScreen(intersection.x, intersection.y);
        const size = intersection.size * this.scale;
        
        // Main intersection box
        this.ctx.fillStyle = this.roadColor;
        this.ctx.fillRect(center.x - size, center.y - size, size * 2, size * 2);
        
        // Draw stop lines and traffic lights for each direction
        this.drawStopLineAndLight(intersection, 'north', center, size);
        this.drawStopLineAndLight(intersection, 'south', center, size);
        this.drawStopLineAndLight(intersection, 'east', center, size);
        this.drawStopLineAndLight(intersection, 'west', center, size);
    }
    
    drawStopLineAndLight(intersection, direction, center, size) {
        const stopLineDist = size + 8 * this.scale;
        const laneWidth = 7 * this.scale;
        const stopLineLength = 12 * this.scale;
        
        let x1, y1, x2, y2;  // Stop line endpoints
        let lightX, lightY;   // Traffic light position
        let light;            // Which light to show
        
        switch (direction) {
            case 'north':
                // Cars coming from north (top), stop line just above intersection
                x1 = center.x + laneWidth - stopLineLength / 2;
                y1 = center.y - size - 5;
                x2 = center.x + laneWidth + stopLineLength / 2;
                y2 = center.y - size - 5;
                lightX = center.x + laneWidth + 10;
                lightY = center.y - size - 8;
                light = intersection.nsLight;
                break;
            case 'south':
                // Cars coming from south (bottom)
                x1 = center.x - laneWidth - stopLineLength / 2;
                y1 = center.y + size + 5;
                x2 = center.x - laneWidth + stopLineLength / 2;
                y2 = center.y + size + 5;
                lightX = center.x - laneWidth - 10;
                lightY = center.y + size + 8;
                light = intersection.nsLight;
                break;
            case 'east':
                // Cars coming from east (right)
                x1 = center.x + size + 5;
                y1 = center.y + laneWidth - stopLineLength / 2;
                x2 = center.x + size + 5;
                y2 = center.y + laneWidth + stopLineLength / 2;
                lightX = center.x + size + 8;
                lightY = center.y + laneWidth + 10;
                light = intersection.ewLight;
                break;
            case 'west':
                // Cars coming from west (left)
                x1 = center.x - size - 5;
                y1 = center.y - laneWidth - stopLineLength / 2;
                x2 = center.x - size - 5;
                y2 = center.y - laneWidth + stopLineLength / 2;
                lightX = center.x - size - 8;
                lightY = center.y - laneWidth - 10;
                light = intersection.ewLight;
                break;
        }
        
        // Draw stop line (thick white line)
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = this.stopLineColor;
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw traffic light
        this.drawTrafficLight(lightX, lightY, light);
    }
    
    drawTrafficLight(x, y, lightState) {
        // Light housing
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.beginPath();
        this.ctx.arc(x, y, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Light color
        let color;
        switch (lightState) {
            case LightState.GREEN:
                color = '#00ff88';
                break;
            case LightState.YELLOW:
                color = '#ffcc00';
                break;
            case LightState.RED:
                color = '#ff4444';
                break;
        }
        
        // Glow effect
        if (this.glowEnabled) {
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, 18);
            gradient.addColorStop(0, color);
            gradient.addColorStop(0.5, hexToRgba(color, 0.3));
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 18, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Light bulb
        this.ctx.beginPath();
        this.ctx.arc(x, y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
    }
    
    drawIntersectionRoads(intersection) {
        const roadWidth = 26 * this.scale;
        const roadLength = 100 * this.scale;
        const center = this.worldToScreen(intersection.x, intersection.y);
        const size = intersection.size * this.scale;
        
        // North road
        this.ctx.fillStyle = this.roadColor;
        this.ctx.fillRect(center.x - roadWidth / 2, center.y - size - roadLength, roadWidth, roadLength);
        
        // South road
        this.ctx.fillRect(center.x - roadWidth / 2, center.y + size, roadWidth, roadLength);
        
        // East road
        this.ctx.fillRect(center.x + size, center.y - roadWidth / 2, roadLength, roadWidth);
        
        // West road
        this.ctx.fillRect(center.x - size - roadLength, center.y - roadWidth / 2, roadLength, roadWidth);
        
        // Lane markings (center dashed lines)
        this.ctx.strokeStyle = this.laneLineColor;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([6, 6]);
        
        // North-South center lines
        this.ctx.beginPath();
        this.ctx.moveTo(center.x, center.y - size - roadLength);
        this.ctx.lineTo(center.x, center.y - size);
        this.ctx.moveTo(center.x, center.y + size);
        this.ctx.lineTo(center.x, center.y + size + roadLength);
        this.ctx.stroke();
        
        // East-West center lines
        this.ctx.beginPath();
        this.ctx.moveTo(center.x + size, center.y);
        this.ctx.lineTo(center.x + size + roadLength, center.y);
        this.ctx.moveTo(center.x - size - roadLength, center.y);
        this.ctx.lineTo(center.x - size, center.y);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
    }
    
    // Draw vehicle with glow effect
    drawVehicle(vehicle) {
        const screen = this.worldToScreen(vehicle.x, vehicle.y);
        const color = vehicle.getColor();
        
        // Skip if off-screen
        if (screen.x < -50 || screen.x > this.canvas.width + 50 ||
            screen.y < -50 || screen.y > this.canvas.height + 50) {
            return;
        }
        
        // Draw trail
        if (this.glowEnabled && vehicle.trail.length > 1) {
            this.ctx.beginPath();
            const firstTrail = this.worldToScreen(vehicle.trail[0].x, vehicle.trail[0].y);
            this.ctx.moveTo(firstTrail.x, firstTrail.y);
            
            for (let i = 1; i < vehicle.trail.length; i++) {
                const trailPoint = this.worldToScreen(vehicle.trail[i].x, vehicle.trail[i].y);
                this.ctx.lineTo(trailPoint.x, trailPoint.y);
            }
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.4;
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
        }
        
        // Glow effect
        if (this.glowEnabled) {
            const glowIntensity = vehicle.getGlowIntensity();
            const glowSize = 15 * glowIntensity;
            const gradient = this.ctx.createRadialGradient(
                screen.x, screen.y, 0,
                screen.x, screen.y, glowSize
            );
            gradient.addColorStop(0, color);
            const rgbaColor = color.replace('rgb(', 'rgba(').replace(')', ', 0.4)');
            gradient.addColorStop(0.4, rgbaColor);
            gradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(screen.x, screen.y, glowSize, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Vehicle body
        this.ctx.save();
        this.ctx.translate(screen.x, screen.y);
        this.ctx.rotate(vehicle.angle);
        
        const width = vehicle.width * this.scale * 0.6;
        const height = vehicle.height * this.scale * 0.6;
        
        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.beginPath();
        this.ctx.roundRect(-width / 2 + 2, -height / 2 + 2, width, height, 2);
        this.ctx.fill();
        
        // Main body
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(-width / 2, -height / 2, width, height, 2);
        this.ctx.fill();
        
        // Highlight
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.beginPath();
        this.ctx.roundRect(-width / 2 + 1, -height / 2 + 1, width - 2, height / 3, 1);
        this.ctx.fill();
        
        // Headlights
        this.ctx.fillStyle = 'rgba(255, 255, 200, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(width / 2 - 2, -height / 4, 1.5, 0, Math.PI * 2);
        this.ctx.arc(width / 2 - 2, height / 4, 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.restore();
    }
    
    drawVehicles(vehicles) {
        const sorted = [...vehicles].sort((a, b) => a.y - b.y);
        for (const vehicle of sorted) {
            if (!vehicle.completed) {
                this.drawVehicle(vehicle);
            }
        }
    }
    
    drawStats(stats, x, y) {
        this.ctx.fillStyle = 'rgba(26, 26, 46, 0.9)';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, 160, 85, 6);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#3d3d5c';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, 160, 85, 6);
        this.ctx.stroke();
        
        this.ctx.font = '11px "JetBrains Mono", monospace';
        this.ctx.fillStyle = '#8888aa';
        
        const lines = [
            `Throughput: ${stats.throughput}/min`,
            `Avg Wait: ${stats.avgWaitTime.toFixed(1)}s`,
            `Queue: ${stats.queueLength}`,
            `Efficiency: ${stats.efficiency.toFixed(0)}%`
        ];
        
        lines.forEach((line, i) => {
            this.ctx.fillText(line, x + 12, y + 20 + i * 17);
        });
    }
    
    drawTitle(text, y = 30) {
        this.ctx.font = 'bold 14px "JetBrains Mono", monospace';
        this.ctx.fillStyle = '#aaaacc';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(text, this.canvas.width / 2, y);
        this.ctx.textAlign = 'left';
    }
}
