// Streetlight Simulator - With Reaction Delays

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
const config = {
    spawnRate: 1,
    carSpeed: 100,
    lightDuration: 10,
    realisticMode: true
};

// Road configuration - True Isometric
const roadWidth = 50;
const isoAngle = Math.PI / 6; // 30 degrees

// Intersection at center
const intersection = {
    x: 500,
    y: 200
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

// Traffic light system
const light = {
    activeRoad: 'A', // which road has green
    state: 'green',
    timer: 0,
    justTurnedGreen: false
};

// Get light state for a road
function getLightState(road) {
    if (road === light.activeRoad) {
        return light.state;
    }
    return 'red';
}

// Metrics
const metrics = {
    waitTimes: [],
    maxSamples: 50,
    carsPassedThisGreen: 0,
    carsPassedLastGreen: 0
};

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

// Vehicles array
const vehicles = [];
let spawnTimerA = 0;
let spawnTimerB = 0.5; // Offset so they don't spawn at exactly the same time

// Rounded rectangle helper
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

// Update traffic light
function updateLight(dt) {
    light.timer += dt;
    
    const greenDuration = config.lightDuration;
    const yellowDuration = 2;
    
    if (light.state === 'green' && light.timer >= greenDuration) {
        light.timer = 0;
        light.state = 'yellow';
    } else if (light.state === 'yellow' && light.timer >= yellowDuration) {
        light.timer = 0;
        light.state = 'red';
        // Save cars passed when cycle ends
        metrics.carsPassedLastGreen = metrics.carsPassedThisGreen;
        metrics.carsPassedThisGreen = 0;
    } else if (light.state === 'red' && light.timer >= 0.5) {
        // Brief all-red, then switch roads
        light.timer = 0;
        light.activeRoad = light.activeRoad === 'A' ? 'B' : 'A';
        light.state = 'green';
        light.justTurnedGreen = true;
    }
    
    // Handle reaction delays when light turns green
    if (light.justTurnedGreen) {
        light.justTurnedGreen = false;
        
        // Only affect cars on the road that just got green
        const carsOnActiveRoad = vehicles.filter(v => v.road === light.activeRoad);
        
        if (config.realisticMode) {
            // Realistic: staggered reaction delays based on queue position
            const stoppedCars = carsOnActiveRoad
                .filter(v => v.waiting)
                .sort((a, b) => b.progress - a.progress); // Higher progress = closer to intersection
            
            stoppedCars.forEach((v, index) => {
                // First car reacts faster, each subsequent car has cumulative delay
                // Simulates each driver waiting to see the car ahead move
                const baseDelay = index === 0 ? 0.2 : 0.5; // First car reacts quicker
                const randomDelay = 0.3 + Math.random() * 0.5; // 0.3-0.8s random per car
                const cumulativeDelay = index * (0.6 + Math.random() * 0.4); // Wave propagation
                
                v.reactionDelay = baseDelay + randomDelay + cumulativeDelay;
                v.reactionTimer = 0;
                v.canGo = false;
            });
        } else {
            // Perfect mode: everyone can go immediately
            carsOnActiveRoad.forEach(v => {
                v.reactionDelay = 0;
                v.reactionTimer = 0;
                v.canGo = true;
            });
        }
    }
}

// Spawn a new vehicle on a specific road
function spawnVehicle(road) {
    const hues = [0, 30, 200, 220, 280, 340];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    
    const roadConfig = road === 'A' ? roadA : roadB;
    const spawnDist = 600; // Distance from intersection to spawn (extended for more queue space)
    const carWidth = 40;
    const minSpawnGap = 8; // Just enough to prevent direct overlap
    
    // Check if there's already a car too close to spawn point
    const carsOnRoad = vehicles.filter(v => v.road === road);
    for (const other of carsOnRoad) {
        // Only prevent spawn if a car is literally at the spawn point
        if (other.progress < carWidth + minSpawnGap) {
            return; // Don't spawn, would overlap
        }
    }
    
    // Cars spawn at slower speed and accelerate naturally
    const initialSpeed = config.carSpeed * 0.4;
    
    vehicles.push({
        road: road,
        progress: 0, // Distance traveled along road
        x: intersection.x - spawnDist * roadConfig.dirX,
        y: intersection.y - spawnDist * roadConfig.dirY,
        width: carWidth,
        height: 20,
        speed: initialSpeed, // Start slower, will accelerate
        hue: hue,
        waiting: false,
        waitStartTime: null,
        reactionDelay: 0,
        reactionTimer: 0,
        canGo: true
    });
}

// Update vehicles
function updateVehicles(dt) {
    const minGap = 15; // Minimum gap between cars (bumper to bumper)
    const safeGap = minGap + 25; // Start slowing down at this gap
    const spawnDist = 600; // Match spawn distance
    const stopDist = roadWidth + 10; // Match where stop lines are drawn
    const stopProgress = spawnDist - stopDist; // Stop at the stop line
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        const roadConfig = v.road === 'A' ? roadA : roadB;
        const prevProgress = v.progress;
        
        // Update reaction timer
        if (config.realisticMode && v.reactionDelay > 0) {
            v.reactionTimer += dt;
            if (v.reactionTimer >= v.reactionDelay) {
                v.canGo = true;
                v.reactionDelay = 0;
            }
        }
        
        // Find closest vehicle ahead on same road
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
        
        // Determine stopping behavior
        const frontProgress = v.progress + v.width / 2;
        const atLight = frontProgress > stopProgress - 80 && frontProgress < stopProgress;
        const myLightState = getLightState(v.road);
        const lightIsRed = myLightState !== 'green';
        
        let shouldStop = false;
        let shouldSlow = false;
        
        if (config.realisticMode) {
            const shouldStopAtLight = lightIsRed && atLight;
            
            // Wait for reaction delay (wave effect through entire queue, not just at light)
            const waitingForReaction = !v.canGo && v.waiting;
            
            // Also wait if car ahead hasn't started moving yet
            const carAheadNotMoving = carAhead && !carAhead.canGo && carAhead.waiting;
            const carAheadStopped = carAhead && carAhead.speed < 5 && gapToCarAhead < 50;
            
            shouldStop = shouldStopAtLight || waitingForReaction || carAheadNotMoving || carAheadStopped || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        } else {
            const shouldStopAtLight = lightIsRed && atLight;
            
            shouldStop = shouldStopAtLight || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        }
        
        // Track waiting state for metrics
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
        
        // Apply acceleration/deceleration
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
        
        // Update progress and position
        v.progress += v.speed * dt;
        v.x = intersection.x - (spawnDist - v.progress) * roadConfig.dirX;
        v.y = intersection.y - (spawnDist - v.progress) * roadConfig.dirY;
        
        // Hard collision prevention
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
        
        // Track cars passing through intersection
        const prevFront = prevProgress + v.width / 2;
        const newFront = v.progress + v.width / 2;
        const myState = getLightState(v.road);
        
        if (prevFront <= spawnDist && newFront > spawnDist && (myState === 'green' || myState === 'yellow')) {
            metrics.carsPassedThisGreen++;
        }
        
        // Remove vehicles that have traveled far enough
        if (v.progress > spawnDist + 400) {
            vehicles.splice(i, 1);
        }
    }
}

