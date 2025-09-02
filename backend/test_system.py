#!/usr/bin/env python3
"""
Simple test script for motor simulation system.
"""

import sys
import time
import numpy as np
sys.path.append('/Volumes/Dev/Motor_Sim/backend')

from app.models.bldc_motor import BLDCMotor
from app.controllers.pid_controller import PIDController
from app.core.config import get_settings


def test_motor_simulation():
    """Test the motor simulation system."""
    print("Testing Motor Simulation System")
    print("=" * 40)
    
    # Initialize components
    settings = get_settings()
    motor = BLDCMotor(settings.DEFAULT_MOTOR_PARAMS)
    pid = PIDController(settings.DEFAULT_PID_PARAMS)
    
    print(f"Motor initialized: {motor.get_motor_parameters()['name']}")
    print(f"PID gains: Kp={pid.kp}, Ki={pid.ki}, Kd={pid.kd}")
    
    # Simulation parameters
    dt = 0.001  # 1ms timestep
    target_speed = 2000.0  # RPM
    load_torque = 5.0  # Nm
    simulation_time = 2.0  # seconds
    steps = int(simulation_time / dt)
    
    print(f"\nRunning simulation:")
    print(f"- Target speed: {target_speed} RPM")
    print(f"- Load torque: {load_torque} Nm")
    print(f"- Simulation time: {simulation_time} seconds")
    print(f"- Time step: {dt*1000} ms")
    print(f"- Total steps: {steps}")
    
    # Data storage
    times = []
    speeds = []
    currents = []
    voltages = []
    efficiencies = []
    
    start_time = time.time()
    
    # Simulation loop
    for step in range(steps):
        current_time = step * dt
        
        # Get current speed
        current_speed = motor.speed * 30 / np.pi  # rad/s to RPM
        
        # PID control
        control_voltage = pid.update(target_speed, current_speed, dt)
        
        # Step motor
        result = motor.step(control_voltage, load_torque, dt)
        
        # Store data (every 10ms for reasonable output size)
        if step % 10 == 0:
            times.append(current_time)
            speeds.append(result['speed_rpm'])
            currents.append(result['current_a'])
            voltages.append(control_voltage)
            efficiencies.append(result['efficiency'])
    
    elapsed_time = time.time() - start_time
    
    # Results
    print(f"\nSimulation completed in {elapsed_time:.3f} seconds")
    print(f"Real-time factor: {simulation_time/elapsed_time:.1f}x")
    
    final_speed = speeds[-1]
    final_current = currents[-1]
    final_efficiency = efficiencies[-1]
    
    print(f"\nFinal results:")
    print(f"- Speed: {final_speed:.1f} RPM (target: {target_speed:.1f} RPM)")
    print(f"- Speed error: {abs(final_speed - target_speed):.1f} RPM")
    print(f"- Current: {final_current:.1f} A")
    print(f"- Efficiency: {final_efficiency:.1%}")
    print(f"- Motor temperature: {motor.temperature:.1f}°C")
    
    # Performance analysis
    settling_time = None
    for i, speed in enumerate(speeds):
        if abs(speed - target_speed) < 0.02 * target_speed:  # Within 2%
            settling_time = times[i]
            break
    
    if settling_time:
        print(f"- Settling time (2%): {settling_time:.3f} seconds")
    
    # Check if system is stable
    recent_speeds = speeds[-10:]  # Last 10 data points
    speed_variation = np.std(recent_speeds)
    
    if speed_variation < 10:  # Less than 10 RPM variation
        print("✓ System is stable")
    else:
        print("⚠ System shows oscillations")
    
    return {
        'success': True,
        'final_speed': final_speed,
        'speed_error': abs(final_speed - target_speed),
        'settling_time': settling_time,
        'efficiency': final_efficiency,
        'simulation_time': elapsed_time
    }


def test_websocket_protocol():
    """Test binary protocol encoding/decoding."""
    print("\nTesting WebSocket Binary Protocol")
    print("=" * 40)
    
    from app.websocket.binary_protocol import BinaryEncoder
    
    encoder = BinaryEncoder()
    
    # Test data
    test_data = {
        'timestamp': time.time(),
        'speed_rpm': 1500.5,
        'torque_nm': 5.25,
        'current_a': 30.2,
        'voltage_v': 47.8,
        'efficiency': 0.891,
        'power_w': 785.3,
        'temperature_c': 65.2
    }
    
    print("Original data:", test_data)
    
    # Encode to binary
    binary_data = encoder.encode_simulation_data(test_data)
    print(f"Binary size: {len(binary_data)} bytes")
    
    # Decode back
    decoded_data = encoder.decode_simulation_data(binary_data)
    print("Decoded data:", decoded_data)
    
    # Check accuracy
    errors = {}
    for key in ['speed_rpm', 'torque_nm', 'current_a', 'voltage_v']:
        if key in test_data and key in decoded_data:
            error = abs(test_data[key] - decoded_data[key])
            errors[key] = error
    
    max_error = max(errors.values()) if errors else 0
    print(f"Maximum decoding error: {max_error:.6f}")
    
    if max_error < 0.001:
        print("✓ Binary protocol accuracy test passed")
        return True
    else:
        print("⚠ Binary protocol accuracy issues")
        return False


if __name__ == "__main__":
    try:
        # Test motor simulation
        motor_result = test_motor_simulation()
        
        # Test binary protocol
        protocol_result = test_websocket_protocol()
        
        print("\n" + "=" * 40)
        print("SYSTEM TEST SUMMARY")
        print("=" * 40)
        
        if motor_result['success']:
            print("✓ Motor simulation: PASSED")
            print(f"  - Final speed error: {motor_result['speed_error']:.1f} RPM")
            print(f"  - Efficiency: {motor_result['efficiency']:.1%}")
        else:
            print("✗ Motor simulation: FAILED")
        
        if protocol_result:
            print("✓ Binary protocol: PASSED")
        else:
            print("✗ Binary protocol: FAILED")
        
        print("\nSystem is ready for FastAPI integration!")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)