"""
Real-time simulation engine for motor control system.
"""

import asyncio
import time
import numpy as np
from typing import Dict, Any, Optional
from datetime import datetime

from app.models.bldc_motor import BLDCMotor
from app.controllers.pid_controller import PIDController
from app.controllers.current_controller import CurrentController, CascadedSpeedCurrentController
from app.core.config import get_settings
from app.core.motor_factory import MotorFactory


class RealTimeSimulator:
    """
    Real-time motor simulation engine with PID control.
    
    Features:
    - 1000Hz simulation rate (1ms timestep)
    - Real-time WebSocket data streaming
    - PID speed control integration
    - Load torque simulation
    - Performance monitoring
    - Graceful error handling
    """
    
    def __init__(self, session_id: str, websocket_manager):
        self.session_id = session_id
        self.ws_manager = websocket_manager
        self.settings = get_settings()
        
        # Simulation parameters
        self.dt = self.settings.DEFAULT_TIMESTEP_MS / 1000.0  # Convert to seconds
        self.simulation_rate_hz = 1.0 / self.dt
        self.websocket_send_rate_hz = self.settings.WEBSOCKET_SEND_RATE_HZ
        
        # Calculate WebSocket send interval
        self.websocket_send_interval = 1.0 / self.websocket_send_rate_hz
        
        # Initialize motor and controllers
        self.motor = None
        self.pid_controller = None  # For legacy voltage control
        self.current_controller = None  # For current control loop
        self.cascaded_controller = None  # For cascaded speed/current control
        
        # Control parameters
        self.target_speed_rpm = 0.0
        self.target_current_a = 0.0
        self.target_torque_nm = 0.0
        self.load_torque_percent = 0.0
        self.manual_voltage = 0.0
        self.manual_duty_cycle = 0.0
        self.control_mode = "speed"  # "speed", "current", "torque", "voltage", "duty_cycle"
        self.use_cascaded_control = True  # Use cascaded control by default
        
        # Simulation state
        self.is_running = False
        self.simulation_step = 0
        self.start_time = None
        
        # Performance tracking
        self.loop_times = []
        self.max_loop_time = 0.0
        self.average_loop_time = 0.001
        self.last_websocket_send = 0.0
        
        # Data buffer for smooth streaming
        self.data_buffer = []
        self.max_buffer_size = 1000
        
    async def initialize(self):
        """Initialize motor and controller for simulation."""
        try:
            # Create motor instance with PWM control enabled
            motor_params = self.settings.DEFAULT_MOTOR_PARAMS.copy()
            
            # Add PWM/inverter parameters
            motor_params['dc_bus_voltage'] = motor_params.get('rated_voltage', 48.0)
            motor_params['switching_frequency'] = 20000  # 20 kHz PWM
            motor_params['dead_time_us'] = 2.0
            motor_params['inverter_on_resistance'] = 0.01  # 10 mOhm
            
            self.motor = BLDCMotor(motor_params, use_pwm=True)
            
            # Create legacy PID controller for voltage mode
            pid_params = self.settings.DEFAULT_PID_PARAMS
            self.pid_controller = PIDController(pid_params)
            
            # Create current controller
            current_controller_params = {
                'kp': 10.0,  # Higher bandwidth than speed loop
                'ki': 1000.0,
                'bandwidth_hz': 1000.0,  # 1 kHz current loop
                'max_duty_cycle': 0.95,
                'min_duty_cycle': 0.05,
                'use_anti_windup': True,
                'use_feedforward': True,
                'feedforward_gain': 0.8
            }
            self.current_controller = CurrentController(current_controller_params)
            
            # Auto-tune current controller based on motor parameters
            self.current_controller.tune_for_motor(motor_params)
            
            # Create cascaded controller
            speed_controller_params = {
                'kp': pid_params['kp'],
                'ki': pid_params['ki'],
                'kd': pid_params['kd'],
                'output_limit': motor_params['max_torque'],
                'integral_limit': motor_params['max_torque'] * 0.5,
                'use_anti_windup': True
            }
            self.cascaded_controller = CascadedSpeedCurrentController(
                speed_controller_params,
                current_controller_params
            )
            self.cascaded_controller.set_motor_params(motor_params['kt'])
            
            # Reset to initial conditions
            self.motor.reset()
            self.pid_controller.reset()
            self.current_controller.reset()
            self.cascaded_controller.reset()
            
            print(f"Simulation initialized for session {self.session_id}")
            print(f"Control architecture: {'Cascaded' if self.use_cascaded_control else 'Direct'}")
            return True
            
        except Exception as e:
            print(f"Error initializing simulation: {e}")
            await self._send_error("simulation_init_failed", str(e))
            return False
    
    async def run(self):
        """
        Run the real-time simulation loop.
        
        Maintains precise 1000Hz simulation rate while streaming
        data to WebSocket clients at configurable rate.
        """
        # Initialize components
        if not await self.initialize():
            return
        
        self.is_running = True
        self.start_time = time.time()
        
        print(f"Starting real-time simulation for session {self.session_id}")
        print(f"Simulation rate: {self.simulation_rate_hz} Hz")
        print(f"WebSocket rate: {self.websocket_send_rate_hz} Hz")
        
        try:
            # Main simulation loop
            while self.is_running:
                loop_start_time = time.perf_counter()
                
                # Execute simulation step
                await self._simulation_step()
                
                # Send data to WebSocket clients if due
                current_time = time.time()
                if current_time - self.last_websocket_send >= self.websocket_send_interval:
                    await self._send_simulation_data()
                    self.last_websocket_send = current_time
                
                # Calculate loop timing
                loop_end_time = time.perf_counter()
                loop_duration = loop_end_time - loop_start_time
                
                # Update performance metrics
                self._update_performance_metrics(loop_duration)
                
                # Sleep to maintain simulation rate
                sleep_time = self.dt - loop_duration
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
                else:
                    # Log if we're running behind
                    if loop_duration > self.dt * 1.1:  # 10% tolerance
                        print(f"Simulation running slow: {loop_duration*1000:.2f}ms (target: {self.dt*1000:.2f}ms)")
                
                self.simulation_step += 1
        
        except asyncio.CancelledError:
            print(f"Simulation cancelled for session {self.session_id}")
        except Exception as e:
            print(f"Simulation error: {e}")
            await self._send_error("simulation_runtime_error", str(e))
        finally:
            self.is_running = False
            print(f"Simulation stopped for session {self.session_id}")
    
    async def _simulation_step(self):
        """Execute one simulation step."""
        try:
            # Get current motor state
            current_speed_rpm = self.motor.speed * 30 / np.pi  # Convert rad/s to RPM
            current_current_a = self.motor.current
            
            # Calculate control input based on mode
            if self.use_cascaded_control and self.control_mode in ['speed', 'current', 'torque']:
                # Use cascaded controller
                if self.control_mode == 'speed':
                    self.cascaded_controller.set_control_mode('speed')
                    duty_cycle = self.cascaded_controller.update(
                        target_speed_rpm=self.target_speed_rpm,
                        actual_speed_rpm=current_speed_rpm,
                        actual_current=current_current_a,
                        dt=self.dt,
                        motor_params={
                            'resistance': self.motor.get_hot_resistance(),
                            'inductance': self.motor.params['inductance'],
                            'back_emf': self.motor.calculate_back_emf(),
                            'dc_voltage': self.motor.params.get('dc_bus_voltage', 48.0)
                        }
                    )
                elif self.control_mode == 'current':
                    self.cascaded_controller.set_control_mode('current')
                    duty_cycle = self.cascaded_controller.update(
                        target_current=self.target_current_a,
                        actual_current=current_current_a,
                        dt=self.dt,
                        motor_params={
                            'resistance': self.motor.get_hot_resistance(),
                            'inductance': self.motor.params['inductance'],
                            'back_emf': self.motor.calculate_back_emf(),
                            'dc_voltage': self.motor.params.get('dc_bus_voltage', 48.0)
                        }
                    )
                else:  # torque mode
                    self.cascaded_controller.set_control_mode('torque')
                    # Convert torque to current: I = T / kt
                    duty_cycle = self.cascaded_controller.update(
                        target_current=self.target_torque_nm,  # Will be converted by controller
                        actual_current=current_current_a,
                        dt=self.dt,
                        motor_params={
                            'resistance': self.motor.get_hot_resistance(),
                            'inductance': self.motor.params['inductance'],
                            'back_emf': self.motor.calculate_back_emf(),
                            'dc_voltage': self.motor.params.get('dc_bus_voltage', 48.0)
                        }
                    )
                control_input = duty_cycle
                
            elif self.control_mode == 'voltage':
                # Legacy voltage control with PID
                if self.target_speed_rpm > 0:
                    control_voltage = self.pid_controller.update(
                        setpoint=self.target_speed_rpm,
                        process_variable=current_speed_rpm,
                        dt=self.dt
                    )
                else:
                    control_voltage = self.manual_voltage
                # Convert voltage to duty cycle for PWM mode
                dc_voltage = self.motor.params.get('dc_bus_voltage', 48.0)
                control_input = control_voltage / dc_voltage
                
            elif self.control_mode == 'duty_cycle':
                # Direct duty cycle control
                control_input = self.manual_duty_cycle
                
            else:
                # Default to zero
                control_input = 0.0
            
            # Calculate load torque
            max_torque = self.motor.params['max_torque']
            load_torque = (self.load_torque_percent / 100.0) * max_torque
            
            # Apply some dynamic load variation for realism
            if self.load_torque_percent > 0:
                load_variation = 0.05 * np.sin(2 * np.pi * 0.1 * self.simulation_step * self.dt)
                load_torque *= (1 + load_variation)
            
            # Step motor simulation (control_input is duty cycle in PWM mode)
            motor_state = self.motor.step(control_input, load_torque, self.dt)
            
            # Store data point
            data_point = {
                'timestamp': time.time(),
                'simulation_step': self.simulation_step,
                'motor_state': motor_state,
                'control_input': control_input,
                'load_torque': load_torque,
                'target_speed_rpm': self.target_speed_rpm,
                'target_current_a': self.target_current_a,
                'target_torque_nm': self.target_torque_nm,
                'control_mode': self.control_mode,
                'use_cascaded_control': self.use_cascaded_control
            }
            
            # Add controller states if available
            if self.cascaded_controller and self.use_cascaded_control:
                data_point['current_controller_state'] = self.current_controller.get_state()
                data_point['current_error'] = self.target_current_a - current_current_a if self.control_mode == 'current' else None
            
            # Add to buffer
            self._add_to_buffer(data_point)
            
        except Exception as e:
            print(f"Error in simulation step: {e}")
            raise
    
    async def _send_simulation_data(self):
        """Send current simulation data to WebSocket clients."""
        if not self.data_buffer:
            return
        
        try:
            # Get latest data point
            latest_data = self.data_buffer[-1]
            
            # Prepare data for WebSocket transmission
            websocket_data = {
                'timestamp': latest_data['timestamp'],
                'speed_rpm': latest_data['motor_state']['speed_rpm'],
                'torque_nm': latest_data['motor_state']['torque_nm'],
                'current_a': latest_data['motor_state']['current_a'],
                'voltage_v': latest_data['motor_state']['voltage_v'],
                'power_w': latest_data['motor_state']['power_w'],
                'efficiency': latest_data['motor_state']['efficiency'],
                'temperature_c': latest_data['motor_state']['temperature_c'],
                'target_speed_rpm': latest_data['target_speed_rpm'],
                'target_current_a': latest_data.get('target_current_a', 0),
                'target_torque_nm': latest_data.get('target_torque_nm', 0),
                'control_input': latest_data['control_input'],
                'load_torque': latest_data['load_torque'],
                'simulation_step': latest_data['simulation_step'],
                'control_mode': latest_data['control_mode']
            }
            
            # Add PWM-specific data if available
            if 'duty_cycle' in latest_data['motor_state']:
                websocket_data['duty_cycle'] = latest_data['motor_state']['duty_cycle']
                websocket_data['dc_bus_voltage'] = latest_data['motor_state'].get('dc_bus_voltage', 48.0)
                websocket_data['switching_frequency'] = latest_data['motor_state'].get('switching_frequency', 20000)
            
            # Add controller state if available
            if 'current_controller_state' in latest_data:
                websocket_data['current_error'] = latest_data['current_controller_state'].get('current_error', 0)
                websocket_data['controller_saturated'] = latest_data['current_controller_state'].get('is_saturated', False)
            
            # Send to WebSocket clients
            await self.ws_manager.broadcast_simulation_data(
                self.session_id, 
                websocket_data
            )
            
        except Exception as e:
            print(f"Error sending WebSocket data: {e}")
    
    async def _send_error(self, error_type: str, message: str):
        """Send error message to WebSocket clients."""
        error_data = {
            'error_type': error_type,
            'message': message,
            'session_id': self.session_id,
            'timestamp': time.time()
        }
        
        try:
            await self.ws_manager.broadcast_error(self.session_id, error_data)
        except Exception as e:
            print(f"Error sending error message: {e}")
    
    def _add_to_buffer(self, data_point: Dict):
        """Add data point to buffer with size management."""
        self.data_buffer.append(data_point)
        
        # Limit buffer size
        if len(self.data_buffer) > self.max_buffer_size:
            self.data_buffer = self.data_buffer[-self.max_buffer_size//2:]
    
    def _update_performance_metrics(self, loop_duration: float):
        """Update simulation performance metrics."""
        # Track loop times
        self.loop_times.append(loop_duration)
        
        # Keep only recent measurements
        if len(self.loop_times) > 1000:
            self.loop_times = self.loop_times[-500:]
        
        # Update max loop time
        self.max_loop_time = max(self.max_loop_time, loop_duration)
        
        # Update average loop time
        self.average_loop_time = np.mean(self.loop_times)
    
    def update_control_parameters(self, **kwargs):
        """
        Update control parameters during simulation.
        
        Args:
            target_speed_rpm: New target speed
            target_current_a: New target current
            target_torque_nm: New target torque
            load_torque_percent: New load torque percentage
            control_mode: Control mode ('speed', 'current', 'torque', 'voltage', 'duty_cycle')
            use_cascaded_control: Whether to use cascaded control
            manual_voltage: Manual voltage setting
            manual_duty_cycle: Manual duty cycle setting
            pid_params: PID parameters dictionary
            current_controller_params: Current controller parameters
        """
        if 'target_speed_rpm' in kwargs:
            self.target_speed_rpm = kwargs['target_speed_rpm']
        
        if 'target_current_a' in kwargs:
            self.target_current_a = kwargs['target_current_a']
        
        if 'target_torque_nm' in kwargs:
            self.target_torque_nm = kwargs['target_torque_nm']
        
        if 'load_torque_percent' in kwargs:
            self.load_torque_percent = kwargs['load_torque_percent']
        
        if 'control_mode' in kwargs:
            self.control_mode = kwargs['control_mode']
        
        if 'use_cascaded_control' in kwargs:
            self.use_cascaded_control = kwargs['use_cascaded_control']
        
        if 'manual_voltage' in kwargs:
            self.manual_voltage = kwargs['manual_voltage']
        
        if 'manual_duty_cycle' in kwargs:
            self.manual_duty_cycle = kwargs['manual_duty_cycle']
        
        if 'pid_params' in kwargs and self.pid_controller:
            pid_params = kwargs['pid_params']
            self.pid_controller.set_parameters(
                kp=pid_params.get('kp'),
                ki=pid_params.get('ki'),
                kd=pid_params.get('kd')
            )
            # Also update cascaded controller's speed loop
            if self.cascaded_controller:
                self.cascaded_controller.speed_controller.set_parameters(
                    kp=pid_params.get('kp'),
                    ki=pid_params.get('ki'),
                    kd=pid_params.get('kd')
                )
        
        if 'current_controller_params' in kwargs and self.current_controller:
            params = kwargs['current_controller_params']
            self.current_controller.set_gains(
                kp=params.get('kp', self.current_controller.kp),
                ki=params.get('ki', self.current_controller.ki)
            )
            # Also update cascaded controller's current loop
            if self.cascaded_controller:
                self.cascaded_controller.current_controller.set_gains(
                    kp=params.get('kp', self.current_controller.kp),
                    ki=params.get('ki', self.current_controller.ki)
                )
    
    def stop(self):
        """Stop the simulation."""
        self.is_running = False
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get simulation statistics."""
        current_time = time.time()
        uptime = current_time - (self.start_time or current_time)
        
        return {
            'session_id': self.session_id,
            'is_running': self.is_running,
            'uptime_seconds': uptime,
            'simulation_steps': self.simulation_step,
            'simulation_rate_hz': self.simulation_step / uptime if uptime > 0 else 0,
            'average_loop_time_ms': self.average_loop_time * 1000,
            'max_loop_time_ms': self.max_loop_time * 1000,
            'buffer_size': len(self.data_buffer),
            'control_parameters': {
                'target_speed_rpm': self.target_speed_rpm,
                'target_current_a': self.target_current_a,
                'target_torque_nm': self.target_torque_nm,
                'load_torque_percent': self.load_torque_percent,
                'control_mode': self.control_mode,
                'use_cascaded_control': self.use_cascaded_control,
                'manual_voltage': self.manual_voltage,
                'manual_duty_cycle': self.manual_duty_cycle
            }
        }