// Calculate metrics
function getQueueLength() {
    return vehicles.filter(v => v.waiting).length;
}

function getAvgWaitTime() {
    if (metrics.waitTimes.length === 0) return 0;
    const sum = metrics.waitTimes.reduce((a, b) => a + b, 0);
    return sum / metrics.waitTimes.length;
}

// Update metrics display
function updateMetricsDisplay() {
    document.getElementById('queueLength').textContent = getQueueLength();
    document.getElementById('avgWaitTime').textContent = getAvgWaitTime().toFixed(1) + 's';
    document.getElementById('carsPassedCurrent').textContent = metrics.carsPassedThisGreen;
    document.getElementById('carsPassedLastGreen').textContent = metrics.carsPassedLastGreen;
}

// Draw a graph with trendline
function drawGraph(graphCtx, graphCanvas, data, color) {
    const w = graphCanvas.width;
    const h = graphCanvas.height;
    const padding = 4;
    
    graphCtx.clearRect(0, 0, w, h);
    
    if (data.length < 2) return;
    
    // Calculate max value
    const max = Math.max(...data, 1);
    
    // Draw area fill
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
    
    // Draw line
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
    
    // Draw trendline if enough data
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

// Update graphs
function updateGraphs(dt) {
    graphData.timer += dt;
    
    if (graphData.timer >= graphData.updateInterval) {
        graphData.timer = 0;
        
        // Add current values
        graphData.queue.push(getQueueLength());
        graphData.wait.push(getAvgWaitTime());
        graphData.current.push(metrics.carsPassedThisGreen);
        graphData.cycle.push(metrics.carsPassedLastGreen);
        
        // Trim to max points
        if (graphData.queue.length > graphData.maxPoints) graphData.queue.shift();
        if (graphData.wait.length > graphData.maxPoints) graphData.wait.shift();
        if (graphData.current.length > graphData.maxPoints) graphData.current.shift();
        if (graphData.cycle.length > graphData.maxPoints) graphData.cycle.shift();
        
        // Draw graphs
        drawGraph(queueCtx, queueGraph, graphData.queue, '#6b9eff');
        drawGraph(waitCtx, waitGraph, graphData.wait, '#ff9f6b');
        drawGraph(currentCtx, currentGraph, graphData.current, '#6bcb77');
        drawGraph(cycleCtx, cycleGraph, graphData.cycle, '#cb6b9f');
    }
}

// Draw a single isometric road
function drawIsometricRoad(roadConfig, length) {
    const halfWidth = roadWidth / 2;
    
    // Perpendicular direction for road width
    const perpX = -roadConfig.dirY * halfWidth;
    const perpY = roadConfig.dirX * halfWidth;
    
    // Start and end points
    const startX = intersection.x - length * roadConfig.dirX;
    const startY = intersection.y - length * roadConfig.dirY;
    const endX = intersection.x + length * roadConfig.dirX;
    const endY = intersection.y + length * roadConfig.dirY;
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.moveTo(startX + perpX + 5, startY + perpY + 5);
    ctx.lineTo(endX + perpX + 5, endY + perpY + 5);
    ctx.lineTo(endX - perpX + 5, endY - perpY + 5);
    ctx.lineTo(startX - perpX + 5, startY - perpY + 5);
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
    
    // Center line (dashed, skip intersection area)
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    // Before intersection
    ctx.moveTo(startX, startY);
    ctx.lineTo(intersection.x - 40 * roadConfig.dirX, intersection.y - 40 * roadConfig.dirY);
    // After intersection
    ctx.moveTo(intersection.x + 40 * roadConfig.dirX, intersection.y + 40 * roadConfig.dirY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
}

// Draw both roads
function drawRoad() {
    ctx.save();
    
    // Draw Road B first (behind, going up-right)
    drawIsometricRoad(roadB, 650);
    
    // Draw Road A (in front, going down-right)
    drawIsometricRoad(roadA, 650);
    
    // Intersection overlay (slightly darker)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    ctx.beginPath();
    ctx.arc(intersection.x, intersection.y, roadWidth * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Draw stop lines (under the cars)
    const stopDist = roadWidth + 10;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 4;

    // Stop line for Road A
    const stopAX = intersection.x - stopDist * roadA.dirX;
    const stopAY = intersection.y - stopDist * roadA.dirY;
    const perpAX = -roadA.dirY * (roadWidth / 2 - 3);
    const perpAY = roadA.dirX * (roadWidth / 2 - 3);
    ctx.beginPath();
    ctx.moveTo(stopAX + perpAX, stopAY + perpAY);
    ctx.lineTo(stopAX - perpAX, stopAY - perpAY);
    ctx.stroke();

    // Stop line for Road B
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

// Draw a single traffic light at a position (facing toward oncoming traffic)
function drawSingleLight(x, y, state, facingAngle) {
    ctx.save();
    ctx.translate(x, y);
    
    const lightColors = {
        red: { on: '#ff4444', off: '#3a2020' },
        yellow: { on: '#ffcc00', off: '#3a3520' },
        green: { on: '#44cc55', off: '#203a25' }
    };
    
    // Pole shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.beginPath();
    ctx.ellipse(4, 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pole
    ctx.fillStyle = '#666';
    ctx.fillRect(-3, -75, 6, 80);
    
    // Light box background (dark, solid)
    ctx.fillStyle = '#2a2a2a';
    roundRect(-12, -72, 24, 58, 4);
    ctx.fill();
    
    // Light box border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    roundRect(-12, -72, 24, 58, 4);
    ctx.stroke();
    
    // Inner panel
    ctx.fillStyle = '#1a1a1a';
    roundRect(-9, -69, 18, 52, 3);
    ctx.fill();
    
    // Lights (red on top, yellow middle, green bottom)
    const states = ['red', 'yellow', 'green'];
    states.forEach((s, i) => {
        const ly = -57 + i * 16;
        const isOn = state === s;
        
        // Glow effect when on
        if (isOn) {
            ctx.fillStyle = lightColors[s].on + '30';
            ctx.beginPath();
            ctx.arc(0, ly, 14, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Light circle
        ctx.beginPath();
        ctx.arc(0, ly, 6, 0, Math.PI * 2);
        ctx.fillStyle = isOn ? lightColors[s].on : lightColors[s].off;
        ctx.fill();
        
        // Highlight when on
        if (isOn) {
            ctx.beginPath();
            ctx.arc(-2, ly - 2, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
        }
    });
    
    ctx.restore();
}

// Draw traffic lights for both roads (Canadian style - lights on far side of intersection)
function drawLight() {
    const lightDist = roadWidth + 20; // Lights on far side (after intersection)
    
    // Light for Road A - positioned on FAR side of intersection (Canadian style)
    // On the RIGHT side of the road (from driver's perspective traveling along road)
    // Driver's right = (-dirY, dirX) when traveling in direction (dirX, dirY)
    const lightAX = intersection.x + lightDist * roadA.dirX - roadWidth * 0.7 * roadA.dirY;
    const lightAY = intersection.y + lightDist * roadA.dirY + roadWidth * 0.7 * roadA.dirX;
    drawSingleLight(lightAX, lightAY, getLightState('A'), 0);

    // Light for Road B - positioned on FAR side of intersection (Canadian style)
    // On the RIGHT side of the road (from driver's perspective)
    const lightBX = intersection.x + lightDist * roadB.dirX - roadWidth * 0.7 * roadB.dirY;
    const lightBY = intersection.y + lightDist * roadB.dirY + roadWidth * 0.7 * roadB.dirX;
    drawSingleLight(lightBX, lightBY, getLightState('B'), 0);
}

// Draw vehicles
function drawVehicles() {
    // Sort by y position for proper layering
    const sorted = [...vehicles].sort((a, b) => a.y - b.y);

    sorted.forEach(v => {
        const roadConfig = v.road === 'A' ? roadA : roadB;
        
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(roadConfig.angle);
        
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

        ctx.restore();
    });
}

// Setup controls
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
}

// Main loop
let lastTime = 0;

function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    // Spawn on Road A
    spawnTimerA += dt;
    if (spawnTimerA > 1 / config.spawnRate) {
        spawnTimerA = 0;
        spawnVehicle('A');
    }
    
    // Spawn on Road B
    spawnTimerB += dt;
    if (spawnTimerB > 1 / config.spawnRate) {
        spawnTimerB = 0;
        spawnVehicle('B');
    }

    updateLight(dt);
    updateVehicles(dt);
    updateMetricsDisplay();
    updateGraphs(dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    drawVehicles();
    drawLight(); // Draw lights LAST so they appear on top of roads

    requestAnimationFrame(loop);
}

// Initialize graphs
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