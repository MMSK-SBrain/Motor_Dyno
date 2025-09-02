# Drive Cycle Test Specifications

## Overview

Drive cycle testing simulates real-world motor operation through predefined speed-time profiles. The system supports standard automotive cycles, custom uploaded profiles, and powertrain-level simulation with vehicle dynamics.

## Standard Drive Cycles

### 1. Urban Driving Cycle (UDDS)
**Profile Characteristics:**
- **Duration**: 1,369 seconds (23 minutes)
- **Distance**: 12.07 km
- **Average Speed**: 31.5 km/h
- **Maximum Speed**: 91.2 km/h
- **Idle Time**: 18% of cycle

**Motor Speed Profile (excerpt):**
```csv
time_s,speed_rpm,load_torque_percent,vehicle_speed_kmh
0,0,0,0
5,210,15,8.5
10,420,28,17.0
15,630,42,25.5
20,840,55,34.0
25,945,48,38.2
30,1050,52,42.5
35,1155,58,46.8
40,1260,45,51.0
45,1155,38,46.8
50,840,25,34.0
55,420,12,17.0
60,0,0,0
```

### 2. Highway Driving Cycle (HWFET)
**Profile Characteristics:**
- **Duration**: 765 seconds (12.8 minutes)
- **Distance**: 16.45 km
- **Average Speed**: 77.4 km/h
- **Maximum Speed**: 96.4 km/h
- **Idle Time**: 0.2% of cycle

**Motor Speed Profile:**
```csv
time_s,speed_rpm,load_torque_percent,vehicle_speed_kmh
0,0,0,0
10,1890,65,76.5
20,2100,72,85.0
30,2205,75,89.3
40,2310,78,93.5
50,2415,65,97.8
60,2520,68,102.0
70,2415,62,97.8
80,2205,58,89.3
90,1995,55,80.8
100,1890,52,76.5
110,2100,68,85.0
120,2205,71,89.3
```

### 3. Aggressive Performance Cycle
**Profile Characteristics:**
- **Duration**: 300 seconds (5 minutes)
- **Peak Acceleration**: 3.5 m/s²
- **Peak Deceleration**: -4.0 m/s²
- **Maximum Speed**: 150 km/h (3750 RPM)

```csv
time_s,speed_rpm,load_torque_percent,acceleration_rpm_s,notes
0,0,0,0,Start
5,525,85,105,Hard acceleration
10,1050,90,105,Continued acceleration
15,1575,95,105,High load
20,2100,100,105,Peak torque
25,2625,85,105,High speed acceleration
30,3150,70,105,Reduced load at speed
35,3750,60,120,Maximum speed
40,3750,55,0,Sustained high speed
50,3000,45,-150,Moderate deceleration
60,1875,35,-225,Heavy braking
65,0,100,-375,Emergency stop
70,0,0,0,Rest period
```

## Custom Drive Cycle Format

### CSV File Structure
All drive cycle files must follow this standard format:

**Required Headers:**
```csv
time_s,speed_rpm,load_torque_percent
```

**Extended Format (Optional):**
```csv
time_s,speed_rpm,load_torque_percent,vehicle_speed_kmh,acceleration_mps2,grade_percent,notes
```

### Validation Rules
1. **Time Column**: Monotonically increasing, starting from 0
2. **Speed Range**: 0 ≤ speed_rpm ≤ motor_max_speed
3. **Load Range**: -200% ≤ load_torque_percent ≤ 200% (negative for regenerative braking)
4. **Sampling Rate**: Recommended 1-10 Hz (1-0.1 second intervals)
5. **Duration Limits**: 10 seconds minimum, 3600 seconds maximum

### File Upload Processing
```python
import pandas as pd
import numpy as np

class DriveProfileValidator:
    def __init__(self, motor_specs):
        self.max_speed = motor_specs['max_speed_rpm']
        self.max_torque = motor_specs['max_torque_nm']
        
    def validate_profile(self, file_path):
        """Validate uploaded drive cycle file"""
        try:
            df = pd.read_csv(file_path)
            
            # Check required columns
            required_cols = ['time_s', 'speed_rpm', 'load_torque_percent']
            missing_cols = set(required_cols) - set(df.columns)
            if missing_cols:
                return False, f"Missing columns: {missing_cols}"
            
            # Validate time sequence
            if not df['time_s'].is_monotonic_increasing:
                return False, "Time column must be monotonically increasing"
            
            # Validate speed limits
            if (df['speed_rpm'] < 0).any() or (df['speed_rpm'] > self.max_speed).any():
                return False, f"Speed must be between 0 and {self.max_speed} RPM"
            
            # Validate load torque limits
            if (df['load_torque_percent'] < -200).any() or (df['load_torque_percent'] > 200).any():
                return False, "Load torque must be between -200% and 200%"
            
            # Check for reasonable acceleration limits
            dt = df['time_s'].diff().fillna(1.0)
            dspeed = df['speed_rpm'].diff().fillna(0.0)
            acceleration = dspeed / dt
            
            max_accel = 10000  # RPM/s (reasonable limit)
            if (acceleration.abs() > max_accel).any():
                return False, f"Acceleration exceeds {max_accel} RPM/s"
            
            return True, "Profile validation successful"
            
        except Exception as e:
            return False, f"File processing error: {str(e)}"
    
    def interpolate_profile(self, df, target_dt=0.1):
        """Interpolate profile to uniform time step"""
        t_new = np.arange(df['time_s'].min(), df['time_s'].max() + target_dt, target_dt)
        
        speed_interp = np.interp(t_new, df['time_s'], df['speed_rpm'])
        load_interp = np.interp(t_new, df['time_s'], df['load_torque_percent'])
        
        return pd.DataFrame({
            'time_s': t_new,
            'speed_rpm': speed_interp,
            'load_torque_percent': load_interp
        })
```

