# Testing and Validation Strategy

## Testing Framework Overview

The motor simulation system employs a comprehensive testing strategy covering unit tests, integration tests, performance benchmarks, and validation against real-world data. The testing framework ensures system reliability, accuracy, and performance requirements are met.

## Testing Pyramid Architecture

```
                    Manual Testing
                 /                    \
            System Tests          Acceptance Tests
           /            \        /                \
    Integration Tests    API Tests    Performance Tests
   /                \              \                    \
Unit Tests      Component Tests    Load Tests      Validation Tests
```

### Testing Stack
- **Unit Tests**: pytest, pytest-asyncio, pytest-mock
- **Integration Tests**: pytest, aiohttp test client
- **Performance Tests**: locust, asyncio-based load testing
- **Validation Tests**: Custom validation framework with real motor data
- **API Tests**: OpenAPI/Swagger validation, postman collections
- **Frontend Tests**: Jest, React Testing Library, Cypress

## Unit Testing Strategy

### Motor Physics Model Tests
```python
# tests/unit/test_motor_models.py
import pytest
import numpy as np
from app.simulation.bldc_motor import BLDCMotor, BLDCParameters
from app.simulation.pmsm_motor import PMSMMotor
from app.control.pid_controller import PIDController, PIDParams

class TestBLDCMotor:
    """Unit tests for BLDC motor model"""
    
    @pytest.fixture
    def bldc_params(self):
        return BLDCParameters(
            resistance=0.1,
            inductance=0.002,
            kt=0.15,
            ke=0.15,
            pole_pairs=4,
            inertia=0.001,
            friction=0.001
        )
    
    @pytest.fixture
    def bldc_motor(self, bldc_params):
        return BLDCMotor(bldc_params)
    
    def test_initialization(self, bldc_motor):
        """Test motor initializes with correct parameters"""
        assert bldc_motor.speed == 0.0
        assert bldc_motor.position == 0.0
        assert bldc_motor.current == 0.0
        
    def test_no_load_operation(self, bldc_motor):
        """Test motor behavior with no load"""
        voltage = 12.0
        load_torque = 0.0
        dt = 0.001
        
        # Run simulation for 1 second
        for _ in range(1000):
            result = bldc_motor.step(voltage, load_torque, dt)
        
        # Motor should reach steady-state speed
        assert result['speed_rpm'] > 500
        assert result['torque_nm'] > 0
        assert 0 < result['efficiency'] < 1.0
        
    def test_torque_speed_relationship(self, bldc_motor):
        """Test that torque decreases with increasing speed (back EMF effect)"""
        voltage = 48.0
        dt = 0.001
        
        torques_at_speeds = {}
        
        for target_speed in [1000, 2000, 3000]:
            # Reset motor
            bldc_motor.speed = 0
            bldc_motor.current = 0
            
            # Apply PID control to reach target speed
            pid = PIDController(PIDParams(kp=0.1, ki=0.01, kd=0.001))
            
            for _ in range(5000):  # 5 seconds to settle
                control_output = pid.update(target_speed * np.pi / 30, bldc_motor.speed, dt)
                result = bldc_motor.step(voltage * control_output / 100, 0, dt)
                
            torques_at_speeds[target_speed] = result['torque_nm']
        
        # Verify torque decreases with speed (characteristic curve)
        assert torques_at_speeds[1000] > torques_at_speeds[2000]
        assert torques_at_speeds[2000] > torques_at_speeds[3000]
    
    def test_energy_conservation(self, bldc_motor):
        """Test energy conservation in motor model"""
        voltage = 24.0
        load_torque = 2.0
        dt = 0.001
        
        total_electrical_energy = 0
        total_mechanical_energy = 0
        
        for _ in range(1000):
            result = bldc_motor.step(voltage, load_torque, dt)
            
            # Accumulate energy
            electrical_power = result['voltage_v'] * result['current_a']
            mechanical_power = result['torque_nm'] * (result['speed_rpm'] * np.pi / 30)
            
            total_electrical_energy += electrical_power * dt
            total_mechanical_energy += mechanical_power * dt
        
        # Mechanical energy should be less than electrical (losses)
        assert total_mechanical_energy < total_electrical_energy
        
        # Efficiency should be reasonable
        efficiency = total_mechanical_energy / total_electrical_energy
        assert 0.7 < efficiency < 0.95

class TestPIDController:
    """Unit tests for PID controller"""
    
    @pytest.fixture
    def pid_params(self):
        return PIDParams(kp=1.0, ki=0.1, kd=0.01, max_output=100.0)
    
    @pytest.fixture  
    def pid_controller(self, pid_params):
        return PIDController(pid_params)
    
    def test_proportional_response(self, pid_controller):
        """Test pure proportional response"""
        setpoint = 100.0
        process_variable = 90.0
        
        output = pid_controller.update(setpoint, process_variable, 0.001)
        expected = pid_controller.params.kp * (setpoint - process_variable)
        
        assert abs(output - expected) < 0.001
    
    def test_integral_buildup(self, pid_controller):
        """Test integral term builds up over time"""
        setpoint = 100.0
        process_variable = 90.0
        dt = 0.001
        
        output1 = pid_controller.update(setpoint, process_variable, dt)
        output2 = pid_controller.update(setpoint, process_variable, dt)
        
        # Second output should be larger due to integral buildup
        assert output2 > output1
    
    def test_anti_windup(self, pid_controller):
        """Test integral anti-windup functionality"""
        setpoint = 100.0
        process_variable = 0.0  # Large error
        dt = 0.001
        
        # Apply large error for extended time
        for _ in range(10000):
            output = pid_controller.update(setpoint, process_variable, dt)
        
        # Output should be limited
        assert abs(output) <= pid_controller.params.max_output
        
        # Integral should be limited
        assert abs(pid_controller.integral) <= pid_controller.params.max_integral
    
    def test_derivative_kick_prevention(self, pid_controller):
        """Test that derivative kick is handled properly"""
        # Start with matched setpoint and PV
        pid_controller.update(50.0, 50.0, 0.001)
        
        # Large setpoint change
        output = pid_controller.update(100.0, 50.0, 0.001)
        
        # Output should not have excessive derivative component
        # (This test would need refinement based on specific D-kick prevention method)
        assert abs(output) < 200  # Reasonable bound
```

