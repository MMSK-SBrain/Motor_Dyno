"""
Test specifications for WebSocket communication - TDD approach
These tests define the expected WebSocket behavior before implementation
"""

import pytest
import asyncio
import json
import time
import struct
from typing import Dict, List
from unittest.mock import Mock, AsyncMock


class TestWebSocketConnection:
    """Test suite for WebSocket connection management"""
    
    @pytest.fixture
    def websocket_mock(self):
        """Mock WebSocket connection for testing"""
        mock_ws = Mock()
        mock_ws.send_text = AsyncMock()
        mock_ws.send_bytes = AsyncMock()
        mock_ws.receive_text = AsyncMock()
        mock_ws.receive_bytes = AsyncMock()
        mock_ws.close = AsyncMock()
        return mock_ws
    
    @pytest.mark.asyncio
    async def test_websocket_connection_establishment(self, websocket_mock):
        """Test WebSocket connection can be established"""
        from app.websocket.manager import WebSocketManager
        
        manager = WebSocketManager()
        session_id = "test_session_123"
        
        # Connect client
        await manager.connect(session_id, websocket_mock)
        
        # Verify connection is tracked
        assert session_id in manager.active_sessions
        assert websocket_mock in manager.active_sessions[session_id]
        
        # Should send connection confirmation
        websocket_mock.send_text.assert_called_once()
        
        # Verify connection message format
        call_args = websocket_mock.send_text.call_args[0][0]
        message = json.loads(call_args)
        
        assert message['type'] == 'connection_established'
        assert message['session_id'] == session_id
        assert 'timestamp' in message
    
    @pytest.mark.asyncio
    async def test_websocket_disconnection(self, websocket_mock):
        """Test WebSocket disconnection is handled properly"""
        from app.websocket.manager import WebSocketManager
        
        manager = WebSocketManager()
        session_id = "test_session_123"
        
        # Connect then disconnect
        await manager.connect(session_id, websocket_mock)
        await manager.disconnect(session_id, websocket_mock)
        
        # Verify connection is removed
        assert websocket_mock not in manager.active_sessions.get(session_id, [])
    
    @pytest.mark.asyncio
    async def test_multiple_clients_same_session(self, websocket_mock):
        """Test multiple clients can connect to same simulation session"""
        from app.websocket.manager import WebSocketManager
        
        manager = WebSocketManager()
        session_id = "test_session_123"
        
        # Create multiple mock clients
        client1 = Mock()
        client1.send_text = AsyncMock()
        client2 = Mock()
        client2.send_text = AsyncMock()
        
        # Connect both clients
        await manager.connect(session_id, client1)
        await manager.connect(session_id, client2)
        
        # Both should be tracked
        assert len(manager.active_sessions[session_id]) == 2
        assert client1 in manager.active_sessions[session_id]
        assert client2 in manager.active_sessions[session_id]


