"""
BLDC Motor Model Implementation

This module implements a comprehensive BLDC motor physics model
for real-time simulation with thermal effects and current limiting.
Supports both direct voltage control and PWM-based control.
"""

import numpy as np
from typing import Dict, Optional, Tuple
import math
from .pwm_inverter import PWMInverter


class BLDCMotor:
    """
    Brushless DC Motor Model with complete physics simulation.
    
    Implements:
    - Electrical dynamics (voltage, current, back EMF)
    - Mechanical dynamics (torque, speed, position)
    - Thermal effects (temperature-dependent resistance)
    - Current limiting and protection
    - Regenerative operation
    """
    
    def __init__(self, motor_params: Dict, use_pwm: bool = True):
        """
        Initialize BLDC motor with given parameters.
        
        Args:
            motor_params: Dictionary containing motor parameters:
                - resistance: Winding resistance (Ohms)
                - inductance: Winding inductance (H)
                - kt: Torque constant (Nm/A)
                - ke: Back EMF constant (V*s/rad)
                - pole_pairs: Number of pole pairs
                - inertia: Rotor inertia (kg*m^2)
                - friction: Friction coefficient
                - rated_voltage: Rated voltage (V)
                - rated_current: Rated current (A)
                - rated_speed: Rated speed (RPM)
                - rated_torque: Rated torque (Nm)
                - max_speed: Maximum speed (RPM)
                - max_torque: Maximum torque (Nm)
            use_pwm: Whether to use PWM inverter model (default True)
        """
        self.params = motor_params.copy()
        self.use_pwm = use_pwm
        
        # Motor state variables
        self.speed = 0.0  # Angular speed (rad/s)
        self.position = 0.0  # Angular position (rad)
        self.current = 0.0  # Motor current (A)
        self.voltage = 0.0  # Applied voltage (V)
        self.torque = 0.0  # Motor torque (Nm)
        self.temperature = 25.0  # Motor temperature (°C)
        self.duty_cycle = 0.0  # PWM duty cycle (0-1)
        
        # Initialize PWM inverter if enabled
        if self.use_pwm:
            inverter_params = {
                'dc_bus_voltage': motor_params.get('dc_bus_voltage', motor_params['rated_voltage']),
                'switching_frequency': motor_params.get('switching_frequency', 20000),
                'dead_time_us': motor_params.get('dead_time_us', 2.0),
                'on_resistance': motor_params.get('inverter_on_resistance', 0.01),
                'switching_loss_coefficient': motor_params.get('switching_loss_coefficient', 0.001)
            }
            self.pwm_inverter = PWMInverter(inverter_params)
        else:
            self.pwm_inverter = None
        
        # Internal states for dynamics
        self._current_filtered = 0.0
        self._last_voltage = 0.0
        self._power_loss = 0.0
        self._thermal_time_constant = 300.0  # seconds
        self._thermal_resistance = 2.0  # °C/W
        
        # Performance tracking
        self._max_current_seen = 0.0
        self._total_energy = 0.0
        
    def reset(self):
        """Reset motor to initial state."""
        self.speed = 0.0
        self.position = 0.0
        self.current = 0.0
        self.voltage = 0.0
        self.torque = 0.0
        self.temperature = 25.0
        self._current_filtered = 0.0
        self._last_voltage = 0.0
        self._power_loss = 0.0
        self._max_current_seen = 0.0
        self._total_energy = 0.0
        
    def step(self, control_input: float, load_torque: float, dt: float) -> Dict:
        """
        Advance motor simulation by one time step.
        
        Args:
            control_input: Duty cycle (0-1) if PWM mode, voltage (V) if direct mode
            load_torque: External load torque (Nm)
            dt: Time step (s)
            
        Returns:
            Dictionary with current motor state:
                - speed_rpm: Motor speed in RPM
                - torque_nm: Motor torque in Nm  
                - current_a: Motor current in A
                - voltage_v: Applied voltage in V
                - power_w: Mechanical power output in W
                - efficiency: Motor efficiency (0-1)
                - position_rad: Angular position in radians
                - temperature_c: Motor temperature in °C
                - duty_cycle: PWM duty cycle (if PWM mode)
        """
        # Convert control input to voltage
        if self.use_pwm and self.pwm_inverter:
            # PWM mode: control_input is duty cycle
            self.duty_cycle = np.clip(control_input, 0.0, 1.0)
            self.voltage = self.pwm_inverter.modulate(self.duty_cycle, self.current)
        else:
            # Direct voltage mode
            self.voltage = control_input
            self.duty_cycle = 0.0
        
        # Calculate back EMF
        back_emf = self.calculate_back_emf()
        
        # Calculate electrical dynamics
        self._update_electrical_dynamics(self.voltage, back_emf, dt)
        
        # Calculate torque
        self._update_torque()
        
        # Calculate mechanical dynamics  
        self._update_mechanical_dynamics(load_torque, dt)
        
        # Update thermal dynamics
        self._update_thermal_dynamics(dt)
        
        # Calculate performance metrics
        return self._calculate_state_outputs()
    
    def calculate_back_emf(self) -> float:
        """Calculate back EMF based on current speed."""
        return self.params['ke'] * self.speed
    
    def get_hot_resistance(self) -> float:
        """Get temperature-compensated winding resistance."""
        # Copper temperature coefficient: 0.00393 per °C
        alpha = 0.00393
        r_hot = self.params['resistance'] * (1 + alpha * (self.temperature - 20))
        return r_hot
    
    def _update_electrical_dynamics(self, applied_voltage: float, back_emf: float, dt: float):
        """Update motor current based on electrical circuit dynamics."""
        # Use temperature-compensated resistance
        resistance = self.get_hot_resistance()
        inductance = self.params['inductance']
        
        # Voltage equation: V = L*di/dt + R*i + EMF
        # Rearranged: di/dt = (V - R*i - EMF) / L
        voltage_drop = applied_voltage - back_emf
        di_dt = (voltage_drop - resistance * self.current) / inductance
        
        # Update current with numerical integration
        self.current += di_dt * dt
        
        # Apply current limiting (1.5x rated current max for safety)
        max_current = self.params['rated_current'] * 1.5
        self.current = np.clip(self.current, -max_current, max_current)
        
        # Track maximum current
        self._max_current_seen = max(self._max_current_seen, abs(self.current))
        
        # Filter current for smoother dynamics
        filter_tau = 0.001  # 1ms filter
        alpha_filter = dt / (dt + filter_tau)
        self._current_filtered += alpha_filter * (self.current - self._current_filtered)
    
    def _update_torque(self):
        """Calculate motor torque from current."""
        # Motor torque proportional to current
        self.torque = self.params['kt'] * self.current
        
        # Apply torque limiting based on max torque
        max_torque = self.params['max_torque']
        self.torque = np.clip(self.torque, -max_torque, max_torque)
    
    def _update_mechanical_dynamics(self, load_torque: float, dt: float):
        """Update speed and position based on torque balance."""
        inertia = self.params['inertia']
        friction_coeff = self.params['friction']
        
        # Calculate friction torque (proportional to speed)
        friction_torque = friction_coeff * self.speed
        
        # Net torque = motor torque - load torque - friction
        net_torque = self.torque - load_torque - friction_torque
        
        # Angular acceleration: alpha = T / J
        angular_acceleration = net_torque / inertia
        
        # Update speed and position
        self.speed += angular_acceleration * dt
        self.position += self.speed * dt
        
        # Apply speed limiting
        max_speed_rad_s = self.params['max_speed'] * np.pi / 30  # Convert RPM to rad/s
        self.speed = np.clip(self.speed, -max_speed_rad_s, max_speed_rad_s)
        
        # Keep position within 0-2π range
        self.position = self.position % (2 * np.pi)
    
    def _update_thermal_dynamics(self, dt: float):
        """Update motor temperature based on power losses."""
        # Calculate power losses
        resistance = self.get_hot_resistance()
        i2r_loss = resistance * self.current ** 2  # Copper losses
        
        # Approximate core losses (proportional to speed squared)
        speed_pu = abs(self.speed) / (self.params['max_speed'] * np.pi / 30)
        core_losses = 5.0 * speed_pu ** 2  # Watts, approximate
        
        total_loss = i2r_loss + core_losses
        self._power_loss = total_loss
        
        # Thermal dynamics: C * dT/dt = P_loss - (T - T_amb) / R_th
        ambient_temp = 25.0  # °C
        thermal_capacity = 100.0  # J/°C, approximate for small motor
        
        dT_dt = (total_loss - (self.temperature - ambient_temp) / self._thermal_resistance) / thermal_capacity
        
        # Update temperature
        self.temperature += dT_dt * dt
        
        # Limit temperature to reasonable range
        self.temperature = max(self.temperature, ambient_temp)
        self.temperature = min(self.temperature, 150.0)  # Max 150°C
    
    def _calculate_state_outputs(self) -> Dict:
        """Calculate and return current motor state."""
        # Convert speed to RPM
        speed_rpm = self.speed * 30 / np.pi
        
        # Calculate mechanical power
        mechanical_power = self.torque * self.speed
        
        # Calculate electrical power
        electrical_power = self.voltage * self.current
        
        # Calculate efficiency
        if abs(electrical_power) > 0.1:  # Avoid division by zero
            if electrical_power > 0:
                # Motoring mode
                efficiency = abs(mechanical_power) / electrical_power if electrical_power > 0 else 0
            else:
                # Regenerating mode
                efficiency = electrical_power / abs(mechanical_power) if mechanical_power != 0 else 0
        else:
            efficiency = 0.0
        
        # Clamp efficiency to reasonable range
        efficiency = np.clip(efficiency, 0.0, 0.98)
        
        # Include inverter efficiency if using PWM
        if self.use_pwm and self.pwm_inverter:
            inverter_efficiency = self.pwm_inverter.get_efficiency() / 100.0
            efficiency *= inverter_efficiency
        
        result = {
            'speed_rpm': float(speed_rpm),
            'torque_nm': float(self.torque),
            'current_a': float(self.current),
            'voltage_v': float(self.voltage),
            'power_w': float(mechanical_power),
            'efficiency': float(efficiency),
            'position_rad': float(self.position),
            'temperature_c': float(self.temperature)
        }
        
        # Add PWM-specific outputs
        if self.use_pwm:
            result['duty_cycle'] = float(self.duty_cycle)
            if self.pwm_inverter:
                inverter_state = self.pwm_inverter.get_state()
                result['dc_bus_voltage'] = inverter_state['dc_bus_voltage']
                result['switching_frequency'] = inverter_state['switching_frequency']
                result['inverter_losses'] = inverter_state['total_losses']
        
        return result
    
    def get_efficiency_curve(self, voltage: float = None) -> Dict:
        """
        Generate efficiency curve data points for the motor.
        
        Args:
            voltage: Operating voltage (uses rated if not specified)
            
        Returns:
            Dictionary with efficiency curve data points
        """
        if voltage is None:
            voltage = self.params['rated_voltage']
        
        efficiency_points = []
        
        # Generate points across operating range
        max_speed = self.params['max_speed']
        max_torque = self.params['max_torque']
        
        for speed_rpm in np.linspace(0, max_speed, 20):
            for torque_percent in np.linspace(10, 100, 10):
                torque_nm = (torque_percent / 100) * max_torque
                
                # Skip points outside motor capability
                speed_rad_s = speed_rpm * np.pi / 30
                required_power = torque_nm * speed_rad_s
                
                if required_power > self.params['rated_power_kw'] * 1000 * 1.5:
                    continue
                
                # Calculate steady-state efficiency at this operating point
                back_emf = self.params['ke'] * speed_rad_s
                required_current = torque_nm / self.params['kt']
                voltage_drop = self.params['resistance'] * required_current
                
                if voltage > back_emf + voltage_drop:
                    mechanical_power = torque_nm * speed_rad_s
                    electrical_power = voltage * required_current
                    
                    if electrical_power > 0:
                        efficiency = mechanical_power / electrical_power
                        efficiency = min(efficiency, 0.98)  # Cap at 98%
                        
                        efficiency_points.append({
                            'speed_rpm': float(speed_rpm),
                            'torque_nm': float(torque_nm),
                            'efficiency': float(efficiency),
                            'power_w': float(mechanical_power)
                        })
        
        return {'efficiency_points': efficiency_points}
    
    def get_motor_parameters(self) -> Dict:
        """Get complete motor parameter information."""
        params = {
            'motor_id': 'bldc_2kw_48v',
            'name': 'BLDC 2kW 48V Motor',
            'type': 'BLDC',
            'rated_power_kw': 2.0,
            'rated_voltage_v': float(self.params['rated_voltage']),
            'rated_current_a': float(self.params['rated_current']),
            'rated_speed_rpm': float(self.params['rated_speed']),
            'rated_torque_nm': float(self.params['rated_torque']),
            'max_speed_rpm': float(self.params['max_speed']),
            'max_torque_nm': float(self.params['max_torque']),
            'physical_parameters': {
                'resistance': float(self.params['resistance']),
                'inductance': float(self.params['inductance']),
                'kt': float(self.params['kt']),
                'ke': float(self.params['ke']),
                'pole_pairs': int(self.params['pole_pairs']),
                'inertia': float(self.params['inertia'])
            },
            'control_mode': 'PWM' if self.use_pwm else 'Direct Voltage'
        }
        
        # Add PWM parameters if applicable
        if self.use_pwm:
            params['pwm_parameters'] = {
                'dc_bus_voltage': self.params.get('dc_bus_voltage', self.params['rated_voltage']),
                'switching_frequency': self.params.get('switching_frequency', 20000),
                'dead_time_us': self.params.get('dead_time_us', 2.0)
            }
        
        return params
    
    def step_with_current_control(self, target_current: float, load_torque: float, dt: float) -> Dict:
        """
        Step motor with current as control input (torque control mode).
        
        This method simulates direct current control where the motor driver
        regulates voltage to achieve the desired current.
        
        Args:
            target_current: Target motor current (A)
            load_torque: External load torque (Nm)
            dt: Time step (s)
            
        Returns:
            Motor state dictionary
        """
        # Simple current control: calculate required voltage
        # V = R*I + L*dI/dt + back_emf
        back_emf = self.calculate_back_emf()
        resistance = self.get_hot_resistance()
        inductance = self.params['inductance']
        
        # Estimate di/dt for feedforward
        di_dt = (target_current - self.current) / dt if dt > 0 else 0
        
        # Calculate required voltage
        required_voltage = (
            resistance * target_current +
            inductance * di_dt +
            back_emf
        )
        
        # Convert to duty cycle if using PWM
        if self.use_pwm:
            dc_voltage = self.params.get('dc_bus_voltage', self.params['rated_voltage'])
            duty_cycle = np.clip(required_voltage / dc_voltage, 0.0, 0.95)
            return self.step(duty_cycle, load_torque, dt)
        else:
            return self.step(required_voltage, load_torque, dt)