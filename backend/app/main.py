"""
FastAPI Motor Simulation Backend

Main application entry point providing REST API and WebSocket support
for real-time motor simulation with comprehensive features.
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
import uvicorn
import time
import psutil
import os
from typing import Dict, Any

# Import API routes
from app.api.motor import router as motor_router
from app.api.simulation import router as simulation_router
from app.api.health import router as health_router

# Import WebSocket handler
from app.websocket.websocket_handler import websocket_endpoint

# Import global dependencies
from app.core.config import get_settings
from app.core.motor_factory import get_default_motor
from app.core.session_manager import SessionManager

# Initialize settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="Motor Simulation API",
    description="Real-time BLDC motor simulation with WebSocket streaming",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Global session manager
session_manager = SessionManager()

# Include API routes
app.include_router(motor_router, prefix="/api", tags=["motor"])
app.include_router(simulation_router, prefix="/api", tags=["simulation"])
app.include_router(health_router, prefix="", tags=["health"])

# WebSocket endpoint
app.websocket("/ws/{session_id}")(websocket_endpoint)


@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    print("Starting Motor Simulation API...")
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Debug mode: {settings.DEBUG}")
    
    # Initialize default motor for testing
    try:
        motor = get_default_motor()
        print(f"Default motor initialized: {motor.get_motor_parameters()['name']}")
    except Exception as e:
        print(f"Warning: Could not initialize default motor: {e}")
    
    # Start session cleanup task
    await session_manager.start_cleanup_task()
    
    print("Motor Simulation API started successfully!")


@app.on_event("shutdown") 
async def shutdown_event():
    """Cleanup on application shutdown."""
    print("Shutting down Motor Simulation API...")
    
    # Stop all active sessions
    await session_manager.cleanup_all_sessions()
    
    print("Motor Simulation API shutdown complete.")


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "Motor Simulation API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "motor_info": "/api/motor",
            "efficiency_curve": "/api/motor/efficiency", 
            "start_simulation": "/api/simulation/start",
            "health_check": "/health",
            "metrics": "/metrics",
            "docs": "/docs"
        },
        "websocket": {
            "endpoint": "/ws/{session_id}",
            "protocols": ["json", "binary"]
        },
        "timestamp": time.time()
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    """Prometheus-style metrics endpoint."""
    # Get system metrics
    cpu_percent = psutil.cpu_percent()
    memory = psutil.virtual_memory()
    
    # Get application metrics
    active_sessions = session_manager.get_active_session_count()
    total_sessions = session_manager.get_total_session_count()
    
    # Format as Prometheus metrics
    metrics_text = f"""# HELP simulation_sessions_total Total number of simulation sessions created
# TYPE simulation_sessions_total counter
simulation_sessions_total {total_sessions}

# HELP simulation_active_sessions Number of currently active simulation sessions  
# TYPE simulation_active_sessions gauge
simulation_active_sessions {active_sessions}

# HELP system_cpu_usage_percent System CPU usage percentage
# TYPE system_cpu_usage_percent gauge
system_cpu_usage_percent {cpu_percent}

# HELP system_memory_usage_bytes System memory usage in bytes
# TYPE system_memory_usage_bytes gauge  
system_memory_usage_bytes {memory.used}

# HELP system_memory_total_bytes Total system memory in bytes
# TYPE system_memory_total_bytes gauge
system_memory_total_bytes {memory.total}

# HELP websocket_connections_total Total WebSocket connections established
# TYPE websocket_connections_total counter
websocket_connections_total {session_manager.get_websocket_connection_count()}

# HELP simulation_loop_duration_seconds Average simulation loop duration
# TYPE simulation_loop_duration_seconds gauge  
simulation_loop_duration_seconds {session_manager.get_average_loop_duration()}

# HELP motor_simulation_steps_total Total motor simulation steps executed
# TYPE motor_simulation_steps_total counter
motor_simulation_steps_total {session_manager.get_total_simulation_steps()}
"""
    
    return metrics_text


# Dependency injection for session manager
def get_session_manager() -> SessionManager:
    """Get the global session manager instance."""
    return session_manager


# Add dependency to app state for use in routes
app.state.session_manager = session_manager


if __name__ == "__main__":
    # Run with uvicorn if called directly
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )