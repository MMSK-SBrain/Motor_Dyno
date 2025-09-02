# API Specification

## Overview

The Motor Simulation API provides RESTful endpoints for configuration and WebSocket connections for real-time data streaming. The API follows OpenAPI 3.0 specification and supports JSON for REST endpoints and binary protocols for WebSocket communication.

## Base Configuration

```yaml
openapi: 3.0.0
info:
  title: Motor Simulation API
  version: 1.0.0
  description: Real-time electric motor simulation and testing API
servers:
  - url: http://localhost:8000
    description: Development server
  - url: https://api.motorsim.example.com
    description: Production server
```

## Authentication

### JWT Token Authentication
```http
Authorization: Bearer <jwt_token>
```

**Token Acquisition:**
```http
POST /auth/login
Content-Type: application/json

{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": 1,
    "username": "user@example.com",
    "role": "engineer"
  }
}
```

## REST API Endpoints

### Motor Configuration

#### List Available Motors
```http
GET /api/v1/motors
```

**Response:**
```json
{
  "motors": [
    {
      "id": "bldc_2kw_48v",
      "name": "2kW BLDC Motor",
      "type": "BLDC",
      "rated_power_kw": 2.0,
      "rated_voltage_v": 48.0,
      "rated_speed_rpm": 3000,
      "max_speed_rpm": 6000,
      "rated_torque_nm": 7.6,
      "max_torque_nm": 15.0,
      "efficiency_percent": 92
    },
    {
      "id": "pmsm_1kw_320v",
      "name": "1kW PMSM Motor", 
      "type": "PMSM",
      "rated_power_kw": 1.0,
      "rated_voltage_v": 320.0,
      "rated_speed_rpm": 1500,
      "max_speed_rpm": 4500,
      "rated_torque_nm": 6.37,
      "max_torque_nm": 12.0,
      "efficiency_percent": 94
    }
  ]
}
```

#### Get Motor Details
```http
GET /api/v1/motors/{motor_id}
```

**Response:**
```json
{
  "id": "bldc_2kw_48v",
  "name": "2kW BLDC Motor",
  "type": "BLDC",
  "description": "High-efficiency brushless DC motor for EV applications",
  
  "electrical_specs": {
    "rated_power_kw": 2.0,
    "rated_voltage_v": 48.0,
    "rated_current_a": 45.0,
    "rated_speed_rpm": 3000,
    "rated_torque_nm": 7.6,
    "max_speed_rpm": 6000,
    "max_torque_nm": 15.0,
    "efficiency_percent": 92
  },
  
  "physical_parameters": {
    "poles": 8,
    "stator_slots": 12,
    "configuration": "star",
    "phase_resistance_ohm": 0.08,
    "phase_inductance_mh": 1.5,
    "torque_constant_nm_per_a": 0.169,
    "back_emf_constant_v_per_rad_per_s": 0.169,
    "rotor_inertia_kg_m2": 0.001
  },
  
  "operating_limits": {
    "max_current_a": 90.0,
    "max_voltage_v": 60.0,
    "max_temperature_c": 120,
    "min_speed_rpm": 100,
    "continuous_power_kw": 2.0,
    "peak_power_kw": 4.0
  }
}
```

#### Get Motor Efficiency Map
```http
GET /api/v1/motors/{motor_id}/efficiency-map
```

**Query Parameters:**
- `speed_min` (optional): Minimum speed in RPM
- `speed_max` (optional): Maximum speed in RPM  
- `torque_min` (optional): Minimum torque in Nm
- `torque_max` (optional): Maximum torque in Nm
- `grid_size` (optional): Grid resolution (default: 20x20)

**Response:**
```json
{
  "motor_id": "bldc_2kw_48v",
  "grid_size": [20, 20],
  "data_points": 400,
  "efficiency_map": [
    {
      "speed_rpm": 500,
      "torque_nm": 1.0,
      "efficiency_percent": 78.5,
      "current_a": 6.2,
      "voltage_v": 47.8,
      "power_w": 52.4,
      "temperature_c": 25
    }
  ]
}
```

