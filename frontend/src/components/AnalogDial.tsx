import React, { useEffect, useRef } from 'react';

interface AnalogDialProps {
  value: number;
  max: number;
  min?: number;
  unit: string;
  label: string;
  warningZone?: number;
  dangerZone?: number;
  size?: number;
  decimals?: number;
  showMarkings?: boolean;
}

const AnalogDial: React.FC<AnalogDialProps> = ({
  value,
  max,
  min = 0,
  unit,
  label,
  warningZone = max * 0.8,
  dangerZone = max * 0.9,
  size = 200,
  decimals = 1,
  showMarkings = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const currentValueRef = useRef<number>(value);
  const targetValueRef = useRef<number>(value);

  useEffect(() => {
    targetValueRef.current = Math.min(max, Math.max(min, value || 0));
  }, [value, min, max]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 20;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const angleRange = endAngle - startAngle;

    const animate = () => {
      // Smooth value transition with damping
      const target = Math.min(max, Math.max(min, targetValueRef.current));
      const diff = target - currentValueRef.current;
      
      // Only update if difference is significant
      if (Math.abs(diff) > 0.01) {
        currentValueRef.current += diff * 0.08; // Slower, smoother animation
      } else {
        currentValueRef.current = target;
      }

      // Clear canvas
      ctx.clearRect(0, 0, size, size);

      // Draw outer ring
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.stroke();

      // Draw colored zones
      const drawZone = (start: number, end: number, color: string) => {
        const startAngleZone = startAngle + (start / max) * angleRange;
        const endAngleZone = startAngle + (end / max) * angleRange;
        ctx.strokeStyle = color;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngleZone, endAngleZone);
        ctx.stroke();
      };

      // Green zone
      drawZone(min, warningZone, '#00ff41');
      // Yellow zone
      if (warningZone < max) {
        drawZone(warningZone, dangerZone, '#ffcc00');
      }
      // Red zone
      if (dangerZone < max) {
        drawZone(dangerZone, max, '#ff3333');
      }

      // Draw tick marks (only if showMarkings is true)
      if (showMarkings) {
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        const tickCount = 10;
        for (let i = 0; i <= tickCount; i++) {
          const tickAngle = startAngle + (i / tickCount) * angleRange;
          const innerRadius = radius - 20;
          const outerRadius = radius - 10;
          
          ctx.beginPath();
          ctx.moveTo(
            centerX + Math.cos(tickAngle) * innerRadius,
            centerY + Math.sin(tickAngle) * innerRadius
          );
          ctx.lineTo(
            centerX + Math.cos(tickAngle) * outerRadius,
            centerY + Math.sin(tickAngle) * outerRadius
          );
          ctx.stroke();

          // Draw numbers
          if (i % 2 === 0) {
            const numberRadius = radius - 35;
            const tickValue = min + (i / tickCount) * (max - min);
            ctx.fillStyle = '#888';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(
              tickValue.toFixed(0),
              centerX + Math.cos(tickAngle) * numberRadius,
              centerY + Math.sin(tickAngle) * numberRadius
            );
          }
        }
      }

      // Draw needle
      const needleAngle = startAngle + ((currentValueRef.current - min) / (max - min)) * angleRange;
      
      // Needle shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      
      ctx.strokeStyle = '#ff0000';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(needleAngle) * (radius - 25),
        centerY + Math.sin(needleAngle) * (radius - 25)
      );
      ctx.stroke();
      
      ctx.shadowColor = 'transparent';

      // Center dot
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
      ctx.fill();

      // Draw label
      ctx.fillStyle = '#aaa';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, centerX, centerY - 40);

      // Draw digital value
      ctx.fillStyle = '#00ff41';
      ctx.font = 'bold 24px monospace';
      ctx.fillText(
        currentValueRef.current.toFixed(decimals),
        centerX,
        centerY + 20
      );

      // Draw unit
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.fillText(unit, centerX, centerY + 40);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [max, min, unit, label, warningZone, dangerZone, size, decimals, showMarkings]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{
        background: 'linear-gradient(145deg, #1a1a1a, #2d2d2d)',
        borderRadius: '15px',
        boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a',
        margin: '10px'
      }}
    />
  );
};

export default AnalogDial;