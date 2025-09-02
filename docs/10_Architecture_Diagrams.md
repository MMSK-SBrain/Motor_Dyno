# System Architecture Diagrams

## High-Level System Architecture

```mermaid
graph TB
    subgraph "User Interface Layer"
        UI[React Frontend<br/>- Motor Configuration<br/>- Real-time Control<br/>- Data Visualization]
        MOBILE[Mobile Interface<br/>- Responsive Design<br/>- Touch Controls]
    end

    subgraph "API Gateway Layer"
        GATEWAY[API Gateway<br/>- Authentication<br/>- Rate Limiting<br/>- Load Balancing]
    end

    subgraph "Application Services"
        API[FastAPI Backend<br/>- REST Endpoints<br/>- WebSocket Handling<br/>- Business Logic]
        
        SIM[Simulation Engine<br/>- Motor Physics<br/>- Real-time Loop<br/>- Control Systems]
        
        ANALYSIS[Analysis Service<br/>- Performance Metrics<br/>- Efficiency Mapping<br/>- Report Generation]
    end

    subgraph "Data Services"
        MOTOR_DB[(Motor Database<br/>SQLite<br/>- Parameters<br/>- Specifications)]
        
        TIME_DB[(Time Series DB<br/>TimescaleDB<br/>- Simulation Data<br/>- Performance Logs)]
        
        FILE_STORE[File Storage<br/>- Drive Cycles<br/>- Exports<br/>- Reports]
    end

    subgraph "External Libraries"
        MOTULATOR[Motulator<br/>- Motor Models<br/>- Control Algorithms]
        PYLEECAN[PYLEECAN<br/>- Motor Design<br/>- FEA Integration]
    end

    %% Connections
    UI --> GATEWAY
    MOBILE --> GATEWAY
    GATEWAY --> API
    API --> SIM
    API --> ANALYSIS
    SIM --> MOTOR_DB
    SIM --> TIME_DB
    ANALYSIS --> TIME_DB
    API --> FILE_STORE
    SIM --> MOTULATOR
    SIM --> PYLEECAN

    %% Styling
    classDef frontend fill:#e1f5fe
    classDef gateway fill:#f3e5f5  
    classDef service fill:#e8f5e8
    classDef data fill:#fff3e0
    classDef external fill:#fce4ec

    class UI,MOBILE frontend
    class GATEWAY gateway
    class API,SIM,ANALYSIS service
    class MOTOR_DB,TIME_DB,FILE_STORE data
    class MOTULATOR,PYLEECAN external
```

## Real-Time Data Flow Architecture

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant SimEngine
    participant Database
    participant WebSocket

    User->>Frontend: Configure Motor & Start Simulation
    Frontend->>API: POST /api/v1/simulation/start
    API->>Database: Load Motor Parameters
    Database-->>API: Motor Config Data
    API->>SimEngine: Initialize Motor Model
    API-->>Frontend: Session ID & WebSocket URL
    
    Frontend->>WebSocket: Connect to ws://host/ws/sim/{id}
    WebSocket-->>Frontend: Connection Established
    
    loop Real-time Simulation (1ms loop)
        SimEngine->>SimEngine: Physics Calculation Step
        SimEngine->>Database: Buffer Data (every 10ms)
        SimEngine->>WebSocket: Stream Data (every 10ms)
        WebSocket-->>Frontend: Binary Simulation Data
        Frontend->>Frontend: Update Real-time Plots
    end
    
    User->>Frontend: Update Control Parameters
    Frontend->>WebSocket: Send Control Command
    WebSocket->>SimEngine: Apply New Parameters
    SimEngine-->>WebSocket: Acknowledge Update
    WebSocket-->>Frontend: Control Confirmation