class TestWebSocketMessaging:
    """Test suite for WebSocket message handling"""
    
    @pytest.fixture
    def manager(self):
        from app.websocket.manager import WebSocketManager
        return WebSocketManager()
    
    @pytest.fixture
    def client_mock(self):
        mock = Mock()
        mock.send_text = AsyncMock()
        mock.send_bytes = AsyncMock()
        return mock
    
    @pytest.mark.asyncio
    async def test_broadcast_json_message(self, manager, client_mock):
        """Test broadcasting JSON messages to all session clients"""
        session_id = "test_session_123"
        
        # Connect client
        await manager.connect(session_id, client_mock)
        
        # Broadcast message
        test_data = {
            'speed_rpm': 1500.0,
            'torque_nm': 5.0,
            'current_a': 30.0,
            'voltage_v': 48.0,
            'efficiency': 0.89,
            'power_w': 785.0
        }
        
        await manager.broadcast_simulation_data(session_id, test_data)
        
        # Verify message was sent
        client_mock.send_text.assert_called_once()
        
        # Verify message format
        call_args = client_mock.send_text.call_args[0][0]
        message = json.loads(call_args)
        
        assert message['type'] == 'simulation_data'
        assert 'timestamp' in message
        assert message['data']['speed_rpm'] == 1500.0
        assert message['data']['torque_nm'] == 5.0
    
    @pytest.mark.asyncio
    async def test_binary_message_protocol(self, manager, client_mock):
        """Test binary message protocol for high-frequency data"""
        session_id = "test_session_123"
        
        # Connect client with binary protocol preference
        await manager.connect(session_id, client_mock, protocol='binary')
        
        # Broadcast binary data
        test_data = {
            'timestamp': 1234567890.123,
            'speed_rpm': 1500.5,
            'torque_nm': 5.25,
            'current_a': 30.2,
            'voltage_v': 47.8,
            'efficiency': 0.891,
            'power_w': 785.3,
            'temperature_c': 65.2
        }
        
        await manager.broadcast_simulation_data(session_id, test_data, binary=True)
        
        # Should use binary send
        client_mock.send_bytes.assert_called_once()
        
        # Verify binary format
        binary_data = client_mock.send_bytes.call_args[0][0]
        
        # Should start with message header
        assert len(binary_data) >= 8  # Minimum header size
        
        # Decode header
        header = struct.unpack('>HHI', binary_data[:8])
        message_type, payload_length, timestamp_ms = header
        
        assert message_type == 0x0001  # Simulation data type
        assert payload_length > 0
        assert timestamp_ms == int(test_data['timestamp'] * 1000)
    
    @pytest.mark.asyncio
    async def test_control_message_handling(self, manager):
        """Test handling control messages from clients"""
        session_id = "test_session_123"
        client_mock = Mock()
        client_mock.send_text = AsyncMock()
        
        await manager.connect(session_id, client_mock)
        
        # Simulate receiving control message
        control_message = {
            'type': 'control_update',
            'data': {
                'target_speed_rpm': 2000,
                'load_torque_percent': 60,
                'enable_pid': True
            }
        }
        
        # Process control message
        result = await manager.handle_client_message(session_id, json.dumps(control_message))
        
        assert result['status'] == 'success'
        assert 'updated_parameters' in result
    
    @pytest.mark.asyncio
    async def test_error_message_handling(self, manager, client_mock):
        """Test error message broadcasting"""
        session_id = "test_session_123"
        
        await manager.connect(session_id, client_mock)
        
        # Simulate error condition
        error_data = {
            'error_type': 'motor_overspeed',
            'message': 'Motor speed exceeded maximum limit',
            'current_speed': 6200,
            'max_speed': 6000
        }
        
        await manager.broadcast_error(session_id, error_data)
        
        # Should send error message
        client_mock.send_text.assert_called_once()
        
        call_args = client_mock.send_text.call_args[0][0]
        message = json.loads(call_args)
        
        assert message['type'] == 'error'
        assert message['data']['error_type'] == 'motor_overspeed'
        assert message['data']['current_speed'] == 6200


