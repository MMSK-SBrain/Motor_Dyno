"""
Motor factory for creating motor instances with predefined configurations.
"""

from typing import Dict, Optional
from app.models.bldc_motor import BLDCMotor
from app.core.config import get_settings


class MotorFactory:
    """Factory for creating motor instances."""
    
    @staticmethod
    def create_motor(motor_id: str, custom_params: Optional[Dict] = None) -> BLDCMotor:
        """
        Create a motor instance by ID.
        
        Args:
            motor_id: Motor identifier
            custom_params: Optional custom parameters to override defaults
            
        Returns:
            BLDCMotor instance
            
        Raises:
            ValueError: If motor_id is not recognized
        """
        settings = get_settings()
        
        if motor_id == "bldc_2kw_48v":
            params = settings.DEFAULT_MOTOR_PARAMS.copy()
            if custom_params:
                params.update(custom_params)
            return BLDCMotor(params)
        else:
            raise ValueError(f"Unknown motor ID: {motor_id}")
    
    @staticmethod
    def get_available_motors() -> Dict[str, Dict]:
        """Get list of available motor configurations."""
        return {
            "bldc_2kw_48v": {
                "name": "BLDC 2kW 48V Motor",
                "type": "BLDC",
                "rated_power_kw": 2.0,
                "rated_voltage_v": 48.0,
                "description": "Standard 2kW brushless DC motor for MVP"
            }
        }
    
    @staticmethod
    def validate_motor_id(motor_id: str) -> bool:
        """Validate if motor ID exists."""
        available = MotorFactory.get_available_motors()
        return motor_id in available


def get_default_motor() -> BLDCMotor:
    """Get default motor instance for testing/development."""
    return MotorFactory.create_motor("bldc_2kw_48v")