### Simulation Control

#### Start Simulation Session
```http
POST /api/v1/simulation/start
Content-Type: application/json
```

**Request Body:**
```json
{
  "motor_id": "bldc_2kw_48v",
  "control_mode": "manual",
  "session_name": "Test Session 1",
  "configuration": {
    "timestep_ms": 1.0,
    "max_duration_s": 3600,
    "data_logging_enabled": true,
    "pid_params": {
      "kp": 1.0,
      "ki": 0.1,
      "kd": 0.01,
      "max_output": 100.0,
      "max_integral": 50.0
    }
  }
}
```

**Response:**
```json
{
  "session_id": "sim_12345",
  "motor_id": "bldc_2kw_48v",
  "status": "started",
  "websocket_url": "ws://localhost:8000/ws/simulation/sim_12345",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Stop Simulation Session
```http
POST /api/v1/simulation/{session_id}/stop
```

**Response:**
```json
{
  "session_id": "sim_12345",
  "status": "stopped",
  "duration_s": 125.6,
  "data_points": 12560,
  "stopped_at": "2024-01-15T10:32:05Z"
}
```

#### Update Control Parameters
```http
PUT /api/v1/simulation/{session_id}/control
Content-Type: application/json
```

**Request Body:**
```json
{
  "control_mode": "manual",
  "target_speed_rpm": 2000,
  "target_torque_nm": 5.0,
  "load_torque_percent": 50,
  "pid_params": {
    "kp": 1.2,
    "ki": 0.15,
    "kd": 0.02
  }
}
```

### Drive Cycle Management

#### Upload Drive Cycle
```http
POST /api/v1/drive-cycles/upload
Content-Type: multipart/form-data
```

**Form Data:**
- `file`: CSV or Excel file
- `name`: Drive cycle name
- `description`: Optional description

**Response:**
```json
{
  "cycle_id": "cycle_123",
  "name": "Custom Urban Cycle",
  "status": "uploaded",
  "validation": {
    "valid": true,
    "data_points": 1369,
    "duration_s": 1369,
    "speed_range_rpm": [0, 3750],
    "warnings": []
  },
  "file_info": {
    "filename": "urban_cycle.csv",
    "size_bytes": 45678,
    "uploaded_at": "2024-01-15T10:35:00Z"
  }
}
```

#### List Drive Cycles
```http
GET /api/v1/drive-cycles
```

**Response:**
```json
{
  "cycles": [
    {
      "id": "udds",
      "name": "Urban Dynamometer Driving Schedule",
      "type": "standard",
      "duration_s": 1369,
      "max_speed_rpm": 3750,
      "description": "EPA standard urban driving cycle"
    },
    {
      "id": "cycle_123",
      "name": "Custom Urban Cycle",
      "type": "custom",
      "duration_s": 1369,
      "max_speed_rpm": 2800,
      "uploaded_by": "user@example.com"
    }
  ]
}
```

#### Start Drive Cycle Test
```http
POST /api/v1/simulation/{session_id}/drive-cycle
Content-Type: application/json
```

**Request Body:**
```json
{
  "cycle_id": "udds",
  "powertrain_config": {
    "vehicle_mass_kg": 1200,
    "wheel_radius_m": 0.32,
    "gear_ratio": 8.5,
    "drag_coefficient": 0.32,
    "frontal_area_m2": 2.3,
    "rolling_resistance": 0.012
  },
  "repeat_count": 1,
  "auto_start": true
}
```

### Data Analysis

#### Get Session Results
```http
GET /api/v1/simulation/{session_id}/results
```

**Query Parameters:**
- `start_time` (optional): Start time for data range
- `end_time` (optional): End time for data range
- `include_raw_data` (optional): Include all data points (default: false)

**Response:**
```json
{
  "session_id": "sim_12345",
  "motor_id": "bldc_2kw_48v",
  "session_info": {
    "start_time": "2024-01-15T10:30:00Z",
    "end_time": "2024-01-15T10:32:05Z",
    "duration_s": 125.6,
    "control_mode": "drive_cycle",
    "cycle_name": "UDDS"
  },
  
  "performance_metrics": {
    "energy_consumption_wh": 156.7,
    "regenerative_recovery_wh": 23.4,
    "net_consumption_wh": 133.3,
    "average_efficiency_percent": 87.2,
    "peak_power_kw": 3.2,
    "speed_tracking_rms_error_rpm": 12.3,
    "max_speed_error_rpm": 45
  },
  
  "control_quality": {
    "pid_settling_time_avg_s": 0.8,
    "pid_overshoot_avg_percent": 5.2,
    "steady_state_error_rms_rpm": 3.1,
    "control_effort_rms": 0.65
  },
  
  "raw_data": [
    {
      "timestamp": "2024-01-15T10:30:00.000Z",
      "speed_rpm": 0,
      "torque_nm": 0,
      "current_a": 0,
      "voltage_v": 48.0,
      "efficiency_percent": 0,
      "power_w": 0
    }
  ]
}
```

#### Export Session Data
```http
GET /api/v1/simulation/{session_id}/export
```

**Query Parameters:**
- `format`: Export format (csv, excel, json)
- `include_metadata`: Include session metadata (default: true)
- `time_format`: Time format (iso, unix, relative)

**Response:** Binary file download

### Comparison and Analysis

#### Compare Multiple Sessions
```http
POST /api/v1/analysis/compare
Content-Type: application/json
```

**Request Body:**
```json
{
  "session_ids": ["sim_12345", "sim_12346", "sim_12347"],
  "comparison_type": "efficiency",
  "metrics": ["energy_consumption", "average_efficiency", "peak_power"],
  "normalize": true
}
```

**Response:**
```json
{
  "comparison_id": "comp_456",
  "sessions": 3,
  "comparison_type": "efficiency",
  "results": {
    "session_summary": [
      {
        "session_id": "sim_12345",
        "motor_type": "BLDC",
        "energy_consumption_wh": 156.7,
        "average_efficiency_percent": 87.2,
        "peak_power_kw": 3.2,
        "rank": 1
      }
    ],
    "statistical_analysis": {
      "energy_consumption_wh": {
        "mean": 158.3,
        "std": 12.4,
        "min": 145.2,
        "max": 172.1
      }
    }
  }
}
```
## WebSocket API

### Connection Establishment

#### Connect to Simulation Session
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/simulation/sim_12345');

ws.onopen = () => {
    console.log('Connected to simulation session');
    
    // Send initial configuration
    ws.send(JSON.stringify({
        type: 'configure',
        payload: {
            data_rate_hz: 100,
            binary_protocol: true,
            compression: 'gzip'
        }
    }));
};
```

