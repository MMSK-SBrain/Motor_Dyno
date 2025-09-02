         ))}
       </select>
     );
   };
   ```

3. **Real-time Plotting Component**
   ```typescript
   // src/components/RealTimePlot.tsx
   import React, { useRef, useEffect } from 'react';
   import uPlot from 'uplot';
   
   interface PlotData {
     time: number[];
     speed: number[];
     torque: number[];
   }
   
   export const RealTimePlot: React.FC<{data: PlotData}> = ({ data }) => {
     const chartRef = useRef<HTMLDivElement>(null);
     const plotRef = useRef<uPlot | null>(null);
     
     useEffect(() => {
       if (!chartRef.current) return;
       
       const opts: uPlot.Options = {
         title: "Motor Performance",
         width: 800,
         height: 400,
         series: [
           {},
           { label: "Speed (RPM)", stroke: "blue" },
           { label: "Torque (Nm)", stroke: "red" }
         ],
         axes: [
           {},
           { label: "Speed (RPM)" },
           { label: "Torque (Nm)", side: 1 }
         ]
       };
       
       plotRef.current = new uPlot(opts, [data.time, data.speed, data.torque], chartRef.current);
       
       return () => plotRef.current?.destroy();
     }, []);
     
     useEffect(() => {
       if (plotRef.current) {
         plotRef.current.setData([data.time, data.speed, data.torque]);
       }
     }, [data]);
     
     return <div ref={chartRef} />;
   };
   ```

4. **WebSocket Service**
   ```typescript
   // src/services/websocket.ts
   export class WebSocketService {
     private ws: WebSocket | null = null;
     private callbacks: Map<string, Function> = new Map();
     
     connect(url: string) {
       this.ws = new WebSocket(url);
       
       this.ws.onopen = () => console.log('WebSocket connected');
       this.ws.onmessage = (event) => this.handleMessage(event);
       this.ws.onerror = (error) => console.error('WebSocket error:', error);
     }
     
     private handleMessage(event: MessageEvent) {
       const data = JSON.parse(event.data);
       const callback = this.callbacks.get(data.type);
       if (callback) callback(data.payload);
     }
     
     subscribe(eventType: string, callback: Function) {
       this.callbacks.set(eventType, callback);
     }
     
     send(message: any) {
       if (this.ws?.readyState === WebSocket.OPEN) {
         this.ws.send(JSON.stringify(message));
       }
     }
   }
   ```

### Phase 2: Core Simulation (Weeks 3-4)

#### Week 3: Real-time Simulation Engine
**Objectives:**
- Implement 1ms timestep simulation loop
- Create PID controller with anti-windup
- Add motor-specific physics models
- Integrate load torque calculation

**Tasks:**
1. **Real-time Simulation Loop**
   ```python
   # app/simulation/real_time.py
   import asyncio
   import time
   import numpy as np
   from typing import Dict, List
   
   class RealTimeSimulator:
       def __init__(self, timestep_ms: float = 1.0):
           self.timestep = timestep_ms / 1000.0
           self.motor_model = None
           self.controller = None
           self.running = False
           self.clients = []
           self.data_buffer = []
           
       async def start_simulation(self, motor_config: Dict):
           self.setup_motor(motor_config)
           self.running = True
           await self.simulation_loop()
           
       async def simulation_loop(self):
           target_time = time.time()
           step_count = 0
           
           while self.running:
               # Get current time for precise timing
               current_time = time.time()
               
               # Run simulation step
               motor_state = self.simulate_step()
               
               # Buffer data for streaming (every 10ms)
               if step_count % 10 == 0:
                   self.buffer_data(motor_state, current_time)
                   await self.stream_to_clients()
               
               # Maintain precise timing
               target_time += self.timestep
               sleep_time = target_time - time.time()
               
               if sleep_time > 0:
                   await asyncio.sleep(sleep_time)
               elif sleep_time < -0.001:  # Warn if falling behind
                   print(f"Simulation falling behind by {-sleep_time*1000:.1f}ms")
               
               step_count += 1
               
       def simulate_step(self) -> Dict:
           # This will be implemented with motor-specific physics
           return {
               'timestamp': time.time(),
               'speed_rpm': 1500,
               'torque_nm': 5.0,
               'current_a': 12.0,
               'voltage_v': 48.0,
               'efficiency': 0.89,
               'power_w': 785.0
           }
   ```

2. **PID Controller Implementation**
   ```python
   # app/control/pid_controller.py
   import numpy as np
   from dataclasses import dataclass
   
   @dataclass
   class PIDParams:
       kp: float = 1.0
       ki: float = 0.1
       kd: float = 0.01
       max_output: float = 100.0
       max_integral: float = 50.0
       
   class PIDController:
       def __init__(self, params: PIDParams):
           self.params = params
           self.integral = 0.0
           self.last_error = 0.0
           self.last_time = None
           
       def update(self, setpoint: float, process_variable: float, dt: float) -> float:
           error = setpoint - process_variable
           
           # Proportional term
           p_term = self.params.kp * error
           
           # Integral term with anti-windup
           self.integral += error * dt
           self.integral = np.clip(self.integral, 
                                 -self.params.max_integral, 
                                  self.params.max_integral)
           i_term = self.params.ki * self.integral
           
           # Derivative term
           d_term = 0.0
           if self.last_error is not None:
               d_term = self.params.kd * (error - self.last_error) / dt
           
           # Calculate output
           output = p_term + i_term + d_term
           output = np.clip(output, -self.params.max_output, self.params.max_output)
           
           # Anti-windup: reduce integral if output is saturated
           if abs(output) >= self.params.max_output:
               self.integral -= error * dt * 0.1  # Reduce integral buildup
           
           self.last_error = error
           return output
   ```

#### Week 4: Motor Physics Integration
**Objectives:**
- Implement BLDC motor model
- Add PMSM with d-q control
- Create SRM switching logic
- Integrate ACIM slip calculation

**Tasks:**
1. **BLDC Motor Model**
   ```python
   # app/simulation/bldc_motor.py
   import numpy as np
   from dataclasses import dataclass
   
   @dataclass
   class BLDCParameters:
       resistance: float  # Phase resistance (ohm)
       inductance: float  # Phase inductance (H)
       kt: float         # Torque constant (Nm/A)
       ke: float         # Back EMF constant (V*s/rad)
       pole_pairs: int   # Number of pole pairs
       inertia: float    # Rotor inertia (kg*m^2)
       friction: float   # Friction coefficient
       
   class BLDCMotor:
       def __init__(self, params: BLDCParameters):
           self.params = params
           self.speed = 0.0
           self.position = 0.0
           self.current = 0.0
           
       def step(self, voltage: float, load_torque: float, dt: float) -> Dict:
           # Back EMF calculation
           back_emf = self.params.ke * self.speed
           
           # Current dynamics (simplified first-order)
           tau_electrical = self.params.inductance / self.params.resistance
           current_target = (voltage - back_emf) / self.params.resistance
           
           # Current update with electrical time constant
           self.current += (current_target - self.current) * dt / tau_electrical
           
           # Torque calculation
           motor_torque = self.params.kt * self.current
           
           # Mechanical dynamics
           friction_torque = self.params.friction * self.speed
           net_torque = motor_torque - load_torque - friction_torque
           
           # Speed update
           acceleration = net_torque / self.params.inertia
           self.speed += acceleration * dt
           
           # Position update  
           self.position += self.speed * dt
           
           # Calculate power and efficiency
           electrical_power = voltage * self.current
           mechanical_power = motor_torque * self.speed
           efficiency = mechanical_power / max(electrical_power, 1e-6)
           
           return {
               'speed_rpm': self.speed * 30 / np.pi,
               'torque_nm': motor_torque,
               'current_a': self.current,
               'voltage_v': voltage,
               'back_emf_v': back_emf,
               'power_w': mechanical_power,
               'efficiency': max(0, min(1, efficiency))
           }
   ```

2. **PMSM d-q Model**
   ```python
   # app/simulation/pmsm_motor.py
   import numpy as np
   
   class PMSMMotor:
       def __init__(self, params):
           self.rs = params['resistance']
           self.ld = params['d_inductance'] 
           self.lq = params['q_inductance']
           self.flux_pm = params['pm_flux']
           self.pole_pairs = params['pole_pairs']
           self.inertia = params['inertia']
           
           self.id = 0.0
           self.iq = 0.0
           self.speed = 0.0
           self.theta = 0.0
           
       def step(self, vd: float, vq: float, load_torque: float, dt: float):
           # Electrical frequency
           omega_e = self.speed * self.pole_pairs
           
           # d-axis current dynamics
           did_dt = (vd - self.rs * self.id + omega_e * self.lq * self.iq) / self.ld
           self.id += did_dt * dt
           
           # q-axis current dynamics  
           diq_dt = (vq - self.rs * self.iq - omega_e * (self.ld * self.id + self.flux_pm)) / self.lq
           self.iq += diq_dt * dt
           
           # Electromagnetic torque
           torque_em = 1.5 * self.pole_pairs * (self.flux_pm * self.iq + (self.ld - self.lq) * self.id * self.iq)
           
           # Mechanical dynamics
           net_torque = torque_em - load_torque
           acceleration = net_torque / self.inertia
           self.speed += acceleration * dt
           self.theta += self.speed * dt
           
           return {
               'speed_rpm': self.speed * 30 / np.pi,
               'torque_nm': torque_em,
               'id_a': self.id,
               'iq_a': self.iq,
               'current_total_a': np.sqrt(self.id**2 + self.iq**2),
               'theta_rad': self.theta
           }
   ```

### Phase 3: Advanced Features (Weeks 5-6)

#### Week 5: Drive Cycle Implementation
**Objectives:**
- Add CSV/Excel file upload processing
- Implement drive cycle interpolation
- Create powertrain load calculation
- Add cycle validation logic

**Tasks:**
1. **File Upload Handler**
   ```python
   # app/api/files.py
   from fastapi import APIRouter, UploadFile, File, HTTPException
   import pandas as pd
   import io
   
   router = APIRouter()
   
   @router.post("/upload/drive-cycle")
   async def upload_drive_cycle(file: UploadFile = File(...)):
       if not file.filename.endswith(('.csv', '.xlsx')):
           raise HTTPException(400, "File must be CSV or Excel format")
       
       try:
           content = await file.read()
           
           if file.filename.endswith('.csv'):
               df = pd.read_csv(io.BytesIO(content))
           else:
               df = pd.read_excel(io.BytesIO(content))
           
           # Validate required columns
           required_cols = ['time_s', 'speed_rpm', 'load_torque_percent']
           missing_cols = set(required_cols) - set(df.columns)
           if missing_cols:
               raise HTTPException(400, f"Missing columns: {missing_cols}")
           
           # Validate data ranges
           if (df['speed_rpm'] < 0).any() or (df['speed_rpm'] > 6000).any():
               raise HTTPException(400, "Speed must be between 0 and 6000 RPM")
           
           # Store processed data
           cycle_data = df.to_dict('records')
           
           return {
               "status": "success",
               "points": len(cycle_data),
               "duration": df['time_s'].max(),
               "data": cycle_data
           }
           
       except Exception as e:
           raise HTTPException(500, f"Error processing file: {str(e)}")
   ```

2. **Drive Cycle Controller**
   ```python
   # app/control/drive_cycle.py
   import numpy as np
   from scipy.interpolate import interp1d
   
   class DriveProfileController:
       def __init__(self, cycle_data: List[Dict]):
           self.time_points = [point['time_s'] for point in cycle_data]
           self.speed_points = [point['speed_rpm'] for point in cycle_data]
           self.load_points = [point['load_torque_percent'] for point in cycle_data]
           
           # Create interpolation functions
           self.speed_interp = interp1d(self.time_points, self.speed_points, 
                                      kind='linear', fill_value='extrapolate')
           self.load_interp = interp1d(self.time_points, self.load_points,
                                     kind='linear', fill_value='extrapolate')
           
           self.start_time = None
           
       def get_setpoint(self, current_time: float) -> Dict:
           if self.start_time is None:
               self.start_time = current_time
               
           elapsed = current_time - self.start_time
           max_time = max(self.time_points)
           
           # Handle cycle completion
           if elapsed > max_time:
               elapsed = max_time
               
           speed_setpoint = float(self.speed_interp(elapsed))
           load_percent = float(self.load_interp(elapsed))
           
           return {
               'speed_setpoint_rpm': speed_setpoint,
               'load_torque_percent': load_percent,
               'cycle_time_s': elapsed,
               'cycle_complete': elapsed >= max_time
           }
   ```

#### Week 6: Analysis and Export
**Objectives:**
- Implement efficiency map generation
- Add performance metric calculations
- Create data export functionality
- Build comparison tools

**Tasks:**
1. **Efficiency Map Generator**
   ```python
   # app/analysis/efficiency_map.py
   import numpy as np
   import pandas as pd
   from typing import Tuple, List
   
   class EfficiencyMapper:
       def __init__(self, motor_simulator):
           self.motor = motor_simulator
           
       async def generate_map(self, speed_range: Tuple[int, int], 
                            torque_range: Tuple[float, float],
                            grid_size: Tuple[int, int] = (20, 20)) -> pd.DataFrame:
           
           speed_points = np.linspace(speed_range[0], speed_range[1], grid_size[0])
           torque_points = np.linspace(torque_range[0], torque_range[1], grid_size[1])
           
           results = []
           
           for speed in speed_points:
               for torque in torque_points:
                   # Run steady-state simulation
                   result = await self.run_steady_state(speed, torque)
                   results.append({
                       'speed_rpm': speed,
                       'torque_nm': torque,
                       'efficiency': result['efficiency'],
                       'current_a': result['current'],
                       'voltage_v': result['voltage'],
                       'power_w': result['power']
                   })
           
           return pd.DataFrame(results)
           
       async def run_steady_state(self, speed_rpm: float, torque_nm: float, 
                                settle_time: float = 2.0) -> Dict:
           # Set motor to target speed/torque and wait for settling
           # This is a simplified version - actual implementation would
           # run closed-loop control until steady state is reached
           
           omega = speed_rpm * np.pi / 30
           power_mech = torque_nm * omega
           
           # Estimate current based on motor parameters
           if hasattr(self.motor, 'kt'):
               current = torque_nm / self.motor.kt
           else:
               current = torque_nm / 0.15  # Default estimate
           
           # Estimate voltage (simplified)
           voltage = 48.0  # Default bus voltage
           power_elec = voltage * current
           
           efficiency = power_mech / max(power_elec, 1e-6) if power_elec > 0 else 0
           efficiency = max(0, min(1, efficiency))
           
           return {
               'efficiency': efficiency,
               'current': current,
               'voltage': voltage,
               'power': power_mech
           }
   ```

2. **Performance Analysis**
   ```python
   # app/analysis/performance.py
   import numpy as np
   from typing import List, Dict
   
   class PerformanceAnalyzer:
       @staticmethod
       def calculate_metrics(simulation_data: List[Dict]) -> Dict:
           df = pd.DataFrame(simulation_data)
           
           # Energy calculations
           dt = df['timestamp'].diff().fillna(0.001)
           energy_wh = (df['power_w'] * dt / 3600).sum()
           
           # Efficiency statistics
           efficiency_avg = df['efficiency'].mean()
           efficiency_weighted = (df['efficiency'] * df['power_w']).sum() / df['power_w'].sum()
           
           # Speed tracking (if setpoint available)
           if 'speed_setpoint_rpm' in df.columns:
               speed_error = df['speed_rpm'] - df['speed_setpoint_rpm']
               speed_rms_error = np.sqrt((speed_error**2).mean())
               max_speed_error = speed_error.abs().max()
           else:
               speed_rms_error = 0
               max_speed_error = 0
           
           # Power statistics
           peak_power = df['power_w'].max()
           avg_power = df['power_w'].mean()
           
           return {
               'energy_consumption_wh': energy_wh,
               'average_efficiency': efficiency_avg,
               'weighted_efficiency': efficiency_weighted,
               'speed_tracking_rms_error_rpm': speed_rms_error,
               'max_speed_error_rpm': max_speed_error,
               'peak_power_w': peak_power,
               'average_power_w': avg_power,
               'duration_s': df['timestamp'].iloc[-1] - df['timestamp'].iloc[0]
           }
   ```

## Testing Strategy

### Unit Tests
```python
# tests/test_pid_controller.py
import pytest
from app.control.pid_controller import PIDController, PIDParams

