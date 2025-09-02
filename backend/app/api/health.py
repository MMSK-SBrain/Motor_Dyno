"""
Health check and system status API endpoints.
"""

from fastapi import APIRouter, Depends, Request
from typing import Dict, Any
import time
import psutil
import platform

from app.core.config import get_settings
from app.core.session_manager import SessionManager

router = APIRouter()


def get_session_manager(request: Request) -> SessionManager:
    """Get session manager from application state."""
    return request.app.state.session_manager


@router.get("/health")
async def health_check(
    session_manager: SessionManager = Depends(get_session_manager)
) -> Dict[str, Any]:
    """
    System health check endpoint.
    
    Returns comprehensive system health information including
    resource usage, active sessions, and service status.
    """
    settings = get_settings()
    
    # Get system metrics
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # Get application metrics
    active_sessions = session_manager.get_active_session_count()
    total_sessions = session_manager.get_total_session_count()
    
    # Determine health status
    health_status = "healthy"
    health_issues = []
    
    # Check CPU usage
    if cpu_percent > 80:
        health_issues.append("High CPU usage")
        health_status = "degraded"
    
    # Check memory usage
    if memory.percent > 85:
        health_issues.append("High memory usage") 
        health_status = "degraded"
    
    # Check disk space
    if disk.percent > 90:
        health_issues.append("Low disk space")
        health_status = "degraded"
    
    # Check session limits
    if active_sessions >= settings.MAX_CONCURRENT_SESSIONS * 0.9:
        health_issues.append("Approaching session limit")
        health_status = "degraded"
    
    return {
        "status": health_status,
        "timestamp": time.time(),
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": time.time(),  # Simplified - would track actual uptime
        "issues": health_issues,
        "system": {
            "cpu_percent": cpu_percent,
            "memory_mb": memory.used // (1024 * 1024),
            "memory_percent": memory.percent,
            "disk_percent": disk.percent,
            "active_sessions": active_sessions,
            "max_sessions": settings.MAX_CONCURRENT_SESSIONS,
            "platform": platform.system(),
            "python_version": platform.python_version()
        },
        "application": {
            "total_sessions_created": total_sessions,
            "websocket_connections": session_manager.get_websocket_connection_count(),
            "simulation_steps": session_manager.get_total_simulation_steps(),
            "average_loop_duration": session_manager.get_average_loop_duration()
        }
    }


@router.get("/ready")
async def readiness_check() -> Dict[str, Any]:
    """
    Kubernetes-style readiness probe endpoint.
    
    Returns simple ready/not-ready status for load balancer
    and orchestration health checks.
    """
    try:
        # Check if core components are functional
        from app.core.motor_factory import get_default_motor
        motor = get_default_motor()
        
        # Verify motor can be created and has expected parameters
        params = motor.get_motor_parameters()
        if not params.get('motor_id'):
            raise ValueError("Motor initialization failed")
        
        return {
            "status": "ready",
            "timestamp": time.time(),
            "checks": {
                "motor_factory": "ok",
                "configuration": "ok"
            }
        }
        
    except Exception as e:
        return {
            "status": "not_ready",
            "timestamp": time.time(),
            "error": str(e),
            "checks": {
                "motor_factory": "failed",
                "configuration": "unknown"
            }
        }


@router.get("/live")
async def liveness_check() -> Dict[str, Any]:
    """
    Kubernetes-style liveness probe endpoint.
    
    Returns simple alive/dead status to detect if the
    application needs to be restarted.
    """
    return {
        "status": "alive",
        "timestamp": time.time(),
        "pid": psutil.Process().pid
    }