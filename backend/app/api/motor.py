"""
Motor configuration API endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any

from app.core.motor_factory import MotorFactory, get_default_motor
from app.models.bldc_motor import BLDCMotor

router = APIRouter()


@router.get("/motor")
async def get_motor_parameters() -> Dict[str, Any]:
    """
    Get BLDC motor parameters and specifications.
    
    Returns motor configuration including electrical, mechanical,
    and performance parameters for the MVP motor.
    """
    try:
        motor = get_default_motor()
        return motor.get_motor_parameters()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "motor_initialization_failed", "message": str(e)}
        )


@router.get("/motor/efficiency")
async def get_motor_efficiency_curve() -> Dict[str, Any]:
    """
    Get motor efficiency curve data points.
    
    Returns efficiency mapping across speed and torque operating points
    for performance analysis and optimization.
    """
    try:
        motor = get_default_motor()
        efficiency_data = motor.get_efficiency_curve()
        
        # Validate we have sufficient data points
        if len(efficiency_data.get('efficiency_points', [])) < 10:
            raise ValueError("Insufficient efficiency data points generated")
        
        return efficiency_data
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "efficiency_calculation_failed", 
                "message": str(e)
            }
        )


@router.get("/motor/models")
async def get_available_motors() -> Dict[str, Any]:
    """
    Get list of available motor models.
    
    Returns information about all motor configurations
    available for simulation.
    """
    try:
        available_motors = MotorFactory.get_available_motors()
        return {
            "available_motors": available_motors,
            "total_count": len(available_motors),
            "default_motor": "bldc_2kw_48v"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "motor_list_failed", "message": str(e)}
        )