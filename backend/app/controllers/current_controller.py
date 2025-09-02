"""
Current Controller for Motor Drive Systems

Implements a high-bandwidth current controller for the inner control loop
of a cascaded motor control system. This controller regulates motor current
to achieve desired torque.
"""

import numpy as np
from typing import Dict, Optional
import math


class CurrentController:
    """
    PI Current Controller with anti-windup and feedforward compensation.
    
    This controller operates at a much higher bandwidth than the outer
    speed loop, typically 1-5 kHz for motor drives. It directly controls
    the PWM duty cycle to regulate motor current.
    """
    
    def __init__(self, controller_params: Dict):
        """
        Initialize current controller with parameters.
        
        Args:
            controller_params: Dictionary containing:
                - kp: Proportional gain (V/A)
                - ki: Integral gain (V/A/s)
                - bandwidth_hz: Current loop bandwidth (Hz)
                - max_duty_cycle: Maximum duty cycle (0-1)
                - min_duty_cycle: Minimum duty cycle (0-1)
                - anti_windup_gain: Anti-windup feedback gain
                - feedforward_gain: Feedforward compensation gain
        """
        # Controller gains
        self.kp = controller_params.get('kp', 10.0)
        self.ki = controller_params.get('ki', 1000.0)
        self.bandwidth = controller_params.get('bandwidth_hz', 1000.0)
        
        # Output limits (duty cycle)
        self.max_duty = controller_params.get('max_duty_cycle', 0.95)
        self.min_duty = controller_params.get('min_duty_cycle', 0.05)
        
        # Anti-windup parameters
        self.anti_windup_gain = controller_params.get('anti_windup_gain', 1.0)
        self.use_anti_windup = controller_params.get('use_anti_windup', True)
        
        # Feedforward compensation
        self.feedforward_gain = controller_params.get('feedforward_gain', 0.0)
        self.use_feedforward = controller_params.get('use_feedforward', False)
        
        # State variables
        self.integral_term = 0.0
        self.prev_error = 0.0
        self.output = 0.0
        self.is_saturated = False
        
        # Performance metrics
        self.error_history = []
        self.max_history_length = 100
        
    def update(self, 
               target_current: float, 
               actual_current: float, 
               dt: float,
               motor_params: Optional[Dict] = None) -> float:
        """
        Update current controller and calculate duty cycle output.
        
        Args:
            target_current: Desired motor current (A)
            actual_current: Measured motor current (A)
            dt: Time step (seconds)
            motor_params: Optional motor parameters for feedforward
                         (resistance, inductance, back_emf, etc.)
            
        Returns:
            Duty cycle command (0.0 to 1.0)
        """
        # Calculate error
        error = target_current - actual_current
        
        # Store error for analysis
        self.error_history.append(error)
        if len(self.error_history) > self.max_history_length:
            self.error_history.pop(0)
        
        # Proportional term
        p_term = self.kp * error
        
        # Integral term with anti-windup
        if self.use_anti_windup and self.is_saturated:
            # Apply anti-windup: reduce integral accumulation when saturated
            anti_windup_feedback = self.anti_windup_gain * (self.output - self.get_limited_output(self.output))
            self.integral_term += (self.ki * error - anti_windup_feedback) * dt
        else:
            # Normal integral accumulation
            self.integral_term += self.ki * error * dt
        
        # Feedforward compensation (if motor parameters provided)
        ff_term = 0.0
        if self.use_feedforward and motor_params:
            # Feedforward based on motor model
            # Vff = R*I + L*dI/dt + Ke*ω
            # Convert to duty cycle: D = V / Vdc
            resistance = motor_params.get('resistance', 0.1)
            inductance = motor_params.get('inductance', 0.0001)
            back_emf = motor_params.get('back_emf', 0.0)
            dc_voltage = motor_params.get('dc_voltage', 48.0)
            
            # Estimate required voltage
            di_dt = (target_current - actual_current) / dt if dt > 0 else 0
            voltage_ff = (
                resistance * target_current + 
                inductance * di_dt + 
                back_emf
            )
            
            # Convert to duty cycle
            ff_term = self.feedforward_gain * (voltage_ff / dc_voltage)
        
        # Calculate total output
        self.output = p_term + self.integral_term + ff_term
        
        # Apply limits and check saturation
        limited_output = self.get_limited_output(self.output)
        self.is_saturated = (limited_output != self.output)
        self.output = limited_output
        
        # Store previous error for derivative (if needed in future)
        self.prev_error = error
        
        return self.output
    
    def get_limited_output(self, output: float) -> float:
        """
        Apply output limits to duty cycle.
        
        Args:
            output: Unlimited output value
            
        Returns:
            Limited output value (duty cycle)
        """
        return np.clip(output, self.min_duty, self.max_duty)
    
    def reset(self):
        """Reset controller state."""
        self.integral_term = 0.0
        self.prev_error = 0.0
        self.output = 0.0
        self.is_saturated = False
        self.error_history.clear()
    
    def set_gains(self, kp: float, ki: float):
        """
        Update controller gains.
        
        Args:
            kp: New proportional gain
            ki: New integral gain
        """
        self.kp = kp
        self.ki = ki
    
    def set_limits(self, min_duty: float, max_duty: float):
        """
        Update output limits.
        
        Args:
            min_duty: Minimum duty cycle
            max_duty: Maximum duty cycle
        """
        self.min_duty = max(0.0, min(min_duty, 1.0))
        self.max_duty = max(0.0, min(max_duty, 1.0))
    
    def get_state(self) -> Dict:
        """
        Get current controller state for monitoring.
        
        Returns:
            Dictionary with controller state variables
        """
        return {
            'kp': self.kp,
            'ki': self.ki,
            'integral_term': self.integral_term,
            'output': self.output,
            'is_saturated': self.is_saturated,
            'current_error': self.prev_error,
            'rms_error': self.get_rms_error(),
            'bandwidth_hz': self.bandwidth
        }
    
    def get_rms_error(self) -> float:
        """
        Calculate RMS error from recent history.
        
        Returns:
            RMS error value
        """
        if not self.error_history:
            return 0.0
        
        squared_errors = [e**2 for e in self.error_history]
        return math.sqrt(sum(squared_errors) / len(squared_errors))
    
    def tune_for_motor(self, motor_params: Dict):
        """
        Auto-tune controller gains based on motor parameters.
        
        Uses pole placement method for current loop tuning.
        
        Args:
            motor_params: Motor parameters (R, L, etc.)
        """
        # Extract motor parameters
        resistance = motor_params.get('resistance', 0.1)
        inductance = motor_params.get('inductance', 0.0001)
        
        # Calculate electrical time constant
        tau_e = inductance / resistance
        
        # Design for desired bandwidth
        # Rule of thumb: current loop bandwidth = 10-20x speed loop bandwidth
        omega_c = 2 * math.pi * self.bandwidth
        
        # PI controller tuning using pole placement
        # Kp = L * omega_c (for critically damped response)
        # Ki = R * omega_c
        self.kp = inductance * omega_c
        self.ki = resistance * omega_c
        
        print(f"Auto-tuned current controller: Kp={self.kp:.3f}, Ki={self.ki:.3f}")