### WebSocket Communication Tests
```python
# tests/unit/test_websocket.py
import pytest
import asyncio
import json
from unittest.mock import Mock, AsyncMock
from app.websocket.manager import WebSocketManager
from app.websocket.protocols import BinaryMessage

class TestWebSocketManager:
    """Unit tests for WebSocket communication"""
    
    @pytest.fixture
    def ws_manager(self):
        return WebSocketManager()
    
    @pytest.fixture
    def mock_websocket(self):
        ws = Mock()
        ws.send_text = AsyncMock()
        ws.send_bytes = AsyncMock()
        return ws
    
    @pytest.mark.asyncio
    async def test_client_connection(self, ws_manager, mock_websocket):
        """Test client connection and disconnection"""
        session_id = "test_session_123"
        
        # Connect client
        ws_manager.add_client(session_id, mock_websocket)
        assert len(ws_manager.clients[session_id]) == 1
        
        # Disconnect client
        ws_manager.remove_client(session_id, mock_websocket)
        assert len(ws_manager.clients[session_id]) == 0
    
    @pytest.mark.asyncio
    async def test_broadcast_message(self, ws_manager, mock_websocket):
        """Test broadcasting to all clients in session"""
        session_id = "test_session_123"
        ws_manager.add_client(session_id, mock_websocket)
        
        test_data = {"speed_rpm": 1500, "torque_nm": 5.0}
        
        await ws_manager.broadcast_to_session(session_id, test_data)
        
        # Verify message was sent
        mock_websocket.send_text.assert_called_once()
        
        # Verify message content
        call_args = mock_websocket.send_text.call_args[0][0]
        message = json.loads(call_args)
        assert message['payload']['speed_rpm'] == 1500
        assert message['payload']['torque_nm'] == 5.0

class TestBinaryProtocol:
    """Unit tests for binary message protocol"""
    
    def test_pack_unpack_simulation_data(self):
        """Test binary message packing and unpacking"""
        original_data = {
            'timestamp': 1705312200.123,
            'speed_rpm': 1500.5,
            'torque_nm': 5.25,
            'current_a': 12.3,
            'voltage_v': 47.8,
            'efficiency': 0.89,
            'power_w': 1234.5,
            'temperature_c': 65.2,
            'pid_output': 85.3
        }
        
        # Pack and unpack
        packed_data = BinaryMessage.pack_simulation_data(original_data, compress=False)
        unpacked_data = BinaryMessage.unpack_simulation_data(packed_data)
        
        # Verify data integrity (within float precision)
        for key in ['speed_rpm', 'torque_nm', 'current_a', 'voltage_v']:
            assert abs(unpacked_data[key] - original_data[key]) < 0.001
        
        # Verify timestamp precision
        assert abs(unpacked_data['timestamp'] - original_data['timestamp']) < 0.001
    
    def test_compression_efficiency(self):
        """Test binary message compression"""
        # Create large dataset
        large_data = {
            'timestamp': 1705312200.0,
            'speed_rpm': 1500.0,
            'torque_nm': 5.0,
            'current_a': 12.0,
            'voltage_v': 48.0,
            'efficiency': 0.9,
            'power_w': 1200.0,
            'temperature_c': 60.0,
            'pid_output': 80.0
        }
        
        # Pack with and without compression
        uncompressed = BinaryMessage.pack_simulation_data(large_data, compress=False)
        compressed = BinaryMessage.pack_simulation_data(large_data, compress=True)
        
        # For this simple data, compression might not be effective,
        # but the test verifies the compression path works
        assert len(compressed) > 0
        assert len(uncompressed) > 0
```

## Integration Testing

### API Integration Tests
```python
# tests/integration/test_api.py
import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app

class TestMotorAPI:
    """Integration tests for motor configuration API"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_list_motors(self, client):
        """Test motor listing endpoint"""
        response = client.get("/api/v1/motors")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "motors" in data
        assert len(data["motors"]) >= 4  # BLDC, PMSM, SRM, ACIM
        
        # Verify motor structure
        motor = data["motors"][0]
        required_fields = ["id", "name", "type", "rated_power_kw", "rated_voltage_v"]
        for field in required_fields:
            assert field in motor
    
    def test_get_motor_details(self, client):
        """Test motor details endpoint"""
        response = client.get("/api/v1/motors/bldc_2kw_48v")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify detailed motor information
        assert data["id"] == "bldc_2kw_48v"
        assert data["type"] == "BLDC"
        assert "electrical_specs" in data
        assert "physical_parameters" in data
        assert "operating_limits" in data
    
    def test_motor_not_found(self, client):
        """Test motor not found error"""
        response = client.get("/api/v1/motors/nonexistent_motor")
        
        assert response.status_code == 404
        data = response.json()
        assert "error" in data

class TestSimulationAPI:
    """Integration tests for simulation control API"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_start_simulation(self, client):
        """Test simulation session creation"""
        payload = {
            "motor_id": "bldc_2kw_48v",
            "control_mode": "manual",
            "session_name": "Test Session"
        }
        
        response = client.post("/api/v1/simulation/start", json=payload)
        
        assert response.status_code == 200
        data = response.json()
        
        assert "session_id" in data
        assert data["motor_id"] == "bldc_2kw_48v"
        assert data["status"] == "started"
        assert "websocket_url" in data
    
    def test_invalid_motor_id(self, client):
        """Test simulation start with invalid motor"""
        payload = {
            "motor_id": "invalid_motor",
            "control_mode": "manual"
        }
        
        response = client.post("/api/v1/simulation/start", json=payload)
        
        assert response.status_code == 400
        data = response.json()
        assert "error" in data

class TestDriveCycleAPI:
    """Integration tests for drive cycle management"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    @pytest.fixture
    def valid_drive_cycle_csv(self):
        """Create valid drive cycle CSV content"""
        return """time_s,speed_rpm,load_torque_percent
0,0,0
5,500,25
10,1000,50
15,1500,75
20,1000,50
25,500,25
30,0,0"""
    
    def test_upload_drive_cycle(self, client, valid_drive_cycle_csv):
        """Test drive cycle file upload"""
        files = {
            "file": ("test_cycle.csv", valid_drive_cycle_csv, "text/csv")
        }
        data = {
            "name": "Test Urban Cycle",
            "description": "Test cycle for integration testing"
        }
        
        response = client.post("/api/v1/drive-cycles/upload", files=files, data=data)
        
        assert response.status_code == 200
        result = response.json()
        
        assert result["status"] == "uploaded"
        assert result["validation"]["valid"] == True
        assert result["validation"]["data_points"] == 7
    
    def test_invalid_drive_cycle(self, client):
        """Test upload of invalid drive cycle"""
        invalid_csv = """invalid,headers,here
1,2,3
4,5,6"""
        
        files = {
            "file": ("invalid_cycle.csv", invalid_csv, "text/csv")
        }
        
        response = client.post("/api/v1/drive-cycles/upload", files=files)
        
        assert response.status_code == 400
        data = response.json()
        assert "error" in data
```

