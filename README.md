# Traffic Flow Simulator

An interactive visual simulation comparing traffic flow patterns between roundabouts and traffic light intersections.

## Features

- **Side-by-side comparison** of roundabout vs traffic light intersection
- **Real-time statistics**: throughput, average wait time, efficiency
- **Interactive controls**:
  - Simulation speed (0.5x - 3x)
  - Vehicle spawn rate
  - Traffic light timing duration
  - Play/Pause and Reset
- **Isometric 2.5D visualization** with glow effects
- **Color-coded vehicles** showing speed (green = fast, red = slow/stopped)
- **Trail effects** for visual flow representation

## How to Run

Simply open `index.html` in a modern web browser. No build step or dependencies required.

```bash
# If you have a local server (optional, for development):
python -m http.server 8000
# Then open http://localhost:8000
```

## How It Works

### Simulation Model

Each vehicle follows an **agent-based model** with simple rules:
1. Follow the leader - maintain safe distance from the car ahead
2. Decelerate when approaching obstacles or intersections
3. Follow specific intersection rules (yield for roundabouts, obey lights for intersections)

### Roundabout Logic
- Vehicles yield to traffic already in the roundabout (coming from the left)
- Continuous flow when no conflicts exist
- Natural self-regulation of traffic

### Traffic Light Logic
- Standard 4-phase signal: NS Green → NS Yellow → EW Green → EW Yellow
- Vehicles queue during red phases
- Creates periodic stop-and-go patterns

## Project Structure

```
roundabout/
├── index.html          # Main HTML page
├── css/
│   └── style.css       # Dark theme styling
├── js/
│   ├── main.js         # Entry point & controls
│   ├── simulation.js   # Core simulation engine
│   ├── vehicle.js      # Vehicle behavior
│   ├── road.js         # Intersections & paths
│   ├── renderer.js     # Canvas rendering
│   └── utils.js        # Helper functions
└── README.md
```

## Browser Support

Works in all modern browsers with ES6 module support:
- Chrome 61+
- Firefox 60+
- Safari 11+
- Edge 16+

## License

MIT License - Feel free to use and modify!