### Message Protocols

#### JSON Protocol (Development/Debug)
**Control Command:**
```json
{
  "type": "control",
  "timestamp": 1705312200000,
  "payload": {
    "target_speed_rpm": 2000,
    "target_torque_nm": 5.0,
    "load_torque_percent": 50
  }
}
```

**Real-time Data:**
```json
{
  "type": "simulation_data",
  "timestamp": 1705312200000,
  "payload": {
    "speed_rpm": 1995.2,
    "torque_nm": 5.1,
    "current_a": 30.2,
    "voltage_v": 47.8,
    "efficiency_percent": 89.1,
    "power_w": 1067.4,
    "temperature_c": 65.2,
    "pid_output": 85.3,
    "pid_error": -4.8
  }
}
```

#### Binary Protocol (Production)
**Message Header (8 bytes):**
```c
struct MessageHeader {
    uint16_t message_type;    // 0x0001 = data, 0x0002 = control
    uint16_t payload_length;  // Length of payload in bytes
    uint32_t timestamp_ms;    // Milliseconds since epoch
};
```

**Simulation Data Payload (32 bytes):**
```c
struct SimulationData {
    float speed_rpm;          // Motor speed
    float torque_nm;          // Motor torque  
    float current_a;          // Phase current RMS
    float voltage_v;          // DC bus voltage
    float efficiency;         // Efficiency (0.0 to 1.0)
    float power_w;           // Mechanical power
    float temperature_c;      // Motor temperature
    float pid_output;        // PID controller output
};
```

