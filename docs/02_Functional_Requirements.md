# Core Functional Requirements

## 1. Motor Types & Configuration

### Supported Motor Types
- **BLDC (Brushless DC)**: 1-2kW rating with configurable pole pairs
- **PMSM (Permanent Magnet Synchronous)**: Surface and interior mounted variants
- **SRM (Switched Reluctance)**: Variable inductance operation
- **AC Induction Motor**: Squirrel cage and wound rotor types

### Motor Parameter Management
- Pre-configured motor specifications with validated parameters
- Dynamic parameter display with units and engineering limits
- Real-time parameter validation and error checking
- Motor selection dropdown with automatic parameter loading

### Configuration Database
```json
{
  "motor_id": "BLDC_2kW_48V",
  "type": "BLDC", 
  "rated_power_kW": 2.0,
  "rated_voltage_V": 48,
  "rated_current_A": 45,
  "rated_speed_rpm": 3000,
  "parameters": {
    "resistance_ohm": 0.08,
    "inductance_mH": 1.5,
    "torque_constant": 0.169,
    "pole_pairs": 4
  }
}
```

## 2. Control Modes

### Manual Control Mode
- **Speed Control**: Direct RPM setpoint with slider/text input
- **Torque Control**: Direct torque command with real-time feedback
- **Load Simulation**: External load percentage (0-200%)
- **Emergency Stop**: Immediate simulation halt with safe shutdown

### Drive Cycle Mode
- **Profile Upload**: CSV/Excel file support for speed-time profiles
- **Profile Validation**: Automatic checking for feasible profiles
- **Real-time Following**: Closed-loop speed tracking with PID control
- **Cycle Library**: Pre-loaded urban, highway, and custom cycles

### Powertrain Mode
- **Vehicle Configuration**: Mass, drag coefficient, rolling resistance
- **Gear Ratios**: Primary reduction and final drive ratios
- **Wheel Parameters**: Rolling radius and transmission efficiency
- **Grade Simulation**: Road gradient effects on load torque

## 3. Simulation Engine

### Real-time Physics Simulation
- **Timestep Accuracy**: 1ms fixed-step integration
- **Motor Models**: Physics-based differential equations
- **Thermal Effects**: Temperature-dependent parameter variation
- **Saturation Limits**: Voltage, current, and torque limiting

### Control Algorithms
- **PID Speed Controller**: Proportional, integral, derivative control
- **Anti-windup Logic**: Integral saturation prevention
- **Feed-forward Terms**: Acceleration and load compensation
- **Adaptive Gains**: Self-tuning based on operating conditions

### Load Calculation
- **Speed-dependent Load**: Friction and windage losses
- **External Load**: User-defined load torque percentage
- **Regenerative Braking**: Four-quadrant operation support
- **Dynamic Load**: Inertial effects during acceleration/deceleration

## 4. Input Parameters

### Powertrain Configuration
```json
{
  "primary_reduction": 3.5,
  "final_drive_ratio": 4.2,
  "rolling_radius_m": 0.32,
  "vehicle_mass_kg": 1200,
  "drag_coefficient": 0.32,
  "frontal_area_m2": 2.3
}
```

### Control Inputs
- **Target Speed**: 0 to motor max speed (RPM)
- **Target Torque**: -max torque to +max torque (Nm)
- **Load Percentage**: 0-200% of rated load
- **Ramp Rate**: Acceleration/deceleration limits (RPM/s)

### Drive Cycle Format
```csv
time_s,speed_rpm,load_torque_percent
0,0,0
5,500,25
10,1000,50
15,1500,75
20,2000,100
```

### PID Tuning Parameters
- **Proportional Gain (Kp)**: 0.1 to 100
- **Integral Gain (Ki)**: 0.01 to 10
- **Derivative Gain (Kd)**: 0.001 to 1
- **Integral Limits**: Anti-windup saturation values
- **Output Limits**: Maximum controller output bounds

## 5. Real-time Visualization Requirements

### Performance Plots
- **Speed Tracking**: Setpoint vs actual speed with error band
- **Torque Response**: Motor torque vs load torque
- **Electrical Variables**: Phase current, DC voltage, power
- **Efficiency Curves**: Real-time efficiency calculation and display

### Control Analysis
- **PID Components**: P, I, D term visualization
- **Error Tracking**: Speed error, integral error accumulation
- **Controller Output**: Control signal and saturation indicators
- **Feed-forward Terms**: Acceleration and load compensation display

### Motor-specific Metrics
```javascript
// BLDC specific
{
  "commutation_angle": "degrees",
  "phase_current_rms": "A",
  "torque_ripple_percent": "%"
}

// PMSM specific  
{
  "d_axis_current": "A",
  "q_axis_current": "A", 
  "flux_linkage": "Wb"
}

// SRM specific
{
  "phase_inductance": "mH",
  "switching_angle": "degrees",
  "torque_ripple": "%"
}

// ACIM specific
{
  "slip_percent": "%",
  "rotor_frequency": "Hz",
  "power_factor": "cos_phi"
}
```

### Interactive Features
- **Zoom and Pan**: Chart navigation with mouse/touch
- **Data Point Tooltips**: Hover for exact values
- **Time Window Selection**: Configurable display duration
- **Real-time Updates**: 60 FPS smooth animation
- **Export Options**: PNG, SVG chart export