```

## Motor Simulation Engine Architecture

```mermaid
graph LR
    subgraph "Control Layer"
        PID[PID Controller<br/>- Speed Control<br/>- Anti-windup<br/>- Adaptive Gains]
        FOC[Field Oriented Control<br/>- d-q Transform<br/>- Current Control<br/>- Space Vector PWM]
    end

    subgraph "Motor Models"
        BLDC[BLDC Model<br/>- Back EMF<br/>- Commutation<br/>- Torque Ripple]
        
        PMSM[PMSM Model<br/>- d-q Equations<br/>- Flux Linkage<br/>- Saliency]
        
        SRM[SRM Model<br/>- Variable Inductance<br/>- Switching Logic<br/>- Torque Ripple]
        
        ACIM[ACIM Model<br/>- Slip Calculation<br/>- Rotor Dynamics<br/>- Efficiency Map]
    end

    subgraph "Physics Engine"
        ELECTRICAL[Electrical Dynamics<br/>- Voltage Equations<br/>- Current Calculation<br/>- Power Analysis]
        
        MECHANICAL[Mechanical Dynamics<br/>- Torque Balance<br/>- Speed Integration<br/>- Inertia Effects]
        
        THERMAL[Thermal Model<br/>- Temperature Rise<br/>- Cooling Effects<br/>- Derating]
    end

    subgraph "Load Models"
        CONSTANT[Constant Load<br/>- Fixed Torque<br/>- User Defined]
        
        VEHICLE[Vehicle Load<br/>- Aerodynamic Drag<br/>- Rolling Resistance<br/>- Grade Effects]
        
        CYCLE[Drive Cycle<br/>- Speed Profile<br/>- Load Variation<br/>- Time-based]
    end

    %% Control connections
    PID --> BLDC
    PID --> PMSM
    PID --> SRM
    PID --> ACIM
    FOC --> PMSM

    %% Motor to physics
    BLDC --> ELECTRICAL
    PMSM --> ELECTRICAL  
    SRM --> ELECTRICAL
    ACIM --> ELECTRICAL
    
    ELECTRICAL --> MECHANICAL
    MECHANICAL --> THERMAL

    %% Load connections
    CONSTANT --> MECHANICAL
    VEHICLE --> MECHANICAL
    CYCLE --> MECHANICAL

    %% Styling
    classDef control fill:#e3f2fd
    classDef motor fill:#e8f5e8
    classDef physics fill:#fff3e0
    classDef load fill:#fce4ec

    class PID,FOC control
    class BLDC,PMSM,SRM,ACIM motor
    class ELECTRICAL,MECHANICAL,THERMAL physics
    class CONSTANT,VEHICLE,CYCLE load
```

## Data Architecture and Storage

```mermaid
graph TB
    subgraph "Real-time Data Pipeline"
        SIM[Simulation Engine<br/>1000 Hz Generation]
        BUFFER[Data Buffer<br/>100 Hz Aggregation]
        STREAM[WebSocket Stream<br/>Binary Protocol]
        CLIENT[Frontend Client<br/>Real-time Plots]
    end

    subgraph "Batch Data Pipeline"  
        BATCH[Batch Processor<br/>Periodic Aggregation]
        METRICS[Metrics Calculator<br/>Performance Analysis]
        REPORTS[Report Generator<br/>PDF/Excel Export]
    end

    subgraph "Storage Layer"
        CACHE[(Redis Cache<br/>- Session State<br/>- Recent Data<br/>- User Preferences)]
        
        CONFIG_DB[(SQLite<br/>- Motor Parameters<br/>- Drive Cycles<br/>- User Sessions)]
        
        TIME_DB[(TimescaleDB<br/>- Simulation Data<br/>- Performance Metrics<br/>- Historical Analysis)]
        
        BLOB[File Storage<br/>- Drive Cycle Uploads<br/>- Generated Reports<br/>- Export Files]
    end

    %% Real-time flow
    SIM --> BUFFER
    BUFFER --> STREAM
    STREAM --> CLIENT
    BUFFER --> CACHE
    
    %% Batch processing
    BUFFER --> BATCH
    BATCH --> METRICS
    METRICS --> REPORTS
    BATCH --> TIME_DB
    
    %% Storage connections
    SIM --> CONFIG_DB
    METRICS --> TIME_DB
    REPORTS --> BLOB
    CLIENT --> CACHE

    %% Data queries
    CLIENT --> CONFIG_DB
    CLIENT --> TIME_DB
    REPORTS --> TIME_DB

    %% Styling
    classDef realtime fill:#e8f5e8
    classDef batch fill:#e3f2fd
    classDef storage fill:#fff3e0

    class SIM,BUFFER,STREAM,CLIENT realtime
    class BATCH,METRICS,REPORTS batch
    class CACHE,CONFIG_DB,TIME_DB,BLOB storage
```

## WebSocket Communication Protocol

```mermaid
graph LR
    subgraph "Client Side"
        JS[JavaScript Client]
        PLOT[uPlot Visualization]
        BINARY[Binary Decoder]
    end

    subgraph "Network Layer"
        WS[WebSocket Connection<br/>- Binary Protocol<br/>- Compression<br/>- Multiplexing]
    end

    subgraph "Server Side"
        MGR[WebSocket Manager<br/>- Connection Pool<br/>- Message Routing<br/>- Error Handling]
        
        ENCODER[Binary Encoder<br/>- Message Packing<br/>- Compression<br/>- Batching]
        
        BROADCASTER[Data Broadcaster<br/>- Multi-client<br/>- Rate Control<br/>- Priority Queuing]
    end

    subgraph "Message Types"
        CTRL[Control Messages<br/>- Start/Stop<br/>- Parameter Updates<br/>- PID Tuning]
        
        DATA[Simulation Data<br/>- Motor State<br/>- Performance Metrics<br/>- Status Updates]
        
        ERROR[Error Messages<br/>- Validation Errors<br/>- System Alerts<br/>- Connection Issues]
    end

    %% Client connections
    JS --> WS
    PLOT --> JS
    BINARY --> JS

    %% Server connections  
    WS --> MGR
    MGR --> ENCODER
    MGR --> BROADCASTER

    %% Message flow
    CTRL --> MGR
    DATA --> ENCODER
    ERROR --> MGR
    
    ENCODER --> BROADCASTER
    BROADCASTER --> WS

    %% Styling
    classDef client fill:#e1f5fe
    classDef network fill:#f3e5f5
    classDef server fill:#e8f5e8
    classDef message fill:#fff3e0

    class JS,PLOT,BINARY client
    class WS network
    class MGR,ENCODER,BROADCASTER server
    class CTRL,DATA,ERROR message