**JavaScript Binary Decoding:**
```javascript
function decodeBinaryMessage(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    // Read header
    const messageType = view.getUint16(offset, true); offset += 2;
    const payloadLength = view.getUint16(offset, true); offset += 2;
    const timestamp = view.getUint32(offset, true); offset += 4;
    
    // Read simulation data payload
    const data = {
        timestamp: timestamp,
        speed_rpm: view.getFloat32(offset, true), 
        torque_nm: view.getFloat32(offset + 4, true),
        current_a: view.getFloat32(offset + 8, true),
        voltage_v: view.getFloat32(offset + 12, true),
        efficiency: view.getFloat32(offset + 16, true),
        power_w: view.getFloat32(offset + 20, true),
        temperature_c: view.getFloat32(offset + 24, true),
        pid_output: view.getFloat32(offset + 28, true)
    };
    
    return data;
}
```

### WebSocket Events

#### Client to Server

**Start Simulation:**
```json
{
  "type": "start_simulation",
  "payload": {
    "motor_id": "bldc_2kw_48v",
    "control_mode": "manual",
    "initial_speed_rpm": 1000
  }
}
```

**Update Control:**
```json
{
  "type": "update_control", 
  "payload": {
    "target_speed_rpm": 2500,
    "load_torque_percent": 75
  }
}
```

**PID Tuning:**
```json
{
  "type": "update_pid",
  "payload": {
    "kp": 1.5,
    "ki": 0.2,
    "kd": 0.05
  }
}
```

#### Server to Client

**Simulation Status:**
```json
{
  "type": "status",
  "payload": {
    "session_id": "sim_12345",
    "status": "running",
    "uptime_s": 125.6,
    "data_points": 12560,
    "performance": {
      "simulation_rate_hz": 1000,
      "data_rate_hz": 100,
      "cpu_usage_percent": 15.2,
      "memory_mb": 45.3
    }
  }
}
```

**Error Message:**
```json
{
  "type": "error",
  "payload": {
    "error_code": "MOTOR_OVERSPEED",
    "message": "Motor speed exceeded maximum limit",
    "details": {
      "current_speed_rpm": 6200,
      "max_speed_rpm": 6000,
      "timestamp": 1705312200000
    }
  }
}
```

**Alert/Warning:**
```json
{
  "type": "alert",
  "payload": {
    "alert_type": "temperature_warning", 
    "severity": "warning",
    "message": "Motor temperature approaching limit",
    "current_value": 115.2,
    "threshold": 120.0,
    "recommended_action": "Reduce load or increase cooling"
  }
}
```

## Error Handling

### HTTP Error Responses

**400 Bad Request:**
```json
{
  "error": "validation_error",
  "message": "Invalid motor parameter",
  "details": {
    "field": "target_speed_rpm",
    "value": 7000,
    "constraint": "Must be <= 6000 RPM"
  }
}
```

**404 Not Found:**
```json
{
  "error": "resource_not_found",
  "message": "Simulation session not found",
  "details": {
    "session_id": "sim_99999",
    "suggestion": "Check session ID or create new session"
  }
}
```

