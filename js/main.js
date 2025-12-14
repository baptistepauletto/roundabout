// Streetlight Simulator - Isometric Style

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Configuration
const config = {
    spawnRate: 1.5,
    carSpeed: 100,
    lightDuration: 5
};

// Road configuration (isometric angle)
const roadY = 320;
const roadHeight = 60;
const roadAngle = -0.05; // Slight tilt for isometric feel

// Traffic light
const light = {
    x: 500,
    state: 'green',
    timer: 0
};

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
    } else if (light.state === 'red' && light.timer >= redDuration) {
        light.timer = 0;
        light.state = 'green';
    }
}

// Spawn a new vehicle
function spawnVehicle() {
    const hues = [0, 30, 200, 220, 280, 340]; // Red, orange, blue, cyan, purple, pink
    const hue = hues[Math.floor(Math.random() * hues.length)];
    
    vehicles.push({
        x: -50,
        width: 44,
        height: 24,
        speed: config.carSpeed * (0.9 + Math.random() * 0.2),
        hue: hue
    });
}

// Update vehicles
function updateVehicles(dt) {
    const stopX = light.x - 60;
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        const front = v.x + v.width / 2;
        
        // Find closest vehicle ahead
        let minDist = Infinity;
        for (const other of vehicles) {
            if (other !== v && other.x > v.x) {
                const dist = other.x - v.x;
                if (dist < minDist) minDist = dist;
            }
        }
        
        // Determine if should stop
        const atLight = front > stopX - 80 && front < stopX;
        const shouldStopAtLight = light.state !== 'green' && atLight;
        const shouldStopForCar = minDist < 60;
        
        if (shouldStopAtLight || shouldStopForCar) {
            // Smooth deceleration
            v.speed = Math.max(0, v.speed - 400 * dt);
        } else {
            // Accelerate back to target speed
            const targetSpeed = config.carSpeed * (0.9 + Math.random() * 0.01);
            v.speed = Math.min(targetSpeed, v.speed + 200 * dt);
        }
        
        v.x += v.speed * dt;
        
        // Remove if off screen
        if (v.x > canvas.width + 100) {
            vehicles.splice(i, 1);
        }
    }
}

// Draw road with isometric perspective
function drawRoad() {
    ctx.save();
    
    // Road shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2 + 8);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2 + 8);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2 + 8);
    ctx.lineTo(0, getRoadY(0) + roadHeight / 2 + 8);
    ctx.closePath();
    ctx.fill();
    
    // Road surface
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2);
    ctx.lineTo(0, getRoadY(0) + roadHeight / 2);
    ctx.closePath();
    ctx.fill();
    
    // Road edges
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, getRoadY(0) - roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) - roadHeight / 2);
    ctx.moveTo(0, getRoadY(0) + roadHeight / 2);
    ctx.lineTo(canvas.width, getRoadY(canvas.width) + roadHeight / 2);
    ctx.stroke();
    
    // Center dashed line
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

