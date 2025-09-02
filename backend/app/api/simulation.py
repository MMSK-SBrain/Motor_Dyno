"""
Simulation control API endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, validator
from typing import Dict, Any, Optional
import time

from app.core.session_manager import SessionManager

router = APIRouter()


# Pydantic models for request validation
class SimulationStartRequest(BaseModel):
    motor_id: str
    control_mode: str = "speed"  # Changed default to speed control
    use_cascaded_control: bool = True  # Use cascaded control by default
    session_name: Optional[str] = None
    
    @validator('motor_id')
    def validate_motor_id(cls, v):
        from app.core.motor_factory import MotorFactory
        if not MotorFactory.validate_motor_id(v):
            raise ValueError(f'Invalid motor_id: {v}')
        return v
    
    @validator('control_mode')
    def validate_control_mode(cls, v):
        valid_modes = ['speed', 'current', 'torque', 'voltage', 'duty_cycle']
        if v not in valid_modes:
            raise ValueError(f'Invalid control_mode: {v}. Must be one of {valid_modes}')
        return v


class ControlUpdateRequest(BaseModel):
    # Control mode selection
    control_mode: Optional[str] = None
    use_cascaded_control: Optional[bool] = None
    
    # Target setpoints for different control modes
    target_speed_rpm: Optional[float] = None
    target_current_a: Optional[float] = None
    target_torque_nm: Optional[float] = None
    
    # Load simulation
    load_torque_percent: Optional[float] = None
    
    # Manual control inputs
    manual_voltage: Optional[float] = None
    manual_duty_cycle: Optional[float] = None
    
    # Controller parameters
    pid_params: Optional[Dict[str, float]] = None
    current_controller_params: Optional[Dict[str, float]] = None
    
    @validator('control_mode')
    def validate_control_mode(cls, v):
        if v is not None:
            valid_modes = ['speed', 'current', 'torque', 'voltage', 'duty_cycle']
            if v not in valid_modes:
                raise ValueError(f'Invalid control_mode: {v}. Must be one of {valid_modes}')
        return v
    
    @validator('target_speed_rpm')
    def validate_target_speed(cls, v):
        if v is not None and (v < -6000 or v > 6000):
            raise ValueError('target_speed_rpm must be between -6000 and 6000')
        return v
    
    @validator('target_current_a')
    def validate_target_current(cls, v):
        if v is not None and (v < -100 or v > 100):
            raise ValueError('target_current_a must be between -100 and 100')
        return v
    
    @validator('target_torque_nm')
    def validate_target_torque(cls, v):
        if v is not None and (v < -20 or v > 20):
            raise ValueError('target_torque_nm must be between -20 and 20')
        return v
    
    @validator('load_torque_percent')
    def validate_load_torque(cls, v):
        if v is not None and (v < -200 or v > 200):
            raise ValueError('load_torque_percent must be between -200 and 200')
        return v
    
    @validator('manual_voltage')
    def validate_manual_voltage(cls, v):
        if v is not None and (v < -60 or v > 60):
            raise ValueError('manual_voltage must be between -60 and 60')
        return v
    
    @validator('manual_duty_cycle')
    def validate_manual_duty_cycle(cls, v):
        if v is not None and (v < 0 or v > 1):
            raise ValueError('manual_duty_cycle must be between 0 and 1')
        return v


# Dependency to get session manager
def get_session_manager(request: Request) -> SessionManager:
    """Get session manager from application state."""
    return request.app.state.session_manager


@router.post("/simulation/start")
async def start_simulation(
    request: SimulationStartRequest,
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    Start a new motor simulation session.
    
    Creates a new simulation instance with the specified motor
    and configuration. Returns session details and WebSocket URL.
    """
    try:
        session = await session_manager.create_session(
            motor_id=request.motor_id,
            control_mode=request.control_mode,
            use_cascaded_control=request.use_cascaded_control,
            session_name=request.session_name
        )
        
        # Generate WebSocket URL
        websocket_url = f"ws://localhost:8000/ws/{session.session_id}"
        
        return {
            "session_id": session.session_id,
            "status": "started",
            "websocket_url": websocket_url,
            "created_at": session.created_at.isoformat(),
            "motor_id": session.motor_id,
            "control_mode": session.control_mode,
            "use_cascaded_control": getattr(session, 'use_cascaded_control', True),
            "session_name": session.session_name
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "validation_error", "message": str(e)})
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": "session_creation_failed", "message": str(e)})


