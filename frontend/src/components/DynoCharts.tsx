import React, { useEffect, useRef } from 'react';

interface DataPoint {
  time: number;
  rpm: number;
  torque: number;
  power: number;
  voltage: number;
  current: number;
  efficiency: number;
}

interface DynoChartsProps {
  data: DataPoint[];
  selectedMetrics: string[];
  timeWindow: number;
}

const DynoCharts: React.FC<DynoChartsProps> = ({ data, selectedMetrics, timeWindow = 30 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const performanceCanvasRef = useRef<HTMLCanvasElement>(null);

  const metricColors: Record<string, string> = {
    rpm: '#00ff41',
    torque: '#ff6b6b',
    power: '#ffcc00',
    voltage: '#00ccff',
    current: '#ff00ff',
    efficiency: '#00ff88'
  };

  const metricRanges: Record<string, [number, number]> = {
    rpm: [0, 6000],
    torque: [0, 100],
    power: [0, 5000],
    voltage: [0, 100],
    current: [0, 100],
    efficiency: [0, 100]
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let i = 0; i <= 10; i++) {
      const x = (width / 10) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Filter data for time window
    const now = Date.now() / 1000;
    const filteredData = data.filter(d => (now - d.time) <= timeWindow);

    if (filteredData.length < 2) return;

    // Draw data lines
    selectedMetrics.forEach(metric => {
      if (!metricColors[metric]) return;

      ctx.strokeStyle = metricColors[metric];
      ctx.lineWidth = 2;
      ctx.beginPath();

      const [min, max] = metricRanges[metric];
      
      filteredData.forEach((point, index) => {
        const x = (index / (filteredData.length - 1)) * width;
        const value = point[metric as keyof DataPoint] as number;
        const normalizedValue = (value - min) / (max - min);
        const y = height - (normalizedValue * height);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Draw metric label
      const lastPoint = filteredData[filteredData.length - 1];
      const lastValue = lastPoint[metric as keyof DataPoint] as number;
      
      ctx.fillStyle = metricColors[metric];
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'right';
      
      const labelY = 20 + selectedMetrics.indexOf(metric) * 20;
      ctx.fillText(`${metric.toUpperCase()}: ${lastValue.toFixed(1)}`, width - 10, labelY);
    });

    // Draw axes labels
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Time (${timeWindow}s window)`, width / 2, height - 5);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedMetrics, timeWindow]);

  useEffect(() => {
    const canvas = performanceCanvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Draw torque vs speed curve
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();

    // Sort data by RPM for performance curve
    const sortedData = [...data].sort((a, b) => a.rpm - b.rpm);

    sortedData.forEach((point, index) => {
      const x = (point.rpm / 6000) * width;
      const y = height - ((point.torque / 100) * height);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw power vs speed curve
    ctx.strokeStyle = '#ffcc00';
    ctx.beginPath();

    sortedData.forEach((point, index) => {
      const x = (point.rpm / 6000) * width;
      const y = height - ((point.power / 5000) * height);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw labels
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Torque', 10, 20);

    ctx.fillStyle = '#ffcc00';
    ctx.fillText('Power', 10, 35);

    // Draw axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, height);
    ctx.stroke();

    // Axes labels
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RPM', width / 2, height - 5);

  }, [data]);

  const styles = {
    container: {
      display: 'flex',
      gap: '20px',
      width: '100%'
    },
    chartContainer: {
      flex: 1,
      background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
      borderRadius: '10px',
      padding: '15px',
      boxShadow: '5px 5px 15px #000000, -5px -5px 15px #2a2a2a'
    },
    title: {
      color: '#00ff41',
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '10px',
      textTransform: 'uppercase' as const
    },
    canvas: {
      width: '100%',
      borderRadius: '5px',
      backgroundColor: '#0a0a0a'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.chartContainer}>
        <div style={styles.title}>Real-Time Data</div>
        <canvas
          ref={canvasRef}
          width={500}
          height={200}
          style={styles.canvas}
        />
      </div>
      
      <div style={styles.chartContainer}>
        <div style={styles.title}>Performance Curves</div>
        <canvas
          ref={performanceCanvasRef}
          width={400}
          height={200}
          style={styles.canvas}
        />
      </div>
    </div>
  );
};

export default DynoCharts;