def test_pid_proportional_only():
    params = PIDParams(kp=1.0, ki=0.0, kd=0.0)
    controller = PIDController(params)
    
    output = controller.update(setpoint=100, process_variable=90, dt=0.001)
    assert output == 10.0  # Pure proportional response

def test_pid_anti_windup():
    params = PIDParams(kp=1.0, ki=1.0, kd=0.0, max_output=50.0)
    controller = PIDController(params)
    
    # Apply large error for extended time
    for _ in range(1000):
        controller.update(setpoint=100, process_variable=0, dt=0.001)
    
    # Integral should be limited
    assert abs(controller.integral) <= params.max_integral
```

### Integration Tests
```python
# tests/test_motor_simulation.py
import pytest
from app.simulation.bldc_motor import BLDCMotor, BLDCParameters

@pytest.mark.asyncio
async def test_bldc_motor_steady_state():
    params = BLDCParameters(
        resistance=0.1, inductance=0.002, kt=0.15, ke=0.15,
        pole_pairs=4, inertia=0.001, friction=0.001
    )
    motor = BLDCMotor(params)
    
    # Run simulation to steady state
    voltage = 48.0
    load_torque = 5.0
    dt = 0.001
    
    for _ in range(5000):  # 5 seconds
        result = motor.step(voltage, load_torque, dt)
    
    # Check steady-state values are reasonable
    assert 1000 < result['speed_rpm'] < 4000
    assert 0.8 < result['efficiency'] < 1.0
    assert result['torque_nm'] > 4.5
```

## Deployment Checklist

### Development Environment
- [ ] Python 3.11+ with virtual environment
- [ ] FastAPI with uvicorn server
- [ ] PostgreSQL or SQLite database
- [ ] Redis for caching (optional)
- [ ] Node.js 18+ for frontend development
- [ ] Docker and docker-compose for containerization

### Production Requirements
- [ ] HTTPS certificate and domain configuration
- [ ] Environment variable management
- [ ] Database backups and recovery procedures
- [ ] Monitoring and logging setup
- [ ] Load balancer configuration (if needed)
- [ ] Security headers and CORS policies

### Performance Validation
- [ ] 1ms simulation timestep accuracy verified
- [ ] WebSocket latency < 50ms measured
- [ ] uPlot.js handling 10,000+ points at 60 FPS
- [ ] Memory usage stable during long simulations
- [ ] Multi-user concurrent access tested

This implementation guide provides a structured approach to building the motor simulation system, with concrete code examples and testing strategies to ensure reliable operation.