class CascadedSpeedCurrentController:
    """
    Cascaded control structure with outer speed loop and inner current loop.
    
    This is the standard control architecture for high-performance motor drives.
    The speed controller generates a torque/current reference for the inner loop.
    """
    
    def __init__(self, speed_controller_params: Dict, current_controller_params: Dict):
        """
        Initialize cascaded controller.
        
        Args:
            speed_controller_params: Parameters for outer speed loop
            current_controller_params: Parameters for inner current loop
        """
        # Import PID controller for speed loop
        from .pid_controller import PIDController
        
        # Create controllers
        self.speed_controller = PIDController(speed_controller_params)
        self.current_controller = CurrentController(current_controller_params)
        
        # Motor parameters (to be set later)
        self.kt = 1.0  # Torque constant (Nm/A)
        
        # Control mode
        self.control_mode = 'speed'  # 'speed', 'current', or 'torque'
        
    def update(self,
               target_speed_rpm: Optional[float] = None,
               actual_speed_rpm: Optional[float] = None,
               target_current: Optional[float] = None,
               actual_current: float = 0.0,
               dt: float = 0.001,
               motor_params: Optional[Dict] = None) -> float:
        """
        Update cascaded controller.
        
        Args:
            target_speed_rpm: Target speed for speed control mode
            actual_speed_rpm: Actual motor speed
            target_current: Target current for current control mode
            actual_current: Actual motor current
            dt: Time step
            motor_params: Motor parameters for feedforward
            
        Returns:
            Duty cycle command
        """
        if self.control_mode == 'speed' and target_speed_rpm is not None:
            # Speed control mode: speed loop generates current reference
            torque_command = self.speed_controller.update(
                setpoint=target_speed_rpm,
                process_variable=actual_speed_rpm,
                dt=dt
            )
            
            # Convert torque to current reference
            current_reference = torque_command / self.kt
            
        elif self.control_mode == 'current' and target_current is not None:
            # Direct current control mode
            current_reference = target_current
            
        elif self.control_mode == 'torque' and target_current is not None:
            # Torque control mode (current is proportional to torque)
            # target_current here is actually target_torque
            current_reference = target_current / self.kt
            
        else:
            current_reference = 0.0
        
        # Inner current loop
        duty_cycle = self.current_controller.update(
            target_current=current_reference,
            actual_current=actual_current,
            dt=dt,
            motor_params=motor_params
        )
        
        return duty_cycle
    
    def set_motor_params(self, kt: float):
        """Set motor torque constant for torque-current conversion."""
        self.kt = kt
    
    def set_control_mode(self, mode: str):
        """Set control mode: 'speed', 'current', or 'torque'."""
        if mode in ['speed', 'current', 'torque']:
            self.control_mode = mode
    
    def reset(self):
        """Reset both controllers."""
        self.speed_controller.reset()
        self.current_controller.reset()