## End-to-End Testing

### WebSocket Integration Tests
```python
# tests/integration/test_websocket_integration.py
import pytest
import asyncio
import websockets
import json
from unittest.mock import patch

class TestWebSocketSimulation:
    """End-to-end WebSocket simulation tests"""
    
    @pytest.mark.asyncio
    async def test_complete_simulation_flow(self):
        """Test complete simulation from start to data streaming"""
        
        # Start simulation via REST API
        async with aiohttp.ClientSession() as session:
            start_payload = {
                "motor_id": "bldc_2kw_48v",
                "control_mode": "manual"
            }
            
            async with session.post("http://localhost:8000/api/v1/simulation/start", 
                                  json=start_payload) as response:
                assert response.status == 200
                sim_data = await response.json()
                session_id = sim_data['session_id']
        
        # Connect to WebSocket
        ws_url = f"ws://localhost:8000/ws/simulation/{session_id}"
        
        async with websockets.connect(ws_url) as websocket:
            # Send control command
            control_message = {
                "type": "update_control",
                "payload": {
                    "target_speed_rpm": 2000,
                    "load_torque_percent": 50
                }
            }
            
            await websocket.send(json.dumps(control_message))
            
            # Receive simulation data
            data_points = []
            start_time = time.time()
            
            while len(data_points) < 100 and (time.time() - start_time) < 10:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    data = json.loads(message)
                    
                    if data.get('type') == 'simulation_data':
                        data_points.append(data['payload'])
                        
                except asyncio.TimeoutError:
                    break
            
            # Verify received data
            assert len(data_points) >= 50  # Should receive data regularly
            
            # Verify data structure
            latest_data = data_points[-1]
            required_fields = ['speed_rpm', 'torque_nm', 'current_a', 'voltage_v', 'efficiency_percent']
            for field in required_fields:
                assert field in latest_data
            
            # Verify motor responds to control commands
            final_speed = latest_data['speed_rpm']
            assert 1800 <= final_speed <= 2200  # Should be near target speed
```

## Validation Testing

