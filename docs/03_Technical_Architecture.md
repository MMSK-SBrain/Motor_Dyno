# Technical Architecture

## System Overview

The motor testing system employs a three-tier hybrid architecture optimized for real-time performance, scalability, and maintainability. The architecture combines Python-based physics modeling with WebAssembly-accelerated browser computation and machine learning optimization.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   React UI      │  │  uPlot.js       │  │ WebSocket    │ │
│  │  - Config UI    │  │  - Real-time    │  │ Client       │ │
│  │  - Controls     │  │  - 60 FPS       │  │ - Binary     │ │
│  │  - Export       │  │  - 10k+ points  │  │ - Low latency│ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Backend Services                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   FastAPI       │  │ Motor Sim       │  │ PID Control  │ │
│  │  - REST API     │  │ - Motulator     │  │ - Anti-windup│ │
│  │  - WebSocket    │  │ - 4 motor types │  │ - Adaptive   │ │
│  │  - File upload  │  │ - 1ms timestep  │  │ - Feed-fwd   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   SQLite        │  │ TimescaleDB     │  │ File Storage │ │
│  │  - Motor params │  │ - Time series   │  │ - Drive cycles│ │
│  │  - Config       │  │ - Results       │  │ - Reports    │ │
│  │  - Sessions     │  │ - Analytics     │  │ - Exports    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Frontend Layer (React + TypeScript)

**React Application Structure:**
```
src/
├── components/
│   ├── MotorConfig/
│   │   ├── MotorSelector.tsx
│   │   ├── ParameterDisplay.tsx
│   │   └── ConfigForm.tsx
│   ├── Control/
│   │   ├── ManualControl.tsx
│   │   ├── DriveControl.tsx
│   │   └── PIDTuning.tsx
│   ├── Visualization/
│   │   ├── RealTimePlots.tsx
│   │   ├── EfficiencyMap.tsx
│   │   └── ControlAnalysis.tsx
│   └── DataManagement/
│       ├── FileUpload.tsx
│       ├── ExportDialog.tsx
│       └── SessionManager.tsx
├── services/
│   ├── websocket.ts
│   ├── api.ts
│   └── dataProcessing.ts
└── types/
    ├── motor.ts
    ├── simulation.ts
    └── api.ts
```

**Key Technologies:**
- **React 18**: Component-based UI with hooks and context
- **TypeScript**: Type safety and developer experience
- **uPlot.js**: High-performance plotting (150k points @ 60 FPS)
- **Material-UI**: Professional component library
- **WebSocket Client**: Binary protocol for real-time data

### 2. Backend Services (Python + FastAPI)

**Service Architecture:**
```python
app/
├── api/
│   ├── routes/
│   │   ├── motors.py      # Motor CRUD operations
│   │   ├── simulation.py  # Simulation control
│   │   ├── analysis.py    # Data analysis endpoints
│   │   └── files.py       # File upload/download
│   └── websocket/
│       ├── manager.py     # Connection management
│       ├── streaming.py   # Real-time data streaming
│       └── protocols.py   # Binary message protocols
├── core/
│   ├── simulation/
│   │   ├── motor_models.py    # Motor physics models
│   │   ├── controllers.py     # PID and advanced control
│   │   ├── drive_cycles.py    # Profile processing
│   │   └── real_time.py       # 1ms simulation loop
│   ├── data/
│   │   ├── models.py      # SQLAlchemy models
│   │   ├── motor_db.py    # Motor parameter database
│   │   └── results.py     # Results storage
│   └── utils/
│       ├── validation.py  # Input validation
│       ├── calculations.py # Engineering calculations
│       └── export.py      # Data export utilities
└── config/
    ├── motors/            # Motor parameter files
    ├── drive_cycles/      # Standard drive cycles
    └── settings.py        # Application configuration
```

**Key Components:**
- **Motor Simulation Engine**: Based on motulator library
- **Real-time Controller**: 1ms timestep simulation loop
- **WebSocket Manager**: Handles multiple client connections
- **Data Processors**: CSV/Excel parsing and validation

### 3. Database Layer

**SQLite Schema (Configuration Data):**
```sql
-- Motor configurations
CREATE TABLE motors (
    id INTEGER PRIMARY KEY,
    motor_type TEXT NOT NULL,
    name TEXT NOT NULL,
    rated_power_kw REAL,
    rated_voltage_v REAL,
    parameters JSON,
    efficiency_map BLOB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test sessions  
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    motor_id INTEGER,
    configuration JSON,
    created_at TIMESTAMP,
    FOREIGN KEY (motor_id) REFERENCES motors(id)
);

-- Drive cycles
CREATE TABLE drive_cycles (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    data BLOB,
    duration_s REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**TimescaleDB Schema (Time Series Data):**
```sql
-- Real-time simulation data
CREATE TABLE simulation_data (
    timestamp TIMESTAMPTZ NOT NULL,
    session_id INTEGER,
    motor_speed_rpm REAL,
    motor_torque_nm REAL,
    phase_current_a REAL,
    dc_voltage_v REAL,
    efficiency_percent REAL,
    power_w REAL,
    controller_output REAL,
    pid_error REAL
);

-- Create hypertable for time-series optimization
SELECT create_hypertable('simulation_data', 'timestamp');

-- Indexes for performance
CREATE INDEX idx_simulation_session ON simulation_data(session_id, timestamp);
```

## Real-time Performance Optimization

### 1. WebSocket Binary Protocol

**Message Format:**
```python
import struct

