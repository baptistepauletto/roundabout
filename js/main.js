// Unified Intersection Simulator - Streetlight & Roundabout

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// =============================================================================
// SHARED CONFIGURATION
// =============================================================================

const config = {
    simulationType: 'streetlight', // 'streetlight' or 'roundabout'
    spawnRate: 1,
    carSpeed: 100,
    lightDuration: 10,
    realisticMode: true
};

// Shared road configuration
const roadWidth = 50;

// Canvas center for both simulations
const center = {
    x: 500,
    y: 200
};

// =============================================================================
// STREETLIGHT-SPECIFIC CONFIGURATION
// =============================================================================

const isoAngle = Math.PI / 6; // 30 degrees

const intersection = {
    x: center.x,
    y: center.y
};

// Road A: goes down-right (30° below horizontal)
const roadA = {
    angle: isoAngle,
    dirX: Math.cos(isoAngle),
    dirY: Math.sin(isoAngle)
};

// Road B: goes up-right (30° above horizontal)  
const roadB = {
    angle: -isoAngle,
    dirX: Math.cos(-isoAngle),
    dirY: Math.sin(-isoAngle)
};

// Traffic light system (streetlight mode)
const light = {
    activeRoad: 'A',
    state: 'green',
    timer: 0,
    justTurnedGreen: false
};

// =============================================================================
// ROUNDABOUT-SPECIFIC CONFIGURATION
// =============================================================================

const roundabout = {
    centerX: center.x,
    centerY: center.y,
    radius: 100, // Driving path radius (increased for more capacity)
    innerRadius: 50, // Center island radius
    approachLength: 300
};

// Entry/exit points (angles in radians, 0 = right, counter-clockwise)
// Top = -PI/2, Right = 0, Bottom = PI/2, Left = PI
const roundaboutEntries = {
    top: { angle: -Math.PI / 2, exitAngle: Math.PI / 2 },      // Top -> Bottom
    left: { angle: Math.PI, exitAngle: 0 }                      // Left -> Right
};

// =============================================================================
// METRICS (Shared)
// =============================================================================

const metrics = {
    waitTimes: [],
    maxSamples: 50,
    carsPassedThisGreen: 0,
    carsPassedLastGreen: 0
};

// Long-term statistics (tracked per simulation type AND mode)
const longTermStats = {
    streetlight: {
        realistic: createEmptyStats(),
        perfect: createEmptyStats()
    },
    roundabout: {
        realistic: createEmptyStats(),
        perfect: createEmptyStats()
    }
};

function createEmptyStats() {
    return {
        totalCarsPassed: 0,
        totalCycles: 0,
        carsPerCycleSum: 0,
        peakQueue: 0,
        queueSamples: [],
        simTime: 0,
        greenTimeUsed: 0,
        totalGreenTime: 0
    };
}

function getCurrentStats() {
    const simStats = longTermStats[config.simulationType];
    return config.realisticMode ? simStats.realistic : simStats.perfect;
}

// Graph data history
const graphData = {
    queue: [],
    wait: [],
    current: [],
    cycle: [],
    maxPoints: 60,
    updateInterval: 0.5,
    timer: 0
};

// Graph canvases
let queueGraph, waitGraph, currentGraph, cycleGraph;
let queueCtx, waitCtx, currentCtx, cycleCtx;

// Vehicles array (shared)
const vehicles = [];
let spawnTimerA = 0;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function getLightState(road) {
    if (road === light.activeRoad) {
        return light.state;
    }
    return 'red';
}

// =============================================================================
// STREETLIGHT SIMULATION
// =============================================================================

function updateStreetlight(dt) {
    light.timer += dt;
    
    const greenDuration = config.lightDuration;
    const yellowDuration = 2;
    
    if (light.state === 'green' && light.timer >= greenDuration) {
        light.timer = 0;
        light.state = 'yellow';
    } else if (light.state === 'yellow' && light.timer >= yellowDuration) {
        light.timer = 0;
        light.state = 'red';
        metrics.carsPassedLastGreen = metrics.carsPassedThisGreen;
        
        const stats = getCurrentStats();
        stats.totalCarsPassed += metrics.carsPassedThisGreen;
        stats.totalCycles++;
        stats.carsPerCycleSum += metrics.carsPassedThisGreen;
        
        metrics.carsPassedThisGreen = 0;
    } else if (light.state === 'red' && light.timer >= 0.5) {
        light.timer = 0;
        light.activeRoad = light.activeRoad === 'A' ? 'B' : 'A';
        light.state = 'green';
        light.justTurnedGreen = true;
    }
    
    if (light.justTurnedGreen) {
        light.justTurnedGreen = false;
        
        const carsOnActiveRoad = vehicles.filter(v => v.road === light.activeRoad);
        
        if (config.realisticMode) {
            const stoppedCars = carsOnActiveRoad
                .filter(v => v.waiting)
                .sort((a, b) => b.progress - a.progress);
            
            stoppedCars.forEach((v, index) => {
                const baseDelay = index === 0 ? 0.2 : 0.5;
                const randomDelay = 0.3 + Math.random() * 0.5;
                const cumulativeDelay = index * (0.6 + Math.random() * 0.4);
                
                v.reactionDelay = baseDelay + randomDelay + cumulativeDelay;
                v.reactionTimer = 0;
                v.canGo = false;
            });
        } else {
            carsOnActiveRoad.forEach(v => {
                v.reactionDelay = 0;
                v.reactionTimer = 0;
                v.canGo = true;
            });
        }
    }
}

function spawnStreetlightVehicle(road) {
    const hues = [0, 30, 200, 220, 280, 340];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    
    const roadConfig = road === 'A' ? roadA : roadB;
    const spawnDist = 600;
    const carWidth = 40;
    const minSpawnGap = 8;
    
    const carsOnRoad = vehicles.filter(v => v.road === road);
    for (const other of carsOnRoad) {
        if (other.progress < carWidth + minSpawnGap) {
            return;
        }
    }
    
    const initialSpeed = config.carSpeed * 0.4;
    
    vehicles.push({
        type: 'streetlight',
        road: road,
        progress: 0,
        x: intersection.x - spawnDist * roadConfig.dirX,
        y: intersection.y - spawnDist * roadConfig.dirY,
        width: carWidth,
        height: 20,
        speed: initialSpeed,
        hue: hue,
        waiting: false,
        waitStartTime: null,
        reactionDelay: 0,
        reactionTimer: 0,
        canGo: true
    });
}