### Real Motor Data Validation
```python
# tests/validation/test_motor_validation.py
import pytest
import pandas as pd
import numpy as np
from app.simulation.bldc_motor import BLDCMotor, BLDCParameters
from app.validation.motor_validator import MotorValidator

class TestMotorValidation:
    """Validation tests against real motor data"""
    
    @pytest.fixture
    def real_motor_data(self):
        """Load real motor test data for validation"""
        # This would load actual dynamometer test data
        return pd.DataFrame({
            'speed_rpm': [0, 500, 1000, 1500, 2000, 2500, 3000],
            'torque_nm': [8.0, 7.8, 7.2, 6.5, 5.8, 4.9, 3.8],
            'current_a': [35, 34, 32, 29, 26, 22, 18],
            'efficiency': [0.0, 0.82, 0.87, 0.90, 0.89, 0.85, 0.79]
        })
    
    @pytest.fixture
    def motor_params(self):
        """Motor parameters derived from datasheet"""
        return BLDCParameters(
            resistance=0.08,
            inductance=0.0015,
            kt=0.169,
            ke=0.169,
            pole_pairs=4,
            inertia=0.001,
            friction=0.001
        )
    
    def test_torque_speed_curve_validation(self, real_motor_data, motor_params):
        """Validate simulated torque-speed curve against real data"""
        motor = BLDCMotor(motor_params)
        validator = MotorValidator()
        
        simulated_results = []
        
        for _, row in real_motor_data.iterrows():
            target_speed = row['speed_rpm'] * np.pi / 30  # Convert to rad/s
            
            # Run simulation to steady state at target speed
            # (This would include proper speed control)
            simulated_torque = validator.simulate_steady_state_point(
                motor, target_speed, load_torque=0
            )
            
            simulated_results.append({
                'speed_rpm': row['speed_rpm'],
                'simulated_torque_nm': simulated_torque,
                'real_torque_nm': row['torque_nm']
            })
        
        # Calculate validation metrics
        sim_df = pd.DataFrame(simulated_results)
        
        # R-squared correlation
        correlation = np.corrcoef(sim_df['simulated_torque_nm'], sim_df['real_torque_nm'])[0,1]
        r_squared = correlation ** 2
        
        # Mean absolute percentage error
        mape = np.mean(np.abs(
            (sim_df['real_torque_nm'] - sim_df['simulated_torque_nm']) / 
            sim_df['real_torque_nm']
        )) * 100
        
        # Validation criteria
        assert r_squared > 0.90  # Good correlation
        assert mape < 15.0  # Less than 15% error
    
    def test_efficiency_validation(self, real_motor_data, motor_params):
        """Validate efficiency calculations against measured data"""
        motor = BLDCMotor(motor_params)
        validator = MotorValidator()
        
        efficiency_errors = []
        
        for _, row in real_motor_data.iterrows():
            if row['speed_rpm'] == 0:  # Skip zero speed point
                continue
                
            simulated_efficiency = validator.calculate_efficiency_at_point(
                motor, row['speed_rpm'], row['torque_nm']
            )
            
            real_efficiency = row['efficiency']
            error_percent = abs(simulated_efficiency - real_efficiency) / real_efficiency * 100
            efficiency_errors.append(error_percent)
        
        # Average efficiency error should be reasonable
        avg_error = np.mean(efficiency_errors)
        max_error = np.max(efficiency_errors)
        
        assert avg_error < 10.0  # Less than 10% average error
        assert max_error < 20.0  # No single point over 20% error

class MotorValidator:
    """Helper class for motor model validation"""
    
    def simulate_steady_state_point(self, motor, target_speed_rad_s, load_torque):
        """Simulate motor at steady-state operating point"""
        # Reset motor state
        motor.speed = 0
        motor.current = 0
        
        # Simple voltage control to reach target speed
        # (In reality, this would use closed-loop control)
        voltage = 48.0 * (target_speed_rad_s / (3000 * np.pi / 30))  # Simple estimate
        
        # Run simulation until steady state
        for _ in range(10000):  # 10 seconds at 1ms steps
            result = motor.step(voltage, load_torque, 0.001)
            
        return result['torque_nm']
    
    def calculate_efficiency_at_point(self, motor, speed_rpm, target_torque):
        """Calculate efficiency at specific operating point"""
        # This would involve more sophisticated control to maintain
        # specific speed and torque conditions
        target_speed_rad_s = speed_rpm * np.pi / 30
        
        # Estimate required voltage for this operating point
        voltage = self._estimate_voltage_for_operating_point(speed_rpm, target_torque)
        
        # Run steady-state simulation
        for _ in range(5000):
            result = motor.step(voltage, target_torque, 0.001)
            
        return result['efficiency']
    
    def _estimate_voltage_for_operating_point(self, speed_rpm, torque_nm):
        """Estimate required voltage for operating point"""
        # Simple estimation based on motor equations
        # Real implementation would be more sophisticated
        speed_rad_s = speed_rpm * np.pi / 30
        back_emf = 0.169 * speed_rad_s  # ke * omega
        current = torque_nm / 0.169  # torque / kt
        voltage_drop = 0.08 * current  # R * I
        
        return back_emf + voltage_drop + 2.0  # Add safety margin
```

## Performance Testing

