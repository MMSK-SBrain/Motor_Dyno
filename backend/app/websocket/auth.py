"""
WebSocket session authorization.
"""

import time
import re
from typing import Dict, Set
from datetime import datetime, timedelta


class SessionAuthorizer:
    """
    Authorizes WebSocket connections to simulation sessions.
    
    Validates session IDs, manages session expiration,
    and provides security controls for WebSocket access.
    """
    
    def __init__(self):
        # Track valid sessions and their expiration
        self.valid_sessions: Dict[str, datetime] = {}
        self.expired_sessions: Set[str] = set()
        
        # Session ID validation pattern
        self.session_id_pattern = re.compile(r'^sim_\d+_[a-f0-9]{8}$')
        
        # Default session timeout
        self.default_session_timeout = timedelta(hours=2)
    
    def is_authorized(self, session_id: str) -> bool:
        """
        Check if a session ID is authorized for WebSocket connection.
        
        Args:
            session_id: Session identifier to validate
            
        Returns:
            True if session is authorized, False otherwise
        """
        try:
            # Check session ID format
            if not self._validate_session_format(session_id):
                return False
            
            # Check if session was explicitly expired
            if session_id in self.expired_sessions:
                return False
            
            # Check if session is in valid list and not expired
            if session_id in self.valid_sessions:
                expiration = self.valid_sessions[session_id]
                if datetime.now() < expiration:
                    return True
                else:
                    # Session expired, mark it
                    self.expire_session(session_id)
                    return False
            
            # For new sessions with valid format, authorize for limited time
            # This allows WebSocket connections to be established before
            # the session is fully registered in the session manager
            self.valid_sessions[session_id] = datetime.now() + timedelta(minutes=5)
            return True
            
        except Exception as e:
            print(f"Error authorizing session {session_id}: {e}")
            return False
    
    def authorize_session(self, session_id: str, timeout: timedelta = None) -> bool:
        """
        Explicitly authorize a session for WebSocket access.
        
        Args:
            session_id: Session identifier
            timeout: Custom timeout duration
            
        Returns:
            True if session was authorized
        """
        if not self._validate_session_format(session_id):
            return False
        
        timeout = timeout or self.default_session_timeout
        expiration = datetime.now() + timeout
        
        # Remove from expired list if present
        self.expired_sessions.discard(session_id)
        
        # Add to valid sessions
        self.valid_sessions[session_id] = expiration
        
        return True
    
    def expire_session(self, session_id: str):
        """
        Expire a session, preventing new WebSocket connections.
        
        Args:
            session_id: Session identifier to expire
        """
        # Remove from valid sessions
        self.valid_sessions.pop(session_id, None)
        
        # Add to expired sessions
        self.expired_sessions.add(session_id)
    
    def extend_session(self, session_id: str, additional_time: timedelta = None):
        """
        Extend session authorization.
        
        Args:
            session_id: Session identifier
            additional_time: Additional time to extend (default: 1 hour)
        """
        if session_id not in self.valid_sessions:
            return False
        
        additional_time = additional_time or timedelta(hours=1)
        self.valid_sessions[session_id] += additional_time
        return True
    
    def get_session_status(self, session_id: str) -> Dict[str, any]:
        """
        Get authorization status for a session.
        
        Args:
            session_id: Session identifier
            
        Returns:
            Dictionary with session authorization status
        """
        current_time = datetime.now()
        
        status = {
            'session_id': session_id,
            'format_valid': self._validate_session_format(session_id),
            'is_authorized': self.is_authorized(session_id),
            'is_expired': session_id in self.expired_sessions
        }
        
        if session_id in self.valid_sessions:
            expiration = self.valid_sessions[session_id]
            status.update({
                'expiration': expiration.isoformat(),
                'time_remaining': str(max(timedelta(0), expiration - current_time)),
                'expires_in_seconds': max(0, (expiration - current_time).total_seconds())
            })
        else:
            status.update({
                'expiration': None,
                'time_remaining': '0:00:00',
                'expires_in_seconds': 0
            })
        
        return status
    
    def cleanup_expired_sessions(self):
        """Remove expired sessions from internal tracking."""
        current_time = datetime.now()
        expired_session_ids = []
        
        for session_id, expiration in self.valid_sessions.items():
            if current_time >= expiration:
                expired_session_ids.append(session_id)
        
        for session_id in expired_session_ids:
            self.expire_session(session_id)
    
    def get_statistics(self) -> Dict[str, any]:
        """
        Get authorization statistics.
        
        Returns:
            Dictionary with authorization statistics
        """
        current_time = datetime.now()
        
        # Count active vs expired sessions
        active_sessions = 0
        expired_from_timeout = 0
        
        for expiration in self.valid_sessions.values():
            if current_time < expiration:
                active_sessions += 1
            else:
                expired_from_timeout += 1
        
        return {
            'total_valid_sessions': len(self.valid_sessions),
            'active_sessions': active_sessions,
            'expired_sessions': len(self.expired_sessions),
            'expired_from_timeout': expired_from_timeout,
            'default_timeout_hours': self.default_session_timeout.total_seconds() / 3600
        }
    
    def _validate_session_format(self, session_id: str) -> bool:
        """
        Validate session ID format.
        
        Args:
            session_id: Session identifier to validate
            
        Returns:
            True if format is valid
        """
        if not isinstance(session_id, str):
            return False
        
        # Check against expected pattern: sim_timestamp_hexhash
        return bool(self.session_id_pattern.match(session_id))
    
    def reset(self):
        """Reset all authorization data."""
        self.valid_sessions.clear()
        self.expired_sessions.clear()