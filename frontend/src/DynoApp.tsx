import React, { useState, useEffect, useRef, useCallback } from 'react';
import AnalogDial from './components/AnalogDial';
import MotorSelector, { MotorConfig } from './components/MotorSelector';
import SimpleLoadControl from './components/SimpleLoadControl';
import { LoadProfile } from './components/LoadControl';
import TestControl, { TestSequence } from './components/TestControl';
import DynoCharts from './components/DynoCharts';

// BLDC Motor Simulation
class BLDCMotorSimulation {
  private resistance: number;
  private inductance: number;
  private ke: number;
  private kt: number;
  private inertia: number;
  private damping: number;
  private speed: number = 0;
  private current: number = 0;
  private temperature: number = 25;

  constructor(config: MotorConfig) {
    this.resistance = config.resistance;
    this.inductance = config.inductance;
    this.ke = config.ke;
    this.kt = config.kt;
    this.inertia = config.inertia;
    this.damping = config.damping;
  }

  step(voltage: number, loadTorque: number, dt: number = 0.001) {
    // Clamp inputs to reasonable ranges
    voltage = Math.max(0, Math.min(150, voltage));
    loadTorque = Math.max(0, Math.min(100, loadTorque));
    dt = Math.min(0.01, dt); // Prevent large time steps
    
    const backEmf = this.ke * this.speed;
    
    // Electrical dynamics with better damping
    const di_dt = (voltage - backEmf - this.resistance * this.current) / this.inductance;
    this.current += di_dt * dt;
    this.current = Math.max(-60, Math.min(60, this.current)); // More reasonable current limits
    
    // Calculate torque
    const electricalTorque = this.kt * this.current;
    
    // Mechanical dynamics with friction
    const friction = this.damping * this.speed + 0.005 * Math.sign(this.speed); // Added static friction
    const netTorque = electricalTorque - loadTorque - friction;
    const acceleration = netTorque / this.inertia;
    
    // Update speed with limits
    this.speed += acceleration * dt;
    this.speed = Math.max(0, Math.min(600, this.speed)); // Max ~5700 RPM
    
    // Improved thermal model
    const powerLoss = Math.abs(this.current * this.current * this.resistance);
    const tempRise = powerLoss * 0.0005; // Slower temperature rise
    const cooling = (this.temperature - 25) * 0.002; // Better cooling
    this.temperature += (tempRise - cooling) * dt / 0.001;
    this.temperature = Math.max(25, Math.min(120, this.temperature));
    
    const speedRpm = (this.speed * 30) / Math.PI;
    const power = Math.abs(electricalTorque * this.speed);
    const inputPower = Math.abs(voltage * this.current);
    const efficiency = inputPower > 0.1 ? (power / inputPower) * 100 : 0;
    
    return {
      speed: this.speed,
      speedRpm,
      current: this.current,
      torque: electricalTorque,
      power,
      voltage,
      temperature: this.temperature,
      efficiency: Math.min(100, Math.max(0, efficiency))
    };
  }
}

interface DataPoint {
  time: number;
  rpm: number;
  torque: number;
  power: number;
  voltage: number;
  current: number;
  efficiency: number;
  temperature: number;
}