```

## Security Architecture

```mermaid
graph TB
    subgraph "Authentication Layer"
        LOGIN[Login Service<br/>- JWT Tokens<br/>- Role-based Access<br/>- Session Management]
        
        OAUTH[OAuth Integration<br/>- Google/GitHub<br/>- Corporate SSO<br/>- LDAP Support]
    end

    subgraph "Authorization Layer"
        RBAC[Role-Based Access Control<br/>- Student/Engineer/Admin<br/>- Resource Permissions<br/>- API Rate Limits]
        
        GUARD[Route Guards<br/>- Endpoint Protection<br/>- WebSocket Auth<br/>- File Access Control]
    end

    subgraph "Security Middleware"
        CORS[CORS Policy<br/>- Origin Validation<br/>- Credential Handling<br/>- Pre-flight Requests]
        
        RATE[Rate Limiting<br/>- Per-user Limits<br/>- API Throttling<br/>- DDoS Protection]
        
        VALID[Input Validation<br/>- Schema Validation<br/>- Sanitization<br/>- Injection Prevention]
    end

    subgraph "Data Protection"
        ENCRYPT[Encryption<br/>- TLS 1.3<br/>- Database Encryption<br/>- Sensitive Data Masking]
        
        AUDIT[Audit Logging<br/>- User Actions<br/>- Security Events<br/>- Compliance Tracking]
    end

    %% Authentication flow
    LOGIN --> RBAC
    OAUTH --> RBAC
    RBAC --> GUARD
    
    %% Security layers
    GUARD --> CORS
    GUARD --> RATE
    GUARD --> VALID
    
    %% Data protection
    CORS --> ENCRYPT
    RATE --> AUDIT
    VALID --> AUDIT

    %% Styling
    classDef auth fill:#e8f5e8
    classDef authz fill:#e3f2fd
    classDef middleware fill:#fff3e0
    classDef protection fill:#fce4ec

    class LOGIN,OAUTH auth
    class RBAC,GUARD authz
    class CORS,RATE,VALID middleware
    class ENCRYPT,AUDIT protection
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Load Balancer Layer"
        LB[Load Balancer<br/>- NGINX/HAProxy<br/>- SSL Termination<br/>- Health Checks]
    end

    subgraph "Application Tier"
        APP1[App Instance 1<br/>- FastAPI<br/>- WebSocket<br/>- Motor Sim]
        
        APP2[App Instance 2<br/>- FastAPI<br/>- WebSocket<br/>- Motor Sim]
        
        APP3[App Instance N<br/>- FastAPI<br/>- WebSocket<br/>- Motor Sim]
    end

    subgraph "Data Tier"
        REDIS[Redis Cluster<br/>- Session Store<br/>- Real-time Cache<br/>- Message Queue]
        
        POSTGRES[PostgreSQL + TimescaleDB<br/>- Primary Database<br/>- Time Series Data<br/>- Read Replicas]
        
        STORAGE[Object Storage<br/>- S3/MinIO<br/>- File Uploads<br/>- Static Assets]
    end

    subgraph "Monitoring & Logging"
        METRICS[Prometheus<br/>- Application Metrics<br/>- Performance Data<br/>- Alerts]
        
        LOGS[ELK Stack<br/>- Centralized Logging<br/>- Log Analysis<br/>- Error Tracking]
        
        GRAFANA[Grafana Dashboard<br/>- Visualization<br/>- Monitoring<br/>- Alerting]
    end

    %% Traffic flow
    LB --> APP1
    LB --> APP2  
    LB --> APP3

    %% Data connections
    APP1 --> REDIS
    APP1 --> POSTGRES
    APP1 --> STORAGE
    
    APP2 --> REDIS
    APP2 --> POSTGRES
    APP2 --> STORAGE
    
    APP3 --> REDIS
    APP3 --> POSTGRES
    APP3 --> STORAGE

    %% Monitoring connections
    APP1 --> METRICS
    APP2 --> METRICS
    APP3 --> METRICS
    
    METRICS --> GRAFANA
    LOGS --> GRAFANA

    %% Styling
    classDef lb fill:#e3f2fd
    classDef app fill:#e8f5e8
    classDef data fill:#fff3e0
    classDef monitor fill:#fce4ec

    class LB lb
    class APP1,APP2,APP3 app
    class REDIS,POSTGRES,STORAGE data
    class METRICS,LOGS,GRAFANA monitor
```

These architecture diagrams provide a comprehensive view of the Motor Simulation System, from high-level system structure to detailed component interactions and deployment considerations.