function updateStreetlightVehicles(dt) {
    const minGap = 15;
    const safeGap = minGap + 25;
    const spawnDist = 600;
    const stopDist = roadWidth + 10;
    const stopProgress = spawnDist - stopDist;
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        if (v.type !== 'streetlight') continue;
        
        const roadConfig = v.road === 'A' ? roadA : roadB;
        const prevProgress = v.progress;
        
        if (config.realisticMode && v.reactionDelay > 0) {
            v.reactionTimer += dt;
            if (v.reactionTimer >= v.reactionDelay) {
                v.canGo = true;
                v.reactionDelay = 0;
            }
        }
        
        let carAhead = null;
        let gapToCarAhead = Infinity;
        
        for (const other of vehicles) {
            if (other !== v && other.road === v.road && other.progress > v.progress) {
                const myFront = v.progress + v.width / 2;
                const theirBack = other.progress - other.width / 2;
                const gap = theirBack - myFront;
                if (gap > 0 && gap < gapToCarAhead) {
                    gapToCarAhead = gap;
                    carAhead = other;
                }
            }
        }
        
        const frontProgress = v.progress + v.width / 2;
        const atLight = frontProgress > stopProgress - 80 && frontProgress < stopProgress;
        const myLightState = getLightState(v.road);
        const lightIsRed = myLightState !== 'green';
        
        let shouldStop = false;
        let shouldSlow = false;
        
        if (config.realisticMode) {
            const shouldStopAtLight = lightIsRed && atLight;
            const waitingForReaction = !v.canGo && v.waiting;
            const carAheadNotMoving = carAhead && !carAhead.canGo && carAhead.waiting;
            const carAheadStopped = carAhead && carAhead.speed < 5 && gapToCarAhead < 50;
            
            shouldStop = shouldStopAtLight || waitingForReaction || carAheadNotMoving || carAheadStopped || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        } else {
            const shouldStopAtLight = lightIsRed && atLight;
            shouldStop = shouldStopAtLight || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        }
        
        if (shouldStop && !v.waiting && frontProgress < stopProgress) {
            v.waiting = true;
            v.waitStartTime = performance.now();
        } else if (!shouldStop && v.waiting) {
            if (v.waitStartTime) {
                const waitTime = (performance.now() - v.waitStartTime) / 1000;
                metrics.waitTimes.push(waitTime);
                if (metrics.waitTimes.length > metrics.maxSamples) {
                    metrics.waitTimes.shift();
                }
            }
            v.waiting = false;
            v.waitStartTime = null;
        }
        
        if (shouldStop) {
            v.speed = Math.max(0, v.speed - 600 * dt);
        } else if (shouldSlow) {
            const targetSpeed = carAhead ? Math.min(carAhead.speed, config.carSpeed * 0.8) : config.carSpeed * 0.8;
            if (v.speed > targetSpeed) {
                v.speed = Math.max(targetSpeed, v.speed - 300 * dt);
            }
        } else {
            const accel = config.realisticMode ? 200 : 400;
            v.speed = Math.min(config.carSpeed, v.speed + accel * dt);
        }
        
        v.progress += v.speed * dt;
        v.x = intersection.x - (spawnDist - v.progress) * roadConfig.dirX;
        v.y = intersection.y - (spawnDist - v.progress) * roadConfig.dirY;
        
        if (carAhead) {
            const myFront = v.progress + v.width / 2;
            const theirBack = carAhead.progress - carAhead.width / 2;
            if (myFront > theirBack - minGap) {
                v.progress = theirBack - minGap - v.width / 2;
                v.x = intersection.x - (spawnDist - v.progress) * roadConfig.dirX;
                v.y = intersection.y - (spawnDist - v.progress) * roadConfig.dirY;
                v.speed = Math.min(v.speed, carAhead.speed);
            }
        }
        
        const prevFront = prevProgress + v.width / 2;
        const newFront = v.progress + v.width / 2;
        const myState = getLightState(v.road);
        
        if (prevFront <= spawnDist && newFront > spawnDist && (myState === 'green' || myState === 'yellow')) {
            metrics.carsPassedThisGreen++;
        }
        
        if (v.progress > spawnDist + 400) {
            vehicles.splice(i, 1);
        }
    }
}

