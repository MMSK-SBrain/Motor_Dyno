"""
Rate limiter for WebSocket messages to prevent abuse.
"""

import time
from typing import Dict, DefaultDict
from collections import defaultdict, deque


class RateLimiter:
    """
    Rate limiting for WebSocket messages to prevent client abuse.
    
    Implements sliding window rate limiting per client connection
    with configurable limits and time windows.
    """
    
    def __init__(self, max_messages: int = 10, time_window: float = 1.0):
        """
        Initialize rate limiter.
        
        Args:
            max_messages: Maximum messages allowed per time window
            time_window: Time window in seconds
        """
        self.max_messages = max_messages
        self.time_window = time_window
        
        # Track message timestamps per client
        # Using client memory address as key for simplicity
        self.client_messages: DefaultDict[str, deque] = defaultdict(deque)
        
        # Track blocked clients and their unblock time
        self.blocked_clients: Dict[str, float] = {}
        
        # Statistics
        self.total_messages = 0
        self.blocked_messages = 0
        self.unique_clients = set()
    
    def allow_message(self, client_id: str) -> bool:
        """
        Check if client is allowed to send a message.
        
        Args:
            client_id: Unique client identifier
            
        Returns:
            True if message is allowed, False if rate limited
        """
        current_time = time.time()
        
        # Check if client is currently blocked
        if client_id in self.blocked_clients:
            if current_time < self.blocked_clients[client_id]:
                self.blocked_messages += 1
                return False
            else:
                # Unblock client
                del self.blocked_clients[client_id]
        
        # Track unique clients
        self.unique_clients.add(client_id)
        
        # Get client's message history
        message_times = self.client_messages[client_id]
        
        # Remove old messages outside time window
        cutoff_time = current_time - self.time_window
        while message_times and message_times[0] < cutoff_time:
            message_times.popleft()
        
        # Check if client has exceeded rate limit
        if len(message_times) >= self.max_messages:
            # Block client for the remaining time window
            oldest_message_time = message_times[0]
            block_until = oldest_message_time + self.time_window
            self.blocked_clients[client_id] = block_until
            
            self.blocked_messages += 1
            return False
        
        # Allow message and record timestamp
        message_times.append(current_time)
        self.total_messages += 1
        return True
    
    def get_client_status(self, client_id: str) -> Dict[str, any]:
        """
        Get rate limiting status for a specific client.
        
        Args:
            client_id: Client identifier
            
        Returns:
            Dictionary with client rate limiting information
        """
        current_time = time.time()
        
        # Check if blocked
        is_blocked = client_id in self.blocked_clients
        block_expires = self.blocked_clients.get(client_id, 0)
        time_until_unblocked = max(0, block_expires - current_time)
        
        # Count recent messages
        message_times = self.client_messages[client_id]
        cutoff_time = current_time - self.time_window
        
        # Clean old messages for accurate count
        while message_times and message_times[0] < cutoff_time:
            message_times.popleft()
        
        recent_message_count = len(message_times)
        remaining_messages = max(0, self.max_messages - recent_message_count)
        
        return {
            'client_id': client_id,
            'is_blocked': is_blocked,
            'time_until_unblocked': time_until_unblocked,
            'recent_messages': recent_message_count,
            'remaining_messages': remaining_messages,
            'max_messages': self.max_messages,
            'time_window': self.time_window,
            'reset_time': current_time + self.time_window if message_times else current_time
        }
    
    def reset_client(self, client_id: str):
        """
        Reset rate limiting for a specific client.
        
        Args:
            client_id: Client identifier to reset
        """
        # Clear message history
        if client_id in self.client_messages:
            del self.client_messages[client_id]
        
        # Remove from blocked list
        if client_id in self.blocked_clients:
            del self.blocked_clients[client_id]
    
    def cleanup_expired_blocks(self):
        """Remove expired client blocks."""
        current_time = time.time()
        expired_clients = [
            client_id for client_id, block_time in self.blocked_clients.items()
            if current_time >= block_time
        ]
        
        for client_id in expired_clients:
            del self.blocked_clients[client_id]
    
    def cleanup_old_clients(self, max_idle_time: float = 3600):
        """
        Clean up data for clients that haven't sent messages recently.
        
        Args:
            max_idle_time: Maximum idle time in seconds before cleanup
        """
        current_time = time.time()
        cutoff_time = current_time - max_idle_time
        
        # Find idle clients
        idle_clients = []
        for client_id, message_times in self.client_messages.items():
            if not message_times or message_times[-1] < cutoff_time:
                idle_clients.append(client_id)
        
        # Remove idle clients
        for client_id in idle_clients:
            if client_id in self.client_messages:
                del self.client_messages[client_id]
            if client_id in self.blocked_clients:
                del self.blocked_clients[client_id]
            self.unique_clients.discard(client_id)
    
    def get_statistics(self) -> Dict[str, any]:
        """
        Get rate limiter statistics.
        
        Returns:
            Dictionary with statistics
        """
        current_time = time.time()
        
        # Count currently blocked clients
        active_blocks = sum(
            1 for block_time in self.blocked_clients.values()
            if current_time < block_time
        )
        
        return {
            'total_messages': self.total_messages,
            'blocked_messages': self.blocked_messages,
            'block_rate': self.blocked_messages / max(1, self.total_messages),
            'unique_clients': len(self.unique_clients),
            'active_clients': len(self.client_messages),
            'currently_blocked': active_blocks,
            'max_messages_per_window': self.max_messages,
            'time_window_seconds': self.time_window
        }
    
    def adjust_limits(self, max_messages: int = None, time_window: float = None):
        """
        Adjust rate limiting parameters.
        
        Args:
            max_messages: New maximum messages per window
            time_window: New time window in seconds
        """
        if max_messages is not None:
            self.max_messages = max_messages
        
        if time_window is not None:
            self.time_window = time_window
            
            # Clear existing data since time window changed
            self.client_messages.clear()
            self.blocked_clients.clear()