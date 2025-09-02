#!/usr/bin/env python3
"""
Simple FastAPI server for testing the motor control system.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import time
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Create FastAPI app
app = FastAPI(
    title="Motor Simulation API",
    description="Real-time BLDC motor simulation with cascaded control",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Motor Simulation API with Cascaded Control",
        "version": "2.0.0",
        "status": "running",
        "description": "BLDC motor simulation with realistic PWM-based control",
        "features": {
            "control_modes": ["speed", "current", "torque", "voltage", "duty_cycle"],
            "pwm_inverter": "20kHz switching with dead time and losses",
            "current_controller": "High-bandwidth inner loop (1kHz)",
            "speed_controller": "Outer loop generating current references",
            "motor_model": "BLDC with temperature effects and saturation",
            "cascaded_control": "Industry-standard architecture"
        },
        "endpoints": {
            "motor_info": "/api/motor",
            "efficiency_curve": "/api/motor/efficiency", 
            "start_simulation": "/api/simulation/start",
            "health_check": "/health",
            "docs": "/docs"
        },
        "websocket": {
            "endpoint": "/ws/{session_id}",
            "protocols": ["json", "binary"]
        },
        "control_architecture": {
            "cascaded": "Speed → Current → PWM → Voltage → Motor",
            "direct_modes": ["Current Control", "Torque Control", "Voltage Control", "Duty Cycle Control"],
            "pwm_features": ["Dead time compensation", "Switching losses", "Conduction losses", "Current ripple"]
        },
        "timestamp": time.time()
    }

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "version": "2.0.0"
    }

@app.get("/api/motor")
async def get_motor_info():
    """Get motor information."""
    try:
        from app.models.bldc_motor import BLDCMotor
        from app.core.config import get_settings
        
        settings = get_settings()
        motor_params = settings.DEFAULT_MOTOR_PARAMS
        motor_params['dc_bus_voltage'] = 48.0
        motor_params['switching_frequency'] = 20000
        
        motor = BLDCMotor(motor_params, use_pwm=True)
        return motor.get_motor_parameters()
    except Exception as e:
        return {
            "error": "Failed to load motor",
            "message": str(e),
            "default_info": {
                "name": "BLDC 2kW 48V Motor with PWM Control",
                "type": "BLDC",
                "rated_power_kw": 2.0,
                "rated_voltage_v": 48.0,
                "control_mode": "PWM with Cascaded Control"
            }
        }

@app.get("/test")
async def test_cascaded_control():
    """Test endpoint to verify cascaded control system works."""
    try:
        from app.models.bldc_motor import BLDCMotor
        from app.controllers.current_controller import CascadedSpeedCurrentController
        from app.core.config import get_settings
        
        # Create motor system
        settings = get_settings()
        motor_params = settings.DEFAULT_MOTOR_PARAMS.copy()
        motor_params['dc_bus_voltage'] = 48.0
        motor_params['switching_frequency'] = 20000
        
        motor = BLDCMotor(motor_params, use_pwm=True)
        
        # Test parameters
        speed_params = {
            'kp': 5.0, 'ki': 10.0, 'kd': 0.1,
            'max_output': 10.0, 'min_output': -10.0,
            'max_integral': 5.0, 'derivative_filter_tau': 0.001
        }
        current_params = {
            'kp': 10.0, 'ki': 1000.0, 'bandwidth_hz': 1000.0,
            'max_duty_cycle': 0.95, 'min_duty_cycle': 0.05,
            'use_anti_windup': True, 'use_feedforward': True
        }
        
        cascaded_controller = CascadedSpeedCurrentController(speed_params, current_params)
        cascaded_controller.set_motor_params(motor_params['kt'])
        cascaded_controller.set_control_mode('speed')
        
        # Run a quick test
        dt = 0.001
        target_speed = 1000.0  # 1000 RPM
        
        results = []
        for step in range(100):  # 100ms test
            t = step * dt
            current_speed = motor.speed * 30 / 3.14159
            
            duty_cycle = cascaded_controller.update(
                target_speed_rpm=target_speed,
                actual_speed_rpm=current_speed,
                actual_current=motor.current,
                dt=dt,
                motor_params={
                    'resistance': motor.get_hot_resistance(),
                    'inductance': motor_params['inductance'],
                    'back_emf': motor.calculate_back_emf(),
                    'dc_voltage': 48.0
                }
            )
            
            motor_state = motor.step(duty_cycle, 0.0, dt)  # No load
            
            if step % 20 == 0:  # Store every 20ms
                results.append({
                    'time_ms': t * 1000,
                    'target_speed_rpm': target_speed,
                    'actual_speed_rpm': motor_state['speed_rpm'],
                    'current_a': motor_state['current_a'],
                    'duty_cycle_percent': duty_cycle * 100,
                    'voltage_v': motor_state['voltage_v']
                })
        
        return {
            "status": "success",
            "message": "Cascaded control system working!",
            "test_results": results,
            "final_state": {
                "speed_rpm": results[-1]['actual_speed_rpm'],
                "speed_error_rpm": abs(results[-1]['actual_speed_rpm'] - target_speed),
                "current_a": results[-1]['current_a'],
                "duty_cycle_percent": results[-1]['duty_cycle_percent']
            }
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Test failed: {str(e)}",
            "error_type": type(e).__name__
        }

if __name__ == "__main__":
    # Run the server
    uvicorn.run(
        "simple_server:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )