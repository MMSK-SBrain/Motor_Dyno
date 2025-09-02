# Motor Dyno MVP - Frontend

A high-performance React TypeScript frontend for real-time electric motor simulation and testing. Features real-time plotting with 30+ FPS performance, WebSocket communication with binary protocol support, and a responsive Material-UI interface.

## Features

### 🚀 Real-Time Performance
- **High-FPS Plotting**: Canvas-based rendering achieving 30+ FPS with 1000+ data points
- **Adaptive Data Management**: Intelligent data buffering and downsampling
- **WebSocket Streaming**: Binary protocol support for high-throughput data transmission
- **Performance Monitoring**: Built-in FPS, memory, and network monitoring

### 🎛️ Motor Control Interface
- **Intuitive Controls**: Speed and torque control with real-time sliders
- **PID Tuning**: Live PID parameter adjustment with visual feedback
- **Safety Features**: Real-time monitoring and emergency stop functionality
- **Multi-Motor Support**: Easy switching between different motor configurations

### 📊 Advanced Visualization
- **Multi-Series Plotting**: Speed, torque, current, voltage, efficiency, power, and temperature
- **Interactive Charts**: Toggle series visibility, zoom, and time window adjustment
- **Real-Time Updates**: Sub-millisecond data processing and display
- **Responsive Design**: Optimized for desktop and tablet viewing

### 🔧 Technical Features
- **TypeScript**: Full type safety and IntelliSense support
- **Material-UI**: Modern, accessible component library
- **State Management**: Efficient React hooks-based state management
- **Error Handling**: Comprehensive error boundaries and user feedback
- **Testing Ready**: Jest and React Testing Library setup

## Architecture

### Component Structure
```
src/
├── components/
│   ├── RealTimePlot.tsx      # High-performance Canvas plotting
│   ├── MotorControl.tsx      # Motor control interface
│   └── SessionManager.tsx    # Session and motor selection
├── services/
│   ├── WebSocketService.ts   # Real-time data streaming
│   └── ApiService.ts         # REST API communication
├── utils/
│   ├── DataBuffer.ts         # Efficient data management
│   └── PerformanceMonitor.ts # Performance tracking
├── types/
│   └── index.ts              # TypeScript definitions
└── App.tsx                   # Main application component
```

### Performance Characteristics
- **Frame Rate**: 30-60 FPS sustained rendering
- **Data Throughput**: Up to 1000 Hz data ingestion
- **Memory Management**: Circular buffers with automatic cleanup
- **Network Protocol**: JSON and binary WebSocket protocols
- **Responsiveness**: Sub-100ms control response time

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Motor Simulation Backend running on `localhost:8000`

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm start
   ```

3. **Access application:**
   Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
```

The build artifacts will be in the `build/` directory, optimized for production deployment.

## Configuration

### API Endpoints
The frontend connects to the backend API at:
- **REST API**: `http://localhost:8000/api/v1/`
- **WebSocket**: `ws://localhost:8000/ws/simulation/{session_id}`

### Environment Variables
Create a `.env` file for custom configuration:
```env
REACT_APP_API_BASE_URL=http://localhost:8000/api/v1
REACT_APP_WS_BASE_URL=ws://localhost:8000/ws
REACT_APP_MAX_DATA_POINTS=10000
REACT_APP_DEFAULT_TIME_WINDOW=30
```

## Usage Guide

### Starting a Simulation

1. **Select Motor**: Choose from available motor configurations
2. **Create Session**: Click "New Session" and configure parameters
3. **Connect**: WebSocket connection establishes automatically
4. **Control Motor**: Use sliders to adjust speed, torque, and load
5. **Monitor Performance**: View real-time plots and safety indicators

### Real-Time Plotting

- **Toggle Series**: Use switches to show/hide data series
- **Performance**: Monitor FPS, data points, and dropped frames
- **Time Window**: Adjust visible time range (5-120 seconds)
- **Auto-scaling**: Automatic Y-axis scaling based on data range

### Motor Control

- **Speed Control**: Set target RPM with real-time feedback
- **Torque Control**: Direct torque command mode
- **Load Simulation**: Variable load torque percentage
- **PID Tuning**: Adjust controller parameters on-the-fly
- **Emergency Stop**: Immediate simulation shutdown

### Safety Features

- **Temperature Monitoring**: Visual alerts for overheating
- **Current Limiting**: Automatic protection against overcurrent
- **Speed Limiting**: Prevent motor overspeed conditions
- **Connection Monitoring**: Automatic reconnection handling

## Development

### Code Structure

**TypeScript Types**: All data structures are fully typed for safety and IntelliSense support.

**State Management**: React hooks pattern with centralized application state.

**Performance Optimization**:
- Canvas-based plotting for maximum frame rate
- Efficient data structures with circular buffers  
- Throttled control updates to prevent spam
- Adaptive rendering based on data complexity

### Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch
```

### Performance Monitoring

Built-in performance monitoring includes:
- **Frame Rate**: Real-time FPS measurement
- **Memory Usage**: JavaScript heap monitoring  
- **Data Throughput**: WebSocket message rate
- **Network Latency**: Connection quality metrics

Access performance data via browser DevTools or the built-in monitoring display.

## API Integration

### REST Endpoints
- `GET /api/v1/motors` - List available motors
- `POST /api/v1/simulation/start` - Create simulation session
- `PUT /api/v1/simulation/{id}/control` - Update control parameters
- `GET /api/v1/simulation/{id}/results` - Get session data

### WebSocket Messages
```typescript
// Control command
{
  type: 'control',
  payload: {
    target_speed_rpm: 2000,
    load_torque_percent: 50
  }
}

// Simulation data (100Hz)
{
  type: 'simulation_data',
  payload: {
    timestamp: 1705312200000,
    speed_rpm: 1995.2,
    torque_nm: 5.1,
    current_a: 30.2,
    // ... additional fields
  }
}
```

## Troubleshooting

### Common Issues

**Connection Failed**: Ensure backend is running on port 8000
```bash
# Check backend status
curl http://localhost:8000/api/v1/health
```

**Low Frame Rate**: Reduce data points or time window
- Decrease `maxDataPoints` in plot configuration
- Reduce time window to 10-15 seconds
- Disable unused data series

**Memory Issues**: Clear data buffer periodically
- Automatic cleanup occurs every 60 seconds
- Manual cleanup via `dataBuffer.clear()`

**WebSocket Disconnections**: Check network stability
- Automatic reconnection with exponential backoff
- Monitor connection state in UI

### Performance Tuning

**High-Performance Mode**:
- Enable binary protocol: `useBinary: true`
- Reduce update interval: `updateInterval: 8` (120 FPS)
- Limit data points: `maxDataPoints: 5000`

**Battery/Mobile Optimization**:
- Increase update interval: `updateInterval: 33` (30 FPS)
- Reduce time window: `timeWindow: 15`
- Disable unused series

## Contributing

### Development Setup
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Follow TypeScript and React best practices
4. Add tests for new functionality
5. Submit pull request with detailed description

### Code Style
- Use TypeScript strict mode
- Follow Material-UI design patterns
- Implement proper error handling
- Add JSDoc comments for public APIs
- Maintain 80%+ test coverage

## License

This project is part of the Motor Simulation MVP and follows the same licensing terms as the parent project.

## Support

For technical support or questions:
- Review API documentation in `/docs/07_API_Specification.md`
- Check backend logs for WebSocket connection issues
- Monitor browser DevTools for client-side errors
- Use built-in performance monitoring for optimization guidance