class TestRealTimeDataStreaming:
    """Test suite for real-time data streaming performance"""
    
    @pytest.mark.asyncio
    async def test_high_frequency_streaming(self):
        """Test streaming at high frequency (100Hz)"""
        from app.websocket.manager import WebSocketManager
        from app.simulation.real_time_simulator import RealTimeSimulator
        
        manager = WebSocketManager()
        simulator = RealTimeSimulator()
        session_id = "test_session_123"
        
        # Mock client
        client_mock = Mock()
        client_mock.send_text = AsyncMock()
        received_messages = []
        
        # Capture sent messages
        async def capture_message(message):
            received_messages.append(json.loads(message))
        
        client_mock.send_text.side_effect = capture_message
        
        await manager.connect(session_id, client_mock)
        
        # Start high-frequency streaming
        streaming_duration = 1.0  # 1 second
        target_frequency = 100  # 100 Hz
        
        start_time = time.time()
        
        # Simulate streaming
        for i in range(int(streaming_duration * target_frequency)):
            test_data = {
                'speed_rpm': 1500 + i % 100,
                'torque_nm': 5.0 + (i % 20) * 0.1,
                'current_a': 30.0,
                'voltage_v': 48.0,
                'efficiency': 0.89,
                'power_w': 785.0
            }
            
            await manager.broadcast_simulation_data(session_id, test_data)
            
            # Maintain timing
            await asyncio.sleep(1.0 / target_frequency)
        
        end_time = time.time()
        actual_duration = end_time - start_time
        
        # Verify streaming performance
        assert len(received_messages) >= 90, \
            f"Should receive at least 90 messages in 1 second, got {len(received_messages)}"
        
        assert actual_duration <= 1.2, \
            f"Streaming should complete within 1.2s, took {actual_duration:.2f}s"
        
        # Verify message timestamps are increasing
        timestamps = [msg.get('timestamp', 0) for msg in received_messages]
        assert all(timestamps[i] <= timestamps[i+1] for i in range(len(timestamps)-1)), \
            "Message timestamps should be monotonically increasing"
    
    @pytest.mark.asyncio
    async def test_data_buffering(self):
        """Test data buffering for smooth streaming"""
        from app.websocket.data_buffer import DataBuffer
        
        buffer = DataBuffer(max_size=1000)
        
        # Add data points
        for i in range(1500):  # More than buffer size
            data_point = {
                'timestamp': i * 0.001,
                'speed_rpm': 1500 + i % 100,
                'torque_nm': 5.0,
                'current_a': 30.0
            }
            buffer.add(data_point)
        
        # Buffer should maintain size limit
        assert len(buffer) == 1000, f"Buffer size should be limited to 1000, got {len(buffer)}"
        
        # Should contain most recent data
        latest_data = buffer.get_latest(10)
        assert len(latest_data) == 10
        assert latest_data[-1]['timestamp'] >= 1.49  # Most recent timestamp
        
        # Test range queries
        range_data = buffer.get_range(1.0, 1.5)  # Get 0.5 seconds of data
        assert all(1.0 <= point['timestamp'] <= 1.5 for point in range_data)
    
    @pytest.mark.asyncio
    async def test_client_disconnect_cleanup(self):
        """Test cleanup when client disconnects during streaming"""
        from app.websocket.manager import WebSocketManager
        
        manager = WebSocketManager()
        session_id = "test_session_123"
        
        client_mock = Mock()
        client_mock.send_text = AsyncMock()
        
        # Connect client
        await manager.connect(session_id, client_mock)
        
        # Start streaming
        for i in range(10):
            await manager.broadcast_simulation_data(session_id, {'data': i})
        
        # Simulate client disconnect
        client_mock.send_text.side_effect = ConnectionResetError("Client disconnected")
        
        # Should handle disconnect gracefully
        try:
            await manager.broadcast_simulation_data(session_id, {'data': 'final'})
        except ConnectionResetError:
            pytest.fail("Should handle client disconnect gracefully")
        
        # Client should be removed from active sessions
        assert client_mock not in manager.active_sessions.get(session_id, [])


class TestWebSocketSecurity:
    """Test suite for WebSocket security and validation"""
    
    @pytest.mark.asyncio
    async def test_message_validation(self):
        """Test incoming message validation"""
        from app.websocket.validator import MessageValidator
        
        validator = MessageValidator()
        
        # Valid control message
        valid_message = {
            'type': 'control_update',
            'data': {
                'target_speed_rpm': 2000,
                'load_torque_percent': 50
            }
        }
        
        result = validator.validate(valid_message)
        assert result['valid'] == True
        
        # Invalid message type
        invalid_type = {
            'type': 'unknown_type',
            'data': {}
        }
        
        result = validator.validate(invalid_type)
        assert result['valid'] == False
        assert 'unknown message type' in result['error'].lower()
        
        # Invalid parameter values
        invalid_params = {
            'type': 'control_update',
            'data': {
                'target_speed_rpm': 7000,  # Above motor limit
                'load_torque_percent': 300  # Above reasonable limit
            }
        }
        
        result = validator.validate(invalid_params)
        assert result['valid'] == False
        assert 'parameter out of range' in result['error'].lower()
    
    @pytest.mark.asyncio
    async def test_rate_limiting(self):
        """Test WebSocket message rate limiting"""
        from app.websocket.rate_limiter import RateLimiter
        
        # Allow 10 messages per second
        rate_limiter = RateLimiter(max_messages=10, time_window=1.0)
        client_id = "test_client_123"
        
        # Should allow messages within limit
        for i in range(10):
            assert rate_limiter.allow_message(client_id) == True
        
        # Should block additional messages
        assert rate_limiter.allow_message(client_id) == False
        
        # Should reset after time window
        await asyncio.sleep(1.1)
        assert rate_limiter.allow_message(client_id) == True
    
    @pytest.mark.asyncio
    async def test_session_authorization(self):
        """Test WebSocket session authorization"""
        from app.websocket.auth import SessionAuthorizer
        
        authorizer = SessionAuthorizer()
        
        # Valid session
        valid_session_id = "sim_valid_123"
        assert authorizer.is_authorized(valid_session_id) == True
        
        # Invalid session format
        invalid_format = "invalid_session"
        assert authorizer.is_authorized(invalid_format) == False
        
        # Expired session
        expired_session = "sim_expired_123"
        # Simulate session expiration
        authorizer.expire_session(expired_session)
        assert authorizer.is_authorized(expired_session) == False


