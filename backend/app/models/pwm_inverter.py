"""
PWM Inverter Model for Motor Control

Implements a realistic PWM inverter model with:
- Duty cycle to voltage conversion
- Dead time effects
- Switching losses
- Current ripple estimation
"""

import numpy as np
from typing import Dict, Optional
import math


class PWMInverter:
    """
    PWM Inverter model for converting duty cycle commands to motor voltage.
    
    This models a three-phase voltage source inverter (VSI) commonly used
    in BLDC/PMSM motor drives. It converts DC bus voltage to controlled
    AC voltage using PWM modulation.
    """
    
    def __init__(self, inverter_params: Dict):
        """
        Initialize PWM inverter with parameters.
        
        Args:
            inverter_params: Dictionary containing:
                - dc_bus_voltage: DC link voltage (V)
                - switching_frequency: PWM switching frequency (Hz)
                - dead_time_us: Dead time in microseconds
                - on_resistance: MOSFET/IGBT on-resistance (Ohms)
                - switching_loss_coefficient: Switching loss factor
        """
        self.dc_bus_voltage = inverter_params.get('dc_bus_voltage', 48.0)
        self.switching_frequency = inverter_params.get('switching_frequency', 20000)
        self.dead_time = inverter_params.get('dead_time_us', 2.0) * 1e-6  # Convert to seconds
        self.on_resistance = inverter_params.get('on_resistance', 0.01)  # MOSFET Ron
        self.switching_loss_coeff = inverter_params.get('switching_loss_coefficient', 0.001)
        
        # Calculate switching period
        self.switching_period = 1.0 / self.switching_frequency
        
        # State variables
        self.duty_cycle = 0.0
        self.output_voltage = 0.0
        self.conduction_losses = 0.0
        self.switching_losses = 0.0
        self.total_losses = 0.0
        
        # Modulation type (for future enhancement)
        self.modulation_type = 'SPWM'  # Sinusoidal PWM, can extend to SVPWM
        
    def modulate(self, duty_cycle: float, motor_current: float) -> float:
        """
        Convert duty cycle to average output voltage with losses.
        
        In a real inverter, the duty cycle controls the on-time of the
        upper switches in the half-bridge, determining the average voltage
        applied to the motor.
        
        Args:
            duty_cycle: Commanded duty cycle (0.0 to 1.0)
            motor_current: Motor phase current for loss calculation (A)
            
        Returns:
            Average output voltage after losses (V)
        """
        # Clamp duty cycle to valid range
        self.duty_cycle = np.clip(duty_cycle, 0.0, 1.0)
        
        # Account for dead time effect on effective duty cycle
        # Dead time reduces the effective duty cycle
        dead_time_ratio = self.dead_time / self.switching_period
        effective_duty = max(0, self.duty_cycle - dead_time_ratio)
        
        # Calculate ideal output voltage (average voltage from PWM)
        # For BLDC, this is the average DC voltage applied to the motor
        ideal_voltage = self.dc_bus_voltage * effective_duty
        
        # Calculate conduction losses (I²R losses in switches)
        # Two switches conduct at any time in a half-bridge
        self.conduction_losses = 2 * motor_current**2 * self.on_resistance
        
        # Calculate switching losses (proportional to current and frequency)
        # Switching losses occur during turn-on and turn-off transitions
        self.switching_losses = (
            self.switching_loss_coeff * 
            abs(motor_current) * 
            self.dc_bus_voltage * 
            self.switching_frequency / 1000  # Normalize by 1kHz
        )
        
        # Total losses
        self.total_losses = self.conduction_losses + self.switching_losses
        
        # Voltage drop due to conduction losses
        voltage_drop = abs(motor_current) * self.on_resistance * 2
        
        # Output voltage after losses
        self.output_voltage = ideal_voltage - voltage_drop
        
        return self.output_voltage
    
    def get_current_ripple(self, motor_inductance: float) -> float:
        """
        Estimate peak-to-peak current ripple due to PWM switching.
        
        The current ripple is caused by the voltage switching between
        0 and Vdc at the switching frequency.
        
        Args:
            motor_inductance: Motor phase inductance (H)
            
        Returns:
            Peak-to-peak current ripple (A)
        """
        if motor_inductance <= 0:
            return 0.0
            
        # Maximum ripple occurs at 50% duty cycle
        # ΔI = (Vdc * D * (1-D)) / (L * f_sw)
        # where D is duty cycle, L is inductance, f_sw is switching frequency
        
        ripple = (
            self.dc_bus_voltage * 
            self.duty_cycle * 
            (1 - self.duty_cycle) / 
            (motor_inductance * self.switching_frequency)
        )
        
        return ripple
    
    def get_efficiency(self) -> float:
        """
        Calculate inverter efficiency.
        
        Returns:
            Efficiency as percentage (0-100)
        """
        if self.output_voltage <= 0 or self.duty_cycle <= 0:
            return 0.0
            
        input_power = self.dc_bus_voltage * (self.output_voltage / self.dc_bus_voltage)
        output_power = input_power - self.total_losses
        
        if input_power > 0:
            efficiency = (output_power / input_power) * 100
            return np.clip(efficiency, 0, 100)
        
        return 0.0
    
    def set_dc_bus_voltage(self, voltage: float):
        """
        Update DC bus voltage (for dynamic bus voltage scenarios).
        
        Args:
            voltage: New DC bus voltage (V)
        """
        self.dc_bus_voltage = max(0, voltage)
    
    def get_max_modulation_index(self) -> float:
        """
        Get maximum modulation index for linear modulation region.
        
        For SPWM, this is typically 1.0.
        For SVPWM, this can be extended to 1.15 (15% more voltage).
        
        Returns:
            Maximum modulation index
        """
        if self.modulation_type == 'SVPWM':
            return 1.15  # Space vector modulation allows 15% more voltage
        else:
            return 1.0  # Sinusoidal PWM
    
    def get_state(self) -> Dict:
        """
        Get current inverter state for monitoring.
        
        Returns:
            Dictionary with inverter state variables
        """
        return {
            'duty_cycle': self.duty_cycle,
            'output_voltage': self.output_voltage,
            'dc_bus_voltage': self.dc_bus_voltage,
            'switching_frequency': self.switching_frequency,
            'conduction_losses': self.conduction_losses,
            'switching_losses': self.switching_losses,
            'total_losses': self.total_losses,
            'efficiency': self.get_efficiency(),
            'modulation_type': self.modulation_type
        }