@router.post("/simulation/{session_id}/stop")
async def stop_simulation(
    session_id: str,
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    Stop an active simulation session.
    
    Terminates the simulation, closes WebSocket connections,
    and returns session summary statistics.
    """
    try:
        summary = await session_manager.stop_session(session_id)
        return summary
        
    except ValueError as e:
        raise HTTPException(
            status_code=404, 
            detail={"error": "session_not_found", "message": str(e)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "session_stop_failed", "message": str(e)}
        )


@router.put("/simulation/{session_id}/control")
async def update_control_parameters(
    session_id: str,
    request: ControlUpdateRequest,
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    Update control parameters for an active simulation.
    
    Allows real-time adjustment of target speed, load conditions,
    and PID controller parameters during simulation.
    """
    try:
        # Build parameter dictionary from request
        update_params = {}
        
        if request.control_mode is not None:
            update_params['control_mode'] = request.control_mode
        if request.use_cascaded_control is not None:
            update_params['use_cascaded_control'] = request.use_cascaded_control
        if request.target_speed_rpm is not None:
            update_params['target_speed_rpm'] = request.target_speed_rpm
        if request.target_current_a is not None:
            update_params['target_current_a'] = request.target_current_a
        if request.target_torque_nm is not None:
            update_params['target_torque_nm'] = request.target_torque_nm
        if request.load_torque_percent is not None:
            update_params['load_torque_percent'] = request.load_torque_percent
        if request.manual_voltage is not None:
            update_params['manual_voltage'] = request.manual_voltage
        if request.manual_duty_cycle is not None:
            update_params['manual_duty_cycle'] = request.manual_duty_cycle
        if request.pid_params is not None:
            update_params['pid_params'] = request.pid_params
        if request.current_controller_params is not None:
            update_params['current_controller_params'] = request.current_controller_params
        
        result = await session_manager.update_control_parameters(
            session_id=session_id,
            **update_params
        )
        return result
        
    except ValueError as e:
        # Check if it's a session not found error or validation error
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail={"error": "session_not_found", "message": error_msg})
        else:
            raise HTTPException(status_code=400, detail={"error": "validation_error", "message": error_msg})
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "parameter_update_failed", "message": str(e)}
        )


@router.get("/simulation/{session_id}/status")
async def get_simulation_status(
    session_id: str,
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    Get current status and state of a simulation session.
    
    Returns comprehensive information about motor state,
    control parameters, and performance metrics.
    """
    try:
        status = await session_manager.get_session_status(session_id)
        return status
        
    except ValueError as e:
        raise HTTPException(
            status_code=404, 
            detail={"error": "session_not_found", "message": str(e)}
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "status_retrieval_failed", "message": str(e)}
        )


@router.get("/simulation/sessions")
async def list_active_sessions(
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    List all active simulation sessions.
    
    Returns summary information about currently running
    simulation sessions for monitoring and management.
    """
    try:
        sessions = []
        for session_id, session in session_manager.sessions.items():
            uptime = (time.time() - session.created_at.timestamp())
            sessions.append({
                "session_id": session_id,
                "motor_id": session.motor_id,
                "control_mode": session.control_mode,
                "session_name": session.session_name,
                "uptime_seconds": uptime,
                "websocket_connections": len(session.websocket_connections),
                "data_points": session.data_points_count,
                "is_active": session.is_active
            })
        
        return {
            "active_sessions": sessions,
            "total_count": len(sessions),
            "max_sessions": session_manager.settings.MAX_CONCURRENT_SESSIONS
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "session_list_failed", "message": str(e)}
        )


@router.post("/admin/cleanup")
async def cleanup_expired_sessions(
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    Manually trigger cleanup of expired sessions.
    
    Administrative endpoint to force cleanup of inactive
    or expired simulation sessions.
    """
    try:
        initial_count = session_manager.get_active_session_count()
        await session_manager.cleanup_expired_sessions()
        final_count = session_manager.get_active_session_count()
        
        return {
            "status": "cleanup_complete",
            "sessions_before": initial_count,
            "sessions_after": final_count,
            "sessions_cleaned": initial_count - final_count,
            "timestamp": time.time()
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={"error": "cleanup_failed", "message": str(e)}
        )