### Load Testing Framework
```python
# tests/performance/load_testing.py
import asyncio
import aiohttp
import time
import statistics
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict

class LoadTestResults:
    def __init__(self):
        self.response_times: List[float] = []
        self.error_count = 0
        self.success_count = 0
        self.throughput_points_per_sec = 0
        
    def add_response_time(self, response_time: float):
        self.response_times.append(response_time)
        self.success_count += 1
        
    def add_error(self):
        self.error_count += 1
        
    def calculate_statistics(self) -> Dict:
        if not self.response_times:
            return {"error": "No successful responses"}
            
        return {
            "total_requests": len(self.response_times),
            "success_count": self.success_count,
            "error_count": self.error_count,
            "success_rate_percent": (self.success_count / (self.success_count + self.error_count)) * 100,
            "avg_response_time_ms": statistics.mean(self.response_times),
            "median_response_time_ms": statistics.median(self.response_times),
            "p95_response_time_ms": statistics.quantiles(self.response_times, n=20)[18],  # 95th percentile
            "p99_response_time_ms": statistics.quantiles(self.response_times, n=100)[98],  # 99th percentile
            "min_response_time_ms": min(self.response_times),
            "max_response_time_ms": max(self.response_times)
        }

class LoadTester:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        
    async def test_api_load(self, 
                          endpoint: str, 
                          method: str = "GET",
                          payload: Dict = None,
                          concurrent_users: int = 10,
                          requests_per_user: int = 100) -> Dict:
        """Load test an API endpoint"""
        
        results = LoadTestResults()
        
        async def make_request(session: aiohttp.ClientSession):
            try:
                start_time = time.time()
                
                if method.upper() == "GET":
                    async with session.get(f"{self.base_url}{endpoint}") as response:
                        await response.text()
                        
                elif method.upper() == "POST":
                    async with session.post(f"{self.base_url}{endpoint}", json=payload) as response:
                        await response.text()
                
                end_time = time.time()
                response_time_ms = (end_time - start_time) * 1000
                results.add_response_time(response_time_ms)
                
            except Exception as e:
                results.add_error()
        
        async def user_simulation():
            """Simulate single user making multiple requests"""
            async with aiohttp.ClientSession() as session:
                tasks = [make_request(session) for _ in range(requests_per_user)]
                await asyncio.gather(*tasks, return_exceptions=True)
        
        # Run concurrent users
        start_time = time.time()
        user_tasks = [user_simulation() for _ in range(concurrent_users)]
        await asyncio.gather(*user_tasks)
        end_time = time.time()
        
        # Calculate throughput
        total_time = end_time - start_time
        total_requests = concurrent_users * requests_per_user
        results.throughput_points_per_sec = results.success_count / total_time
        
        return results.calculate_statistics()

# Example load test runner
async def run_load_tests():
    tester = LoadTester()
    
    print("=== Motor Simulation Load Tests ===")
    
    # Test 1: Motor listing API
    print("\n1. Motor Listing API Load Test")
    result = await tester.test_api_load("/api/v1/motors", "GET", concurrent_users=20, requests_per_user=50)
    print(f"   Success rate: {result['success_rate_percent']:.1f}%")
    print(f"   Avg response time: {result['avg_response_time_ms']:.2f}ms")
    print(f"   P95 response time: {result['p95_response_time_ms']:.2f}ms")
    
    # Test 2: Simulation start API
    print("\n2. Simulation Start API Load Test")
    payload = {"motor_id": "bldc_2kw_48v", "control_mode": "manual"}
    result = await tester.test_api_load("/api/v1/simulation/start", "POST", payload, 
                                      concurrent_users=10, requests_per_user=20)
    print(f"   Success rate: {result['success_rate_percent']:.1f}%")
    print(f"   Avg response time: {result['avg_response_time_ms']:.2f}ms")

if __name__ == "__main__":
    asyncio.run(run_load_tests())
```

## Test Data Management