## Powertrain Integration

### Vehicle Parameter Configuration
```json
{
  "vehicle_config": {
    "mass_kg": 1200,
    "wheel_radius_m": 0.32,
    "drag_coefficient": 0.32,
    "frontal_area_m2": 2.3,
    "rolling_resistance_coefficient": 0.012,
    "air_density_kg_m3": 1.225
  },
  
  "drivetrain_config": {
    "primary_reduction_ratio": 3.5,
    "final_drive_ratio": 4.2,
    "transmission_efficiency": 0.95,
    "differential_efficiency": 0.98,
    "regenerative_braking_enabled": true,
    "max_regen_power_kw": 50
  }
}
```

### Load Torque Calculation
```python
def calculate_load_torque(vehicle_speed_mps, acceleration_mps2, grade_percent, config):
    """Calculate motor load torque from vehicle dynamics"""
    
    # Vehicle forces
    mass = config['mass_kg']
    drag_coeff = config['drag_coefficient'] 
    frontal_area = config['frontal_area_m2']
    rolling_coeff = config['rolling_resistance_coefficient']
    
    # Aerodynamic drag force
    F_aero = 0.5 * 1.225 * drag_coeff * frontal_area * vehicle_speed_mps**2
    
    # Rolling resistance force  
    F_roll = rolling_coeff * mass * 9.81 * np.cos(np.radians(grade_percent))
    
    # Gravitational force (grade)
    F_grade = mass * 9.81 * np.sin(np.radians(grade_percent))
    
    # Inertial force
    F_inertia = mass * acceleration_mps2
    
    # Total wheel force
    F_total = F_aero + F_roll + F_grade + F_inertia
    
    # Convert to motor torque
    wheel_radius = config['wheel_radius_m']
    gear_ratio = config['primary_reduction_ratio'] * config['final_drive_ratio']
    efficiency = config['transmission_efficiency'] * config['differential_efficiency']
    
    # Motor torque (accounting for efficiency direction)
    if F_total > 0:  # Motoring
        T_motor = F_total * wheel_radius / (gear_ratio * efficiency)
    else:  # Regenerating
        T_motor = F_total * wheel_radius * efficiency / gear_ratio
        
    return T_motor
```

## Test Scenarios

### 1. Steady-State Efficiency Test
**Objective**: Map motor efficiency across operating range

```csv
test_name,speed_rpm,torque_nm,duration_s,expected_efficiency_min
Idle,100,0.1,30,40
Low_Speed_Low_Load,500,1.0,60,75
Low_Speed_High_Load,500,4.0,60,85
Mid_Speed_Low_Load,1500,1.0,60,80
Mid_Speed_High_Load,1500,6.0,60,90
High_Speed_Low_Load,3000,1.0,60,75
High_Speed_High_Load,3000,4.0,60,85
Peak_Torque,1000,8.0,30,88
Peak_Speed,5000,2.0,30,80
```

### 2. Transient Response Test
**Objective**: Evaluate dynamic performance and control response

```csv
time_s,speed_command_rpm,torque_limit_nm,test_phase
0,0,8,Initial
1,1000,8,Step_Response
5,1000,8,Steady_State
6,2000,8,Acceleration
10,2000,8,Steady_State  
11,500,8,Deceleration
15,500,8,Steady_State
16,0,8,Coast_Down
20,0,8,Final
```

### 3. Thermal Stress Test
**Objective**: Validate thermal model and protection systems

```csv
time_s,power_percent,duration_s,expected_temp_rise_c
0,100,300,40
300,150,60,60
360,50,180,20
540,200,30,80
570,0,300,-30
```

## Performance Metrics

### Drive Cycle Analysis Results
For each completed drive cycle, the system calculates:

**Energy Metrics:**
- Total energy consumption (Wh)
- Regenerative energy recovery (Wh)
- Net energy efficiency (%)
- Peak power demand (kW)

**Performance Metrics:**
- Speed tracking accuracy (RMS error)
- Maximum speed deviation (RPM)
- Acceleration capability (RPM/s)
- Torque utilization (% of rated)

**Control Quality:**
- PID controller performance (settling time, overshoot)
- Steady-state error (RPM)
- Control effort (RMS controller output)

### Example Results Summary
```json
{
  "drive_cycle_results": {
    "cycle_name": "Urban_UDDS",
    "motor_type": "BLDC_2kW",
    "duration_s": 1369,
    
    "energy_metrics": {
      "total_consumption_wh": 156.7,
      "regenerative_recovery_wh": 23.4,
      "net_consumption_wh": 133.3,
      "average_efficiency_percent": 87.2,
      "peak_power_kw": 3.2
    },
    
    "performance_metrics": {
      "speed_tracking_rms_error_rpm": 12.3,
      "max_speed_deviation_rpm": 45,
      "average_acceleration_rpm_s": 156,
      "max_torque_utilization_percent": 85
    },
    
    "control_quality": {
      "pid_settling_time_avg_s": 0.8,
      "pid_overshoot_avg_percent": 5.2,
      "steady_state_error_rms_rpm": 3.1,
      "control_effort_rms": 0.65
    }
  }
}
```