class TestBinaryProtocolImplementation:
    """Test suite for binary protocol implementation details"""
    
    def test_binary_message_encoding(self):
        """Test binary message encoding accuracy"""
        from app.websocket.binary_protocol import BinaryEncoder
        
        encoder = BinaryEncoder()
        
        test_data = {
            'timestamp': 1234567890.123,
            'speed_rpm': 1500.5,
            'torque_nm': 5.25,
            'current_a': 30.2,
            'voltage_v': 47.8,
            'efficiency': 0.891,
            'power_w': 785.3,
            'temperature_c': 65.2
        }
        
        # Encode to binary
        binary_data = encoder.encode_simulation_data(test_data)
        
        # Should be predictable size
        expected_size = 8 + 32  # Header + 8 floats
        assert len(binary_data) == expected_size, \
            f"Binary message should be {expected_size} bytes, got {len(binary_data)}"
        
        # Should be decodable
        decoded_data = encoder.decode_simulation_data(binary_data)
        
        # Verify accuracy (within float precision)
        for key in ['speed_rpm', 'torque_nm', 'current_a', 'voltage_v']:
            assert abs(decoded_data[key] - test_data[key]) < 0.001, \
                f"{key} should match within precision"
    
    def test_binary_compression(self):
        """Test binary message compression for repeated data"""
        from app.websocket.binary_protocol import BinaryEncoder
        
        encoder = BinaryEncoder()
        
        # Create repetitive data
        repeated_data = {
            'timestamp': 1234567890.0,
            'speed_rpm': 1500.0,
            'torque_nm': 5.0,
            'current_a': 30.0,
            'voltage_v': 48.0,
            'efficiency': 0.9,
            'power_w': 785.0,
            'temperature_c': 60.0
        }
        
        # Encode with and without compression
        uncompressed = encoder.encode_simulation_data(repeated_data, compress=False)
        compressed = encoder.encode_simulation_data(repeated_data, compress=True)
        
        # Compression might not be effective for single message,
        # but should not break decoding
        decompressed = encoder.decode_simulation_data(compressed)
        
        assert decompressed['speed_rpm'] == repeated_data['speed_rpm']
        assert decompressed['torque_nm'] == repeated_data['torque_nm']
    
    @pytest.mark.asyncio
    async def test_binary_streaming_performance(self):
        """Test binary protocol performance vs JSON"""
        from app.websocket.binary_protocol import BinaryEncoder
        import json
        
        encoder = BinaryEncoder()
        
        test_data = {
            'timestamp': 1234567890.123,
            'speed_rpm': 1500.5,
            'torque_nm': 5.25,
            'current_a': 30.2,
            'voltage_v': 47.8,
            'efficiency': 0.891,
            'power_w': 785.3,
            'temperature_c': 65.2
        }
        
        # Time JSON encoding
        start_time = time.perf_counter()
        for _ in range(1000):
            json_data = json.dumps(test_data)
        json_time = time.perf_counter() - start_time
        
        # Time binary encoding  
        start_time = time.perf_counter()
        for _ in range(1000):
            binary_data = encoder.encode_simulation_data(test_data)
        binary_time = time.perf_counter() - start_time
        
        # Binary should be faster or at least comparable
        assert binary_time <= json_time * 1.5, \
            f"Binary encoding should be efficient: {binary_time:.4f}s vs JSON {json_time:.4f}s"
        
        # Binary should be smaller
        json_size = len(json.dumps(test_data))
        binary_size = len(encoder.encode_simulation_data(test_data))
        
        assert binary_size <= json_size, \
            f"Binary message should be smaller: {binary_size} bytes vs JSON {json_size} bytes"