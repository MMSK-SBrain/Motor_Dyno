"""
Session management for motor simulation instances.
"""

import asyncio
import time
import uuid
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.models.bldc_motor import BLDCMotor
from app.controllers.pid_controller import PIDController
from app.core.config import get_settings
from app.core.motor_factory import MotorFactory


@dataclass
class SimulationSession:
    """Data class representing a simulation session."""
    session_id: str
    motor_id: str
    motor: BLDCMotor
    pid_controller: PIDController
    control_mode: str
    session_name: str
    created_at: datetime
    last_activity: datetime
    websocket_connections: Set = field(default_factory=set)
    is_active: bool = True
    data_points_count: int = 0
    total_simulation_steps: int = 0
    
    # Current control parameters
    target_speed_rpm: float = 0.0
    load_torque_percent: float = 0.0
    enable_pid: bool = True
    
    # Performance metrics
    average_loop_time: float = 0.001
    max_loop_time: float = 0.0


class SessionManager:
    """
    Manages simulation sessions and their lifecycle.
    
    Features:
    - Session creation and cleanup
    - Concurrent session limiting
    - Session timeout handling
    - Performance monitoring
    - WebSocket connection tracking
    """
    
    def __init__(self):
        self.sessions: Dict[str, SimulationSession] = {}
        self.settings = get_settings()
        self._cleanup_task = None
        self._total_sessions_created = 0
        self._total_websocket_connections = 0
        self._total_simulation_steps = 0
        
    async def create_session(
        self, 
        motor_id: str, 
        control_mode: str = "manual",
        session_name: str = None
    ) -> SimulationSession:
        """
        Create a new simulation session.
        
        Args:
            motor_id: Motor identifier
            control_mode: Control mode ('manual' or 'automatic')
            session_name: Optional session name
            
        Returns:
            SimulationSession instance
            
        Raises:
            HTTPException: If session limit exceeded or motor invalid
        """
        # Check session limits
        if len(self.sessions) >= self.settings.MAX_CONCURRENT_SESSIONS:
            raise ValueError("Maximum concurrent sessions exceeded")
        
        # Validate motor ID
        if not MotorFactory.validate_motor_id(motor_id):
            raise ValueError(f"Invalid motor ID: {motor_id}")
        
        # Generate unique session ID
        session_id = f"sim_{int(time.time())}_{uuid.uuid4().hex[:8]}"
        
        # Create motor instance
        motor = MotorFactory.create_motor(motor_id)
        
        # Create PID controller
        pid_controller = PIDController(self.settings.DEFAULT_PID_PARAMS)
        
        # Create session
        session = SimulationSession(
            session_id=session_id,
            motor_id=motor_id,
            motor=motor,
            pid_controller=pid_controller,
            control_mode=control_mode,
            session_name=session_name or f"Session {len(self.sessions) + 1}",
            created_at=datetime.now(),
            last_activity=datetime.now()
        )
        
        # Store session
        self.sessions[session_id] = session
        self._total_sessions_created += 1
        
        return session
    
    async def get_session(self, session_id: str) -> Optional[SimulationSession]:
        """Get session by ID."""
        session = self.sessions.get(session_id)
        if session:
            session.last_activity = datetime.now()
        return session
    
    async def stop_session(self, session_id: str) -> Dict:
        """
        Stop and remove a simulation session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Session summary information
        """
        session = self.sessions.get(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Calculate session duration
        duration = datetime.now() - session.created_at
        
        # Close all WebSocket connections
        for ws in session.websocket_connections.copy():
            try:
                await ws.close()
            except:
                pass
        
        # Mark as inactive
        session.is_active = False
        
        # Create summary
        summary = {
            "session_id": session_id,
            "status": "stopped",
            "duration_s": duration.total_seconds(),
            "data_points": session.data_points_count,
            "simulation_steps": session.total_simulation_steps
        }
        
        # Remove from active sessions
        del self.sessions[session_id]
        
        return summary
    
    async def update_control_parameters(
        self, 
        session_id: str, 
        target_speed_rpm: Optional[float] = None,
        load_torque_percent: Optional[float] = None,
        pid_params: Optional[Dict] = None
    ) -> Dict:
        """
        Update control parameters for a session.
        
        Args:
            session_id: Session identifier
            target_speed_rpm: New target speed
            load_torque_percent: New load torque percentage
            pid_params: New PID parameters
            
        Returns:
            Update confirmation
        """
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Update parameters
        if target_speed_rpm is not None:
            # Validate speed limits
            max_speed = session.motor.params['max_speed']
            if target_speed_rpm > max_speed:
                raise ValueError(f"Target speed {target_speed_rpm} exceeds maximum {max_speed}")
            session.target_speed_rpm = target_speed_rpm
        
        if load_torque_percent is not None:
            # Validate load limits
            if not (0 <= load_torque_percent <= 200):
                raise ValueError(f"Load torque percent must be between 0 and 200")
            session.load_torque_percent = load_torque_percent
        
        if pid_params:
            # Update PID parameters
            session.pid_controller.set_parameters(
                kp=pid_params.get('kp'),
                ki=pid_params.get('ki'), 
                kd=pid_params.get('kd')
            )
        
        session.last_activity = datetime.now()
        
        return {
            "status": "updated",
            "session_id": session_id,
            "updated_parameters": {
                "target_speed_rpm": session.target_speed_rpm,
                "load_torque_percent": session.load_torque_percent,
                "pid_enabled": session.enable_pid
            }
        }
    
    async def get_session_status(self, session_id: str) -> Dict:
        """
        Get current status of a simulation session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Complete session status information
        """
        session = await self.get_session(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        
        # Get current motor state
        motor_state = {
            'speed_rpm': session.motor.speed * 30 / 3.14159,  # Convert rad/s to RPM
            'torque_nm': session.motor.torque,
            'current_a': session.motor.current,
            'voltage_v': session.motor.voltage,
            'power_w': session.motor.torque * session.motor.speed,
            'efficiency': 0.85,  # Placeholder
            'temperature_c': session.motor.temperature
        }
        
        # Get control state
        control_state = {
            'target_speed_rpm': session.target_speed_rpm,
            'pid_output': 0.0,  # Would come from last PID calculation
            'control_mode': session.control_mode,
            'load_torque_percent': session.load_torque_percent
        }
        
        # Calculate uptime
        uptime = (datetime.now() - session.created_at).total_seconds()
        
        return {
            'session_id': session_id,
            'status': 'running' if session.is_active else 'stopped',
            'uptime_s': uptime,
            'motor_state': motor_state,
            'control_state': control_state,
            'performance': {
                'data_points': session.data_points_count,
                'simulation_steps': session.total_simulation_steps,
                'average_loop_time': session.average_loop_time,
                'websocket_connections': len(session.websocket_connections)
            }
        }
    
    async def add_websocket_connection(self, session_id: str, websocket):
        """Add WebSocket connection to session."""
        session = await self.get_session(session_id)
        if session:
            session.websocket_connections.add(websocket)
            self._total_websocket_connections += 1
    
    async def remove_websocket_connection(self, session_id: str, websocket):
        """Remove WebSocket connection from session."""
        session = self.sessions.get(session_id)
        if session:
            session.websocket_connections.discard(websocket)
    
    async def cleanup_expired_sessions(self):
        """Clean up expired sessions."""
        current_time = datetime.now()
        timeout_minutes = self.settings.SESSION_TIMEOUT_MINUTES
        expired_sessions = []
        
        for session_id, session in self.sessions.items():
            time_since_activity = current_time - session.last_activity
            if time_since_activity > timedelta(minutes=timeout_minutes):
                expired_sessions.append(session_id)
        
        # Clean up expired sessions
        for session_id in expired_sessions:
            try:
                await self.stop_session(session_id)
                print(f"Cleaned up expired session: {session_id}")
            except Exception as e:
                print(f"Error cleaning up session {session_id}: {e}")
    
    async def cleanup_all_sessions(self):
        """Clean up all sessions (called on shutdown)."""
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            try:
                await self.stop_session(session_id)
            except Exception as e:
                print(f"Error cleaning up session {session_id}: {e}")
    
    async def start_cleanup_task(self):
        """Start background cleanup task."""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def _cleanup_loop(self):
        """Background cleanup loop."""
        while True:
            try:
                await self.cleanup_expired_sessions()
                await asyncio.sleep(self.settings.CLEANUP_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Error in cleanup loop: {e}")
                await asyncio.sleep(self.settings.CLEANUP_INTERVAL_SECONDS)
    
    # Metrics methods
    def get_active_session_count(self) -> int:
        """Get number of active sessions."""
        return len(self.sessions)
    
    def get_total_session_count(self) -> int:
        """Get total sessions created."""
        return self._total_sessions_created
    
    def get_websocket_connection_count(self) -> int:
        """Get total WebSocket connections established."""
        return self._total_websocket_connections
    
    def get_total_simulation_steps(self) -> int:
        """Get total simulation steps executed."""
        return sum(s.total_simulation_steps for s in self.sessions.values())
    
    def get_average_loop_duration(self) -> float:
        """Get average simulation loop duration."""
        if not self.sessions:
            return 0.0
        return sum(s.average_loop_time for s in self.sessions.values()) / len(self.sessions)