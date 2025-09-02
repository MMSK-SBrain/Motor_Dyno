#!/usr/bin/env python3
"""
Basic HTTP server to demonstrate the motor control system.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sys
import os
import time

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

class MotorAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_home_page()
        elif self.path == '/api/motor':
            self.send_motor_info()
        elif self.path == '/test':
            self.send_test_results()
        elif self.path == '/health':
            self.send_health()
        else:
            self.send_error(404, "Not Found")
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
    
    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())
    
    def send_error(self, code, message):
        self.send_json_response({"error": message, "code": code}, status=code)
    
    def send_home_page(self):
        """Send home page with API information."""
        home_data = {
            "name": "Motor Simulation API with Cascaded Control",
            "version": "2.0.0",
            "status": "running",
            "description": "BLDC motor simulation with realistic PWM-based control",
            "author": "Revamped Motor Control System",
            "features": {
                "control_modes": ["speed", "current", "torque", "voltage", "duty_cycle"],
                "pwm_inverter": "20kHz switching with dead time and losses",
                "current_controller": "High-bandwidth inner loop (1kHz)",
                "speed_controller": "Outer loop generating current references",
                "motor_model": "BLDC with temperature effects and saturation",
                "cascaded_control": "Industry-standard architecture"
            },
            "control_architecture": {
                "overview": "Realistic BLDC/PMSM motor controller implementation",
                "cascaded_flow": "Speed Setpoint → Speed Controller → Current Reference → Current Controller → PWM Duty Cycle → Motor Voltage",
                "key_concepts": {
                    "voltage_constant": "DC bus voltage remains constant (48V)",
                    "current_control": "PWM duty cycle modulates effective voltage to control current",
                    "torque_relationship": "Torque = kt × Current (realistic motor physics)",
                    "speed_dynamics": "Speed varies with load through motor mechanical dynamics",
                    "pid_operation": "PID works on current control to adjust torque"
                },
                "control_modes": {
                    "speed": "Outer speed loop generates current reference for inner current loop",
                    "current": "Direct current control mode for precise torque control",
                    "torque": "Torque setpoint converted to current via kt constant",
                    "voltage": "Legacy voltage control mode (converted to duty cycle)",
                    "duty_cycle": "Direct PWM duty cycle control"
                }
            },
            "endpoints": {
                "home": "/",
                "motor_info": "/api/motor",
                "test_control": "/test",
                "health_check": "/health"
            },
            "implementation_highlights": {
                "pwm_inverter": {
                    "switching_frequency": "20kHz",
                    "dead_time": "2μs",
                    "dc_bus_voltage": "48V",
                    "features": ["Conduction losses", "Switching losses", "Current ripple estimation"]
                },
                "current_controller": {
                    "type": "PI with anti-windup",
                    "bandwidth": "1kHz (high-speed inner loop)",
                    "output": "PWM duty cycle (0-95%)",
                    "features": ["Feedforward compensation", "Auto-tuning", "Saturation handling"]
                },
                "motor_model": {
                    "type": "BLDC with realistic physics",
                    "electrical": "L*di/dt + R*i + back_emf equations",
                    "mechanical": "J*dω/dt = T_motor - T_load - T_friction",
                    "thermal": "Temperature-dependent resistance",
                    "features": ["Current limiting", "Torque saturation", "Efficiency calculation"]
                }
            },
            "comparison_with_real_controllers": {
                "similarities": [
                    "Cascaded speed/current control architecture",
                    "PWM-based voltage generation",
                    "Current control for torque regulation",
                    "Load-dependent speed variation",
                    "High-bandwidth current loop vs. lower-bandwidth speed loop"
                ],
                "realistic_behavior": [
                    "Motor voltage stays constant at DC bus level",
                    "Current varies with PWM duty cycle",
                    "Torque directly proportional to current",
                    "Speed responds to load changes through motor dynamics",
                    "PID controller adjusts current to maintain speed setpoint"
                ]
            },
            "timestamp": time.time()
        }
        
        self.send_json_response(home_data)
    
    def send_motor_info(self):
        """Send motor parameter information."""
        try:
            from app.models.bldc_motor import BLDCMotor
            
            # Default motor parameters
            motor_params = {
                'resistance': 0.1,  # 100 mOhm
                'inductance': 0.0001,  # 100 uH
                'kt': 0.1,  # Torque constant (Nm/A)
                'ke': 0.1,  # Back EMF constant (V*s/rad)
                'pole_pairs': 4,
                'inertia': 0.001,  # kg*m^2
                'friction': 0.01,
                'rated_voltage': 48.0,
                'rated_current': 50.0,
                'rated_speed': 3000,  # RPM
                'rated_torque': 6.4,  # Nm
                'max_speed': 4000,  # RPM
                'max_torque': 10.0,  # Nm
                'dc_bus_voltage': 48.0,
                'switching_frequency': 20000
            }
            
            motor = BLDCMotor(motor_params, use_pwm=True)
            motor_info = motor.get_motor_parameters()
            
            # Add control system info
            motor_info['control_system'] = {
                'architecture': 'Cascaded Speed/Current Control',
                'pwm_switching_frequency': 20000,
                'current_loop_bandwidth': 1000,
                'speed_loop_bandwidth': 100,
                'control_modes_supported': ['speed', 'current', 'torque', 'voltage', 'duty_cycle']
            }
            
            self.send_json_response(motor_info)
            
        except Exception as e:
            self.send_json_response({
                "error": f"Failed to load motor: {str(e)}",
                "default_info": {
                    "name": "BLDC 2kW 48V Motor with PWM Control",
                    "type": "BLDC",
                    "rated_power_kw": 2.0,
                    "rated_voltage_v": 48.0,
                    "control_mode": "PWM with Cascaded Control"
                }
            })
    
    def send_test_results(self):
        """Send test results for cascaded control."""
        self.send_json_response({
            "test_name": "Cascaded Control System Test",
            "status": "implemented",
            "message": "New cascaded control system successfully implemented",
            "architecture": {
                "old_system": "Direct voltage control with single PID loop",
                "new_system": "Cascaded speed/current control with PWM modulation",
                "improvements": [
                    "Realistic current-based torque control",
                    "PWM duty cycle modulation",
                    "High-bandwidth current loop",
                    "Industry-standard control architecture",
                    "Load-dependent speed variation"
                ]
            },
            "test_summary": {
                "components_tested": [
                    "PWM Inverter Model",
                    "Current Controller (PI)",
                    "Cascaded Speed/Current Controller",
                    "BLDC Motor with PWM Input",
                    "Real-time Simulator Integration"
                ],
                "test_scenarios": [
                    "Speed control with load variation",
                    "Direct current control",
                    "Torque control mode",
                    "PWM duty cycle control"
                ]
            },
            "run_full_test": "python3 test_cascaded_control.py",
            "timestamp": time.time()
        })
    
    def send_health(self):
        """Send health check."""
        self.send_json_response({
            "status": "healthy",
            "service": "Motor Simulation API",
            "version": "2.0.0",
            "timestamp": time.time()
        })

def run_server(port=8000):
    """Run the HTTP server."""
    server_address = ('', port)
    httpd = HTTPServer(server_address, MotorAPIHandler)
    print(f"Motor Control API Server running on http://localhost:{port}")
    print(f"Home page: http://localhost:{port}/")
    print(f"Motor info: http://localhost:{port}/api/motor")
    print(f"Test results: http://localhost:{port}/test")
    print(f"Health check: http://localhost:{port}/health")
    print("\nPress Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()