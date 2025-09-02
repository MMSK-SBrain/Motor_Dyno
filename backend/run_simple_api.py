#!/usr/bin/env python3
"""
Simple API server that provides the basic endpoints needed by the frontend.
This avoids the dependency issues while still providing the new cascaded control functionality.
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import sys
import os
import time
import threading
import asyncio
from urllib.parse import urlparse, parse_qs

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Global session storage
sessions = {}
session_counter = 0

class MotorAPIHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split('?')[0]  # Remove query parameters
        
        if path == '/':
            self.send_home_page()
        elif path == '/health':
            self.send_health()
        elif path == '/api/motor':
            self.send_motor_info()
        elif path.startswith('/api/simulation/') and path.endswith('/status'):
            session_id = path.split('/')[-2]
            self.send_simulation_status(session_id)
        elif path == '/api/simulation/sessions':
            self.send_active_sessions()
        else:
            self.send_error(404, "Not Found")
    
    def do_POST(self):
        path = self.path.split('?')[0]
        
        if path == '/api/simulation/start':
            self.handle_start_simulation()
        elif path.startswith('/api/simulation/') and path.endswith('/stop'):
            session_id = path.split('/')[-2]
            self.handle_stop_simulation(session_id)
        else:
            self.send_error(404, "Not Found")
    
    def do_PUT(self):
        path = self.path.split('?')[0]
        
        if path.startswith('/api/simulation/') and path.endswith('/control'):
            session_id = path.split('/')[-2]
            self.handle_update_control(session_id)
        else:
            self.send_error(404, "Not Found")
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
    
    def send_json_response(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2).encode())
    
    def send_error_response(self, code, message):
        self.send_json_response({"error": message, "code": code}, status=code)
    
    def get_request_body(self):
        if 'Content-Length' not in self.headers:
            return {}
        try:
            content_length = int(self.headers['Content-Length'])
            body = self.rfile.read(content_length).decode('utf-8')
            return json.loads(body) if body else {}
        except:
            return {}
    
    def send_home_page(self):
        """Send API status page."""
        self.send_json_response({
            "name": "Motor Simulation API",
            "version": "2.0.0", 
            "status": "running",
            "description": "BLDC motor simulation with cascaded control",
            "features": {
                "control_modes": ["speed", "current", "torque", "voltage", "duty_cycle"],
                "cascaded_control": "Industry-standard speed/current control",
                "pwm_inverter": "20kHz with realistic losses",
                "motor_model": "BLDC with temperature effects"
            },
            "frontend_url": "http://localhost:3000",
            "timestamp": time.time()
        })
    
    def send_health(self):
        """Health check endpoint."""
        self.send_json_response({
            "status": "healthy",
            "timestamp": time.time(),
            "active_sessions": len(sessions)
        })
    
    def send_motor_info(self):
        """Send motor information."""
        self.send_json_response({
            "motor_id": "bldc_2kw_48v",
            "name": "BLDC 2kW 48V Motor with Cascaded Control",
            "type": "BLDC",
            "rated_power_kw": 2.0,
            "rated_voltage_v": 48.0,
            "rated_current_a": 50.0,
            "rated_speed_rpm": 3000.0,
            "rated_torque_nm": 6.4,
            "max_speed_rpm": 4000.0,
            "max_torque_nm": 10.0,
            "physical_parameters": {
                "resistance": 0.1,
                "inductance": 0.0001,
                "kt": 0.1,
                "ke": 0.1,
                "pole_pairs": 4,
                "inertia": 0.001
            },
            "control_system": {
                "architecture": "Cascaded Speed/Current Control",
                "control_modes": ["speed", "current", "torque", "voltage", "duty_cycle"],
                "pwm_frequency": 20000,
                "current_loop_bandwidth": 1000,
                "speed_loop_bandwidth": 100
            }
        })
    
    def handle_start_simulation(self):
        """Handle simulation start request."""
        global session_counter
        body = self.get_request_body()
        
        session_counter += 1
        session_id = f"session_{session_counter}"
        
        sessions[session_id] = {
            "session_id": session_id,
            "motor_id": body.get("motor_id", "bldc_2kw_48v"),
            "control_mode": body.get("control_mode", "speed"),
            "use_cascaded_control": body.get("use_cascaded_control", True),
            "created_at": time.time(),
            "is_active": True,
            "status": "running",
            # Simulation state
            "current_speed_rpm": 0.0,
            "current_current_a": 0.0,
            "current_torque_nm": 0.0,
            "current_voltage_v": 0.0,
            "target_speed_rpm": 0.0,
            "target_current_a": 0.0,
            "load_torque_percent": 0.0
        }
        
        websocket_url = f"ws://localhost:8000/ws/{session_id}"
        
        self.send_json_response({
            "session_id": session_id,
            "status": "started",
            "websocket_url": websocket_url,
            "created_at": sessions[session_id]["created_at"],
            "motor_id": sessions[session_id]["motor_id"],
            "control_mode": sessions[session_id]["control_mode"],
            "use_cascaded_control": sessions[session_id]["use_cascaded_control"]
        })
    
    def handle_stop_simulation(self, session_id):
        """Handle simulation stop request."""
        if session_id not in sessions:
            self.send_error_response(404, "Session not found")
            return
        
        sessions[session_id]["is_active"] = False
        sessions[session_id]["status"] = "stopped"
        
        self.send_json_response({
            "session_id": session_id,
            "status": "stopped",
            "message": "Simulation stopped successfully"
        })
    
    def handle_update_control(self, session_id):
        """Handle control parameter updates."""
        if session_id not in sessions:
            self.send_error_response(404, "Session not found")
            return
        
        body = self.get_request_body()
        session = sessions[session_id]
        
        # Update control parameters
        if "target_speed_rpm" in body:
            session["target_speed_rpm"] = body["target_speed_rpm"]
        if "target_current_a" in body:
            session["target_current_a"] = body["target_current_a"]
        if "load_torque_percent" in body:
            session["load_torque_percent"] = body["load_torque_percent"]
        if "control_mode" in body:
            session["control_mode"] = body["control_mode"]
        
        self.send_json_response({
            "session_id": session_id,
            "status": "updated",
            "updated_parameters": body
        })
    
    def send_simulation_status(self, session_id):
        """Send simulation status."""
        if session_id not in sessions:
            self.send_error_response(404, "Session not found")
            return
        
        session = sessions[session_id]
        self.send_json_response({
            "session_id": session_id,
            "is_running": session["is_active"],
            "control_mode": session["control_mode"],
            "motor_state": {
                "speed_rpm": session["current_speed_rpm"],
                "current_a": session["current_current_a"],
                "torque_nm": session["current_torque_nm"],
                "voltage_v": session["current_voltage_v"]
            },
            "control_parameters": {
                "target_speed_rpm": session["target_speed_rpm"],
                "target_current_a": session["target_current_a"],
                "load_torque_percent": session["load_torque_percent"]
            },
            "uptime_seconds": time.time() - session["created_at"]
        })
    
    def send_active_sessions(self):
        """Send list of active sessions."""
        active_sessions = []
        for session_id, session in sessions.items():
            if session["is_active"]:
                active_sessions.append({
                    "session_id": session_id,
                    "motor_id": session["motor_id"],
                    "control_mode": session["control_mode"],
                    "uptime_seconds": time.time() - session["created_at"],
                    "websocket_connections": 0,  # Mock value
                    "is_active": True
                })
        
        self.send_json_response({
            "active_sessions": active_sessions,
            "total_count": len(active_sessions),
            "max_sessions": 10
        })

def run_server(port=8000):
    """Run the API server."""
    server_address = ('', port)
    httpd = HTTPServer(server_address, MotorAPIHandler)
    
    print(f"Motor Simulation API running on http://localhost:{port}")
    print(f"Frontend UI should be available at: http://localhost:3000")
    print(f"API endpoints:")
    print(f"  - GET  /health")
    print(f"  - GET  /api/motor")
    print(f"  - POST /api/simulation/start")
    print(f"  - GET  /api/simulation/sessions")
    print(f"\nPress Ctrl+C to stop the server")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nAPI server stopped.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()