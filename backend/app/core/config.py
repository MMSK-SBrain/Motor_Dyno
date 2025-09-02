"""
Application configuration settings.
"""

from pydantic_settings import BaseSettings
from typing import List
import os


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # CORS settings
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001", 
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001"
    ]
    
    # Session settings
    MAX_CONCURRENT_SESSIONS: int = 10
    SESSION_TIMEOUT_MINUTES: int = 30
    CLEANUP_INTERVAL_SECONDS: int = 60
    
    # Simulation settings
    DEFAULT_TIMESTEP_MS: float = 1.0  # 1ms default timestep
    MAX_SIMULATION_RATE_HZ: int = 1000  # 1000Hz max rate
    WEBSOCKET_SEND_RATE_HZ: int = 100  # 100Hz WebSocket update rate
    
    # Rate limiting
    MAX_REQUESTS_PER_MINUTE: int = 60
    MAX_WEBSOCKET_MESSAGES_PER_SECOND: int = 100
    
    # Motor parameters (default BLDC motor)
    DEFAULT_MOTOR_PARAMS: dict = {
        'resistance': 0.08,  # Ohms
        'inductance': 0.0015,  # Henries  
        'kt': 0.169,  # Torque constant (Nm/A)
        'ke': 0.169,  # Back EMF constant (V*s/rad)
        'pole_pairs': 4,
        'inertia': 0.001,  # kg*m^2
        'friction': 0.001,  # Friction coefficient
        'rated_voltage': 48.0,  # V
        'rated_current': 45.0,  # A
        'rated_speed': 3000,  # RPM
        'rated_torque': 7.6,  # Nm  
        'max_speed': 6000,  # RPM
        'max_torque': 15.0,  # Nm
        'rated_power_kw': 2.0
    }
    
    # PID controller defaults
    DEFAULT_PID_PARAMS: dict = {
        'kp': 1.0,
        'ki': 0.1,
        'kd': 0.01,
        'max_output': 60.0,  # Max voltage
        'min_output': -60.0,
        'max_integral': 50.0,
        'derivative_filter_tau': 0.01
    }
    
    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
_settings = None


def get_settings() -> Settings:
    """Get application settings singleton."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings