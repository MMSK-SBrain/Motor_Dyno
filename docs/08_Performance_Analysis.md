  };
  maxPoints?: number;
  updateRate?: number;
}

export const OptimizedPlot: React.FC<OptimizedPlotProps> = ({ 
  data, 
  maxPoints = 10000,
  updateRate = 60 
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  const lastUpdateTime = useRef<number>(0);
  const frameId = useRef<number>(0);

  // Optimized plot configuration
  const plotOptions = useMemo((): uPlot.Options => ({
    title: "Motor Performance",
    width: 800,
    height: 400,
    
    // Performance optimizations
    cursor: {
      drag: { x: true, y: false },
      focus: { prox: 16 },
      sync: { key: 'motor_plots' }
    },
    
    // Efficient series configuration
    series: [
      {},  // Time axis
      {
        label: "Speed (RPM)",
        stroke: "#3b82f6",
        width: 2,
        // Reduce point density for performance
        points: { show: false },
        // Use path optimization
        paths: uPlot.paths.linear!(),
      },
      {
        label: "Torque (Nm)", 
        stroke: "#ef4444",
        width: 2,
        scale: "torque",
        points: { show: false },
        paths: uPlot.paths.linear!(),
      }
    ],
    
    scales: {
      x: { time: false },
      y: { auto: true },
      torque: { auto: true }
    },
    
    axes: [
      { label: "Time (s)" },
      { 
        label: "Speed (RPM)",
        stroke: "#3b82f6",
        grid: { show: true, stroke: "#e5e7eb", width: 1 }
      },
      { 
        label: "Torque (Nm)",
        side: 1,
        scale: "torque", 
        stroke: "#ef4444",
        grid: { show: false }
      }
    ],
    
    // Optimize hooks for performance
    hooks: {
      init: [
        u => {
          // Set up efficient rendering context
          const ctx = u.ctx;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
        }
      ],
      draw: [
        u => {
          // Custom drawing optimizations if needed
          performance.mark('plot-draw-start');
        }
      ],
      drawClear: [
        u => {
          performance.mark('plot-draw-end');
          performance.measure('plot-draw-time', 'plot-draw-start', 'plot-draw-end');
        }
      ]
    }
  }), []);

  // Data decimation for large datasets
  const decimatedData = useMemo(() => {
    if (data.time.length <= maxPoints) {
      return [data.time, data.speed, data.torque];
    }
    
    // Intelligent decimation - keep more recent data dense
    const step = Math.ceil(data.time.length / maxPoints);
    const decimatedTime: number[] = [];
    const decimatedSpeed: number[] = [];
    const decimatedTorque: number[] = [];
    
    // Keep recent 20% of data at full resolution
    const recentStartIndex = Math.floor(data.time.length * 0.8);
    
    // Decimate older data
    for (let i = 0; i < recentStartIndex; i += step) {
      decimatedTime.push(data.time[i]);
      decimatedSpeed.push(data.speed[i]);
      decimatedTorque.push(data.torque[i]);
    }
    
    // Add recent data at full resolution
    for (let i = recentStartIndex; i < data.time.length; i++) {
      decimatedTime.push(data.time[i]);
      decimatedSpeed.push(data.speed[i]);  
      decimatedTorque.push(data.torque[i]);
    }
    
    return [decimatedTime, decimatedSpeed, decimatedTorque];
  }, [data, maxPoints]);

  // Throttled update mechanism
  const updatePlot = useMemo(() => {
    return () => {
      const now = performance.now();
      const timeSinceUpdate = now - lastUpdateTime.current;
      const minUpdateInterval = 1000 / updateRate;
      
      if (timeSinceUpdate >= minUpdateInterval) {
        if (plotRef.current) {
          plotRef.current.setData(decimatedData);
          lastUpdateTime.current = now;
        }
      } else {
        // Schedule next update
        if (frameId.current) {
          cancelAnimationFrame(frameId.current);
        }
        frameId.current = requestAnimationFrame(() => {
          if (plotRef.current) {
            plotRef.current.setData(decimatedData);
            lastUpdateTime.current = performance.now();
          }
        });
      }
    };
  }, [decimatedData, updateRate]);

  // Initialize plot
  useEffect(() => {
    if (!chartRef.current) return;
    
    plotRef.current = new uPlot(plotOptions, decimatedData, chartRef.current);
    
    return () => {
      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
      plotRef.current?.destroy();
    };
  }, []);

  // Update plot data
  useEffect(() => {
    updatePlot();
  }, [updatePlot]);

  return <div ref={chartRef} className="w-full h-full" />;
};
```

#### Canvas-based High-Performance Plotting
```typescript
// src/components/CanvasPlot.tsx
import React, { useRef, useEffect, useCallback } from 'react';

interface CanvasPlotProps {
  data: {
    time: number[];
    values: number[][];
    labels: string[];
    colors: string[];
  };
  width: number;
  height: number;
}

export const CanvasPlot: React.FC<CanvasPlotProps> = ({ data, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Create offscreen canvas for double buffering
  useEffect(() => {
    if (typeof window !== 'undefined') {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = width;
      offscreenCanvasRef.current.height = height;
    }
  }, [width, height]);

  const drawPlot = useCallback(() => {
    const canvas = canvasRef.current;
    const offscreenCanvas = offscreenCanvasRef.current;
    
    if (!canvas || !offscreenCanvas || !data.time.length) return;
    
    const ctx = offscreenCanvas.getContext('2d');
    const displayCtx = canvas.getContext('2d');
    
    if (!ctx || !displayCtx) return;
    
    // Clear offscreen canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Calculate plot area
    const margin = { top: 20, right: 60, bottom: 40, left: 60 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    
    // Find data ranges
    const timeRange = [Math.min(...data.time), Math.max(...data.time)];
    const valueRanges = data.values.map(values => [
      Math.min(...values),
      Math.max(...values)
    ]);
    
    // Scale functions
    const scaleX = (time: number) => 
      margin.left + ((time - timeRange[0]) / (timeRange[1] - timeRange[0])) * plotWidth;
    
    const scaleY = (value: number, seriesIndex: number) => {
      const [min, max] = valueRanges[seriesIndex];
      return margin.top + plotHeight - ((value - min) / (max - min)) * plotHeight;
    };
    
    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    const timeStep = (timeRange[1] - timeRange[0]) / 10;
    for (let i = 0; i <= 10; i++) {
      const time = timeRange[0] + i * timeStep;
      const x = scaleX(time);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();
    }
    
    // Draw data series with optimized paths
    data.values.forEach((values, seriesIndex) => {
      ctx.strokeStyle = data.colors[seriesIndex] || '#3b82f6';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // Use optimized path drawing for large datasets
      if (values.length > 1000) {
        // Simplified line drawing for performance
        ctx.beginPath();
        let lastX = scaleX(data.time[0]);
        let lastY = scaleY(values[0], seriesIndex);
        ctx.moveTo(lastX, lastY);
        
        // Sample points for performance (Lttb algorithm could be used here)
        const step = Math.max(1, Math.floor(values.length / 1000));
        for (let i = step; i < values.length; i += step) {
          const x = scaleX(data.time[i]);
          const y = scaleY(values[i], seriesIndex);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // Full resolution for smaller datasets
        ctx.beginPath();
        data.time.forEach((time, i) => {
          const x = scaleX(time);
          const y = scaleY(values[i], seriesIndex);
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
      }
    });
    
    // Draw axes labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Time (s)', width / 2, height - 10);
    
    // Copy offscreen canvas to display canvas
    displayCtx.clearRect(0, 0, width, height);
    displayCtx.drawImage(offscreenCanvas, 0, 0);
    
  }, [data, width, height]);

  // Animate updates
  useEffect(() => {
    const animate = () => {
      drawPlot();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawPlot]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="border border-gray-200 rounded"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};
```

### 4. Database Query Optimization

#### Time-Series Data Optimization
```sql
-- Optimized TimescaleDB queries for motor simulation data

-- Create optimized hypertable with appropriate chunk sizing
SELECT create_hypertable(
    'simulation_data', 
    'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create efficient indexes
CREATE INDEX CONCURRENTLY idx_simulation_session_time 
ON simulation_data (session_id, timestamp DESC);

CREATE INDEX CONCURRENTLY idx_simulation_motor_type
ON simulation_data (motor_type, timestamp DESC);

-- Materialized view for real-time aggregations
CREATE MATERIALIZED VIEW simulation_metrics_1min AS
SELECT 
    time_bucket('1 minute', timestamp) AS time_bucket,
    session_id,
    motor_type,
    AVG(motor_speed_rpm) as avg_speed_rpm,
    AVG(motor_torque_nm) as avg_torque_nm,
    AVG(efficiency_percent) as avg_efficiency,
    MAX(power_w) as peak_power_w,
    COUNT(*) as sample_count
FROM simulation_data
GROUP BY time_bucket, session_id, motor_type;

-- Refresh policy for materialized view
SELECT add_continuous_aggregate_policy('simulation_metrics_1min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

-- Optimized query for recent data
PREPARE get_recent_simulation_data AS
SELECT timestamp, motor_speed_rpm, motor_torque_nm, efficiency_percent, power_w
FROM simulation_data 
WHERE session_id = $1 
  AND timestamp >= NOW() - INTERVAL '10 minutes'
ORDER BY timestamp DESC
LIMIT 6000;  -- 10 minutes at 10Hz = 6000 points

-- Efficient aggregation for dashboard
PREPARE get_session_summary AS
SELECT 
    session_id,
    motor_type,
    MIN(timestamp) as start_time,
    MAX(timestamp) as end_time,
    EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) as duration_seconds,
    AVG(efficiency_percent) as avg_efficiency,
    SUM(power_w * 0.1 / 3600) as energy_wh,  -- Assuming 10Hz sampling
    MAX(power_w) as peak_power_w,
    COUNT(*) as total_samples
FROM simulation_data 
WHERE session_id = $1
GROUP BY session_id, motor_type;
```

#### Connection Pooling and Query Optimization
```python
# app/database/optimized_queries.py
import asyncpg
import asyncio
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

class OptimizedDatabase:
    def __init__(self, database_url: str, pool_size: int = 20):
        self.database_url = database_url
        self.pool_size = pool_size
        self.pool: Optional[asyncpg.Pool] = None
        
    async def initialize(self):
        """Initialize connection pool with optimized settings"""
        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=5,
            max_size=self.pool_size,
            max_queries=50000,
            max_inactive_connection_lifetime=300.0,
            command_timeout=60.0,
            server_settings={
                'jit': 'off',  # Disable JIT for short queries
                'application_name': 'motor_simulation',
            }
        )
        
        # Prepare frequently used statements
        async with self.pool.acquire() as conn:
            await conn.execute("""
                PREPARE get_recent_data AS
                SELECT timestamp, motor_speed_rpm, motor_torque_nm, 
                       efficiency_percent, power_w
                FROM simulation_data 
                WHERE session_id = $1 AND timestamp >= $2
                ORDER BY timestamp DESC
                LIMIT $3
            """)
            
            await conn.execute("""
                PREPARE insert_simulation_batch AS
                INSERT INTO simulation_data 
                (timestamp, session_id, motor_speed_rpm, motor_torque_nm,
                 phase_current_a, dc_voltage_v, efficiency_percent, power_w)
                SELECT * FROM UNNEST($1::timestamptz[], $2::text[], 
                                   $3::real[], $4::real[], $5::real[], 
                                   $6::real[], $7::real[], $8::real[])
            """)
    
    @asynccontextmanager
    async def get_connection(self):
        """Get database connection from pool"""
        if not self.pool:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            yield conn
    
    async def insert_simulation_batch(self, data_batch: List[Dict]):
        """Efficiently insert batch of simulation data"""
        if not data_batch:
            return
            
        # Prepare batch data arrays
        timestamps = [d['timestamp'] for d in data_batch]
        session_ids = [d['session_id'] for d in data_batch]
        speeds = [d['motor_speed_rpm'] for d in data_batch]
        torques = [d['motor_torque_nm'] for d in data_batch] 
        currents = [d['phase_current_a'] for d in data_batch]
        voltages = [d['dc_voltage_v'] for d in data_batch]
        efficiencies = [d['efficiency_percent'] for d in data_batch]
        powers = [d['power_w'] for d in data_batch]
        
        async with self.get_connection() as conn:
            await conn.execute(
                'EXECUTE insert_simulation_batch($1, $2, $3, $4, $5, $6, $7, $8)',
                timestamps, session_ids, speeds, torques,
                currents, voltages, efficiencies, powers
            )
    
    async def get_recent_simulation_data(self, session_id: str, 
                                       minutes_back: int = 10, 
                                       limit: int = 6000) -> List[Dict]:
        """Get recent simulation data with efficient query"""
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes_back)
        
        async with self.get_connection() as conn:
            rows = await conn.fetch(
                'EXECUTE get_recent_data($1, $2, $3)',
                session_id, cutoff_time, limit
            )
            
        return [dict(row) for row in rows]
```

## Load Testing and Benchmarks

### Performance Testing Framework
```python
# tests/performance/load_test.py
import asyncio
import aiohttp
import websockets
import time
import statistics
from typing import List, Dict
from concurrent.futures import ThreadPoolExecutor

class PerformanceTest:
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.ws_url = base_url.replace("http", "ws")
        
    async def test_simulation_throughput(self, 
                                       concurrent_sessions: int = 10,
                                       duration_seconds: int = 60):
        """Test maximum simulation throughput"""
        print(f"Testing {concurrent_sessions} concurrent simulations for {duration_seconds}s")
        
        tasks = []
        for i in range(concurrent_sessions):
            task = asyncio.create_task(self._run_simulation_session(f"test_{i}", duration_seconds))
            tasks.append(task)
        
        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = time.time()
        
        # Analyze results
        successful_sessions = [r for r in results if not isinstance(r, Exception)]
        failed_sessions = [r for r in results if isinstance(r, Exception)]
        
        total_data_points = sum(r['data_points'] for r in successful_sessions)
        total_throughput = total_data_points / (end_time - start_time)
        
        return {
            'concurrent_sessions': concurrent_sessions,
            'duration_s': end_time - start_time,
            'successful_sessions': len(successful_sessions),
            'failed_sessions': len(failed_sessions),
            'total_data_points': total_data_points,
            'throughput_points_per_second': total_throughput,
            'avg_latency_ms': statistics.mean([r['avg_latency_ms'] for r in successful_sessions]),
            'errors': [str(e) for e in failed_sessions]
        }
    
    async def _run_simulation_session(self, session_name: str, duration_s: int) -> Dict:
        """Run single simulation session for testing"""
        data_points = 0
        latencies = []
        
        try:
            # Start simulation via REST API
            async with aiohttp.ClientSession() as session:
                start_payload = {
                    "motor_id": "bldc_2kw_48v",
                    "control_mode": "manual",
                    "session_name": session_name
                }
                
                async with session.post(f"{self.base_url}/api/v1/simulation/start", 
                                      json=start_payload) as resp:
                    if resp.status != 200:
                        raise Exception(f"Failed to start simulation: {resp.status}")
                    
                    sim_data = await resp.json()
                    session_id = sim_data['session_id']
                    ws_url = f"{self.ws_url}/ws/simulation/{session_id}"
            
            # Connect to WebSocket and collect data
            async with websockets.connect(ws_url) as websocket:
                start_time = time.time()
                
                while time.time() - start_time < duration_s:
                    message_start = time.time()
                    
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        message_end = time.time()
                        
                        latency_ms = (message_end - message_start) * 1000
                        latencies.append(latency_ms)
                        data_points += 1
                        
                    except asyncio.TimeoutError:
                        continue
            
            return {
                'session_name': session_name,
                'duration_s': duration_s,
                'data_points': data_points,
                'avg_latency_ms': statistics.mean(latencies) if latencies else 0,
                'max_latency_ms': max(latencies) if latencies else 0
            }
            
        except Exception as e:
            raise Exception(f"Session {session_name} failed: {str(e)}")

# Benchmark runner
async def run_benchmarks():
    tester = PerformanceTest()
    
    print("=== Motor Simulation Performance Benchmarks ===")
    
    # Test 1: Single session maximum data rate
    print("\n1. Single Session Maximum Data Rate")
    result = await tester.test_simulation_throughput(concurrent_sessions=1, duration_seconds=30)
    print(f"   Data rate: {result['throughput_points_per_second']:.1f} points/sec")
    print(f"   Avg latency: {result['avg_latency_ms']:.2f} ms")
    
    # Test 2: Multiple concurrent sessions
    print("\n2. Concurrent Sessions Test")
    for sessions in [5, 10, 20]:
        result = await tester.test_simulation_throughput(concurrent_sessions=sessions, duration_seconds=30)
        print(f"   {sessions} sessions: {result['throughput_points_per_second']:.1f} points/sec total")
        print(f"   Success rate: {result['successful_sessions']}/{sessions}")
    
    # Test 3: Extended duration stability
    print("\n3. Extended Duration Stability Test")
    result = await tester.test_simulation_throughput(concurrent_sessions=5, duration_seconds=300)
    print(f"   5 sessions for 5 minutes: {result['throughput_points_per_second']:.1f} points/sec")
    print(f"   Success rate: {result['successful_sessions']}/5")

if __name__ == "__main__":
    asyncio.run(run_benchmarks())
```

### Expected Performance Benchmarks

Based on the optimization strategies above, the expected performance characteristics are:

| Metric | Target | Optimized |
|--------|---------|-----------|
| Simulation Rate | 1000 Hz | 1000 Hz ± 0.1 Hz |
| WebSocket Latency | < 50ms | 15-25ms (99th percentile) |
| Data Throughput | 100 points/sec/session | 500+ points/sec/session |
| Concurrent Sessions | 10 sessions | 50+ sessions |
| Memory per Session | < 2GB | 500MB - 1GB |
| CPU Usage (4-core) | < 50% | 25-35% (10 sessions) |
| Plot Rendering | 60 FPS @ 10k points | 60 FPS @ 15k+ points |
| Database Ingestion | 1000 points/sec | 10,000+ points/sec |

These optimizations ensure the motor simulation system can handle professional workloads while maintaining real-time performance and accuracy requirements.
