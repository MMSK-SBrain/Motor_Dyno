"""
WebSocket message validator for incoming client messages.
"""

from typing import Dict, Any, List
from app.core.config import get_settings


class MessageValidator:
    """
    Validates incoming WebSocket messages from clients.
    
    Ensures message format, parameter ranges, and security compliance
    before processing control updates and other client requests.
    """
    
    def __init__(self):
        self.settings = get_settings()
        
        # Define valid message types and their required fields
        self.valid_message_types = {
            'control_update': {
                'required_fields': ['type', 'data'],
                'optional_fields': ['timestamp'],
                'data_schema': {
                    'target_speed_rpm': {'type': float, 'min': 0, 'max': 6000},
                    'load_torque_percent': {'type': float, 'min': 0, 'max': 200}, 
                    'enable_pid': {'type': bool},
                    'pid_params': {
                        'type': dict,
                        'schema': {
                            'kp': {'type': float, 'min': 0, 'max': 10},
                            'ki': {'type': float, 'min': 0, 'max': 1},
                            'kd': {'type': float, 'min': 0, 'max': 0.1}
                        }
                    }
                }
            },
            'ping': {
                'required_fields': ['type'],
                'optional_fields': ['timestamp'],
                'data_schema': {}
            },
            'protocol_change': {
                'required_fields': ['type', 'protocol'],
                'optional_fields': ['timestamp'],
                'data_schema': {}
            }
        }
    
    def validate(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate incoming WebSocket message.
        
        Args:
            message: Parsed JSON message from client
            
        Returns:
            Dictionary with validation result:
                - valid: True if message is valid
                - error: Error description if invalid
        """
        try:
            # Check if message is a dictionary
            if not isinstance(message, dict):
                return {
                    'valid': False,
                    'error': 'Message must be a JSON object'
                }
            
            # Check required top-level fields
            if 'type' not in message:
                return {
                    'valid': False,
                    'error': 'Missing required field: type'
                }
            
            message_type = message['type']
            
            # Check if message type is supported
            if message_type not in self.valid_message_types:
                return {
                    'valid': False,
                    'error': f'Unknown message type: {message_type}'
                }
            
            # Get message type schema
            schema = self.valid_message_types[message_type]
            
            # Validate required fields
            for field in schema['required_fields']:
                if field not in message:
                    return {
                        'valid': False,
                        'error': f'Missing required field: {field}'
                    }
            
            # Validate message type specific requirements
            validation_result = self._validate_message_type(message_type, message)
            if not validation_result['valid']:
                return validation_result
            
            # Validate data section if present
            if 'data' in message:
                data_validation = self._validate_data_section(
                    message_type, 
                    message['data'],
                    schema['data_schema']
                )
                if not data_validation['valid']:
                    return data_validation
            
            return {'valid': True}
            
        except Exception as e:
            return {
                'valid': False,
                'error': f'Validation error: {str(e)}'
            }
    
    def _validate_message_type(self, message_type: str, message: Dict[str, Any]) -> Dict[str, Any]:
        """Validate message type specific requirements."""
        
        if message_type == 'control_update':
            return self._validate_control_update(message)
        elif message_type == 'ping':
            return self._validate_ping(message)
        elif message_type == 'protocol_change':
            return self._validate_protocol_change(message)
        else:
            return {'valid': True}
    
    def _validate_control_update(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Validate control update message."""
        
        # Must have data section
        if 'data' not in message:
            return {
                'valid': False,
                'error': 'Control update message must have data section'
            }
        
        data = message['data']
        if not isinstance(data, dict):
            return {
                'valid': False,
                'error': 'Control update data must be an object'
            }
        
        # At least one control parameter must be specified
        control_params = ['target_speed_rpm', 'load_torque_percent', 'enable_pid', 'pid_params']
        if not any(param in data for param in control_params):
            return {
                'valid': False,
                'error': 'Control update must specify at least one control parameter'
            }
        
        return {'valid': True}
    
    def _validate_ping(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Validate ping message."""
        # Ping messages are simple, just need type field
        return {'valid': True}
    
    def _validate_protocol_change(self, message: Dict[str, Any]) -> Dict[str, Any]:
        """Validate protocol change message."""
        
        if 'protocol' not in message:
            return {
                'valid': False,
                'error': 'Protocol change message must specify protocol'
            }
        
        protocol = message['protocol']
        if protocol not in ['json', 'binary']:
            return {
                'valid': False,
                'error': 'Protocol must be "json" or "binary"'
            }
        
        return {'valid': True}
    
    def _validate_data_section(
        self, 
        message_type: str, 
        data: Any, 
        schema: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Validate data section against schema."""
        
        if not isinstance(data, dict):
            return {
                'valid': False,
                'error': 'Data section must be an object'
            }
        
        # Validate each field in data
        for field_name, field_value in data.items():
            if field_name not in schema:
                # Unknown fields are allowed but ignored
                continue
            
            field_schema = schema[field_name]
            field_validation = self._validate_field(field_name, field_value, field_schema)
            
            if not field_validation['valid']:
                return field_validation
        
        return {'valid': True}
    
    def _validate_field(self, field_name: str, value: Any, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Validate individual field against schema."""
        
        expected_type = schema.get('type')
        
        # Type validation
        if expected_type and not isinstance(value, expected_type):
            return {
                'valid': False,
                'error': f'Field {field_name} must be of type {expected_type.__name__}'
            }
        
        # Range validation for numeric types
        if isinstance(value, (int, float)):
            min_val = schema.get('min')
            max_val = schema.get('max')
            
            if min_val is not None and value < min_val:
                return {
                    'valid': False,
                    'error': f'Field {field_name} value {value} below minimum {min_val}'
                }
            
            if max_val is not None and value > max_val:
                return {
                    'valid': False,
                    'error': f'Field {field_name} value {value} above maximum {max_val}'
                }
        
        # Nested object validation
        if expected_type == dict and 'schema' in schema:
            nested_schema = schema['schema']
            for nested_field, nested_value in value.items():
                if nested_field in nested_schema:
                    nested_validation = self._validate_field(
                        f'{field_name}.{nested_field}',
                        nested_value,
                        nested_schema[nested_field]
                    )
                    if not nested_validation['valid']:
                        return nested_validation
        
        return {'valid': True}
    
    def get_message_schema(self, message_type: str) -> Dict[str, Any]:
        """
        Get schema for a specific message type.
        
        Args:
            message_type: Message type to get schema for
            
        Returns:
            Schema dictionary or None if message type not found
        """
        return self.valid_message_types.get(message_type)
    
    def get_supported_message_types(self) -> List[str]:
        """Get list of supported message types."""
        return list(self.valid_message_types.keys())