const DynoApp: React.FC = () => {
  const [motorConfig, setMotorConfig] = useState<MotorConfig>({
    id: 'bldc-2000w-48v',
    name: 'BLDC 2000W 48V',
    type: 'BLDC',
    resistance: 0.1,
    inductance: 0.0005,
    ke: 0.05,
    kt: 0.48,
    maxRpm: 4000,
    maxCurrent: 50,
    maxPower: 2000,
    ratedVoltage: 48,
    poles: 8,
    inertia: 0.001,
    damping: 0.01
  });

  const [motorData, setMotorData] = useState({
    rpm: 0,
    torque: 0,
    power: 0,
    voltage: 48,
    current: 0,
    temperature: 25,
    efficiency: 0
  });

  const [dataHistory, setDataHistory] = useState<DataPoint[]>([]);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentLoad, setCurrentLoad] = useState(0);
  const [targetSpeed, setTargetSpeed] = useState(0);
  
  const motorRef = useRef<BLDCMotorSimulation | null>(null);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(Date.now());
  const loadProfileRef = useRef<LoadProfile>({ type: 'constant', targetValue: 0 });
  const testSequenceRef = useRef<TestSequence | null>(null);
  const testStartTimeRef = useRef<number>(0);
  const recordedDataRef = useRef<DataPoint[]>([]);

  // Initialize motor
  useEffect(() => {
    motorRef.current = new BLDCMotorSimulation(motorConfig);
  }, [motorConfig]);

  // Main simulation loop
  const simulate = useCallback(() => {
    if (!motorRef.current) return;

    const now = Date.now();
    const dt = Math.min((now - lastTimeRef.current) / 1000, 0.02); // Cap at 20ms max timestep
    
    // Skip if dt is too small (avoid jitter)
    if (dt < 0.001) {
      animationRef.current = requestAnimationFrame(simulate);
      return;
    }
    
    lastTimeRef.current = now;

    // Apply load profile with smoothing
    let load = currentLoad;
    const profile = loadProfileRef.current;
    if (profile.type === 'ramp' && profile.rampRate) {
      const targetDiff = profile.targetValue - currentLoad;
      const step = Math.sign(targetDiff) * Math.min(Math.abs(targetDiff), profile.rampRate * dt);
      load = currentLoad + step;
      setCurrentLoad(prev => prev + step);
    } else if (profile.type === 'sine' && profile.frequency && profile.amplitude) {
      const time = (now - testStartTimeRef.current) / 1000;
      load = profile.targetValue + profile.amplitude * Math.sin(2 * Math.PI * profile.frequency * time);
      setCurrentLoad(load);
    } else if (profile.type === 'constant' || profile.type === 'step') {
      load = profile.targetValue;
      if (Math.abs(load - currentLoad) > 0.1) {
        setCurrentLoad(load);
      }
    }
    
    // Ensure load is in valid range
    load = Math.max(0, Math.min(100, load));

    // Handle test sequences
    if (isTestRunning && testSequenceRef.current) {
      const elapsedTime = (now - testStartTimeRef.current) / 1000;
      const test = testSequenceRef.current;
      const progress = Math.min(elapsedTime / test.parameters.duration, 1);
      
      if (progress >= 1) {
        setIsTestRunning(false);
        testSequenceRef.current = null;
      } else {
        if (test.type === 'speed_sweep') {
          const targetRpm = test.parameters.startValue + 
            (test.parameters.endValue - test.parameters.startValue) * progress;
          setTargetSpeed(targetRpm);
        } else if (test.type === 'load_ramp') {
          const targetLoad = test.parameters.startValue + 
            (test.parameters.endValue - test.parameters.startValue) * progress;
          loadProfileRef.current = { type: 'constant', targetValue: targetLoad };
          setCurrentLoad(targetLoad);
        }
      }
    }

    // PID-like speed control with anti-windup
    const targetSpeedRad = (targetSpeed * Math.PI / 30);
    const speedError = targetSpeedRad - motorRef.current['speed'];
    
    // Proportional control with feedforward
    const kp = 5.0;
    const feedforward = targetSpeedRad * motorConfig.ke * 1.2; // Feedforward based on back-EMF
    let voltage = feedforward + kp * speedError;
    
    // Clamp voltage to motor limits
    voltage = Math.max(0, Math.min(motorConfig.ratedVoltage * 1.2, voltage));

    // Run simulation step with fixed timestep for stability
    const result = motorRef.current.step(voltage, load, 0.001);
    
    setMotorData({
      rpm: result.speedRpm,
      torque: result.torque,
      power: result.power / 1000, // Convert to kW
      voltage: result.voltage,
      current: result.current,
      temperature: result.temperature,
      efficiency: result.efficiency
    });

    // Update data history
    const dataPoint: DataPoint = {
      time: now / 1000,
      rpm: result.speedRpm,
      torque: result.torque,
      power: result.power,
      voltage: result.voltage,
      current: result.current,
      efficiency: result.efficiency,
      temperature: result.temperature
    };

    setDataHistory(prev => {
      const updated = [...prev, dataPoint];
      return updated.slice(-300); // Keep last 300 points
    });

    // Record data if recording
    if (isRecording) {
      recordedDataRef.current.push(dataPoint);
    }

    animationRef.current = requestAnimationFrame(simulate);
  }, [currentLoad, targetSpeed, isTestRunning, motorConfig, isRecording]);

  // Start/stop simulation
  useEffect(() => {
    simulate();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [simulate]);

  const handleMotorSelect = (motor: MotorConfig) => {
    setMotorConfig(motor);
    motorRef.current = new BLDCMotorSimulation(motor);
  };

  const handleLoadChange = (profile: LoadProfile) => {
    loadProfileRef.current = profile;
    if (profile.type === 'step' || profile.type === 'constant') {
      setCurrentLoad(profile.targetValue);
    }
  };

  const handleTestStart = (test: TestSequence) => {
    testSequenceRef.current = test;
    testStartTimeRef.current = Date.now();
    setIsTestRunning(true);
    setIsRecording(true);
    recordedDataRef.current = [];
  };

  const handleTestStop = () => {
    setIsTestRunning(false);
    setIsRecording(false);
    testSequenceRef.current = null;
  };

  const handleExportData = () => {
    const csv = [
      'Time,RPM,Torque,Power,Voltage,Current,Efficiency,Temperature',
      ...recordedDataRef.current.map(d => 
        `${d.time},${d.rpm},${d.torque},${d.power},${d.voltage},${d.current},${d.efficiency},${d.temperature}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dyno_data_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const styles = {
    app: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      color: '#ddd',
      fontFamily: 'sans-serif',
      padding: '20px'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '20px',
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      marginBottom: '20px',
      boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#00ff41',
      textShadow: '0 0 10px rgba(0, 255, 65, 0.5)'
    },
    statusBar: {
      display: 'flex',
      gap: '20px',
      alignItems: 'center'
    },
    statusItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 15px',
      background: '#2a2a2a',
      borderRadius: '5px'
    },
    mainContainer: {
      display: 'grid',
      gridTemplateColumns: '300px 1fr 300px',
      gap: '20px',
      marginBottom: '20px'
    },
    leftPanel: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px'
    },
    centerPanel: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px'
    },
    rightPanel: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px'
    },
    dialsContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '20px',
      justifyItems: 'center'
    },
    controlsContainer: {
      display: 'flex',
      gap: '20px',
      marginTop: '20px'
    },
    speedControl: {
      flex: 1,
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a'
    },
    input: {
      width: '100%',
      padding: '10px',
      backgroundColor: '#222',
      color: '#00ff41',
      border: '1px solid #444',
      borderRadius: '5px',
      fontSize: '16px',
      fontFamily: 'monospace'
    },
    button: {
      backgroundColor: isRecording ? '#ff3333' : '#00ff41',
      color: isRecording ? '#fff' : '#000',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
      transition: 'all 0.3s'
    },
    emergencyStop: {
      backgroundColor: '#ff0000',
      color: '#fff',
      border: 'none',
      padding: '15px 30px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '16px',
      boxShadow: '0 4px 15px rgba(255, 0, 0, 0.3)'
    }
  };

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.title}>Motor Dyno Control System</div>
        <div style={styles.statusBar}>
          <div style={styles.statusItem}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#00ff41',
              animation: 'pulse 2s infinite'
            }} />
            <span>Connected</span>
          </div>
          <div style={styles.statusItem}>
            <span>1000 Hz</span>
          </div>
          <div style={styles.statusItem}>
            {isRecording && <span style={{ color: '#ff3333' }}>● REC</span>}
            {!isRecording && <span>Ready</span>}
          </div>
          <button 
            style={styles.emergencyStop}
            onClick={() => {
              setTargetSpeed(0);
              handleLoadChange({ type: 'constant', targetValue: 0 });
              handleTestStop();
            }}
          >
            EMERGENCY STOP
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        <div style={styles.leftPanel}>
          <MotorSelector 
            onMotorSelect={handleMotorSelect}
            currentMotor={motorConfig}
          />
        </div>

        <div style={styles.centerPanel}>
          <div style={styles.dialsContainer}>
            <AnalogDial
              value={motorData.rpm}
              max={motorConfig.maxRpm}
              unit="RPM"
              label="Speed"
              warningZone={motorConfig.maxRpm * 0.8}
              dangerZone={motorConfig.maxRpm * 0.95}
            />
            <AnalogDial
              value={motorData.torque}
              max={100}
              unit="Nm"
              label="Torque"
              warningZone={80}
              dangerZone={90}
            />
            <AnalogDial
              value={motorData.power}
              max={motorConfig.maxPower / 1000}
              unit="kW"
              label="Power"
              warningZone={motorConfig.maxPower / 1000 * 0.8}
              dangerZone={motorConfig.maxPower / 1000 * 0.95}
              decimals={2}
            />
            <AnalogDial
              value={motorData.temperature}
              max={120}
              min={0}
              unit="°C"
              label="Temperature"
              warningZone={80}
              dangerZone={100}
            />
          </div>

          <div style={styles.controlsContainer}>
            <div style={styles.speedControl}>
              <div style={{ marginBottom: '10px', color: '#00ff41', fontWeight: 'bold' }}>
                Speed Control
              </div>
              <input
                type="range"
                min="0"
                max={motorConfig.maxRpm}
                value={targetSpeed}
                onChange={(e) => setTargetSpeed(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '10px' }}
              />
              <input
                type="number"
                value={targetSpeed}
                onChange={(e) => setTargetSpeed(Number(e.target.value))}
                style={styles.input}
                placeholder="Target RPM"
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <button 
                style={styles.button}
                onClick={() => setIsRecording(!isRecording)}
              >
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>
              <button 
                style={{...styles.button, backgroundColor: '#ffcc00'}}
                onClick={handleExportData}
                disabled={recordedDataRef.current.length === 0}
              >
                Export Data
              </button>
            </div>
          </div>
        </div>

        <div style={styles.rightPanel}>
          <SimpleLoadControl
            onLoadChange={handleLoadChange}
            currentLoad={currentLoad}
            maxLoad={100}
          />
          <TestControl
            onTestStart={handleTestStart}
            onTestStop={handleTestStop}
            isRunning={isTestRunning}
            motorData={motorData}
            onSpeedControl={setTargetSpeed}
            onLoadControl={(targetLoad: number) => {
              loadProfileRef.current = { type: 'constant', targetValue: targetLoad };
              setCurrentLoad(targetLoad);
            }}
            isConnected={true}
          />
        </div>
      </div>

      <DynoCharts
        data={dataHistory}
        selectedMetrics={['rpm', 'torque', 'power', 'efficiency']}
        timeWindow={30}
      />

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default DynoApp;