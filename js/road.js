// Road network - intersections and roundabouts

import { distance, normalizeAngle, angleBetween } from './utils.js';

// Traffic light states
export const LightState = {
    RED: 'red',
    YELLOW: 'yellow',
    GREEN: 'green'
};

// Lane configuration
const LANE_WIDTH = 7;

// Traffic light intersection
export class TrafficLightIntersection {
    constructor(x, y, size = 40) {
        this.x = x;
        this.y = y;
        this.size = size;
        
        this.greenDuration = 4000;
        this.yellowDuration = 1000;
        this.redDuration = 4000;
        
        this.nsLight = LightState.GREEN;
        this.ewLight = LightState.RED;
        this.stateTimer = 0;
        this.currentPhase = 0;
    }
    
    update(deltaTime) {
        this.stateTimer += deltaTime;
        
        const phaseDurations = [
            this.greenDuration,
            this.yellowDuration,
            this.greenDuration,
            this.yellowDuration
        ];
        
        if (this.stateTimer >= phaseDurations[this.currentPhase]) {
            this.stateTimer = 0;
            this.currentPhase = (this.currentPhase + 1) % 4;
            this.updateLights();
        }
    }
    
    updateLights() {
        switch (this.currentPhase) {
            case 0:
                this.nsLight = LightState.GREEN;
                this.ewLight = LightState.RED;
                break;
            case 1:
                this.nsLight = LightState.YELLOW;
                this.ewLight = LightState.RED;
                break;
            case 2:
                this.nsLight = LightState.RED;
                this.ewLight = LightState.GREEN;
                break;
            case 3:
                this.nsLight = LightState.RED;
                this.ewLight = LightState.YELLOW;
                break;
        }
    }
    
    isGreenFor(direction) {
        if (direction === 'north' || direction === 'south') {
            return this.nsLight === LightState.GREEN;
        }
        return this.ewLight === LightState.GREEN;
    }
    
    isYellowFor(direction) {
        if (direction === 'north' || direction === 'south') {
            return this.nsLight === LightState.YELLOW;
        }
        return this.ewLight === LightState.YELLOW;
    }
    
    setGreenDuration(duration) {
        this.greenDuration = duration;
        this.redDuration = duration;
    }
}

// 2-lane Roundabout
export class Roundabout {
    constructor(x, y, outerRadius = 55, innerRadius = 20) {
        this.x = x;
        this.y = y;
        this.outerRadius = outerRadius;
        this.innerRadius = innerRadius;
        
        // Two lanes in the circle
        this.laneWidth = (outerRadius - innerRadius) / 2;
        this.outerLaneRadius = outerRadius - this.laneWidth / 2;  // Center of outer lane
        this.innerLaneRadius = innerRadius + this.laneWidth / 2;  // Center of inner lane
        
        this.vehicles = [];
    }
    
    update(deltaTime) {}
    
    registerVehicle(vehicle) {
        if (!this.vehicles.includes(vehicle)) {
            this.vehicles.push(vehicle);
        }
    }
    
    unregisterVehicle(vehicle) {
        const idx = this.vehicles.indexOf(vehicle);
        if (idx > -1) this.vehicles.splice(idx, 1);
    }
    
    hasConflictingVehicle(enteringVehicle) {
        for (const v of this.vehicles) {
            if (v.id === enteringVehicle.id || !v.inRoundabout) continue;
            
            const dist = distance(enteringVehicle.x, enteringVehicle.y, v.x, v.y);
            if (dist < 18) return true;
        }
        return false;
    }
    
    // Calculate which exit number (1, 2, or 3) based on entry and exit directions
    getExitNumber(entryDirection, exitDirection) {
        const order = ['north', 'east', 'south', 'west'];
        const entryIdx = order.indexOf(entryDirection);
        const exitIdx = order.indexOf(exitDirection);
        
        // Count clockwise from entry to exit
        let diff = (exitIdx - entryIdx + 4) % 4;
        
        // diff: 1 = 1st exit (right), 2 = 2nd exit (straight), 3 = 3rd exit (left)
        return diff === 0 ? 4 : diff;  // 0 would be U-turn (4th exit)
    }
    
