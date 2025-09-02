"""
WebSocket endpoint handler for real-time simulation data streaming.
"""

import asyncio
import json
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Any

from app.websocket.manager import WebSocketManager
from app.simulation.real_time_simulator import RealTimeSimulator

# Global WebSocket manager instance
ws_manager = WebSocketManager()


async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time simulation data streaming.
    
    Args:
        websocket: WebSocket connection
        session_id: Simulation session identifier
    """
    client_id = f"{websocket.client.host}:{websocket.client.port}"
    
    try:
        # Connect client to session
        await ws_manager.connect(session_id, websocket)
        
        # Start real-time simulation for this session if not already running
        simulator = RealTimeSimulator(session_id, ws_manager)
        simulation_task = asyncio.create_task(simulator.run())
        
        print(f"WebSocket connected: {client_id} -> session {session_id}")
        
        # Message handling loop
        while True:
            try:
                # Receive message from client
                message = await websocket.receive_text()
                
                # Process message
                response = await ws_manager.handle_client_message(session_id, message)
                
                # Send response back to client
                if response:
                    await websocket.send_text(json.dumps(response))
                
            except WebSocketDisconnect:
                print(f"WebSocket client disconnected: {client_id}")
                break
            except Exception as e:
                print(f"Error handling WebSocket message: {e}")
                # Send error response
                error_response = {
                    'type': 'error',
                    'error': str(e),
                    'timestamp': asyncio.get_event_loop().time()
                }
                try:
                    await websocket.send_text(json.dumps(error_response))
                except:
                    # Client likely disconnected
                    break
    
    except Exception as e:
        print(f"WebSocket connection error: {e}")
    
    finally:
        # Clean up
        try:
            # Cancel simulation task
            if 'simulation_task' in locals():
                simulation_task.cancel()
                try:
                    await simulation_task
                except asyncio.CancelledError:
                    pass
            
            # Disconnect from manager
            await ws_manager.disconnect(session_id, websocket)
            
            print(f"WebSocket cleanup complete for {client_id}")
            
        except Exception as e:
            print(f"Error during WebSocket cleanup: {e}")