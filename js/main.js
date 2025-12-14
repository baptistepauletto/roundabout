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

// Road configuration
const roadY = 250;
const roadHeight = 60;
const roadAngle = -0.03;

// Traffic light
const light = {
    x: 500,
    state: 'green',
    timer: 0,
    justTurnedGreen: false
};

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
let spawnTimer = 0;

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

// Get Y position at X (for isometric road)
function getRoadY(x) {
    return roadY + (x - canvas.width / 2) * roadAngle;
}

// Update traffic light
function updateLight(dt) {
    light.timer += dt;
    
    const greenDuration = config.lightDuration;
    const yellowDuration = 2;
    const redDuration = config.lightDuration;
    
    if (light.state === 'green' && light.timer >= greenDuration) {
        light.timer = 0;
        light.state = 'yellow';
    } else if (light.state === 'yellow' && light.timer >= yellowDuration) {
        light.timer = 0;
        light.state = 'red';
        // Save cars passed when cycle ends (at red)
        metrics.carsPassedLastGreen = metrics.carsPassedThisGreen;
        metrics.carsPassedThisGreen = 0;
    } else if (light.state === 'red' && light.timer >= redDuration) {
        light.timer = 0;
        light.state = 'green';
        light.justTurnedGreen = true;
    }
    
    // Handle reaction delays when light turns green
    if (light.justTurnedGreen) {
        light.justTurnedGreen = false;
        
        if (config.realisticMode) {
            // Realistic: staggered reaction delays based on queue position
            const stoppedCars = vehicles
                .filter(v => v.waiting)
                .sort((a, b) => b.x - a.x);
            
            stoppedCars.forEach((v, index) => {
                v.reactionDelay = 0.3 + Math.random() * 0.5 + index * (0.4 + Math.random() * 0.6);
                v.reactionTimer = 0;
                v.canGo = false;
            });
        } else {
            // Perfect mode: everyone can go immediately
            vehicles.forEach(v => {
                v.reactionDelay = 0;
                v.reactionTimer = 0;
                v.canGo = true;
            });
        }
    }
}

// Spawn a new vehicle
function spawnVehicle() {
    const hues = [0, 30, 200, 220, 280, 340];
    const hue = hues[Math.floor(Math.random() * hues.length)];
    
    vehicles.push({
        x: -50,
        width: 44,
        height: 24,
        speed: config.carSpeed,
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
    const stopX = light.x - 50;
    const minGap = 10;
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        const front = v.x + v.width / 2;
        const prevX = v.x;
        
        // Update reaction timer (only in realistic mode)
        if (config.realisticMode && v.reactionDelay > 0) {
            v.reactionTimer += dt;
            if (v.reactionTimer >= v.reactionDelay) {
                v.canGo = true;
                v.reactionDelay = 0;
            }
        }
        
        // Find closest vehicle ahead (bumper to bumper)
        let carAhead = null;
        let gapToCarAhead = Infinity;
        for (const other of vehicles) {
            if (other !== v && other.x > v.x) {
                const myFront = v.x + v.width / 2;
                const theirBack = other.x - other.width / 2;
                const gap = theirBack - myFront;
                if (gap < gapToCarAhead) {
                    gapToCarAhead = gap;
                    carAhead = other;
                }
            }
        }
        
        // Determine stopping behavior
        const atLight = front > stopX - 100 && front < stopX;
        const lightIsRed = light.state !== 'green';
        const safeGap = minGap + 10;
        
        let shouldStop = false;
        let shouldSlow = false;
        
        if (config.realisticMode) {
            // REALISTIC MODE
            const shouldStopAtLight = lightIsRed && atLight;
            const waitingForReaction = atLight && !v.canGo;
            const carAheadStopped = carAhead && carAhead.speed < 5 && gapToCarAhead < 50;
            
            shouldStop = shouldStopAtLight || waitingForReaction || carAheadStopped || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        } else {
            // PERFECT MODE - all cars go together
            const shouldStopAtLight = lightIsRed && atLight;
            
            shouldStop = shouldStopAtLight || gapToCarAhead < minGap;
            shouldSlow = gapToCarAhead < safeGap && !shouldStop;
        }
        
        // Track waiting state for metrics
        if (shouldStop && !v.waiting && front < stopX) {
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
        
        v.x += v.speed * dt;
        
        // Hard collision prevention
        if (carAhead) {
            const myFront = v.x + v.width / 2;
            const theirBack = carAhead.x - carAhead.width / 2;
            if (myFront > theirBack - minGap) {
                v.x = theirBack - minGap - v.width / 2;
                v.speed = Math.min(v.speed, carAhead.speed);
            }
        }
        
        // Track cars passing through light during green or yellow
        const prevFront = prevX + v.width / 2;
        const newFront = v.x + v.width / 2;
        if (prevFront <= light.x && newFront > light.x && (light.state === 'green' || light.state === 'yellow')) {
            metrics.carsPassedThisGreen++;
        }
        
        if (v.x > canvas.width + 100) {
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

// Draw road
function drawRoad() {
    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2 + 8);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2 + 8);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2 + 8);
    ctx.lineTo(0, getRoadY(0) + roadHeight / 2 + 8);
    ctx.closePath();
    ctx.fill();
    
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2);
    ctx.lineTo(0, getRoadY(0) + roadHeight / 2);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2);
    ctx.moveTo(0, getRoadY(0) + roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2);
    ctx.stroke();
    
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 15]);
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0));
    ctx.lineTo(canvas.width, getRoadY(canvas.width));
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.restore();
}