// Draw traffic light (isometric style)
function drawLight() {
    const x = light.x;
    const baseY = getRoadY(x);
    
    // Pole shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.beginPath();
    ctx.ellipse(x + 8, baseY - roadHeight / 2 + 5, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Pole
    ctx.fillStyle = '#888';
    roundRect(x - 4, baseY - roadHeight / 2 - 120, 8, 120, 4);
    ctx.fill();
    
    // Light box shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    roundRect(x - 16 + 4, baseY - roadHeight / 2 - 115 + 4, 32, 70, 8);
    ctx.fill();
    
    // Light box
    ctx.fillStyle = '#666';
    roundRect(x - 16, baseY - roadHeight / 2 - 115, 32, 70, 8);
    ctx.fill();
    
    // Inner box
    ctx.fillStyle = '#555';
    roundRect(x - 12, baseY - roadHeight / 2 - 111, 24, 62, 6);
    ctx.fill();
    
    // Lights
    const lightColors = {
        red: { on: '#ff6b6b', off: '#4a3535' },
        yellow: { on: '#ffd93d', off: '#4a4535' },
        green: { on: '#6bcb77', off: '#354a38' }
    };
    
    const states = ['red', 'yellow', 'green'];
    states.forEach((s, i) => {
        const ly = baseY - roadHeight / 2 - 100 + i * 20;
        const isOn = light.state === s;
        
        // Glow effect
        if (isOn) {
            const gradient = ctx.createRadialGradient(x, ly, 0, x, ly, 20);
            gradient.addColorStop(0, lightColors[s].on + '40');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, ly, 20, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Light bulb
        ctx.beginPath();
        ctx.arc(x, ly, 8, 0, Math.PI * 2);
        ctx.fillStyle = isOn ? lightColors[s].on : lightColors[s].off;
        ctx.fill();
        
        // Highlight
        if (isOn) {
            ctx.beginPath();
            ctx.arc(x - 2, ly - 2, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fill();
        }
    });
    
    // Stop line on road
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

// Draw vehicles (isometric rounded style)
function drawVehicles() {
    // Sort by Y position for proper layering
    const sorted = [...vehicles].sort((a, b) => a.x - b.x);
    
    sorted.forEach(v => {
        const vx = v.x - v.width / 2;
        const vy = getRoadY(v.x) - v.height / 2;
        
        ctx.save();
        
        // Car shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.ellipse(v.x + 4, vy + v.height + 6, v.width / 2 - 2, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Car body (rounded rectangle)
        const bodyColor = `hsl(${v.hue}, 45%, 60%)`;
        const darkColor = `hsl(${v.hue}, 45%, 45%)`;
        const lightColor = `hsl(${v.hue}, 45%, 75%)`;
        
        // Bottom part (darker)
        ctx.fillStyle = darkColor;
        roundRect(vx, vy + v.height * 0.4, v.width, v.height * 0.6, 6);
        ctx.fill();
        
        // Main body
        ctx.fillStyle = bodyColor;
        roundRect(vx + 2, vy, v.width - 4, v.height * 0.65, 8);
        ctx.fill();
        
        // Roof / top highlight
        ctx.fillStyle = lightColor;
        roundRect(vx + v.width * 0.25, vy + 2, v.width * 0.45, v.height * 0.35, 5);
        ctx.fill();
        
        // Window
        ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
        roundRect(vx + v.width * 0.55, vy + 4, v.width * 0.3, v.height * 0.35, 4);
        ctx.fill();
        
        // Wheels
        ctx.fillStyle = '#444';
        ctx.beginPath();
        ctx.arc(vx + 10, vy + v.height - 2, 5, 0, Math.PI * 2);
        ctx.arc(vx + v.width - 10, vy + v.height - 2, 5, 0, Math.PI * 2);
        ctx.fill();
        
        // Wheel highlights
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
    const spawnRateSlider = document.getElementById('spawnRate');
    const spawnRateValue = document.getElementById('spawnRateValue');
    spawnRateSlider.addEventListener('input', (e) => {
        config.spawnRate = parseFloat(e.target.value);
        spawnRateValue.textContent = config.spawnRate.toFixed(1) + '/s';
    });
    
    const carSpeedSlider = document.getElementById('carSpeed');
    const carSpeedValue = document.getElementById('carSpeedValue');
    carSpeedSlider.addEventListener('input', (e) => {
        config.carSpeed = parseInt(e.target.value);
        carSpeedValue.textContent = config.carSpeed;
    });
    
    const lightDurationSlider = document.getElementById('lightDuration');
    const lightDurationValue = document.getElementById('lightDurationValue');
    lightDurationSlider.addEventListener('input', (e) => {
        config.lightDuration = parseFloat(e.target.value);
        lightDurationValue.textContent = config.lightDuration + 's';
    });
}

// Main loop
let lastTime = 0;

function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    
    // Spawn vehicles
    spawnTimer += dt;
    const spawnInterval = 1 / config.spawnRate;
    if (spawnTimer > spawnInterval) {
        spawnTimer = 0;
        spawnVehicle();
    }
    
    // Update
    updateLight(dt);
    updateVehicles(dt);
    
    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    drawLight();
    drawVehicles();
    
    requestAnimationFrame(loop);
}

// Initialize
setupControls();
requestAnimationFrame(loop);
