# Dynamometer Operation Modes

## Overview
The Motor Dyno simulator now supports two distinct operation modes that represent different real-world motor testing scenarios.

## 1. Constant Voltage Mode (Dyno Mode) - **DEFAULT**

### What it simulates:
- **Real dynamometer testing** where motor is connected to constant voltage supply
- **Battery-powered systems** (EV, power tools, etc.)
- **Laboratory motor characterization** with regulated DC supply

### How it works:
- ✅ **Voltage stays constant** at set value (e.g., 48V)
- ✅ **Current varies** based on load and speed
- ✅ **Speed naturally varies** with load torque
- ✅ **Realistic motor behavior** under load

### Typical Test Procedure:
1. Set supply voltage (e.g., 48V for 48V motor)
2. Apply varying load torque via dyno brake
3. Observe resulting speed, current, power, efficiency
4. Generate motor characteristic curves

### Expected Behavior:
- **No Load**: Low current, high speed, voltage = 48V
- **Under Load**: Higher current, lower speed, voltage = 48V
- **Full Load**: Maximum current, rated speed, voltage = 48V

---

## 2. Speed Control Mode (Servo Mode)

### What it simulates:
- **Servo motor systems** with speed controllers
- **Variable frequency drives** (VFDs)
- **Closed-loop speed control** applications

### How it works:
- ✅ **Speed stays constant** at target RPM
- ✅ **Voltage modulated** by controller to maintain speed
- ✅ **Current varies** with load
- ✅ **Active feedback control** system

### Typical Test Procedure:
1. Set target speed (e.g., 2000 RPM)
2. Apply varying load torque
3. Controller adjusts voltage to maintain speed
4. Observe controller response and power consumption

### Expected Behavior:
- **No Load**: Low voltage, low current, speed = 2000 RPM
- **Under Load**: Higher voltage, higher current, speed = 2000 RPM
- **Full Load**: Maximum voltage, maximum current, speed = 2000 RPM

---

## Key Differences Summary

| Parameter | Constant Voltage Mode | Speed Control Mode |
|-----------|----------------------|-------------------|
| **Voltage** | ✅ **Constant** (e.g., 48V) | 🔄 **Variable** (controller output) |
| **Speed** | 🔄 **Variable** (load dependent) | ✅ **Constant** (target RPM) |
| **Current** | 🔄 **Variable** (load dependent) | 🔄 **Variable** (load dependent) |
| **Use Case** | Battery/dyno testing | Servo applications |
| **Realistic** | ✅ **Typical dyno setup** | ✅ **Typical servo system** |

---

## Validation Tests

The **Debug Validator** performs different checks based on mode:

### Constant Voltage Mode:
- ✅ Voltage should equal set value (±2V tolerance)
- ✅ Speed should vary with load
- ✅ Current should follow V = Ke×ω + I×R equation
- ✅ Power should equal T×ω

### Speed Control Mode:
- ✅ Speed should equal target RPM (±10% tolerance)
- ✅ Voltage should vary to maintain speed
- ✅ Controller response should be stable
- ✅ Power should equal T×ω

---

## Recommended Usage

### For Motor Characterization (Choose **Constant Voltage**):
- Testing motor efficiency curves
- Measuring torque-speed characteristics
- Simulating battery-powered operation
- Understanding natural motor behavior

### For Control System Testing (Choose **Speed Control**):
- Testing servo system performance
- Analyzing controller stability
- Simulating VFD operation
- Understanding active speed control

**Default Mode**: Constant Voltage (typical dynamometer operation)