    // Generate path with proper 2-lane behavior
    generatePath(entryDirection, exitDirection) {
        const points = [];
        const spawnDist = this.outerRadius + 80;
        const approachDist = this.outerRadius + 8;
        
        const exitNumber = this.getExitNumber(entryDirection, exitDirection);
        
        // Direction vectors - where the road comes FROM
        const dirs = {
            'north': { x: 0, y: -1, laneX: LANE_WIDTH, laneY: 0 },
            'south': { x: 0, y: 1, laneX: -LANE_WIDTH, laneY: 0 },
            'east':  { x: 1, y: 0, laneX: 0, laneY: LANE_WIDTH },
            'west':  { x: -1, y: 0, laneX: 0, laneY: -LANE_WIDTH }
        };
        
        // Angles for each direction (where road connects to roundabout)
        const angles = {
            'north': -Math.PI / 2,
            'east': 0,
            'south': Math.PI / 2,
            'west': Math.PI
        };
        
        const entry = dirs[entryDirection];
        const exit = dirs[exitDirection];
        const entryAngle = angles[entryDirection];
        const exitAngle = angles[exitDirection];
        
        // All exits in clockwise order from entry
        const order = ['north', 'east', 'south', 'west'];
        const entryIdx = order.indexOf(entryDirection);
        const exit1Dir = order[(entryIdx + 1) % 4];
        const exit2Dir = order[(entryIdx + 2) % 4];
        const exit1Angle = angles[exit1Dir];
        const exit2Angle = angles[exit2Dir];
        
        // 1. Spawn point (approaching, right lane)
        points.push({
            x: this.x + entry.x * spawnDist + entry.laneX,
            y: this.y + entry.y * spawnDist + entry.laneY
        });
        
        // 2. Approach roundabout
        points.push({
            x: this.x + entry.x * approachDist + entry.laneX,
            y: this.y + entry.y * approachDist + entry.laneY
        });
        
        // Determine which lane to use based on exit
        if (exitNumber === 1) {
            // 1st exit: Use OUTER lane entire way
            
            // Enter outer lane
            points.push({
                x: this.x + Math.cos(entryAngle) * this.outerLaneRadius,
                y: this.y + Math.sin(entryAngle) * this.outerLaneRadius
            });
            
            // Go around to exit in outer lane
            this.addArcPoints(points, entryAngle, exitAngle, this.outerLaneRadius);
            
        } else if (exitNumber === 2) {
            // 2nd exit: INNER lane, then move to OUTER after 1st exit
            
            // Enter inner lane
            points.push({
                x: this.x + Math.cos(entryAngle) * this.innerLaneRadius,
                y: this.y + Math.sin(entryAngle) * this.innerLaneRadius
            });
            
            // Travel in inner lane to just past 1st exit
            const pastExit1Angle = this.getAnglePastExit(entryAngle, exit1Angle);
            this.addArcPoints(points, entryAngle, pastExit1Angle, this.innerLaneRadius);
            
            // Lane change: move from inner to outer
            const laneChangeAngle = pastExit1Angle - 0.3;  // A bit further along
            points.push({
                x: this.x + Math.cos(laneChangeAngle) * this.outerLaneRadius,
                y: this.y + Math.sin(laneChangeAngle) * this.outerLaneRadius
            });
            
            // Continue in outer lane to exit
            this.addArcPoints(points, laneChangeAngle, exitAngle, this.outerLaneRadius);
            
        } else if (exitNumber === 3) {
            // 3rd exit: INNER lane, move to OUTER after 2nd exit
            
            // Enter inner lane
            points.push({
                x: this.x + Math.cos(entryAngle) * this.innerLaneRadius,
                y: this.y + Math.sin(entryAngle) * this.innerLaneRadius
            });
            
            // Travel in inner lane past 1st and 2nd exits
            const pastExit2Angle = this.getAnglePastExit(entryAngle, exit2Angle);
            this.addArcPoints(points, entryAngle, pastExit2Angle, this.innerLaneRadius);
            
            // Lane change: move from inner to outer
            const laneChangeAngle = pastExit2Angle - 0.3;
            points.push({
                x: this.x + Math.cos(laneChangeAngle) * this.outerLaneRadius,
                y: this.y + Math.sin(laneChangeAngle) * this.outerLaneRadius
            });
            
            // Continue in outer lane to exit
            this.addArcPoints(points, laneChangeAngle, exitAngle, this.outerLaneRadius);
        }
        
        // Exit from roundabout (outer lane exit point)
        points.push({
            x: this.x + exit.x * approachDist - exit.laneX,
            y: this.y + exit.y * approachDist - exit.laneY
        });
        
        // Final destination
        points.push({
            x: this.x + exit.x * spawnDist - exit.laneX,
            y: this.y + exit.y * spawnDist - exit.laneY
        });
        
        return points;
    }
    
