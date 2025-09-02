"""
PID Controller with Anti-windup Implementation
Provides comprehensive PID control functionality with performance analysis
"""

from typing import Dict, List, Optional
import numpy as np


class PIDController:
    """
    PID Controller with anti-windup, derivative filtering, and performance analysis.
    
    Features:
    - Standard PID algorithm with configurable gains
    - Anti-windup with integral clamping
    - Derivative filtering to handle noisy signals
    - Output saturation limits
    - Bumpless transfer capability
    - Performance metrics calculation
    """
    
    def __init__(self, params: Dict[str, float]):
        """
        Initialize PID controller with given parameters.
        
        Args:
            params: Dictionary containing PID parameters:
                - kp: Proportional gain
                - ki: Integral gain  
                - kd: Derivative gain
                - max_output: Maximum controller output
                - min_output: Minimum controller output
                - max_integral: Anti-windup integral limit
                - derivative_filter_tau: Derivative filter time constant
        """
        # PID gains
        self.kp = params['kp']
        self.ki = params['ki']
        self.kd = params['kd']
        
        # Output limits
        self.max_output = params['max_output']
        self.min_output = params['min_output']
        
        # Anti-windup settings
        self.max_integral = params['max_integral']
        
        # Derivative filter time constant
        self.derivative_filter_tau = params['derivative_filter_tau']
        
        # Initialize internal state
        self.reset()
    
    def reset(self) -> None:
        """Reset controller internal state to initial conditions."""
        self.integral = 0.0
        self.last_error = 0.0
        self.last_derivative = 0.0
        self.manual_output = None
    
    def update(self, setpoint: float, process_variable: float, dt: float) -> float:
        """
        Update PID controller and calculate control output.
        
        Args:
            setpoint: Desired value
            process_variable: Current measured value
            dt: Time step since last update
            
        Returns:
            Control output value
        """
        # Calculate error
        error = setpoint - process_variable
        
        # Proportional term
        proportional = self.kp * error
        
        # Derivative term with filtering
        derivative = self._calculate_filtered_derivative(error, dt)
        derivative_term = self.kd * derivative
        
        # Calculate preliminary output without integral
        preliminary_output = proportional + derivative_term
        
        # Handle bumpless transfer if switching from manual
        if self.manual_output is not None:
            # Calculate required integral to achieve bumpless transfer
            if self.ki != 0:
                desired_integral = (self.manual_output - preliminary_output) / self.ki
                self.integral = np.clip(desired_integral, -self.max_integral, self.max_integral)
            self.manual_output = None
        
        # Update integral normally first
        self.integral += error * dt
        
        # Apply integral limits
        self.integral = np.clip(self.integral, -self.max_integral, self.max_integral)
        
        integral_term = self.ki * self.integral
        
        # Calculate total output
        output = proportional + integral_term + derivative_term
        
        # Apply output saturation
        saturated_output = np.clip(output, self.min_output, self.max_output)
        
        # Back-calculation anti-windup: if output is saturated, adjust integral
        if saturated_output != output and self.ki != 0:
            # Calculate what integral should be to achieve saturated output
            integral_for_saturated = (saturated_output - proportional - derivative_term) / self.ki
            # Only adjust integral if it would reduce windup
            if abs(integral_for_saturated) < abs(self.integral):
                self.integral = np.clip(integral_for_saturated, -self.max_integral, self.max_integral)
        
        # Update state for next iteration
        self.last_error = error
        
        return saturated_output
    
    
    def _calculate_filtered_derivative(self, error: float, dt: float) -> float:
        """
        Calculate derivative term with first-order low-pass filtering.
        
        This helps reduce noise amplification in the derivative term.
        """
        if dt <= 0:
            return self.last_derivative
        
        # For the very first call, avoid derivative kick
        if self.last_error == 0.0 and error != 0.0:
            # This is likely the first call with a step input
            # Initialize last_error to current error to avoid derivative kick
            raw_derivative = 0.0
        else:
            # Calculate raw derivative
            raw_derivative = (error - self.last_error) / dt
        
        # Apply first-order filter: filtered = alpha * raw + (1-alpha) * last_filtered
        # where alpha = dt / (tau + dt)
        if self.derivative_filter_tau > 0:
            alpha = dt / (self.derivative_filter_tau + dt)
            filtered_derivative = alpha * raw_derivative + (1 - alpha) * self.last_derivative
        else:
            filtered_derivative = raw_derivative
        
        self.last_derivative = filtered_derivative
        return filtered_derivative
    
    def set_manual_output(self, output: float) -> None:
        """
        Set manual output for bumpless transfer when switching modes.
        
        Args:
            output: Manual output value to initialize for smooth transition
        """
        self.manual_output = output
    
    def get_performance_metrics(self, response: List[float], setpoint: float, dt: float = 0.001) -> Dict[str, float]:
        """
        Calculate performance metrics from step response data.
        
        Args:
            response: List of process variable values over time
            setpoint: Target setpoint value
            dt: Time step between samples
            
        Returns:
            Dictionary containing performance metrics:
            - rise_time: Time to reach 90% of setpoint
            - settling_time: Time to stay within 2% of setpoint
            - overshoot_percent: Maximum overshoot as percentage
            - steady_state_error: Final error relative to setpoint
        """
        if len(response) < 2:
            return {
                'rise_time': 0.0,
                'settling_time': 0.0,
                'overshoot_percent': 0.0,
                'steady_state_error': float('inf')
            }
        
        response_array = np.array(response)
        final_value = np.mean(response_array[-100:]) if len(response_array) >= 100 else response_array[-1]
        
        # Steady-state error
        steady_state_error = abs(setpoint - final_value)
        
        # Rise time (10% to 90% of final value)
        rise_time = self._calculate_rise_time(response_array, final_value, dt)
        
        # Settling time (2% settling band)
        settling_time = self._calculate_settling_time(response_array, setpoint, dt)
        
        # Overshoot percentage
        overshoot_percent = self._calculate_overshoot(response_array, setpoint, final_value)
        
        return {
            'rise_time': rise_time,
            'settling_time': settling_time,
            'overshoot_percent': overshoot_percent,
            'steady_state_error': steady_state_error
        }
    
    def _calculate_rise_time(self, response: np.ndarray, final_value: float, dt: float) -> float:
        """Calculate rise time (10% to 90% of final value)."""
        if len(response) < 2:
            return 0.0
        
        initial_value = response[0]
        value_range = final_value - initial_value
        
        if abs(value_range) < 1e-6:
            return 0.0
        
        # Find 10% and 90% points
        ten_percent = initial_value + 0.1 * value_range
        ninety_percent = initial_value + 0.9 * value_range
        
        # Find indices where these values are crossed
        try:
            if value_range > 0:
                ten_percent_idx = np.where(response >= ten_percent)[0][0]
                ninety_percent_idx = np.where(response >= ninety_percent)[0][0]
            else:
                ten_percent_idx = np.where(response <= ten_percent)[0][0]
                ninety_percent_idx = np.where(response <= ninety_percent)[0][0]
            
            return (ninety_percent_idx - ten_percent_idx) * dt
        except (IndexError, ValueError):
            return len(response) * dt
    
    def _calculate_settling_time(self, response: np.ndarray, setpoint: float, dt: float) -> float:
        """Calculate settling time (2% settling criterion)."""
        settling_band = 0.02 * abs(setpoint) if setpoint != 0 else 0.02
        
        # Find the last time the response was outside the settling band
        settling_indices = np.where(np.abs(response - setpoint) > settling_band)[0]
        
        if len(settling_indices) == 0:
            return 0.0
        
        return (settling_indices[-1] + 1) * dt
    
    def _calculate_overshoot(self, response: np.ndarray, setpoint: float, final_value: float) -> float:
        """Calculate maximum overshoot percentage."""
        if len(response) < 2:
            return 0.0
        
        initial_value = response[0]
        
        # Determine direction of response
        if abs(setpoint - initial_value) < 1e-6:
            return 0.0
        
        if setpoint > initial_value:
            # Step up: look for overshoot above setpoint
            max_value = np.max(response)
            if max_value > setpoint:
                overshoot = max_value - setpoint
                return (overshoot / abs(setpoint - initial_value)) * 100.0
        else:
            # Step down: look for overshoot below setpoint
            min_value = np.min(response)
            if min_value < setpoint:
                overshoot = setpoint - min_value
                return (overshoot / abs(setpoint - initial_value)) * 100.0
        
        return 0.0