class BinaryMessage:
    def pack_simulation_data(self, data):
        # Pack: timestamp(8) + speed(4) + torque(4) + current(4) + voltage(4) + efficiency(4) + power(4)
        return struct.pack('>dfffffff', 
            data.timestamp,
            data.speed, data.torque, data.current, 
            data.voltage, data.efficiency, data.power
        )
    
    def unpack_simulation_data(self, buffer):
        return struct.unpack('>dfffffff', buffer)
```

**Performance Benefits:**
- **3.5x smaller** than JSON messages
- **40% faster** serialization/deserialization
- **Deterministic timing** for real-time applications

### 2. Simulation Loop Architecture

**Real-time Simulation Engine:**
```python
import asyncio
import time
from typing import Dict, List

class RealTimeSimulator:
    def __init__(self, timestep_ms: float = 1.0):
        self.timestep = timestep_ms / 1000.0  # Convert to seconds
        self.motor_model = None
        self.controller = None
        self.clients: List[WebSocket] = []
        self.running = False
        
    async def simulation_loop(self):
        """1ms timestep simulation loop"""
        target_time = time.time()
        
        while self.running:
            # Physics simulation
            motor_state = self.motor_model.step(self.timestep)
            control_output = self.controller.step(motor_state)
            
            # Apply control to motor
            self.motor_model.apply_control(control_output)
            
            # Stream to connected clients
            await self.broadcast_state(motor_state)
            
            # Maintain precise timing
            target_time += self.timestep
            sleep_time = target_time - time.time()
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
```
### 3. Motor Physics Models

**Motulator Integration:**
```python
from motulator.drive import model
from motulator.common import control

class MotorSimulationEngine:
    def __init__(self, motor_type: str, parameters: Dict):
        self.motor_type = motor_type
        self.parameters = parameters
        self.setup_motor_model()
        
    def setup_motor_model(self):
        if self.motor_type == "ACIM":
            # AC Induction Motor from motulator
            self.motor = model.InductionMachine(
                n_p=self.parameters['pole_pairs'],
                R_s=self.parameters['stator_resistance'],
                R_R=self.parameters['rotor_resistance'],
                L_sgm=self.parameters['leakage_inductance'],
                L_M=self.parameters['magnetizing_inductance']
            )
            
        elif self.motor_type == "PMSM":
            # Permanent Magnet Synchronous Motor
            self.motor = model.SynchronousMachine(
                n_p=self.parameters['pole_pairs'],
                R_s=self.parameters['phase_resistance'],
                L_d=self.parameters['d_axis_inductance'],
                L_q=self.parameters['q_axis_inductance'],
                psi_pm=self.parameters['pm_flux_linkage']
            )
```

## Performance Specifications

### Timing Requirements
- **Simulation Timestep**: 1ms ± 0.1ms accuracy
- **WebSocket Latency**: < 50ms end-to-end
- **UI Response Time**: < 100ms for parameter changes
- **Plot Update Rate**: 60 FPS sustained
- **Data Throughput**: 1000+ samples/second

### Scalability Targets
- **Concurrent Users**: 100+ simultaneous sessions
- **Data Points**: 10,000+ points per plot
- **Session Duration**: 8+ hours continuous operation
- **Memory Usage**: < 2GB per simulation instance
- **CPU Usage**: < 50% on modern 4-core systems

## Deployment Architecture

### Docker Container Strategy
```dockerfile
# Multi-stage build for optimization
FROM python:3.11-slim as backend
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

FROM node:18-alpine as frontend  
WORKDIR /app
COPY package*.json .
RUN npm ci --production
COPY . .
RUN npm run build

FROM python:3.11-slim as production
# Combine backend and built frontend
COPY --from=backend /app /app
COPY --from=frontend /app/build /app/static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Infrastructure Requirements
```yaml
# docker-compose.yml
version: '3.8'
services:
  motor-sim:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@timescaledb:5432/motorsim
      - REDIS_URL=redis://redis:6379
    depends_on:
      - timescaledb
      - redis
      
  timescaledb:
    image: timescale/timescaledb:latest-pg14
    environment:
      - POSTGRES_DB=motorsim
    volumes:
      - timescale_data:/var/lib/postgresql/data
      
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  timescale_data:
  redis_data:
```

## Security Architecture

### Authentication & Authorization
- **JWT Token-based**: Stateless authentication
- **Role-based Access**: Admin, Engineer, Student roles
- **API Rate Limiting**: Prevent abuse and ensure fair usage
- **Input Validation**: Comprehensive parameter validation

### Data Protection
- **Encryption at Rest**: Database encryption
- **HTTPS Only**: TLS 1.3 for all communications
- **WebSocket Security**: WSS with origin validation
- **File Upload Limits**: Size and type restrictions

### Network Security
```python
# CORS configuration
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# WebSocket security
async def websocket_endpoint(websocket: WebSocket):
    # Validate origin
    origin = websocket.headers.get("origin")
    if not validate_origin(origin):
        await websocket.close(code=1008)
        return
    
    # Rate limiting per connection
    rate_limiter = RateLimiter(max_requests=1000, time_window=60)
    if not rate_limiter.allow(websocket.client.host):
        await websocket.close(code=1008)
        return
```

## Monitoring & Observability

### Performance Monitoring
- **Application Metrics**: Response time, throughput, error rates
- **System Metrics**: CPU, memory, disk usage
- **Simulation Metrics**: Timestep accuracy, simulation stability
- **User Metrics**: Session duration, feature usage

### Logging Strategy
```python
import logging
import structlog

# Structured logging configuration
logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=logging.INFO,
)

logger = structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
)
```

### Error Handling & Recovery
- **Graceful Degradation**: Fallback modes for system failures
- **Circuit Breakers**: Prevent cascade failures
- **Health Checks**: Automated system health monitoring
- **Backup & Recovery**: Automated data backup procedures
