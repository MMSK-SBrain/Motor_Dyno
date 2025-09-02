# Motor Dyno - Real-Time Electric Motor Simulation

A comprehensive real-time electric motor simulation and testing system built with Test-Driven Development principles. Features advanced physics modeling, sophisticated control algorithms, and professional-grade visualization.

## Current Features

- **Advanced BLDC Motor Simulation**: 2kW, 48V motor with comprehensive physics modeling
- **Professional UI**: Real-time analog gauges with smooth animations and color-coded zones
- **Advanced Load Control**: Multiple load profiles (constant, ramp, step, sine wave, custom CSV)
- **Stable PID Control**: Optimized PID controller with anti-windup and stability enhancements
- **Real-time Visualization**: High-performance analog dials with professional styling
- **Current/Torque Smoothing**: Realistic electrical and mechanical time constant simulation
- **Collapsible UI**: Organized interface with collapsible panels for optimal space utilization

## Architecture

### Backend (Python/FastAPI)
- Real-time motor physics simulation (1ms timestep)
- PID controller with anti-windup
- WebSocket server for real-time data
- REST API for configuration

### Frontend (React/TypeScript)
- Professional analog gauge displays with Canvas-based rendering
- Advanced load control with multiple profile types
- Optimized PID controller with stability enhancements
- Real-time current and torque smoothing
- Collapsible UI panels for organized workflow
- Responsive design with professional styling

## Quick Start

### Using Docker (Recommended)
```bash
# Clone repository
git clone https://github.com/MMSK-SBrain/Motor_Dyno.git
cd Motor_Dyno

# Start all services
docker-compose up --build

# Access application
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run tests
pytest tests/ -v --cov=app

# Start server
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install

# Run tests
npm test

# Start development server
npm start
```

## Test-Driven Development

This project follows TDD principles with comprehensive test coverage:

### Backend Tests
```bash
cd backend

# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# All tests with coverage
pytest tests/ -v --cov=app --cov-report=html
```

### Frontend Tests
```bash
cd frontend

# Component tests
npm test

# Coverage report
npm run test:coverage
```

## API Documentation

### REST Endpoints
- `GET /api/motor` - Get motor parameters
- `POST /api/simulation/start` - Start simulation session
- `POST /api/simulation/{id}/stop` - Stop simulation
- `PUT /api/simulation/{id}/control` - Update control parameters
- `GET /health` - Health check

### WebSocket
- `WS /ws/simulation/{session_id}` - Real-time data stream

See [API Documentation](http://localhost:8000/docs) for detailed specs.

## Testing Strategy

### Test Pyramid
1. **Unit Tests**: Motor models, PID controller, utilities
2. **Integration Tests**: API endpoints, WebSocket communication
3. **End-to-End Tests**: Complete user workflows

### Performance Requirements
- Simulation: 1000 Hz (1ms timestep) ± 0.1Hz
- WebSocket: < 50ms latency
- UI: 30+ FPS with 1000+ data points
- Memory: < 1GB per session

## Development Workflow

### TDD Cycle
1. **Red**: Write failing test
2. **Green**: Write minimal code to pass
3. **Refactor**: Improve code quality

### Git Workflow
```bash
# Feature development
git checkout -b feature/motor-model
# Write tests, implement feature, commit
git checkout main
git merge feature/motor-model
```

## Recent Improvements

### Stability Enhancements
- **Conservative PID Tuning**: Reduced gains (kp=0.8, ki=0.5, kd=0.01) for stable operation
- **Current Smoothing**: 85% previous + 15% new filtering simulates realistic electrical time constants
- **Torque Smoothing**: 90% previous + 10% new filtering reduces mechanical ripples
- **Mini-deadband**: 20 RPM deadband prevents hunting without aggressive behavior

### UI Enhancements
- **Professional Analog Gauges**: Custom Canvas-based gauges with smooth animations
- **Advanced Load Control**: Support for constant, ramp, step, sine, and custom CSV load profiles  
- **Organized Layout**: Moved load control to collapsible right panel for better space utilization
- **Color-coded Zones**: Green/yellow/red zones for intuitive status indication

## Motor Model Validation

The BLDC motor model is validated against:
- Manufacturer datasheets
- Real dyno test data
- Industry simulation tools

### Key Validation Points
- Torque-speed curve accuracy: ±10%
- Efficiency mapping: ±5%
- Dynamic response: <5% overshoot
- Current calculations: ±3%
- Current stability: Minimal ripple at constant RPM

## Performance Benchmarks

| Metric | Target | Achieved |
|--------|---------|----------|
| Simulation Rate | 1000 Hz | TBD |
| WebSocket Latency | <50ms | TBD |
| Memory Usage | <1GB | TBD |
| UI Frame Rate | 30 FPS | TBD |
| Test Coverage | 80% | TBD |

## Project Structure

```
Motor_Sim/
├── plan.md                 # Comprehensive development plan
├── docker-compose.yml      # Container orchestration
├── backend/
│   ├── app/
│   │   ├── models/         # Motor physics models
│   │   ├── controllers/    # PID controller
│   │   ├── api/           # REST endpoints
│   │   └── websocket/     # WebSocket handlers
│   ├── tests/
│   │   ├── unit/          # Unit tests
│   │   └── integration/   # Integration tests
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/    # React components
    │   ├── services/      # WebSocket service
    │   └── utils/         # Utilities
    ├── tests/
    └── package.json
```

## Contributing

1. Follow TDD principles - write tests first
2. Maintain 80%+ test coverage
3. Run full test suite before committing
4. Document any changes to requirements
5. Performance tests must pass

## Future Roadmap

### Phase 2 (Post-MVP)
- Additional motor types (PMSM, SRM, ACIM)
- Drive cycle simulation
- Efficiency mapping
- Data export functionality

### Phase 3 (Advanced)
- Multi-user support
- Database integration
- Cloud deployment
- Machine learning optimization

## License

[Add your license here]

## Support

For issues and questions:
1. Check existing test specifications
2. Review API documentation
3. Submit GitHub issue with test case
4. Contact development team

---

**Built with Test-Driven Development principles for reliability and maintainability.**