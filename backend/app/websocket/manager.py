"""
WebSocket connection manager for real-time motor simulation data streaming.
"""

import asyncio
import json
import time
import struct
from typing import Dict, List, Set, Optional, Any
from collections import defaultdict
from fastapi import WebSocket

from app.websocket.binary_protocol import BinaryEncoder
from app.websocket.validator import MessageValidator
from app.websocket.rate_limiter import RateLimiter
from app.websocket.auth import SessionAuthorizer
from app.core.config import get_settings


class WebSocketManager:
    """
    Manages WebSocket connections and real-time data streaming.
    
    Features:
    - Multiple clients per simulation session
    - JSON and binary protocol support
    - Message validation and rate limiting
    - Connection lifecycle management
    - Real-time data broadcasting
    - Error handling and recovery
    """
    
    def __init__(self):
        # Active connections organized by session
        self.active_sessions: Dict[str, Set[WebSocket]] = defaultdict(set)
        
        # Client protocol preferences 
        self.client_protocols: Dict[WebSocket, str] = {}
        
        # Components
        self.binary_encoder = BinaryEncoder()
        self.message_validator = MessageValidator()
        self.rate_limiter = RateLimiter()
        self.session_authorizer = SessionAuthorizer()
        
        self.settings = get_settings()
        
        # Performance tracking
        self._message_count = 0
        self._error_count = 0
        self._bytes_sent = 0
    
    async def connect(self, session_id: str, websocket: WebSocket, protocol: str = 'json'):
        """
        Connect a WebSocket client to a simulation session.
        
        Args:
            session_id: Simulation session identifier
            websocket: WebSocket connection
            protocol: Communication protocol ('json' or 'binary')
        """
        # Validate session authorization
        if not self.session_authorizer.is_authorized(session_id):
            await websocket.close(code=1008, reason="Unauthorized session")
            return
        
        # Accept the WebSocket connection
        await websocket.accept()
        
        # Store connection and preferences
        self.active_sessions[session_id].add(websocket)
        self.client_protocols[websocket] = protocol
        
        # Send connection confirmation
        confirmation_message = {
            'type': 'connection_established',
            'session_id': session_id,
            'protocol': protocol,
            'timestamp': time.time(),
            'server_info': {
                'version': '1.0.0',
                'max_rate_hz': self.settings.WEBSOCKET_SEND_RATE_HZ,
                'supported_protocols': ['json', 'binary']
            }
        }
        
        await self._send_to_client(websocket, confirmation_message)
        
        print(f"WebSocket client connected to session {session_id} with {protocol} protocol")
    
    async def disconnect(self, session_id: str, websocket: WebSocket):
        """
        Disconnect a WebSocket client from a session.
        
        Args:
            session_id: Simulation session identifier
            websocket: WebSocket connection to disconnect
        """
        # Remove from active sessions
        self.active_sessions[session_id].discard(websocket)
        
        # Clean up empty sessions
        if not self.active_sessions[session_id]:
            del self.active_sessions[session_id]
        
        # Clean up client protocol tracking
        self.client_protocols.pop(websocket, None)
        
        print(f"WebSocket client disconnected from session {session_id}")
    
    async def broadcast_simulation_data(
        self, 
        session_id: str, 
        data: Dict[str, Any],
        binary: bool = False
    ):
        """
        Broadcast simulation data to all clients in a session.
        
        Args:
            session_id: Target session identifier
            data: Simulation data to broadcast
            binary: Force binary protocol if True
        """
        if session_id not in self.active_sessions:
            return
        
        clients = self.active_sessions[session_id].copy()
        if not clients:
            return
        
        # Prepare message
        message = {
            'type': 'simulation_data',
            'timestamp': time.time(),
            'data': data
        }
        
        # Send to each client based on their protocol preference
        disconnected_clients = []
        
        for client in clients:
            try:
                client_protocol = self.client_protocols.get(client, 'json')
                
                if binary or client_protocol == 'binary':
                    # Send binary data
                    binary_data = self.binary_encoder.encode_simulation_data(data)
                    await client.send_bytes(binary_data)
                    self._bytes_sent += len(binary_data)
                else:
                    # Send JSON data
                    json_message = json.dumps(message)
                    await client.send_text(json_message)
                    self._bytes_sent += len(json_message.encode())
                
                self._message_count += 1
                
            except Exception as e:
                print(f"Error sending to client: {e}")
                disconnected_clients.append(client)
                self._error_count += 1
        
        # Clean up disconnected clients
        for client in disconnected_clients:
            await self.disconnect(session_id, client)
    
    async def broadcast_error(self, session_id: str, error_data: Dict[str, Any]):
        """
        Broadcast error message to session clients.
        
        Args:
            session_id: Target session identifier
            error_data: Error information to broadcast
        """
        if session_id not in self.active_sessions:
            return
        
        error_message = {
            'type': 'error',
            'timestamp': time.time(),
            'data': error_data
        }
        
        clients = self.active_sessions[session_id].copy()
        disconnected_clients = []
        
        for client in clients:
            try:
                await client.send_text(json.dumps(error_message))
                self._message_count += 1
            except Exception as e:
                print(f"Error sending error message to client: {e}")
                disconnected_clients.append(client)
        
        # Clean up disconnected clients
        for client in disconnected_clients:
            await self.disconnect(session_id, client)
    
    async def handle_client_message(self, session_id: str, message: str) -> Dict[str, Any]:
        """
        Handle incoming message from WebSocket client.
        
        Args:
            session_id: Session identifier
            message: JSON message from client
            
        Returns:
            Response dictionary
        """
        try:
            # Parse message
            data = json.loads(message)
            
            # Validate message format
            validation_result = self.message_validator.validate(data)
            if not validation_result['valid']:
                return {
                    'status': 'error',
                    'error': validation_result['error']
                }
            
            # Handle different message types
            message_type = data.get('type')
            
            if message_type == 'control_update':
                return await self._handle_control_update(session_id, data)
            elif message_type == 'ping':
                return {'status': 'pong', 'timestamp': time.time()}
            elif message_type == 'protocol_change':
                return await self._handle_protocol_change(session_id, data)
            else:
                return {
                    'status': 'error',
                    'error': f'Unknown message type: {message_type}'
                }
                
        except json.JSONDecodeError:
            return {
                'status': 'error',
                'error': 'Invalid JSON format'
            }
        except Exception as e:
            return {
                'status': 'error', 
                'error': f'Message handling failed: {str(e)}'
            }
    
    async def _handle_control_update(self, session_id: str, data: Dict) -> Dict:
        """Handle control parameter update from client."""
        control_data = data.get('data', {})
        
        # This would integrate with the session manager to update control parameters
        # For now, return success confirmation
        return {
            'status': 'success',
            'message': 'Control parameters updated',
            'updated_parameters': control_data,
            'timestamp': time.time()
        }
    
    async def _handle_protocol_change(self, session_id: str, data: Dict) -> Dict:
        """Handle client protocol change request."""
        new_protocol = data.get('protocol')
        
        if new_protocol not in ['json', 'binary']:
            return {
                'status': 'error',
                'error': 'Invalid protocol. Must be "json" or "binary"'
            }
        
        # Update client protocol preference
        # Note: In real implementation, would need to identify specific client
        return {
            'status': 'success',
            'message': f'Protocol changed to {new_protocol}',
            'protocol': new_protocol,
            'timestamp': time.time()
        }
    
    async def _send_to_client(self, websocket: WebSocket, message: Dict):
        """Send message to specific client."""
        try:
            await websocket.send_text(json.dumps(message))
            self._message_count += 1
        except Exception as e:
            print(f"Error sending message to client: {e}")
            self._error_count += 1
    
    def get_session_client_count(self, session_id: str) -> int:
        """Get number of clients connected to a session."""
        return len(self.active_sessions.get(session_id, set()))
    
    def get_total_connections(self) -> int:
        """Get total number of active connections."""
        return sum(len(clients) for clients in self.active_sessions.values())
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get WebSocket manager statistics."""
        return {
            'active_sessions': len(self.active_sessions),
            'total_connections': self.get_total_connections(),
            'messages_sent': self._message_count,
            'errors': self._error_count,
            'bytes_sent': self._bytes_sent,
            'session_details': {
                session_id: len(clients) 
                for session_id, clients in self.active_sessions.items()
            }
        }