**429 Too Many Requests:**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "details": {
    "limit": 100,
    "window": "60s",
    "retry_after": 45
  }
}
```

**500 Internal Server Error:**
```json
{
  "error": "simulation_error",
  "message": "Simulation engine failure",
  "details": {
    "error_id": "err_123456",
    "timestamp": "2024-01-15T10:32:00Z",
    "support_info": "Contact support with error ID"
  }
}
```

### WebSocket Error Codes

| Code | Name | Description |
|------|------|-------------|
| 1000 | Normal Closure | Simulation completed normally |
| 1001 | Going Away | Server shutting down |
| 1002 | Protocol Error | Invalid message format |
| 1003 | Unsupported Data | Message type not supported |
| 1008 | Policy Violation | Authentication failed |
| 1011 | Internal Error | Simulation engine error |
| 4000 | Motor Error | Motor-specific error |
| 4001 | Control Error | Control system error |
| 4002 | Data Error | Data validation error |

## Rate Limiting

### REST API Limits
- **Global**: 1000 requests per hour per user
- **Motor Configuration**: 100 requests per hour
- **File Upload**: 10 files per hour, 10MB max per file
- **Data Export**: 50 exports per hour, 100MB max per export

### WebSocket Limits
- **Connections**: 10 concurrent sessions per user
- **Message Rate**: 1000 messages per minute per connection
- **Data Rate**: 10MB per minute per connection

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 899
X-RateLimit-Reset: 1705315800
X-RateLimit-Window: 3600
```

## Data Formats

### Time Formats
- **ISO 8601**: `2024-01-15T10:30:00.000Z` (default)
- **Unix Timestamp**: `1705312200` (seconds since epoch)
- **Relative**: `125.6` (seconds since session start)

### Units and Conventions
- **Speed**: RPM (revolutions per minute)
- **Torque**: Nm (Newton-meters)  
- **Current**: A (Amperes RMS)
- **Voltage**: V (Volts DC)
- **Power**: W (Watts mechanical)
- **Temperature**: °C (Celsius)
- **Efficiency**: Decimal (0.0 to 1.0) or percentage
- **Time**: Seconds with millisecond precision

### CSV Export Format
```csv
timestamp,speed_rpm,torque_nm,current_a,voltage_v,efficiency,power_w,temperature_c
2024-01-15T10:30:00.000Z,0,0,0,48.0,0,0,25.0
2024-01-15T10:30:00.010Z,105.2,0.5,3.1,47.9,0.785,5.5,25.1
2024-01-15T10:30:00.020Z,210.1,1.0,6.2,47.8,0.825,22.0,25.3
```

## Authentication & Authorization

### User Roles
- **Student**: Read-only access to standard motors and cycles
- **Engineer**: Full access to simulation and analysis features  
- **Admin**: User management and system configuration
- **API**: Programmatic access with rate limit exemptions

### Permissions Matrix
| Endpoint | Student | Engineer | Admin | API |
|----------|---------|----------|--------|-----|
| GET /motors | ✓ | ✓ | ✓ | ✓ |
| POST /simulation/start | ✓ | ✓ | ✓ | ✓ |
| POST /drive-cycles/upload | - | ✓ | ✓ | ✓ |
| GET /users | - | - | ✓ | - |
| POST /motors | - | - | ✓ | ✓ |

### API Key Usage
```http
GET /api/v1/motors
X-API-Key: your-api-key-here
Content-Type: application/json
```

## Versioning

### API Versioning Strategy
- **URL Path**: `/api/v1/` for version 1
- **Header**: `API-Version: 1.0` (optional)
- **Backward Compatibility**: Maintained for 2 major versions
- **Deprecation Notice**: 6 months before removal

### Version History
- **v1.0**: Initial release with basic motor simulation
- **v1.1**: Added drive cycle support and PID tuning
- **v1.2**: Enhanced efficiency mapping and analysis tools
- **v2.0**: (Planned) Machine learning optimization features

This API specification provides comprehensive documentation for integrating with the Motor Simulation system, supporting both REST and WebSocket protocols for different use cases.
