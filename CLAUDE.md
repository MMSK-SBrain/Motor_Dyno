# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a real-time electric motor simulation and testing system built with Test-Driven Development principles. It simulates a 2kW, 48V BLDC motor with accurate physics modeling, providing real-time visualization and control through a React frontend and FastAPI backend.

## Development Commands

### Backend (Python/FastAPI)
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run unit tests
pytest tests/unit/ -v

# Run integration tests  
pytest tests/integration/ -v

# Run all tests with coverage
pytest tests/ -v --cov=app --cov-report=html

# Start development server
uvicorn app.main:app --reload
```

### Frontend (React/TypeScript)
```bash
cd frontend

# Install dependencies
npm install

# Run tests
npm test

# Start development server
npm start

# Build production
npm run build
```

### Docker Development
```bash
# Start all services
docker-compose up --build

# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Architecture Overview

### Backend Structure (`backend/app/`)
- **`models/`**: Motor physics models (BLDC motor with thermal effects)
- **`controllers/`**: PID controller with anti-windup
- **`api/`**: REST endpoints for motor config and simulation control
- **`websocket/`**: Real-time data streaming with binary protocol
- **`simulation/`**: Real-time simulator with 1ms timestep
- **`core/`**: Configuration, session management, motor factory

### Frontend Structure (`frontend/src/`)
- **`components/`**: React components for motor control and visualization
- **`types/`**: TypeScript type definitions
- **`utils/`**: Utilities including simulation validation

### Key Technical Details
- **Simulation Rate**: 1000 Hz (1ms timestep) for real-time physics
- **WebSocket Protocol**: Binary messaging for low-latency data streaming
- **Motor Model**: Comprehensive BLDC physics with electrical/mechanical dynamics
- **Performance Requirements**: <50ms WebSocket latency, 30+ FPS UI updates

## Testing Strategy

The project follows TDD principles with comprehensive test coverage:
- **Unit Tests**: Motor models, PID controller, utilities
- **Integration Tests**: API endpoints, WebSocket communication
- **Test Coverage Target**: 80%+

Always run the full test suite before committing changes. The system includes performance tests that must pass for real-time simulation requirements.

## API Structure

### REST Endpoints
- `GET /api/motor` - Get motor parameters
- `POST /api/simulation/start` - Start simulation session
- `POST /api/simulation/{id}/stop` - Stop simulation
- `PUT /api/simulation/{id}/control` - Update control parameters
- `GET /health` - Health check

### WebSocket
- `WS /ws/simulation/{session_id}` - Real-time data stream with binary protocol

## Development Workflow

1. Follow TDD principles - write tests first
2. Maintain real-time performance requirements (1ms timestep accuracy)
3. Use binary WebSocket protocol for data streaming
4. Ensure motor model validation against manufacturer specifications
5. Run full test suite before committing