// Draw traffic light
function drawLight() {
    const x = light.x;
    const baseY = getRoadY(x);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.ellipse(x + 8, baseY - roadHeight / 2 + 5, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#888';
    roundRect(x - 4, baseY - roadHeight / 2 - 100, 8, 100, 4);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    roundRect(x - 16 + 4, baseY - roadHeight / 2 - 95 + 4, 32, 70, 8);
    ctx.fill();
    
    ctx.fillStyle = '#666';
    roundRect(x - 16, baseY - roadHeight / 2 - 95, 32, 70, 8);
    ctx.fill();
    
    ctx.fillStyle = '#555';
    roundRect(x - 12, baseY - roadHeight / 2 - 91, 24, 62, 6);
    ctx.fill();
    
    const lightColors = {
        red: { on: '#ff6b6b', off: '#4a3535' },
        yellow: { on: '#ffd93d', off: '#4a4535' },
        green: { on: '#6bcb77', off: '#354a38' }
    };
    
    const states = ['red', 'yellow', 'green'];
    states.forEach((s, i) => {
        const ly = baseY - roadHeight / 2 - 80 + i * 20;
        const isOn = light.state === s;
        
        if (isOn) {
            const gradient = ctx.createRadialGradient(x, ly, 0, x, ly, 20);
            gradient.addColorStop(0, lightColors[s].on + '40');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, ly, 20, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.beginPath();
        ctx.arc(x, ly, 8, 0, Math.PI * 2);
        ctx.fillStyle = isOn ? lightColors[s].on : lightColors[s].off;
        ctx.fill();
        
        if (isOn) {
            ctx.beginPath();
            ctx.arc(x - 2, ly - 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
        }
    });
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(x, baseY - roadHeight / 2 + 5);
    ctx.lineTo(x, baseY + roadHeight / 2 - 5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = 'butt';
}

// Draw vehicles
function drawVehicles() {
    const sorted = [...vehicles].sort((a, b) => a.x - b.x);
    
    sorted.forEach(v => {
        const vx = v.x - v.width / 2;
        const vy = getRoadY(v.x) - v.height / 2;
        
        ctx.save();
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.ellipse(v.x + 4, vy + v.height + 6, v.width / 2 - 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        const bodyColor = `hsl(${v.hue}, 45%, 60%)`;
        const darkColor = `hsl(${v.hue}, 45%, 45%)`;
        const lightColor = `hsl(${v.hue}, 45%, 75%)`;
        
        ctx.fillStyle = darkColor;
        roundRect(vx, vy + v.height * 0.4, v.width, v.height * 0.6, 6);
        ctx.fill();
        
        ctx.fillStyle = bodyColor;
        roundRect(vx + 2, vy, v.width - 4, v.height * 0.65, 8);
        ctx.fill();
        
        ctx.fillStyle = lightColor;
        roundRect(vx + v.width * 0.25, vy + 2, v.width * 0.45, v.height * 0.35, 5);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
        roundRect(vx + v.width * 0.55, vy + 4, v.width * 0.3, v.height * 0.35, 4);
        ctx.fill();
        
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(vx + 10, vy + v.height - 2, 5, 0, Math.PI * 2);
        ctx.arc(vx + v.width - 10, vy + v.height - 2, 5, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#666';
        ctx.beginPath();
        ctx.arc(vx + 10, vy + v.height - 3, 2, 0, Math.PI * 2);
        ctx.arc(vx + v.width - 10, vy + v.height - 3, 2, 0, Math.PI * 2);
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
    
    spawnTimer += dt;
    if (spawnTimer > 1 / config.spawnRate) {
        spawnTimer = 0;
        spawnVehicle();
    }
    
    updateLight(dt);
    updateVehicles(dt);
    updateMetricsDisplay();
    updateGraphs(dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    drawLight();
    drawVehicles();
    
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