function drawStreetlightRoad() {
    ctx.save();
    
    drawIsometricRoad(roadB, 650);
    drawIsometricRoad(roadA, 650);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.beginPath();
    ctx.arc(intersection.x, intersection.y, roadWidth * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    const stopDist = roadWidth + 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 4;

    const stopAX = intersection.x - stopDist * roadA.dirX;
    const stopAY = intersection.y - stopDist * roadA.dirY;
    const perpAX = -roadA.dirY * (roadWidth / 2 - 3);
    const perpAY = roadA.dirX * (roadWidth / 2 - 3);
    ctx.beginPath();
    ctx.moveTo(stopAX + perpAX, stopAY + perpAY);
    ctx.lineTo(stopAX - perpAX, stopAY - perpAY);
    ctx.stroke();

    const stopBX = intersection.x - stopDist * roadB.dirX;
    const stopBY = intersection.y - stopDist * roadB.dirY;
    const perpBX = -roadB.dirY * (roadWidth / 2 - 3);
    const perpBY = roadB.dirX * (roadWidth / 2 - 3);
    ctx.beginPath();
    ctx.moveTo(stopBX + perpBX, stopBY + perpBY);
    ctx.lineTo(stopBX - perpBX, stopBY - perpBY);
    ctx.stroke();
    
    ctx.restore();
}

function drawIsometricRoad(roadConfig, length) {
    const halfWidth = roadWidth / 2;
    
    const perpX = -roadConfig.dirY * halfWidth;
    const perpY = roadConfig.dirX * halfWidth;
    
    const startX = intersection.x - length * roadConfig.dirX;
    const startY = intersection.y - length * roadConfig.dirY;
    const endX = intersection.x + length * roadConfig.dirX;
    const endY = intersection.y + length * roadConfig.dirY;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.moveTo(startX + perpX + 5, startY + perpY + 5);
    ctx.lineTo(endX + perpX + 5, endY + perpY + 5);
    ctx.lineTo(endX - perpX + 5, endY - perpY + 5);
    ctx.lineTo(startX - perpX + 5, startY - perpY + 5);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(startX + perpX, startY + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(startX - perpX, startY - perpY);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + perpX, startY + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.moveTo(startX - perpX, startY - perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.stroke();
    
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(intersection.x - 40 * roadConfig.dirX, intersection.y - 40 * roadConfig.dirY);
    ctx.moveTo(intersection.x + 40 * roadConfig.dirX, intersection.y + 40 * roadConfig.dirY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawStreetlightLights() {
    const lightDist = roadWidth + 20;
    
    const lightAX = intersection.x + lightDist * roadA.dirX - roadWidth * 0.7 * roadA.dirY;
    const lightAY = intersection.y + lightDist * roadA.dirY + roadWidth * 0.7 * roadA.dirX;
    drawSingleLight(lightAX, lightAY, getLightState('A'));

    const lightBX = intersection.x + lightDist * roadB.dirX - roadWidth * 0.7 * roadB.dirY;
    const lightBY = intersection.y + lightDist * roadB.dirY + roadWidth * 0.7 * roadB.dirX;
    drawSingleLight(lightBX, lightBY, getLightState('B'));
}

function drawSingleLight(x, y, state) {
    ctx.save();
    ctx.translate(x, y);
    
    const lightColors = {
        red: { on: '#ff4444', off: '#3a2020' },
        yellow: { on: '#ffcc00', off: '#3a3520' },
        green: { on: '#44cc55', off: '#203a25' }
    };
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(4, 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#666';
    ctx.fillRect(-3, -75, 6, 80);
    
    ctx.fillStyle = '#2a2a2a';
    roundRect(-12, -72, 24, 58, 4);
    ctx.fill();
    
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    roundRect(-12, -72, 24, 58, 4);
    ctx.stroke();
    
    ctx.fillStyle = '#1a1a1a';
    roundRect(-9, -69, 18, 52, 3);
    ctx.fill();
    
    const states = ['red', 'yellow', 'green'];
    states.forEach((s, i) => {
        const ly = -57 + i * 16;
        const isOn = state === s;
        
        if (isOn) {
            ctx.fillStyle = lightColors[s].on + '30';
            ctx.beginPath();
            ctx.arc(0, ly, 14, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.beginPath();
        ctx.arc(0, ly, 6, 0, Math.PI * 2);
        ctx.fillStyle = isOn ? lightColors[s].on : lightColors[s].off;
        ctx.fill();
        
        if (isOn) {
            ctx.beginPath();
            ctx.arc(-2, ly - 2, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        }
    });
    
    ctx.restore();
}

function drawStreetlightVehicles() {
    const sorted = [...vehicles].filter(v => v.type === 'streetlight').sort((a, b) => a.y - b.y);

    sorted.forEach(v => {
        const roadConfig = v.road === 'A' ? roadA : roadB;
        
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(roadConfig.angle);
        
        drawCarBody(v);
        
        ctx.restore();
    });
}

// =============================================================================
// ROUNDABOUT SIMULATION
// =============================================================================

function spawnRoundaboutVehicle(entry) {
    const hues = [0, 30, 200, 220, 280, 340];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    
    const entryConfig = roundaboutEntries[entry];
    const spawnDist = roundabout.approachLength;
    const carWidth = 40;
    const minSpawnGap = 8;
    
    // Check if there's already a car too close to spawn point on this entry
    const carsOnEntry = vehicles.filter(v => v.type === 'roundabout' && v.entry === entry && v.state === 'approaching');
    for (const other of carsOnEntry) {
        if (other.approachProgress < carWidth + minSpawnGap) {
            return;
        }
    }
    
    const initialSpeed = config.carSpeed * 0.4;
    
    // Calculate spawn position
    const spawnX = roundabout.centerX + Math.cos(entryConfig.angle) * (roundabout.radius + spawnDist);
    const spawnY = roundabout.centerY + Math.sin(entryConfig.angle) * (roundabout.radius + spawnDist);
    
    vehicles.push({
        type: 'roundabout',
        entry: entry,
        exitAngle: entryConfig.exitAngle,
        state: 'approaching', // 'approaching', 'waiting', 'in_roundabout', 'exiting'
        approachProgress: 0,
        circleAngle: entryConfig.angle, // Current angle in the roundabout
        exitProgress: 0,
        x: spawnX,
        y: spawnY,
        width: carWidth,
        height: 20,
        speed: initialSpeed,
        hue: hue,
        waiting: false,
        waitStartTime: null,
        reactionDelay: 0,
        reactionTimer: 0,
        canGo: true,
        gapWaitTimer: 0 // Timer for gap acceptance
    });
}

function canEnterRoundabout(vehicle) {
    const entryAngle = roundaboutEntries[vehicle.entry].angle;
    
    // Minimum angular gap required (in radians)
    // Reduced for better flow - cars need space but not excessive
    const minAngularGap = config.realisticMode ? 0.5 : 0.35; // ~30-20 degrees
    
    // Check all vehicles currently in the roundabout
    for (const other of vehicles) {
        if (other === vehicle) continue;
        if (other.type !== 'roundabout') continue;
        if (other.state !== 'in_roundabout') continue;
        
        // Calculate angular distance from this car to the entry point
        let angleDiff = other.circleAngle - entryAngle;
        
        // Normalize to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        // Check if car is too close to entry point
        // We need space both behind (approaching) and just ahead (just passed)
        // More symmetric check - block if car is within gap zone in either direction
        const gapBehind = minAngularGap * 0.7; // Space needed from behind
        const gapAhead = minAngularGap * 0.3;  // Space needed from ahead
        
        if (angleDiff > -gapBehind && angleDiff < gapAhead) {
            return false;
        }
    }
    
    return true;
}

function updateRoundaboutVehicles(dt) {
    const minGap = 15;
    const safeGap = minGap + 25;
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        if (v.type !== 'roundabout') continue;
        
        const entryConfig = roundaboutEntries[v.entry];
        
        // Update reaction timer
        if (config.realisticMode && v.reactionDelay > 0) {
            v.reactionTimer += dt;
            if (v.reactionTimer >= v.reactionDelay) {
                v.canGo = true;
                v.reactionDelay = 0;
            }
        }
        
        if (v.state === 'approaching') {
            // Define stop distance before entry point
            const stopDistanceBeforeEntry = 50; // Distance to stop before roundabout edge
            const stopProgress = roundabout.approachLength - stopDistanceBeforeEntry;
            
            // Find car ahead on same approach
            let carAhead = null;
            let gapToCarAhead = Infinity;
            
            for (const other of vehicles) {
                if (other !== v && other.type === 'roundabout' && other.entry === v.entry) {
                    if (other.state === 'approaching' && other.approachProgress > v.approachProgress) {
                        const gap = other.approachProgress - v.approachProgress - v.width;
                        if (gap > 0 && gap < gapToCarAhead) {
                            gapToCarAhead = gap;
                            carAhead = other;
                        }
                    } else if (other.state === 'waiting') {
                        // Waiting car is at stopProgress, calculate gap to that point
                        const gap = stopProgress - v.approachProgress - v.width;
                        if (gap > 0 && gap < gapToCarAhead) {
                            gapToCarAhead = gap;
                            carAhead = other;
                        }
                    }
                }
            }
            
            // Check if reached stop point
            const distToStop = stopProgress - v.approachProgress;
            
            let shouldStop = false;
            let shouldSlow = false;
            
            // Check if we need to stop before entry
            if (distToStop <= 0) {
                // At or past stop point - check for gap
                if (!canEnterRoundabout(v)) {
                    shouldStop = true;
                    // Clamp progress to stop point to prevent going further
                    if (v.approachProgress > stopProgress) {
                        v.approachProgress = stopProgress;
                    }
                    // Transition to waiting if not already
                    if (v.state !== 'waiting') {
                        v.state = 'waiting';
                    }
                    if (!v.waiting) {
                        v.waiting = true;
                        v.waitStartTime = performance.now();
                    }
                } else {
                    // Can enter - continue to entry point
                    if (v.approachProgress >= roundabout.approachLength) {
                        v.state = 'in_roundabout';
                        v.circleAngle = entryConfig.angle;
                        v.speed = config.carSpeed * 0.4; // Enter with some speed
                        if (v.waiting) {
                            if (v.waitStartTime) {
                                const waitTime = (performance.now() - v.waitStartTime) / 1000;
                                metrics.waitTimes.push(waitTime);
                                if (metrics.waitTimes.length > metrics.maxSamples) {
                                    metrics.waitTimes.shift();
                                }
                            }
                            v.waiting = false;
                        }
                    }
                }
            } else if (gapToCarAhead < minGap) {
                shouldStop = true;
            } else if (gapToCarAhead < safeGap) {
                shouldSlow = true;
            }
            
            // Apply acceleration/deceleration
            if (shouldStop) {
                v.speed = Math.max(0, v.speed - 600 * dt);
            } else if (shouldSlow) {
                const targetSpeed = carAhead ? Math.min(carAhead.speed, config.carSpeed * 0.6) : config.carSpeed * 0.6;
                if (v.speed > targetSpeed) {
                    v.speed = Math.max(targetSpeed, v.speed - 300 * dt);
                }
            } else {
                const accel = config.realisticMode ? 200 : 400;
                v.speed = Math.min(config.carSpeed, v.speed + accel * dt);
            }
            
            // Update position (only if still approaching)
            if (v.state === 'approaching') {
                v.approachProgress += v.speed * dt;
                // Clamp to prevent going past stop point if can't enter
                if (v.approachProgress > stopProgress && !canEnterRoundabout(v)) {
                    v.approachProgress = stopProgress;
                }
            }
            
            // Hard collision prevention - don't pass car ahead
            if (carAhead) {
                let carAheadProgress;
                if (carAhead.state === 'approaching') {
                    carAheadProgress = carAhead.approachProgress;
                } else if (carAhead.state === 'waiting') {
                    carAheadProgress = stopProgress;
                } else {
                    carAheadProgress = roundabout.approachLength;
                }
                
                const myFront = v.approachProgress + v.width / 2;
                const theirBack = carAheadProgress - carAhead.width / 2;
                if (myFront > theirBack - minGap) {
                    v.approachProgress = theirBack - minGap - v.width / 2;
                    v.speed = Math.min(v.speed, carAhead.speed || 0);
                }
            }
            
            // Calculate position along approach road (consistent for both approaching and waiting)
            const distFromCenter = roundabout.radius + (roundabout.approachLength - v.approachProgress);
            v.x = roundabout.centerX + Math.cos(entryConfig.angle) * distFromCenter;
            v.y = roundabout.centerY + Math.sin(entryConfig.angle) * distFromCenter;
            
        } else if (v.state === 'waiting') {
            // Waiting at stop point - check for gap
            v.gapWaitTimer += dt;
            v.speed = 0; // Ensure stopped
            
            // Set reaction threshold once when starting to wait
            if (!v.reactionThreshold) {
                v.reactionThreshold = config.realisticMode ? (0.3 + Math.random() * 0.5) : 0.1;
            }
            
            if (canEnterRoundabout(v)) {
                // Check reaction delay
                if (v.gapWaitTimer >= v.reactionThreshold) {
                    // Can enter - transition back to approaching to move forward
                    v.state = 'approaching';
                    v.gapWaitTimer = 0;
                    v.reactionThreshold = null;
                    v.speed = config.carSpeed * 0.3; // Start moving
                }
            } else {
                // Gap closed, reset timer
                v.gapWaitTimer = 0;
            }
            
            // Position is already calculated in the approaching state logic above
            // (using the same calculation for consistency)
            
        } else if (v.state === 'in_roundabout') {
            // Moving through roundabout (clockwise = increasing angle)
            
            // Find car ahead in the roundabout (clockwise direction)
            let carAheadInRoundabout = null;
            let angularGapAhead = Infinity;
            
            for (const other of vehicles) {
                if (other === v) continue;
                if (other.type !== 'roundabout') continue;
                if (other.state !== 'in_roundabout') continue;
                
                // Calculate angular distance to car ahead (clockwise)
                // Car ahead has a LARGER angle (or wrapped around)
                let gap = other.circleAngle - v.circleAngle;
                
                // Normalize to 0 to 2*PI
                while (gap < 0) gap += Math.PI * 2;
                while (gap > Math.PI * 2) gap -= Math.PI * 2;
                
                // Only consider cars ahead (small positive gap, not behind)
                if (gap > 0 && gap < Math.PI && gap < angularGapAhead) {
                    angularGapAhead = gap;
                    carAheadInRoundabout = other;
                }
            }
            
            // Convert angular gap to linear distance
            const linearGapAhead = angularGapAhead * roundabout.radius;
            const minGapRoundabout = 25; // Minimum gap in roundabout
            const safeGapRoundabout = 50;
            
            // Determine speed based on gap
            let shouldStop = linearGapAhead < minGapRoundabout;
            let shouldSlow = linearGapAhead < safeGapRoundabout && !shouldStop;
            
            const accel = config.realisticMode ? 150 : 300;
            const targetSpeed = config.carSpeed * 0.75; // Slightly slower in roundabout
            
            if (shouldStop) {
                v.speed = Math.max(0, v.speed - 400 * dt);
            } else if (shouldSlow) {
                const slowSpeed = carAheadInRoundabout ? carAheadInRoundabout.speed * 0.9 : targetSpeed * 0.5;
                if (v.speed > slowSpeed) {
                    v.speed = Math.max(slowSpeed, v.speed - 200 * dt);
                }
            } else if (v.speed < targetSpeed) {
                v.speed = Math.min(targetSpeed, v.speed + accel * dt);
            }
            
            // Angular movement
            const angularSpeed = v.speed / roundabout.radius;
            v.circleAngle += angularSpeed * dt;
            
            // Normalize angle
            while (v.circleAngle > Math.PI) v.circleAngle -= Math.PI * 2;
            while (v.circleAngle < -Math.PI) v.circleAngle += Math.PI * 2;
            
            // Hard collision prevention - don't pass car ahead
            if (carAheadInRoundabout && linearGapAhead < minGapRoundabout) {
                // Snap back to safe distance
                const safeAngle = carAheadInRoundabout.circleAngle - (minGapRoundabout / roundabout.radius);
                v.circleAngle = safeAngle;
                v.speed = Math.min(v.speed, carAheadInRoundabout.speed);
            }
            
            // Update position
            v.x = roundabout.centerX + Math.cos(v.circleAngle) * roundabout.radius;
            v.y = roundabout.centerY + Math.sin(v.circleAngle) * roundabout.radius;
            
            // Check if reached exit
            let exitAngleDiff = Math.abs(v.circleAngle - v.exitAngle);
            if (exitAngleDiff > Math.PI) exitAngleDiff = Math.PI * 2 - exitAngleDiff;
            
            if (exitAngleDiff < 0.15) {
                v.state = 'exiting';
                v.exitProgress = 0;
                metrics.carsPassedThisGreen++;
            }
            
        } else if (v.state === 'exiting') {
            // Exiting the roundabout
            const accel = config.realisticMode ? 200 : 400;
            v.speed = Math.min(config.carSpeed, v.speed + accel * dt);
            
            v.exitProgress += v.speed * dt;
            
            // Calculate position along exit road
            const distFromCenter = roundabout.radius + v.exitProgress;
            v.x = roundabout.centerX + Math.cos(v.exitAngle) * distFromCenter;
            v.y = roundabout.centerY + Math.sin(v.exitAngle) * distFromCenter;
            
            // Remove when far enough
            if (v.exitProgress > roundabout.approachLength) {
                vehicles.splice(i, 1);
            }
        }
    }
}

function drawRoundaboutRoad() {
    ctx.save();
    
    const rb = roundabout;
    
    // Draw approach roads first (so roundabout goes on top)
    // Top approach (entry)
    drawApproachRoad(-Math.PI / 2, rb.approachLength);
    // Left approach (entry)
    drawApproachRoad(Math.PI, rb.approachLength);
    // Bottom exit
    drawApproachRoad(Math.PI / 2, rb.approachLength);
    // Right exit
    drawApproachRoad(0, rb.approachLength);
    
    // Shadow for roundabout
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.beginPath();
    ctx.arc(rb.centerX + 5, rb.centerY + 5, rb.radius + roadWidth / 2, 0, Math.PI * 2);
    ctx.arc(rb.centerX + 5, rb.centerY + 5, rb.radius - roadWidth / 2, 0, Math.PI * 2, true);
    ctx.fill();
    
    // Outer road surface
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.arc(rb.centerX, rb.centerY, rb.radius + roadWidth / 2, 0, Math.PI * 2);
    ctx.arc(rb.centerX, rb.centerY, rb.radius - roadWidth / 2, 0, Math.PI * 2, true);
    ctx.fill();
    
    // Road edges
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rb.centerX, rb.centerY, rb.radius + roadWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rb.centerX, rb.centerY, rb.radius - roadWidth / 2, 0, Math.PI * 2);
    ctx.stroke();
    
    // Center island
    ctx.fillStyle = '#a8d5a2'; // Green grass
    ctx.beginPath();
    ctx.arc(rb.centerX, rb.centerY, rb.innerRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Center island border
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rb.centerX, rb.centerY, rb.innerRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Yield lines at entries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    
    // Top entry yield line
    drawYieldLine(-Math.PI / 2);
    // Left entry yield line
    drawYieldLine(Math.PI);
    
    ctx.setLineDash([]);
    
    // Direction arrows in roundabout
    drawRoundaboutArrows();
    
    ctx.restore();
}

function drawApproachRoad(angle, length) {
    const rb = roundabout;
    const halfWidth = roadWidth / 2;
    
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const perpX = -dirY * halfWidth;
    const perpY = dirX * halfWidth;
    
    const startX = rb.centerX + dirX * (rb.radius - roadWidth / 2);
    const startY = rb.centerY + dirY * (rb.radius - roadWidth / 2);
    const endX = rb.centerX + dirX * (rb.radius + length);
    const endY = rb.centerY + dirY * (rb.radius + length);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.moveTo(startX + perpX + 4, startY + perpY + 4);
    ctx.lineTo(endX + perpX + 4, endY + perpY + 4);
    ctx.lineTo(endX - perpX + 4, endY - perpY + 4);
    ctx.lineTo(startX - perpX + 4, startY - perpY + 4);
    ctx.closePath();
    ctx.fill();
    
    // Road surface
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(startX + perpX, startY + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(startX - perpX, startY - perpY);
    ctx.closePath();
    ctx.fill();
    
    // Road edges
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX + perpX, startY + perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.moveTo(startX - perpX, startY - perpY);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.stroke();
    
    // Center line (dashed)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    ctx.moveTo(startX + dirX * 20, startY + dirY * 20);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawYieldLine(angle) {
    const rb = roundabout;
    const halfWidth = roadWidth / 2 - 3;
    
    const dist = rb.radius - 5;
    const centerX = rb.centerX + Math.cos(angle) * dist;
    const centerY = rb.centerY + Math.sin(angle) * dist;
    
    const perpX = -Math.sin(angle) * halfWidth;
    const perpY = Math.cos(angle) * halfWidth;
    
    ctx.beginPath();
    ctx.moveTo(centerX + perpX, centerY + perpY);
    ctx.lineTo(centerX - perpX, centerY - perpY);
    ctx.stroke();
}

function drawRoundaboutArrows() {
    const rb = roundabout;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    
    // Draw arrows at 4 points around the circle
    const arrowAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    
    arrowAngles.forEach(angle => {
        ctx.save();
        ctx.translate(
            rb.centerX + Math.cos(angle) * rb.radius,
            rb.centerY + Math.sin(angle) * rb.radius
        );
        // Rotate to point clockwise (tangent direction + 90)
        ctx.rotate(angle + Math.PI / 2);
        
        // Draw arrow
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 4);
        ctx.lineTo(2, 4);
        ctx.lineTo(2, 8);
        ctx.lineTo(-2, 8);
        ctx.lineTo(-2, 4);
        ctx.lineTo(-6, 4);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    });
}

function drawRoundaboutVehicles() {
    const sorted = [...vehicles].filter(v => v.type === 'roundabout').sort((a, b) => a.y - b.y);

    sorted.forEach(v => {
        ctx.save();
        ctx.translate(v.x, v.y);
        
        // Calculate rotation based on state
        // Car front points in +X direction in local coords, so rotation = travel direction
        let rotation = 0;
        const entryAngle = roundaboutEntries[v.entry].angle;
        
        if (v.state === 'approaching' || v.state === 'waiting') {
            // Travel direction is TOWARD center (opposite of entry angle direction)
            // Entry angle points FROM center TO entry point
            // So travel direction = entry angle + PI (pointing toward center)
            rotation = entryAngle + Math.PI;
        } else if (v.state === 'in_roundabout') {
            // Tangent to circle - for clockwise motion, tangent is perpendicular
            // At angle 0 (right), clockwise tangent points DOWN (PI/2)
            // At angle PI/2 (bottom), clockwise tangent points LEFT (PI)
            // So tangent = circleAngle + PI/2
            rotation = v.circleAngle + Math.PI / 2;
        } else if (v.state === 'exiting') {
            // Travel direction is AWAY from center (same as exit angle direction)
            rotation = v.exitAngle;
        }
        
        ctx.rotate(rotation);
        
        drawCarBody(v);
        
        ctx.restore();
    });
}

// =============================================================================
// SHARED DRAWING
// =============================================================================

function drawCarBody(v) {
    const vx = -v.width / 2;
    const vy = -v.height / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.beginPath();
    ctx.ellipse(4, vy + v.height + 5, v.width / 2 - 2, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyColor = `hsl(${v.hue}, 45%, 60%)`;
    const darkColor = `hsl(${v.hue}, 45%, 45%)`;
    const lightColor = `hsl(${v.hue}, 45%, 75%)`;

    // Body bottom
    ctx.fillStyle = darkColor;
    roundRect(vx, vy + v.height * 0.4, v.width, v.height * 0.6, 5);
    ctx.fill();

    // Body top
    ctx.fillStyle = bodyColor;
    roundRect(vx + 2, vy, v.width - 4, v.height * 0.65, 6);
    ctx.fill();

    // Hood
    ctx.fillStyle = lightColor;
    roundRect(vx + v.width * 0.25, vy + 2, v.width * 0.4, v.height * 0.3, 4);
    ctx.fill();

    // Windshield
    ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
    roundRect(vx + v.width * 0.55, vy + 3, v.width * 0.28, v.height * 0.3, 3);
    ctx.fill();

    // Wheels
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(vx + 8, vy + v.height - 2, 4, 0, Math.PI * 2);
    ctx.arc(vx + v.width - 8, vy + v.height - 2, 4, 0, Math.PI * 2);
    ctx.fill();
}

// =============================================================================
// METRICS FUNCTIONS
// =============================================================================

function getQueueLength() {
    if (config.simulationType === 'streetlight') {
        // Streetlight: count cars waiting at the light
        return vehicles.filter(v => v.waiting).length;
    } else {
        // Roundabout: count cars waiting to enter + cars approaching but stopped/slowed
        return vehicles.filter(v => {
            if (v.type !== 'roundabout') return false;
            // Count cars in waiting state (stopped at entry)
            if (v.state === 'waiting') return true;
            // Count cars approaching but stopped or very slow (effectively queued)
            if (v.state === 'approaching' && v.speed < 10) return true;
            return false;
        }).length;
    }
}

function getAvgWaitTime() {
    if (metrics.waitTimes.length === 0) return 0;
    const sum = metrics.waitTimes.reduce((a, b) => a + b, 0);
    return sum / metrics.waitTimes.length;
}

function updateMetricsDisplay() {
    document.getElementById('queueLength').textContent = getQueueLength();
    document.getElementById('avgWaitTime').textContent = getAvgWaitTime().toFixed(1) + 's';
    document.getElementById('carsPassedCurrent').textContent = metrics.carsPassedThisGreen;
    document.getElementById('carsPassedLastGreen').textContent = metrics.carsPassedLastGreen;
}

function updateLongTermStats(dt) {
    const stats = getCurrentStats();
    const queueLen = getQueueLength();
    
    stats.simTime += dt;
    
    if (queueLen > stats.peakQueue) {
        stats.peakQueue = queueLen;
    }
    
    if (stats.queueSamples.length === 0 || stats.simTime % 0.5 < dt) {
        stats.queueSamples.push(queueLen);
        if (stats.queueSamples.length > 1000) {
            stats.queueSamples.shift();
        }
    }
    
    // Track utilization (for streetlight: green time, for roundabout: always count)
    if (config.simulationType === 'streetlight') {
        if (light.state === 'green') {
            stats.totalGreenTime += dt;
            const passing = vehicles.some(v => {
                const frontProgress = v.progress + v.width / 2;
                return frontProgress > 530 && frontProgress < 620;
            });
            if (passing) {
                stats.greenTimeUsed += dt;
            }
        }
    } else {
        // Roundabout: count as "utilized" when cars are in roundabout
        stats.totalGreenTime += dt;
        const inRoundabout = vehicles.some(v => v.type === 'roundabout' && v.state === 'in_roundabout');
        if (inRoundabout) {
            stats.greenTimeUsed += dt;
        }
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateLongTermDisplay() {
    const slr = longTermStats.streetlight.realistic;
    const slp = longTermStats.streetlight.perfect;
    const rbr = longTermStats.roundabout.realistic;
    const rbp = longTermStats.roundabout.perfect;
    
    // Total cars passed
    document.getElementById('totalCarsSLR').textContent = slr.totalCarsPassed;
    document.getElementById('totalCarsSLP').textContent = slp.totalCarsPassed;
    document.getElementById('totalCarsRBR').textContent = rbr.totalCarsPassed;
    document.getElementById('totalCarsRBP').textContent = rbp.totalCarsPassed;
    
    // Throughput
    document.getElementById('throughputSLR').textContent = slr.simTime > 0 ? (slr.totalCarsPassed / slr.simTime * 60).toFixed(1) : '0.0';
    document.getElementById('throughputSLP').textContent = slp.simTime > 0 ? (slp.totalCarsPassed / slp.simTime * 60).toFixed(1) : '0.0';
    document.getElementById('throughputRBR').textContent = rbr.simTime > 0 ? (rbr.totalCarsPassed / rbr.simTime * 60).toFixed(1) : '0.0';
    document.getElementById('throughputRBP').textContent = rbp.simTime > 0 ? (rbp.totalCarsPassed / rbp.simTime * 60).toFixed(1) : '0.0';
    
    // Peak queue
    document.getElementById('peakQueueSLR').textContent = slr.peakQueue;
    document.getElementById('peakQueueSLP').textContent = slp.peakQueue;
    document.getElementById('peakQueueRBR').textContent = rbr.peakQueue;
    document.getElementById('peakQueueRBP').textContent = rbp.peakQueue;
    
    // Avg cars per cycle
    document.getElementById('avgCycleSLR').textContent = slr.totalCycles > 0 ? (slr.carsPerCycleSum / slr.totalCycles).toFixed(1) : '0.0';
    document.getElementById('avgCycleSLP').textContent = slp.totalCycles > 0 ? (slp.carsPerCycleSum / slp.totalCycles).toFixed(1) : '0.0';
    document.getElementById('avgCycleRBR').textContent = rbr.totalCycles > 0 ? (rbr.carsPerCycleSum / rbr.totalCycles).toFixed(1) : '-';
    document.getElementById('avgCycleRBP').textContent = rbp.totalCycles > 0 ? (rbp.carsPerCycleSum / rbp.totalCycles).toFixed(1) : '-';
    
    // Avg queue
    document.getElementById('avgQueueSLR').textContent = slr.queueSamples.length > 0 ? (slr.queueSamples.reduce((a, b) => a + b, 0) / slr.queueSamples.length).toFixed(1) : '0.0';
    document.getElementById('avgQueueSLP').textContent = slp.queueSamples.length > 0 ? (slp.queueSamples.reduce((a, b) => a + b, 0) / slp.queueSamples.length).toFixed(1) : '0.0';
    document.getElementById('avgQueueRBR').textContent = rbr.queueSamples.length > 0 ? (rbr.queueSamples.reduce((a, b) => a + b, 0) / rbr.queueSamples.length).toFixed(1) : '0.0';
    document.getElementById('avgQueueRBP').textContent = rbp.queueSamples.length > 0 ? (rbp.queueSamples.reduce((a, b) => a + b, 0) / rbp.queueSamples.length).toFixed(1) : '0.0';
    
    // Sim time
    document.getElementById('simTimeSLR').textContent = formatTime(slr.simTime);
    document.getElementById('simTimeSLP').textContent = formatTime(slp.simTime);
    document.getElementById('simTimeRBR').textContent = formatTime(rbr.simTime);
    document.getElementById('simTimeRBP').textContent = formatTime(rbp.simTime);
    
    // Utilization
    document.getElementById('utilizationSLR').textContent = slr.totalGreenTime > 0 ? (slr.greenTimeUsed / slr.totalGreenTime * 100).toFixed(0) + '%' : '0%';
    document.getElementById('utilizationSLP').textContent = slp.totalGreenTime > 0 ? (slp.greenTimeUsed / slp.totalGreenTime * 100).toFixed(0) + '%' : '0%';
    document.getElementById('utilizationRBR').textContent = rbr.totalGreenTime > 0 ? (rbr.greenTimeUsed / rbr.totalGreenTime * 100).toFixed(0) + '%' : '0%';
    document.getElementById('utilizationRBP').textContent = rbp.totalGreenTime > 0 ? (rbp.greenTimeUsed / rbp.totalGreenTime * 100).toFixed(0) + '%' : '0%';
}

// =============================================================================
// GRAPH FUNCTIONS
// =============================================================================

function drawGraph(graphCtx, graphCanvas, data, color) {
    const w = graphCanvas.width;
    const h = graphCanvas.height;
    const padding = 4;
    
    graphCtx.clearRect(0, 0, w, h);
    
    if (data.length < 2) return;
    
    const max = Math.max(...data, 1);
    
    graphCtx.beginPath();
    graphCtx.moveTo(padding, h - padding);
    
    data.forEach((val, i) => {
        const x = padding + (i / (graphData.maxPoints - 1)) * (w - padding * 2);
        const y = h - padding - (val / max) * (h - padding * 2);
        graphCtx.lineTo(x, y);
    });
    
    graphCtx.lineTo(padding + ((data.length - 1) / (graphData.maxPoints - 1)) * (w - padding * 2), h - padding);
    graphCtx.closePath();
    graphCtx.fillStyle = color + '20';
    graphCtx.fill();
    
    graphCtx.beginPath();
    data.forEach((val, i) => {
        const x = padding + (i / (graphData.maxPoints - 1)) * (w - padding * 2);
        const y = h - padding - (val / max) * (h - padding * 2);
        if (i === 0) graphCtx.moveTo(x, y);
        else graphCtx.lineTo(x, y);
    });
    graphCtx.strokeStyle = color;
    graphCtx.lineWidth = 1.5;
    graphCtx.stroke();
    
    if (data.length >= 5) {
        const n = data.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        data.forEach((val, i) => {
            sumX += i;
            sumY += val;
            sumXY += i * val;
            sumX2 += i * i;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        const startY = intercept;
        const endY = slope * (n - 1) + intercept;
        
        const x1 = padding;
        const y1 = h - padding - (Math.max(0, startY) / max) * (h - padding * 2);
        const x2 = padding + ((n - 1) / (graphData.maxPoints - 1)) * (w - padding * 2);
        const y2 = h - padding - (Math.max(0, endY) / max) * (h - padding * 2);
        
        graphCtx.beginPath();
        graphCtx.moveTo(x1, Math.min(h - padding, Math.max(padding, y1)));
        graphCtx.lineTo(x2, Math.min(h - padding, Math.max(padding, y2)));
        graphCtx.strokeStyle = color + '80';
        graphCtx.lineWidth = 2;
        graphCtx.setLineDash([4, 4]);
        graphCtx.stroke();
        graphCtx.setLineDash([]);
    }
}

function updateGraphs(dt) {
    graphData.timer += dt;
    
    if (graphData.timer >= graphData.updateInterval) {
        graphData.timer = 0;
        
        graphData.queue.push(getQueueLength());
        graphData.wait.push(getAvgWaitTime());
        graphData.current.push(metrics.carsPassedThisGreen);
        graphData.cycle.push(metrics.carsPassedLastGreen);
        
        if (graphData.queue.length > graphData.maxPoints) graphData.queue.shift();
        if (graphData.wait.length > graphData.maxPoints) graphData.wait.shift();
        if (graphData.current.length > graphData.maxPoints) graphData.current.shift();
        if (graphData.cycle.length > graphData.maxPoints) graphData.cycle.shift();
        
        drawGraph(queueCtx, queueGraph, graphData.queue, '#6b9eff');
        drawGraph(waitCtx, waitGraph, graphData.wait, '#ff9f6b');
        drawGraph(currentCtx, currentGraph, graphData.current, '#6bcb77');
        drawGraph(cycleCtx, cycleGraph, graphData.cycle, '#cb6b9f');
    }
}

// =============================================================================
// SIMULATION SWITCHING
// =============================================================================

function switchSimulation(type) {
    config.simulationType = type;
    
    // Clear all vehicles
    vehicles.length = 0;
    
    // Reset spawn timer
    spawnTimerA = 0;
    
    // Reset current metrics (but keep long-term stats)
    metrics.carsPassedThisGreen = 0;
    metrics.carsPassedLastGreen = 0;
    metrics.waitTimes = [];
    
    // Reset light state for streetlight
    if (type === 'streetlight') {
        light.state = 'green';
        light.timer = 0;
        light.activeRoad = 'A';
    }
    
    // Update tab UI
    document.getElementById('streetlightTab').classList.toggle('active', type === 'streetlight');
    document.getElementById('roundaboutTab').classList.toggle('active', type === 'roundabout');
    
    // Update light duration control visibility
    const lightDurationControl = document.getElementById('lightDurationControl');
    if (lightDurationControl) {
        lightDurationControl.style.display = type === 'streetlight' ? 'flex' : 'none';
    }
}

// =============================================================================
// CONTROLS SETUP
// =============================================================================

function setupControls() {
    document.getElementById('spawnRate').addEventListener('input', (e) => {
        config.spawnRate = parseFloat(e.target.value);
        document.getElementById('spawnRateValue').textContent = config.spawnRate.toFixed(1) + '/s';
    });
    
    document.getElementById('carSpeed').addEventListener('input', (e) => {
        config.carSpeed = parseInt(e.target.value);
        document.getElementById('carSpeedValue').textContent = config.carSpeed;
    });
    
    document.getElementById('lightDuration').addEventListener('input', (e) => {
        config.lightDuration = parseFloat(e.target.value);
        document.getElementById('lightDurationValue').textContent = config.lightDuration + 's';
    });
    
    document.getElementById('realisticBtn').addEventListener('click', () => {
        config.realisticMode = true;
        document.getElementById('realisticBtn').classList.add('active');
        document.getElementById('perfectBtn').classList.remove('active');
        metrics.waitTimes = [];
    });
    
    document.getElementById('perfectBtn').addEventListener('click', () => {
        config.realisticMode = false;
        document.getElementById('perfectBtn').classList.add('active');
        document.getElementById('realisticBtn').classList.remove('active');
        metrics.waitTimes = [];
    });
    
    // Tab switching
    document.getElementById('streetlightTab').addEventListener('click', () => {
        switchSimulation('streetlight');
    });
    
    document.getElementById('roundaboutTab').addEventListener('click', () => {
        switchSimulation('roundabout');
    });
}

// =============================================================================
// MAIN LOOP
// =============================================================================

let lastTime = 0;

function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (config.simulationType === 'streetlight') {
        // Streetlight spawning - random road selection
        spawnTimerA += dt;
        if (spawnTimerA > 1 / config.spawnRate) {
            spawnTimerA = 0;
            const road = Math.random() < 0.5 ? 'A' : 'B';
            spawnStreetlightVehicle(road);
        }

        updateStreetlight(dt);
        updateStreetlightVehicles(dt);
    } else {
        // Roundabout spawning - random entry selection
        spawnTimerA += dt;
        if (spawnTimerA > 1 / config.spawnRate) {
            spawnTimerA = 0;
            const entry = Math.random() < 0.5 ? 'top' : 'left';
            spawnRoundaboutVehicle(entry);
        }

        updateRoundaboutVehicles(dt);
        
        // Update cycle counter for roundabout (every 10 seconds)
        if (Math.floor((time / 1000) % 10) === 0 && Math.floor(((time - dt * 1000) / 1000) % 10) !== 0) {
            const stats = getCurrentStats();
            stats.totalCarsPassed += metrics.carsPassedThisGreen;
            stats.totalCycles++;
            stats.carsPerCycleSum += metrics.carsPassedThisGreen;
            metrics.carsPassedLastGreen = metrics.carsPassedThisGreen;
            metrics.carsPassedThisGreen = 0;
        }
    }

    updateLongTermStats(dt);
    updateMetricsDisplay();
    updateLongTermDisplay();
    updateGraphs(dt);

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (config.simulationType === 'streetlight') {
        drawStreetlightRoad();
        drawStreetlightVehicles();
        drawStreetlightLights();
    } else {
        drawRoundaboutRoad();
        drawRoundaboutVehicles();
    }

    requestAnimationFrame(loop);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

function initGraphs() {
    queueGraph = document.getElementById('queueGraph');
    waitGraph = document.getElementById('waitGraph');
    currentGraph = document.getElementById('currentGraph');
    cycleGraph = document.getElementById('cycleGraph');
    
    queueCtx = queueGraph.getContext('2d');
    waitCtx = waitGraph.getContext('2d');
    currentCtx = currentGraph.getContext('2d');
    cycleCtx = cycleGraph.getContext('2d');
}

setupControls();
initGraphs();
requestAnimationFrame(loop);