### Test Data Generation
```python
# tests/fixtures/test_data_generator.py
import numpy as np
import pandas as pd
from typing import Dict, List

class TestDataGenerator:
    """Generate realistic test data for motor simulation testing"""
    
    @staticmethod
    def generate_drive_cycle(duration_s: int = 300, 
                           max_speed_rpm: int = 3000,
                           cycle_type: str = "urban") -> pd.DataFrame:
        """Generate synthetic drive cycle data"""
        
        time_points = np.arange(0, duration_s, 0.1)  # 10Hz sampling
        
        if cycle_type == "urban":
            # Urban cycle with frequent stops and starts
            speed_profile = TestDataGenerator._urban_speed_profile(time_points, max_speed_rpm)
            
        elif cycle_type == "highway":
            # Highway cycle with steady speeds
            speed_profile = TestDataGenerator._highway_speed_profile(time_points, max_speed_rpm)
            
        elif cycle_type == "aggressive":
            # Aggressive driving with rapid changes
            speed_profile = TestDataGenerator._aggressive_speed_profile(time_points, max_speed_rpm)
        
        # Calculate load torque based on acceleration
        acceleration = np.gradient(speed_profile, 0.1)  # RPM/s
        load_torque_percent = 25 + np.abs(acceleration) / 100  # Base load + acceleration component
        load_torque_percent = np.clip(load_torque_percent, 0, 150)
        
        return pd.DataFrame({
            'time_s': time_points,
            'speed_rpm': speed_profile,
            'load_torque_percent': load_torque_percent
        })
    
    @staticmethod
    def _urban_speed_profile(time_points: np.ndarray, max_speed: int) -> np.ndarray:
        """Generate urban driving speed profile"""
        speed = np.zeros_like(time_points)
        
        # Create segments with different characteristics
        segment_length = len(time_points) // 6
        
        for i in range(6):
            start_idx = i * segment_length
            end_idx = (i + 1) * segment_length if i < 5 else len(time_points)
            segment_time = time_points[start_idx:end_idx] - time_points[start_idx]
            
            if i % 2 == 0:  # Acceleration/cruising phases
                target_speed = max_speed * (0.4 + 0.3 * np.random.random())
                speed[start_idx:end_idx] = target_speed * (1 - np.exp(-segment_time / 10))
            else:  # Deceleration/stop phases
                initial_speed = speed[start_idx-1] if start_idx > 0 else 0
                speed[start_idx:end_idx] = initial_speed * np.exp(-segment_time / 15)
        
        return speed
    
    @staticmethod
    def generate_motor_test_data(motor_type: str) -> Dict:
        """Generate comprehensive test data for motor validation"""
        
        # Generate steady-state test points
        speed_points = np.linspace(100, 6000, 20)  # RPM
        torque_points = np.linspace(0.5, 15.0, 15)  # Nm
        
        test_data = {
            'motor_type': motor_type,
            'steady_state_points': [],
            'transient_responses': [],
            'efficiency_map': []
        }
        
        for speed in speed_points:
            for torque in torque_points:
                # Skip unrealistic operating points
                if speed * torque / 9549 > 2.5:  # Power > 2.5kW
                    continue
                    
                # Generate realistic data with noise
                base_efficiency = TestDataGenerator._calculate_efficiency(speed, torque, motor_type)
                noise = np.random.normal(0, 0.02)  # 2% noise
                efficiency = np.clip(base_efficiency + noise, 0.1, 0.95)
                
                test_data['efficiency_map'].append({
                    'speed_rpm': speed,
                    'torque_nm': torque,
                    'efficiency': efficiency,
                    'current_a': TestDataGenerator._estimate_current(torque, motor_type),
                    'voltage_v': 48.0,
                    'power_w': speed * torque / 9549 * 1000
                })
        
        return test_data
    
    @staticmethod
    def _calculate_efficiency(speed_rpm: float, torque_nm: float, motor_type: str) -> float:
        """Calculate realistic efficiency based on motor type and operating point"""
        
        # Normalize operating point
        normalized_speed = speed_rpm / 3000
        normalized_torque = torque_nm / 8.0
        
        if motor_type == "BLDC":
            # BLDC motors have high efficiency across wide range
            base_efficiency = 0.88 - 0.15 * (normalized_speed - 0.5)**2 - 0.1 * (normalized_torque - 0.6)**2
            
        elif motor_type == "PMSM":  
            # PMSM motors have highest peak efficiency
            base_efficiency = 0.92 - 0.12 * (normalized_speed - 0.4)**2 - 0.08 * (normalized_torque - 0.7)**2
            
        elif motor_type == "SRM":
            # SRM motors have lower efficiency due to switching losses
            base_efficiency = 0.82 - 0.18 * (normalized_speed - 0.6)**2 - 0.12 * (normalized_torque - 0.5)**2
            
        elif motor_type == "ACIM":
            # AC induction motors have good efficiency at rated conditions
            base_efficiency = 0.85 - 0.20 * (normalized_speed - 0.8)**2 - 0.15 * (normalized_torque - 0.8)**2
        
        return np.clip(base_efficiency, 0.1, 0.95)
    
    @staticmethod
    def _estimate_current(torque_nm: float, motor_type: str) -> float:
        """Estimate phase current based on torque and motor type"""
        kt_values = {
            "BLDC": 0.169,
            "PMSM": 0.15,
            "SRM": 0.12,
            "ACIM": 0.14
        }
        
        kt = kt_values.get(motor_type, 0.15)
        return torque_nm / kt
```

This comprehensive testing strategy ensures the motor simulation system meets all performance, accuracy, and reliability requirements through systematic validation at multiple levels.
