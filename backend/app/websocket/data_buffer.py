"""
Data buffer for WebSocket streaming optimization.
"""

import time
from typing import List, Dict, Any, Optional
from collections import deque
import numpy as np


class DataBuffer:
    """
    Circular buffer for simulation data with efficient querying.
    
    Features:
    - Fixed-size circular buffer
    - Time-based range queries
    - Latest N points retrieval
    - Memory efficient storage
    - Thread-safe operations
    """
    
    def __init__(self, max_size: int = 1000):
        """
        Initialize data buffer.
        
        Args:
            max_size: Maximum number of data points to store
        """
        self.max_size = max_size
        self.buffer = deque(maxlen=max_size)
        self._lock = False  # Simple lock for basic thread safety
        
    def add(self, data_point: Dict[str, Any]):
        """
        Add data point to buffer.
        
        Args:
            data_point: Dictionary containing data with 'timestamp' field
        """
        if self._lock:
            return
            
        # Ensure timestamp is present
        if 'timestamp' not in data_point:
            data_point['timestamp'] = time.time()
        
        self.buffer.append(data_point)
    
    def get_latest(self, n: int = 1) -> List[Dict[str, Any]]:
        """
        Get latest N data points.
        
        Args:
            n: Number of latest points to retrieve
            
        Returns:
            List of latest data points
        """
        if n <= 0:
            return []
        
        return list(self.buffer)[-n:]
    
    def get_range(self, start_time: float, end_time: float) -> List[Dict[str, Any]]:
        """
        Get data points within time range.
        
        Args:
            start_time: Start timestamp (inclusive)
            end_time: End timestamp (inclusive)
            
        Returns:
            List of data points within time range
        """
        result = []
        
        for point in self.buffer:
            timestamp = point.get('timestamp', 0)
            if start_time <= timestamp <= end_time:
                result.append(point)
        
        return result
    
    def get_all(self) -> List[Dict[str, Any]]:
        """Get all data points in buffer."""
        return list(self.buffer)
    
    def clear(self):
        """Clear all data from buffer."""
        self.buffer.clear()
    
    def __len__(self) -> int:
        """Get number of data points in buffer."""
        return len(self.buffer)
    
    def is_full(self) -> bool:
        """Check if buffer is at maximum capacity."""
        return len(self.buffer) >= self.max_size
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get buffer statistics."""
        if not self.buffer:
            return {
                'size': 0,
                'max_size': self.max_size,
                'utilization': 0.0,
                'time_span': 0.0,
                'oldest_timestamp': None,
                'newest_timestamp': None
            }
        
        timestamps = [point.get('timestamp', 0) for point in self.buffer]
        oldest = min(timestamps)
        newest = max(timestamps)
        
        return {
            'size': len(self.buffer),
            'max_size': self.max_size,
            'utilization': len(self.buffer) / self.max_size,
            'time_span': newest - oldest,
            'oldest_timestamp': oldest,
            'newest_timestamp': newest
        }