    // Get angle that's just past an exit (for lane change timing)
    getAnglePastExit(startAngle, exitAngle) {
        let angle = exitAngle;
        // Ensure we're going clockwise (decreasing angle)
        while (angle >= startAngle) {
            angle -= Math.PI * 2;
        }
        // Go a bit past the exit
        return angle - 0.2;
    }
    
    // Add arc points along the circle (clockwise)
    addArcPoints(points, startAngle, endAngle, radius) {
        // Normalize for clockwise travel
        let end = endAngle;
        while (end >= startAngle) {
            end -= Math.PI * 2;
        }
        
        const arc = startAngle - end;
        const steps = Math.max(2, Math.ceil(arc / (Math.PI / 3)));
        
        for (let i = 1; i <= steps; i++) {
            const angle = startAngle - (arc * i / steps);
            points.push({
                x: this.x + Math.cos(angle) * radius,
                y: this.y + Math.sin(angle) * radius
            });
        }
    }
}

// Generate path for traffic light intersection
export function generateTrafficLightPath(intersection, entryDirection, exitDirection) {
    const points = [];
    const size = intersection.size;
    const spawnDist = size + 80;
    const stopDist = size + 8;  // Stop line position
    
    // Direction config
    const dirs = {
        'north': { x: 0, y: -1, laneX: LANE_WIDTH, laneY: 0 },
        'south': { x: 0, y: 1, laneX: -LANE_WIDTH, laneY: 0 },
        'east':  { x: 1, y: 0, laneX: 0, laneY: LANE_WIDTH },
        'west':  { x: -1, y: 0, laneX: 0, laneY: -LANE_WIDTH }
    };
    
    const entry = dirs[entryDirection];
    const exit = dirs[exitDirection];
    
    // 1. Starting position (right lane of approach road)
    points.push({
        x: intersection.x + entry.x * spawnDist + entry.laneX,
        y: intersection.y + entry.y * spawnDist + entry.laneY
    });
    
    // 2. Stop line (still in right lane)
    points.push({
        x: intersection.x + entry.x * stopDist + entry.laneX,
        y: intersection.y + entry.y * stopDist + entry.laneY
    });
    
    // 3. Enter intersection
    points.push({
        x: intersection.x + entry.x * (size * 0.5) + entry.laneX,
        y: intersection.y + entry.y * (size * 0.5) + entry.laneY
    });
    
    // 4. Navigate through (based on turn type)
    const turnType = getTurnType(entryDirection, exitDirection);
    
    if (turnType === 'straight') {
        // Straight through - cross to opposite side
        points.push({
            x: intersection.x - exit.x * (size * 0.5) + exit.laneX,
            y: intersection.y - exit.y * (size * 0.5) + exit.laneY
        });
    } else if (turnType === 'right') {
        // Right turn - arc through corner
        points.push({
            x: intersection.x + entry.x * (size * 0.3) - exit.x * (size * 0.3) + exit.laneX,
            y: intersection.y + entry.y * (size * 0.3) - exit.y * (size * 0.3) + exit.laneY
        });
    } else if (turnType === 'left') {
        // Left turn - go through center
        points.push({
            x: intersection.x,
            y: intersection.y
        });
        points.push({
            x: intersection.x - exit.x * (size * 0.3) + exit.laneX,
            y: intersection.y - exit.y * (size * 0.3) + exit.laneY
        });
    }
    
    // 5. Exit intersection (right lane of exit road)
    points.push({
        x: intersection.x - exit.x * stopDist + exit.laneX,
        y: intersection.y - exit.y * stopDist + exit.laneY
    });
    
    // 6. Final destination
    points.push({
        x: intersection.x - exit.x * spawnDist + exit.laneX,
        y: intersection.y - exit.y * spawnDist + exit.laneY
    });
    
    return points;
}

function getTurnType(entry, exit) {
    const order = ['north', 'east', 'south', 'west'];
    const entryIdx = order.indexOf(entry);
    const exitIdx = order.indexOf(exit);
    const diff = (exitIdx - entryIdx + 4) % 4;
    
    if (diff === 0) return 'uturn';
    if (diff === 1) return 'right';
    if (diff === 2) return 'straight';
    return 'left';
}
