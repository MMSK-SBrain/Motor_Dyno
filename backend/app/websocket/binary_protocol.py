"""
Binary protocol implementation for high-frequency data streaming.
"""

import struct
import time
import zlib
from typing import Dict, Any, Optional


class BinaryEncoder:
    """
    Encodes simulation data into compact binary format for efficient WebSocket transmission.
    
    Binary Message Format:
    - Header (8 bytes):
      - Message type (2 bytes, big-endian uint16)
      - Payload length (2 bytes, big-endian uint16) 
      - Timestamp ms (4 bytes, big-endian uint32)
    - Payload (variable length):
      - Simulation data fields as packed floats
    
    Message Types:
    - 0x0001: Simulation data
    - 0x0002: Control update
    - 0x0003: Error message
    - 0x0004: Status update
    """
    
    # Message type constants
    MSG_TYPE_SIMULATION_DATA = 0x0001
    MSG_TYPE_CONTROL_UPDATE = 0x0002
    MSG_TYPE_ERROR = 0x0003
    MSG_TYPE_STATUS = 0x0004
    
    def __init__(self):
        self.compression_threshold = 100  # Compress if payload > 100 bytes
    
    def encode_simulation_data(self, data: Dict[str, Any], compress: bool = False) -> bytes:
        """
        Encode simulation data to binary format.
        
        Args:
            data: Dictionary containing simulation data
            compress: Whether to compress the payload
            
        Returns:
            Binary encoded message
        """
        # Pack simulation data fields
        payload_data = []
        
        # Standard fields in fixed order for consistent decoding
        fields = [
            ('timestamp', data.get('timestamp', time.time())),
            ('speed_rpm', data.get('speed_rpm', 0.0)),
            ('torque_nm', data.get('torque_nm', 0.0)),
            ('current_a', data.get('current_a', 0.0)),
            ('voltage_v', data.get('voltage_v', 0.0)),
            ('efficiency', data.get('efficiency', 0.0)),
            ('power_w', data.get('power_w', 0.0)),
            ('temperature_c', data.get('temperature_c', 25.0))
        ]
        
        # Pack as float32 values (4 bytes each)
        for field_name, value in fields:
            payload_data.append(struct.pack('>f', float(value)))
        
        # Combine payload
        payload = b''.join(payload_data)
        
        # Apply compression if requested and beneficial
        if compress and len(payload) > self.compression_threshold:
            payload = zlib.compress(payload, level=6)
        
        # Create header
        message_type = self.MSG_TYPE_SIMULATION_DATA
        payload_length = len(payload)
        # Use lower 32 bits of timestamp to fit in uint32
        timestamp_ms = int(data.get('timestamp', time.time()) * 1000) & 0xFFFFFFFF
        
        header = struct.pack('>HHI', message_type, payload_length, timestamp_ms)
        
        return header + payload
    
    def decode_simulation_data(self, binary_data: bytes) -> Dict[str, Any]:
        """
        Decode binary simulation data message.
        
        Args:
            binary_data: Binary encoded message
            
        Returns:
            Dictionary with decoded simulation data
        """
        if len(binary_data) < 8:
            raise ValueError("Binary data too short for header")
        
        # Unpack header
        header = binary_data[:8]
        message_type, payload_length, timestamp_ms = struct.unpack('>HHI', header)
        
        if message_type != self.MSG_TYPE_SIMULATION_DATA:
            raise ValueError(f"Expected simulation data message, got type {message_type}")
        
        # Extract payload
        payload = binary_data[8:8+payload_length]
        
        if len(payload) != payload_length:
            raise ValueError("Payload length mismatch")
        
        # Try decompression if payload seems compressed
        original_payload = payload
        try:
            # Check if it might be compressed (zlib header magic bytes)
            if payload.startswith(b'\x78'):
                payload = zlib.decompress(payload)
        except zlib.error:
            # Not compressed, use original
            payload = original_payload
        
        # Unpack simulation data (8 float32 values)
        expected_size = 8 * 4  # 8 fields * 4 bytes each
        if len(payload) != expected_size:
            raise ValueError(f"Unexpected payload size: {len(payload)}, expected {expected_size}")
        
        # Unpack fields in the same order as encoding
        unpacked = struct.unpack('>8f', payload)
        
        return {
            'timestamp': unpacked[0],
            'speed_rpm': unpacked[1],
            'torque_nm': unpacked[2],
            'current_a': unpacked[3],
            'voltage_v': unpacked[4],
            'efficiency': unpacked[5],
            'power_w': unpacked[6],
            'temperature_c': unpacked[7]
        }
    
    def encode_control_message(self, control_data: Dict[str, Any]) -> bytes:
        """
        Encode control update message to binary format.
        
        Args:
            control_data: Control parameters
            
        Returns:
            Binary encoded control message
        """
        # Pack control data
        target_speed = control_data.get('target_speed_rpm', 0.0)
        load_torque = control_data.get('load_torque_percent', 0.0)
        enable_pid = 1.0 if control_data.get('enable_pid', True) else 0.0
        
        # Pack as 3 float32 values
        payload = struct.pack('>3f', target_speed, load_torque, enable_pid)
        
        # Create header
        message_type = self.MSG_TYPE_CONTROL_UPDATE
        payload_length = len(payload)
        timestamp_ms = int(time.time() * 1000)
        
        header = struct.pack('>HHI', message_type, payload_length, timestamp_ms)
        
        return header + payload
    
    def decode_control_message(self, binary_data: bytes) -> Dict[str, Any]:
        """
        Decode binary control message.
        
        Args:
            binary_data: Binary encoded message
            
        Returns:
            Dictionary with decoded control parameters
        """
        if len(binary_data) < 8:
            raise ValueError("Binary data too short for header")
        
        # Unpack header
        header = binary_data[:8]
        message_type, payload_length, timestamp_ms = struct.unpack('>HHI', header)
        
        if message_type != self.MSG_TYPE_CONTROL_UPDATE:
            raise ValueError(f"Expected control message, got type {message_type}")
        
        # Extract payload
        payload = binary_data[8:8+payload_length]
        
        if len(payload) != 12:  # 3 float32 values
            raise ValueError("Invalid control message payload size")
        
        # Unpack control data
        target_speed, load_torque, enable_pid = struct.unpack('>3f', payload)
        
        return {
            'target_speed_rpm': target_speed,
            'load_torque_percent': load_torque,
            'enable_pid': bool(enable_pid > 0.5),
            'timestamp': timestamp_ms / 1000.0
        }
    
    def encode_error_message(self, error_data: Dict[str, Any]) -> bytes:
        """
        Encode error message to binary format.
        
        Args:
            error_data: Error information
            
        Returns:
            Binary encoded error message
        """
        # For errors, use JSON payload for flexibility
        import json
        json_payload = json.dumps(error_data).encode('utf-8')
        
        # Create header
        message_type = self.MSG_TYPE_ERROR
        payload_length = len(json_payload)
        timestamp_ms = int(time.time() * 1000)
        
        header = struct.pack('>HHI', message_type, payload_length, timestamp_ms)
        
        return header + json_payload
    
    def decode_message(self, binary_data: bytes) -> Dict[str, Any]:
        """
        Decode binary message of any type.
        
        Args:
            binary_data: Binary encoded message
            
        Returns:
            Dictionary with decoded message and metadata
        """
        if len(binary_data) < 8:
            raise ValueError("Binary data too short for header")
        
        # Unpack header to determine message type
        header = binary_data[:8]
        message_type, payload_length, timestamp_ms = struct.unpack('>HHI', header)
        
        # Decode based on message type
        if message_type == self.MSG_TYPE_SIMULATION_DATA:
            data = self.decode_simulation_data(binary_data)
            return {
                'type': 'simulation_data',
                'data': data,
                'timestamp': timestamp_ms / 1000.0
            }
        elif message_type == self.MSG_TYPE_CONTROL_UPDATE:
            data = self.decode_control_message(binary_data)
            return {
                'type': 'control_update',
                'data': data,
                'timestamp': timestamp_ms / 1000.0
            }
        elif message_type == self.MSG_TYPE_ERROR:
            # Extract JSON payload for errors
            payload = binary_data[8:8+payload_length]
            import json
            data = json.loads(payload.decode('utf-8'))
            return {
                'type': 'error',
                'data': data,
                'timestamp': timestamp_ms / 1000.0
            }
        else:
            raise ValueError(f"Unknown message type: {message_type}")
    
    def get_message_info(self, binary_data: bytes) -> Dict[str, Any]:
        """
        Get message information without full decoding.
        
        Args:
            binary_data: Binary message
            
        Returns:
            Message metadata
        """
        if len(binary_data) < 8:
            return {'error': 'Invalid message length'}
        
        # Unpack header only
        message_type, payload_length, timestamp_ms = struct.unpack('>HHI', binary_data[:8])
        
        type_names = {
            self.MSG_TYPE_SIMULATION_DATA: 'simulation_data',
            self.MSG_TYPE_CONTROL_UPDATE: 'control_update', 
            self.MSG_TYPE_ERROR: 'error',
            self.MSG_TYPE_STATUS: 'status'
        }
        
        return {
            'message_type': type_names.get(message_type, 'unknown'),
            'message_type_code': message_type,
            'payload_length': payload_length,
            'timestamp': timestamp_ms / 1000.0,
            'total_size': 8 + payload_length
        }