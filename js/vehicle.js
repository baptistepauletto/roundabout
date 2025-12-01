// Vehicle class with behavior rules

import { distance, angleBetween, normalizeAngle, clamp, speedToColor, generateId } from './utils.js';

export const VehicleState = {
    DRIVING: 'driving',
    WAITING: 'waiting',
    IN_INTERSECTION: 'in_intersection'
};

export class Vehicle {
    constructor(x, y, angle, path) {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 0;
        this.maxSpeed = 1.8 + Math.random() * 0.4;
        this.acceleration = 0.08;
        this.deceleration = 0.15;
        this.width = 10;
        this.height = 5;
        
        this.path = path;
        this.waypointIndex = 0;
        this.state = VehicleState.DRIVING;
        
        this.totalWaitTime = 0;
        this.trail = [];
        this.maxTrailLength = 8;
        
        this.safeDistance = 22;
        this.completed = false;
    }
    
    get waypoint() {
        return this.path[this.waypointIndex];
    }
    
    update(deltaTime, vehicles, intersection) {
        if (this.completed) return;
        
        // Update trail
        if (this.trail.length === 0 || distance(this.x, this.y, this.trail[0].x, this.trail[0].y) > 4) {
            this.trail.unshift({ x: this.x, y: this.y });
            if (this.trail.length > this.maxTrailLength) this.trail.pop();
        }
        
        const wp = this.waypoint;
        if (!wp) {
            this.completed = true;
            return;
        }
        
        // Distance to current waypoint
        const distToWp = distance(this.x, this.y, wp.x, wp.y);
        
        // Advance to next waypoint when close enough
        if (distToWp < 10) {
            this.waypointIndex++;
            if (this.waypointIndex >= this.path.length) {
                this.completed = true;
                return;
            }
        }
        
        // Steer towards waypoint
        const targetAngle = angleBetween(this.x, this.y, wp.x, wp.y);
        let angleDiff = targetAngle - this.angle;
        
        // Normalize angle difference to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Smooth steering
        this.angle += angleDiff * 0.15;
        
        // Determine target speed
        let targetSpeed = this.maxSpeed;
        
        // Check for cars ahead
        const ahead = this.getCarAhead(vehicles);
        if (ahead.distance < this.safeDistance) {
            const factor = Math.max(0, (ahead.distance - 10) / (this.safeDistance - 10));
            targetSpeed = Math.min(targetSpeed, ahead.speed + factor * this.maxSpeed);
        }
        
        // Check intersection rules
        if (!this.canProceed(intersection)) {
            targetSpeed = 0;
            this.totalWaitTime += deltaTime;
        }
        
        // Slow down for turns
        if (distToWp < 30 && this.path[this.waypointIndex + 1]) {
            const nextWp = this.path[this.waypointIndex + 1];
            const nextAngle = angleBetween(wp.x, wp.y, nextWp.x, nextWp.y);
            let turnAngle = Math.abs(nextAngle - targetAngle);
            if (turnAngle > Math.PI) turnAngle = Math.PI * 2 - turnAngle;
            if (turnAngle > 0.5) targetSpeed *= 0.6;
        }
        
        // Accelerate/decelerate
        if (this.speed < targetSpeed) {
            this.speed = Math.min(targetSpeed, this.speed + this.acceleration);
        } else {
            this.speed = Math.max(targetSpeed, this.speed - this.deceleration);
        }
        
        // Move
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
    }
    
    getCarAhead(vehicles) {
        let closest = { distance: Infinity, speed: 0 };
        
        for (const v of vehicles) {
            if (v.id === this.id || v.completed) continue;
            
            const dx = v.x - this.x;
            const dy = v.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > this.safeDistance * 2) continue;
            
            // Check if in front of us
            const angleToV = Math.atan2(dy, dx);
            let angleDiff = Math.abs(angleToV - this.angle);
            if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
            
            if (angleDiff < Math.PI / 3 && dist < closest.distance) {
                closest = { distance: dist, speed: v.speed };
            }
        }
        
        return closest;
    }
    
    canProceed(intersection) {
        return true;  // Override in subclasses
    }
    
    getColor() {
        return speedToColor(this.speed, this.maxSpeed);
    }
    
    getGlowIntensity() {
        return 0.4 + (this.speed / this.maxSpeed) * 0.6;
    }
}

// Traffic light vehicle
export class TrafficLightVehicle extends Vehicle {
    constructor(x, y, angle, path, direction) {
        super(x, y, angle, path);
        this.direction = direction;
        this.passedStopLine = false;
    }
    
    canProceed(intersection) {
        if (!intersection || this.passedStopLine) return true;
        
        const distToCenter = distance(this.x, this.y, intersection.x, intersection.y);
        const stopZone = intersection.size + 15;
        
        // Check if at stop zone
        if (distToCenter < stopZone && distToCenter > intersection.size - 5) {
            const isGreen = intersection.isGreenFor(this.direction);
            const isYellow = intersection.isYellowFor(this.direction);
            
            if (isGreen || isYellow) {
                this.passedStopLine = true;
                this.state = VehicleState.IN_INTERSECTION;
                return true;
            }
            
            this.state = VehicleState.WAITING;
            return false;
        }
        
        // Inside intersection
        if (distToCenter <= intersection.size) {
            this.passedStopLine = true;
            this.state = VehicleState.IN_INTERSECTION;
        }
        
        return true;
    }
}

// Roundabout vehicle  
export class RoundaboutVehicle extends Vehicle {
    constructor(x, y, angle, path, entryDirection) {
        super(x, y, angle, path);
        this.entryDirection = entryDirection;
        this.inRoundabout = false;
        this.waitTimer = 0;
    }
    
    canProceed(intersection) {
        if (!intersection) return true;
        
        const distToCenter = distance(this.x, this.y, intersection.x, intersection.y);
        
        // Already in roundabout - keep going
        if (this.inRoundabout) {
            // Check if we've exited
            if (distToCenter > intersection.outerRadius + 5) {
                this.inRoundabout = false;
                intersection.unregisterVehicle(this);
            }
            return true;
        }
        
        // Approaching roundabout
        const yieldZone = intersection.outerRadius + 12;
        
        if (distToCenter < yieldZone && distToCenter > intersection.outerRadius - 5) {
            // Check for conflicting traffic
            if (intersection.hasConflictingVehicle(this)) {
                this.waitTimer = 0;
                this.state = VehicleState.WAITING;
                return false;
            }
            
            // Safe to enter after brief check
            this.waitTimer += 16;
            if (this.waitTimer > 50) {
                this.inRoundabout = true;
                intersection.registerVehicle(this);
                this.state = VehicleState.IN_INTERSECTION;
                return true;
            }
        }
        
        // Entered the circle
        if (distToCenter <= intersection.outerRadius && distToCenter > intersection.innerRadius) {
            if (!this.inRoundabout) {
                this.inRoundabout = true;
                intersection.registerVehicle(this);
            }
        }
        
        return true;
    }
}
