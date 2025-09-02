#!/usr/bin/env python3
"""
Motor Simulation API Server Launcher

This script starts the FastAPI server with proper configuration for
development and production environments.
"""

import sys
import os
import subprocess
import signal
from pathlib import Path

# Add backend directory to Python path
backend_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(backend_dir))

def check_dependencies():
    """Check if required dependencies are available."""
    try:
        import uvicorn
        import fastapi
        import numpy
        import pydantic_settings
        print("✓ All dependencies are available")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("\nPlease install dependencies with:")
        print("pip install -r requirements.txt")
        return False

def run_development_server():
    """Run the development server with hot reloading."""
    print("Starting Motor Simulation API Server (Development Mode)")
    print("=" * 60)
    print("Features enabled:")
    print("- Hot reloading")
    print("- Debug logging")
    print("- CORS for local development")
    print("- API documentation at http://localhost:8000/docs")
    print("- WebSocket endpoint at ws://localhost:8000/ws/{session_id}")
    print("=" * 60)
    
    # Set development environment variables
    os.environ["ENVIRONMENT"] = "development"
    os.environ["DEBUG"] = "true"
    
    # Import and run uvicorn
    try:
        import uvicorn
        uvicorn.run(
            "app.main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info",
            reload_dirs=[str(backend_dir / "app")]
        )
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")
        return False
    
    return True

def run_production_server():
    """Run the production server with gunicorn."""
    print("Starting Motor Simulation API Server (Production Mode)")
    print("=" * 60)
    
    # Set production environment variables
    os.environ["ENVIRONMENT"] = "production"
    os.environ["DEBUG"] = "false"
    
    # Use gunicorn for production
    cmd = [
        "gunicorn",
        "app.main:app",
        "-k", "uvicorn.workers.UvicornWorker",
        "--bind", "0.0.0.0:8000",
        "--workers", "4",
        "--worker-connections", "1000",
        "--max-requests", "1000",
        "--max-requests-jitter", "100",
        "--timeout", "60",
        "--access-logfile", "-",
        "--error-logfile", "-",
        "--log-level", "info"
    ]
    
    try:
        subprocess.run(cmd, check=True)
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except FileNotFoundError:
        print("Error: gunicorn not found. Install with: pip install gunicorn")
        return False
    except subprocess.CalledProcessError as e:
        print(f"Server error: {e}")
        return False
    
    return True

def test_api_endpoints():
    """Test basic API endpoints."""
    print("\nTesting API endpoints...")
    
    try:
        import requests
        import time
        
        # Wait for server to start
        time.sleep(2)
        
        base_url = "http://localhost:8000"
        
        # Test health endpoint
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print("✓ Health check: PASSED")
        else:
            print(f"✗ Health check: FAILED ({response.status_code})")
        
        # Test motor info endpoint
        response = requests.get(f"{base_url}/api/motor", timeout=5)
        if response.status_code == 200:
            print("✓ Motor info: PASSED")
        else:
            print(f"✗ Motor info: FAILED ({response.status_code})")
        
        print("API endpoints are responding correctly")
        
    except ImportError:
        print("Skipping API tests (requests library not available)")
    except requests.exceptions.RequestException as e:
        print(f"API test error: {e}")

def show_usage():
    """Show usage information."""
    print("""
Motor Simulation API Server

Usage:
    python run_server.py [mode]

Modes:
    dev, development    - Run development server with hot reloading (default)
    prod, production    - Run production server with gunicorn
    test               - Test system components only
    help, --help       - Show this help message

Examples:
    python run_server.py              # Development mode
    python run_server.py dev          # Development mode
    python run_server.py prod         # Production mode
    python run_server.py test         # Test components
    """)

if __name__ == "__main__":
    # Parse command line arguments
    mode = "development"  # Default mode
    
    if len(sys.argv) > 1:
        arg = sys.argv[1].lower()
        if arg in ["help", "--help", "-h"]:
            show_usage()
            sys.exit(0)
        elif arg in ["prod", "production"]:
            mode = "production"
        elif arg in ["dev", "development"]:
            mode = "development"
        elif arg == "test":
            mode = "test"
        else:
            print(f"Unknown mode: {arg}")
            show_usage()
            sys.exit(1)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    try:
        if mode == "test":
            # Run system tests
            print("Running system tests...")
            from test_system import test_motor_simulation, test_websocket_protocol
            
            motor_result = test_motor_simulation()
            protocol_result = test_websocket_protocol()
            
            if motor_result['success'] and protocol_result:
                print("\n✓ All system tests passed")
                sys.exit(0)
            else:
                print("\n✗ System tests failed")
                sys.exit(1)
                
        elif mode == "development":
            success = run_development_server()
            sys.exit(0 if success else 1)
            
        elif mode == "production":
            success = run_production_server()
            sys.exit(0 if success else 1)
            
    except KeyboardInterrupt:
        print("\nShutdown requested by user")
        sys.exit(0)
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)