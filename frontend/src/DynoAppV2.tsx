import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AnalogDial from './components/AnalogDial';
import MotorSelector, { MotorConfig } from './components/MotorSelector';
import LoadControl, { LoadProfile } from './components/LoadControl';
import TestControl, { TestSequence } from './components/TestControl';
import TestResults from './components/TestResults';
import TestReporting from './components/TestReporting';
import useTestSequenceEngine, { TestResult } from './components/TestSequenceEngine';
import SimulationValidator from './utils/SimulationValidator';

// Simple Line Graph Component
interface SimpleGraphProps {
  data: DataPoint[];
  metric: 'rpm' | 'current' | 'torque' | 'power' | 'backEmf';
  width?: number;
  height?: number;
  maxPoints?: number;
  yMin?: number;
  yMax?: number;
}

const SimpleGraph: React.FC<SimpleGraphProps> = ({ data, metric, width = 400, height = 200, maxPoints = 60, yMin, yMax }) => {
  // Get recent data points
  const recentData = data.slice(-maxPoints);
  
  if (recentData.length < 2) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        No data
      </div>
    );
  }

  // Get values for the metric
  const values = recentData.map(d => d[metric]);
  const times = recentData.map(d => d.time);
  
  // Use fixed Y-axis range if provided, otherwise auto-scale
  const minValue = yMin !== undefined ? yMin : Math.min(...values);
  const maxValue = yMax !== undefined ? yMax : Math.max(...values);
  const valueRange = maxValue - minValue || 1;
  
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = maxTime - minTime || 1;

  // Create SVG path
  const points = recentData.map((d, i) => {
    const x = (times[i] - minTime) / timeRange * (width - 40) + 20;
    const y = height - 20 - ((values[i] - minValue) / valueRange * (height - 40));
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(' L ')}`;

  return (
    <svg width={width} height={height} style={{ background: '#111', borderRadius: '5px' }}>
      {/* Grid lines */}
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#333" strokeWidth="0.5"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      {/* Data line */}
      <path
        d={pathData}
        fill="none"
        stroke="#00ff41"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Value labels - show fixed range values */}
      <text x="5" y="15" fill="#666" fontSize="10">{maxValue.toFixed(1)}</text>
      <text x="5" y={height - 5} fill="#666" fontSize="10">{minValue.toFixed(1)}</text>
    </svg>
  );
};

// BLDC Motor Simulation (same as before)
class BLDCMotorSimulation {
  private resistance: number;
  private inductance: number;
  private ke: number;
  private kt: number;
  private inertia: number;
  private damping: number;
  private maxCurrent: number;
  private maxRpm: number;
  private speed: number = 0;
  private current: number = 0;
  private temperature: number = 25;
  private position: number = 0; // Rotor electrical position in radians
  private poles: number = 8; // Number of poles (from motor config)
  private previousTorque: number = 0; // For torque smoothing

  constructor(config: MotorConfig) {
    this.resistance = config.resistance;
    this.inductance = config.inductance;
    this.ke = config.ke;
    this.kt = config.kt;
    this.inertia = config.inertia;
    this.damping = config.damping;
    this.maxCurrent = config.maxCurrent;
    this.maxRpm = config.maxRpm;
    this.poles = config.poles || 8; // Default to 8 poles if not specified
  }

  // Calculate trapezoidal back EMF for BLDC motor
  private calculateTrapezoidalBackEmf(): number {
    // Convert rotor position to electrical angle (0 to 2π per pole pair)
    const polePairs = this.poles / 2;
    const electricalAngle = (this.position * polePairs) % (2 * Math.PI);
    
    // Trapezoidal waveform: 120° flat top, 60° transitions
    // Normalize angle to 0-360° equivalent (0 to 2π)
    const angleDeg = (electricalAngle * 180) / Math.PI;
    
    let shapeFactor = 0;
    
    if (angleDeg >= 0 && angleDeg < 30) {
      // Rising transition (0° to 30°)
      shapeFactor = angleDeg / 30;
    } else if (angleDeg >= 30 && angleDeg < 150) {
      // Positive flat top (30° to 150°)
      shapeFactor = 1.0;
    } else if (angleDeg >= 150 && angleDeg < 210) {
      // Falling transition (150° to 210°) 
      shapeFactor = 1.0 - (angleDeg - 150) / 60;
    } else if (angleDeg >= 210 && angleDeg < 330) {
      // Negative flat top (210° to 330°)
      shapeFactor = -1.0;
    } else {
      // Rising transition (330° to 360°)
      shapeFactor = -1.0 + (angleDeg - 330) / 30;
    }
    
    // Back EMF = ke * speed * shape_factor
    return this.ke * this.speed * shapeFactor;
  }

  step(voltage: number, loadTorque: number, dt: number = 0.001) {
    const inputVoltage = voltage; // Store original PWM voltage for calculations
    voltage = Math.max(0, Math.min(150, voltage));
    loadTorque = Math.max(0, Math.min(100, loadTorque));
    dt = Math.min(0.01, dt);
    
    // Update rotor position based on speed
    this.position += this.speed * dt;
    this.position = this.position % (2 * Math.PI); // Keep within 0 to 2π
    
    // Calculate trapezoidal back EMF for BLDC motor
    const backEmf = this.calculateTrapezoidalBackEmf();
    const di_dt = (voltage - backEmf - this.resistance * this.current) / this.inductance;
    
    // Add current smoothing to simulate realistic electrical time constant
    // Real motors have inductance that naturally smooths current changes
    const targetCurrent = this.current + di_dt * dt;
    const smoothingFactor = 0.85; // 85% previous + 15% new (adds natural smoothing)
    this.current = this.current * smoothingFactor + targetCurrent * (1 - smoothingFactor);
    this.current = Math.max(-this.maxCurrent, Math.min(this.maxCurrent, this.current));
    
    // Debug motor electrical equation (sample occasionally)
    if (voltage > 10 && Math.random() < 0.01) {
      console.log(`MOTOR ELEC: V=${voltage.toFixed(1)}V, BackEMF=${backEmf.toFixed(2)}V, R*I=${(this.resistance * this.current).toFixed(2)}V, di/dt=${di_dt.toFixed(1)}A/s, I=${this.current.toFixed(2)}A`);
    }
    
    // Calculate electrical torque with some smoothing for realistic behavior
    const instantTorque = this.kt * this.current;
    // Add torque smoothing (real motors have mechanical inertia effects)
    if (!(this as any).previousTorque) (this as any).previousTorque = instantTorque;
    const torqueSmoothing = 0.9; // 90% previous + 10% new
    const electricalTorque = (this as any).previousTorque * torqueSmoothing + instantTorque * (1 - torqueSmoothing);
    (this as any).previousTorque = electricalTorque;
    const friction = this.damping * this.speed + 0.005 * Math.sign(this.speed);
    const netTorque = electricalTorque - loadTorque - friction;
    const acceleration = netTorque / this.inertia;
    
    this.speed += acceleration * dt;
    // Convert max RPM to rad/s for speed limiting
    const maxSpeedRad = (this.maxRpm * Math.PI) / 30;
    this.speed = Math.max(0, Math.min(maxSpeedRad, this.speed));
    
    const powerLoss = Math.abs(this.current * this.current * this.resistance);
    const tempRise = powerLoss * 0.0005;
    const cooling = (this.temperature - 25) * 0.002;
    this.temperature += (tempRise - cooling) * dt / 0.001;
    this.temperature = Math.max(25, Math.min(120, this.temperature));
    
    const speedRpm = (this.speed * 30) / Math.PI;
    const mechanicalPower = Math.abs(electricalTorque * this.speed); // Mechanical power output (Watts)
    const electricalPower = Math.abs(voltage * this.current); // Electrical power input (Watts)
    const efficiency = electricalPower > 0.1 ? (mechanicalPower / electricalPower) * 100 : 0;
    
    // Return DC bus voltage (48V) instead of PWM modulated voltage for realistic display
    const dcBusVoltage = 48.0; // What you'd actually measure on motor terminals
    
    return {
      speed: this.speed,
      speedRpm,
      current: this.current,
      torque: electricalTorque,
      power: mechanicalPower,
      voltage: dcBusVoltage, // Display actual DC bus voltage, not PWM modulated
      temperature: this.temperature,
      efficiency: Math.min(100, Math.max(0, efficiency)),
      backEmf: backEmf // Trapezoidal back EMF waveform
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
  backEmf: number;
}

const DynoAppV2: React.FC = () => {
  const [motorConfig, setMotorConfig] = useState<MotorConfig>({
    id: 'bldc-2000w-48v',
    name: 'BLDC 2000W 48V',
    type: 'BLDC',
    resistance: 0.05,     // Lower resistance for better efficiency
    inductance: 0.001,    // Increased inductance for stability (1mH)
    ke: 0.142,           // Ke in V·s/rad for 2000W motor (calculated for proper power)
    kt: 0.142,           // Kt = Ke for SI units (6.37 Nm / 45A = 0.142)
    maxRpm: 4000,
    maxCurrent: 45,      // 2000W / 48V ≈ 42A
    maxPower: 2000,
    ratedVoltage: 48,
    poles: 8,
    inertia: 0.002,      // Slightly higher inertia
    damping: 0.005       // Lower damping
  });

  const [motorData, setMotorData] = useState({
    rpm: 0,
    torque: 0,
    power: 0,
    voltage: 48,
    current: 0,
    temperature: 25,
    efficiency: 0,
    pwmDutyCycle: 0
  });

  // Ultra-heavy smoothing filters for display values (2+ second stability)
  const smoothingFactors = useMemo(() => ({
    voltage: 0.9985,    // Ultra-heavy smoothing - 2+ seconds stability
    current: 0.998,     // Ultra-heavy smoothing - 2+ seconds stability  
    efficiency: 0.9975, // Ultra-heavy smoothing - 2+ seconds stability
    rpm: 0.80,          // Much lighter smoothing for RPM for diagnosis
    torque: 0.90,       // Moderate smoothing for torque
    power: 0.90,        // Moderate smoothing for power
    temperature: 0.98   // Very light smoothing for temperature
  }), []);

  const smoothedValues = useRef({
    voltage: 48,
    current: 0,
    efficiency: 0,
    rpm: 0,
    torque: 0,
    power: 0,
    temperature: 25,
    pwmDutyCycle: 0
  });

  const [dataHistory, setDataHistory] = useState<DataPoint[]>([]);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentLoad, setCurrentLoad] = useState(0);
  // Default eddy current brake physics (built into motor simulation)
  // No UI controls needed - uses realistic dyno brake behavior
  // Real dyno equipment parameters - Cascaded Control for BLDC motors
  const [targetSpeed, setTargetSpeed] = useState(0); // Target speed in RPM
  const [targetCurrent, setTargetCurrent] = useState(0); // Target current in A
  const [targetTorque, setTargetTorque] = useState(0); // Target torque in Nm
  const [targetVoltage, setTargetVoltage] = useState(motorConfig.ratedVoltage); // Target voltage in V
  const [cascadedEnabled, setCascadedEnabled] = useState(true); // Cascaded controller on/off
  const [controlMode, setControlMode] = useState<'speed' | 'current' | 'torque' | 'voltage'>('speed'); // Default to Speed control
  
  // BLDC motor control parameters
  const maxSpeed = motorConfig.maxRpm;
  const currentTargetSpeed = targetSpeed; // Direct RPM control for BLDC
  
  // UI State
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [validatorOpen, setValidatorOpen] = useState(false);
  const [selectedMetrics] = useState(['rpm', 'torque', 'power', 'efficiency']);
  const [showTestResults, setShowTestResults] = useState(false);
  const [showTestReports, setShowTestReports] = useState(false);
  const [professionalTestResults, setProfessionalTestResults] = useState<TestResult[]>([]);
  
  const motorRef = useRef<BLDCMotorSimulation | null>(null);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(Date.now());
  const loadProfileRef = useRef<LoadProfile>({ type: 'constant', targetValue: 0 });
  const loadProfileStartTimeRef = useRef<number>(0);
  // Fixed: Removed problematic brake constant that was limiting motor speed to 339 RPM
  const defaultBrakeConstant = 0.0;
  const testSequenceRef = useRef<TestSequence | null>(null);
  const testStartTimeRef = useRef<number>(0);
  const recordedDataRef = useRef<DataPoint[]>([]);
  const speedIntegralRef = useRef<number>(0);
  const currentIntegralRef = useRef<number>(0);
  const lastSpeedErrorRef = useRef<number>(0);
  const lastGraphUpdateRef = useRef<number>(0);
  const prevTargetSpeedRef = useRef<number>(0);
  
  // Filtered data for smooth graph display (separate from actual motor data)
  const [filteredDataHistory, setFilteredDataHistory] = useState<DataPoint[]>([]);
  
  // Time-based display updates for ultra-stable values
  const lastDisplayUpdateRef = useRef<number>(Date.now());
  const displayUpdateInterval = 500; // Update display every 500ms (2Hz) for voltage/current/efficiency
  
  // Previous display values for hysteresis
  const lastDisplayValues = useRef({
    voltage: 48,
    current: 0,
    efficiency: 0
  });

  // Minimum change thresholds to trigger display update
  const changeThresholds = useMemo(() => ({
    voltage: 1.0,     // Must change by at least 1V
    current: 0.5,     // Must change by at least 0.5A
    efficiency: 2.0   // Must change by at least 2%
  }), []);

  useEffect(() => {
    motorRef.current = new BLDCMotorSimulation(motorConfig);
  }, [motorConfig]);

  // Professional test engine
  const professionalTestEngine = useTestSequenceEngine({
    motorData,
    onSpeedControl: setTargetSpeed,
    onLoadControl: (targetLoad: number) => {
      loadProfileRef.current = { type: 'constant', targetValue: targetLoad };
    },
    onTestComplete: (result: TestResult) => {
      setProfessionalTestResults(prev => [result, ...prev.slice(0, 19)]); // Keep last 20 results
    },
    onTestProgress: (progress: number, phase: string) => {
      // Progress updates handled by TestResults component
      console.log(`Test Progress: ${progress.toFixed(1)}% - ${phase}`);
    },
    isConnected: true // Always connected in simulation
  });

  const simulate = useCallback(() => {
    if (!motorRef.current) return;

    const now = Date.now();
    // 100Hz control loop - sufficient for online simulation (10ms timestep)
    const dt = 0.01; // Fixed 10ms timestep for stable online control
    const realDt = (now - lastTimeRef.current) / 1000;
    
    // Skip if called too frequently (maintain 100Hz max)
    if (realDt < 0.008) {
      animationRef.current = requestAnimationFrame(simulate);
      return;
    }
    
    lastTimeRef.current = now;

    // Enhanced load profile calculation
    let load = currentLoad;
    const profile = loadProfileRef.current;
    const profileTime = (now - loadProfileStartTimeRef.current) / 1000;
    
    switch (profile.type) {
      case 'constant':
        load = profile.targetValue;
        if (Math.abs(load - currentLoad) > 0.1) {
          setCurrentLoad(load);
        }
        break;
        
      case 'ramp':
        if (profile.startLoad !== undefined && profile.endLoad !== undefined && profile.rampTime !== undefined) {
          const progress = Math.min(profileTime / profile.rampTime, 1);
          load = profile.startLoad + (profile.endLoad - profile.startLoad) * progress;
          setCurrentLoad(load);
        }
        break;
        
      case 'step':
        if (profile.baseLoad !== undefined && profile.stepLoad !== undefined && profile.stepTime !== undefined) {
          load = profileTime >= profile.stepTime ? profile.stepLoad : profile.baseLoad;
          setCurrentLoad(load);
        }
        break;
        
      case 'sine':
        if (profile.sineBaseLoad !== undefined && profile.frequency !== undefined && profile.amplitude !== undefined) {
          load = profile.sineBaseLoad + profile.amplitude * Math.sin(2 * Math.PI * profile.frequency * profileTime);
          setCurrentLoad(load);
        }
        break;
        
      case 'custom':
        if (profile.customPoints && profile.customPoints.length > 0) {
          // Linear interpolation between custom points
          const points = profile.customPoints;
          if (profileTime <= points[0].time) {
            load = points[0].load;
          } else if (profileTime >= points[points.length - 1].time) {
            load = points[points.length - 1].load;
          } else {
            // Find surrounding points and interpolate
            for (let i = 0; i < points.length - 1; i++) {
              if (profileTime >= points[i].time && profileTime <= points[i + 1].time) {
                const t = (profileTime - points[i].time) / (points[i + 1].time - points[i].time);
                load = points[i].load + (points[i + 1].load - points[i].load) * t;
                break;
              }
            }
          }
          setCurrentLoad(load);
        }
        break;
    }
    
    load = Math.max(0, Math.min(100, load));

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

    let voltage: number;
    
    if (controlMode === 'speed' && cascadedEnabled) {
      // Cascaded Speed Control Mode (Industry Standard BLDC/PMSM Controller)
      // Speed Controller generates current reference -> Current Controller generates voltage
      const targetSpeedRad = (currentTargetSpeed * Math.PI / 30);
      const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
      const speedError = targetSpeedRad - currentSpeedRad;
      
      // Reset integral terms if target speed changes significantly or motor starts/stops
      if (Math.abs(currentTargetSpeed - prevTargetSpeedRef.current) > 100 || (currentTargetSpeed === 0) !== (prevTargetSpeedRef.current === 0)) {
        speedIntegralRef.current = 0;
        currentIntegralRef.current = 0;
        console.log(`Integral reset: target changed from ${prevTargetSpeedRef.current} to ${currentTargetSpeed} RPM`);
      }
      prevTargetSpeedRef.current = currentTargetSpeed;

      if (currentTargetSpeed === 0) {
        voltage = 0;
        speedIntegralRef.current = 0; // Reset when stopped
        currentIntegralRef.current = 0;
      } else {
        // Speed controller generates torque/current reference (PID controller)
        // Much more conservative gains for stability
        const kp_speed = 0.8; // Reduced proportional gain for stability
        const ki_speed = 0.5; // Reduced integral gain to prevent oscillations
        const kd_speed = 0.01; // Very small derivative gain
        
        // Only apply PID correction if speed error is significant (mini-deadband)
        const speedErrorRpm = Math.abs(speedError * 30 / Math.PI);
        let targetCurrentFromSpeed = 0;
        
        if (speedErrorRpm > 20) { // 20 RPM mini-deadband for stability
          // PID controller for speed loop (generates current reference)
          // Update integral term properly
          if (!speedIntegralRef.current) speedIntegralRef.current = 0;
          speedIntegralRef.current += speedError * 0.01; // dt = 10ms
          // Anti-windup: much tighter integral limits
          speedIntegralRef.current = Math.max(-3.0, Math.min(3.0, speedIntegralRef.current));
          
          // Derivative term with filtering to reduce noise
          const speedErrorDerivative = (speedError - lastSpeedErrorRef.current) / 0.01;
          lastSpeedErrorRef.current = speedError;
          
          const targetTorque = kp_speed * speedError + ki_speed * speedIntegralRef.current + kd_speed * speedErrorDerivative;
          targetCurrentFromSpeed = Math.max(-motorConfig.maxCurrent, Math.min(motorConfig.maxCurrent, targetTorque / motorConfig.kt));
        } else {
          // Within mini-deadband: gentle feedforward only
          const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
          const backEmfCurrent = (motorConfig.ke * currentSpeedRad) / motorConfig.resistance;
          targetCurrentFromSpeed = Math.max(0, Math.min(motorConfig.maxCurrent * 0.2, backEmfCurrent * 1.1));
          
          // Slowly decay integral term
          speedIntegralRef.current *= 0.95;
          lastSpeedErrorRef.current = speedError;
        }
        
        // Current controller (inner loop) - high bandwidth
        const actualCurrent = motorRef.current ? motorRef.current['current'] : 0;
        const currentError = targetCurrentFromSpeed - actualCurrent;
        
        // Current controller with PWM voltage modulation
        // Much more conservative current loop gains
        const kp_current = 0.3; // Reduced current loop proportional gain
        const ki_current = 0.8; // Reduced current loop integral gain 
        
        // Update current integral with much tighter limits
        if (!currentIntegralRef.current) currentIntegralRef.current = 0;
        currentIntegralRef.current += currentError * 0.01; // dt = 10ms
        // Anti-windup: much tighter integral limits to prevent oscillations
        currentIntegralRef.current = Math.max(-2.0, Math.min(2.0, currentIntegralRef.current));
        
        // Current controller generates voltage reference
        const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
        const backEmf = motorConfig.ke * currentSpeedRad;
        const feedforwardVoltage = backEmf + (targetCurrentFromSpeed * motorConfig.resistance);
        const feedbackVoltage = kp_current * currentError + ki_current * currentIntegralRef.current;
        
        // PWM modulates this voltage (duty cycle controls effective voltage)
        const targetVoltage = feedforwardVoltage + feedbackVoltage;
        const dutyCycle = Math.max(0.01, Math.min(0.98, targetVoltage / motorConfig.ratedVoltage));
        
        // PWM effective voltage applied to motor
        voltage = dutyCycle * motorConfig.ratedVoltage;
        
        // Debug log for PWM voltage control (reduced frequency)
        if (currentTargetSpeed > 0 && Math.random() < 0.02) { // 2% logging frequency
          const pidStatus = speedErrorRpm > 20 ? 'ACTIVE' : 'STABLE';
          console.log(`PWM [${pidStatus}]: Target=${currentTargetSpeed}rpm, SpeedErr=${speedErrorRpm.toFixed(0)}rpm, TargetI=${targetCurrentFromSpeed.toFixed(1)}A, ActualI=${actualCurrent.toFixed(1)}A, V=${voltage.toFixed(1)}V`);
        }
      }
    } else if (controlMode === 'current' && cascadedEnabled) {
      // Direct Current Control Mode - PWM voltage control
      const actualCurrent = motorRef.current ? motorRef.current['current'] : 0;
      const currentError = targetCurrent - actualCurrent;
      const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
      
      // Current controller generates voltage
      const kp_current = 0.5;
      const backEmf = motorConfig.ke * currentSpeedRad;
      const feedforwardVoltage = backEmf + (targetCurrent * motorConfig.resistance);
      const feedbackVoltage = kp_current * currentError;
      
      const targetVoltage = feedforwardVoltage + feedbackVoltage;
      const dutyCycle = Math.max(0.05, Math.min(0.95, targetVoltage / motorConfig.ratedVoltage));
      voltage = dutyCycle * motorConfig.ratedVoltage;
    } else if (controlMode === 'torque' && cascadedEnabled) {
      // Direct Torque Control Mode - convert torque to current, then voltage
      const targetCurrentFromTorque = targetTorque / motorConfig.kt;
      const actualCurrent = motorRef.current ? motorRef.current['current'] : 0;
      const currentError = targetCurrentFromTorque - actualCurrent;
      const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
      
      // Current controller generates voltage
      const kp_current = 0.5;
      const backEmf = motorConfig.ke * currentSpeedRad;
      const feedforwardVoltage = backEmf + (targetCurrentFromTorque * motorConfig.resistance);
      const feedbackVoltage = kp_current * currentError;
      
      const targetVoltage = feedforwardVoltage + feedbackVoltage;
      const dutyCycle = Math.max(0.05, Math.min(0.95, targetVoltage / motorConfig.ratedVoltage));
      voltage = dutyCycle * motorConfig.ratedVoltage;
    } else {
      // Direct Voltage Control Mode (for testing/calibration only)
      voltage = controlMode === 'voltage' ? targetVoltage : 12; // Use target voltage or default
    }

    // Apply default eddy current brake physics for realistic dyno behavior
    // Eddy Current Brake: adds speed-dependent load (Torque = k * speed^2)
    const currentSpeedRad = motorRef.current ? motorRef.current['speed'] : 0;
    const brakeTorque = defaultBrakeConstant * Math.pow(currentSpeedRad, 2);
    let effectiveLoad = load + brakeTorque;
    
    // Debug brake torque issue
    if (currentTargetSpeed > 0) {
      console.log(`BRAKE DEBUG: Speed=${(currentSpeedRad * 30/Math.PI).toFixed(0)}rpm, Load=${load.toFixed(1)}Nm, BrakeTorque=${brakeTorque.toFixed(3)}Nm, EffectiveLoad=${effectiveLoad.toFixed(1)}Nm`);
    }
    
    // Limit load to reasonable range - motor can handle up to max torque
    const maxMotorTorque = motorConfig.kt * motorConfig.maxCurrent; // 0.142 * 45 = 6.39 Nm
    effectiveLoad = Math.max(0, Math.min(maxMotorTorque * 1.2, effectiveLoad)); // Allow 20% overload
    const result = motorRef.current.step(voltage, effectiveLoad, 0.001);
    
    // Store PWM voltage for duty cycle calculation
    const pwmDutyCyclePercent = (voltage / motorConfig.ratedVoltage) * 100;
    
    // Debug motor simulation results
    if (currentTargetSpeed > 0 && Math.random() < 0.1) { // 10% sampling to reduce spam
      console.log(`MOTOR DEBUG: ControlV=${voltage.toFixed(1)}V → MotorV=${result.voltage.toFixed(1)}V, RPM=${result.speedRpm.toFixed(0)}, I=${result.current.toFixed(1)}A`);
    }
    
    // Apply exponential smoothing to reduce display jitter
    smoothedValues.current.voltage = smoothedValues.current.voltage * smoothingFactors.voltage + 
                                     result.voltage * (1 - smoothingFactors.voltage);
    
    smoothedValues.current.current = smoothedValues.current.current * smoothingFactors.current + 
                                     result.current * (1 - smoothingFactors.current);
    
    smoothedValues.current.efficiency = smoothedValues.current.efficiency * smoothingFactors.efficiency + 
                                        result.efficiency * (1 - smoothingFactors.efficiency);
    
    smoothedValues.current.rpm = smoothedValues.current.rpm * smoothingFactors.rpm + 
                                 result.speedRpm * (1 - smoothingFactors.rpm);
    
    smoothedValues.current.torque = smoothedValues.current.torque * smoothingFactors.torque + 
                                    result.torque * (1 - smoothingFactors.torque);
    
    smoothedValues.current.power = smoothedValues.current.power * smoothingFactors.power + 
                                   (result.power / 1000) * (1 - smoothingFactors.power);
    
    smoothedValues.current.temperature = smoothedValues.current.temperature * smoothingFactors.temperature + 
                                         result.temperature * (1 - smoothingFactors.temperature);
    
    smoothedValues.current.pwmDutyCycle = smoothedValues.current.pwmDutyCycle * 0.9 + 
                                         pwmDutyCyclePercent * 0.1;
    
    // Update display values only every 500ms AND if significant change occurred
    const timeSinceLastUpdate = now - lastDisplayUpdateRef.current;
    const shouldUpdateByTime = timeSinceLastUpdate >= displayUpdateInterval;
    
    // Check if values have changed significantly (hysteresis)
    const voltageChanged = Math.abs(smoothedValues.current.voltage - lastDisplayValues.current.voltage) >= changeThresholds.voltage;
    const currentChanged = Math.abs(smoothedValues.current.current - lastDisplayValues.current.current) >= changeThresholds.current;
    const efficiencyChanged = Math.abs(smoothedValues.current.efficiency - lastDisplayValues.current.efficiency) >= changeThresholds.efficiency;
    
    const shouldUpdateByChange = voltageChanged || currentChanged || efficiencyChanged;
    const shouldUpdateDisplay = shouldUpdateByTime && shouldUpdateByChange;
    
    // Force update every 2 seconds regardless of change to prevent stale display
    const forceUpdate = timeSinceLastUpdate >= 2000;
    
    if (shouldUpdateDisplay || forceUpdate) {
      lastDisplayUpdateRef.current = now;
      lastDisplayValues.current = {
        voltage: smoothedValues.current.voltage,
        current: smoothedValues.current.current,
        efficiency: smoothedValues.current.efficiency
      };
      
      setMotorData({
        rpm: smoothedValues.current.rpm,
        torque: smoothedValues.current.torque,
        power: smoothedValues.current.power,
        voltage: smoothedValues.current.voltage,
        current: smoothedValues.current.current,
        temperature: smoothedValues.current.temperature,
        efficiency: smoothedValues.current.efficiency,
        pwmDutyCycle: smoothedValues.current.pwmDutyCycle
      });
    }

    const dataPoint: DataPoint = {
      time: now / 1000,
      rpm: result.speedRpm,
      torque: result.torque,
      power: result.power,
      voltage: result.voltage,
      current: result.current,
      efficiency: result.efficiency,
      temperature: result.temperature,
      backEmf: result.backEmf
    };

    setDataHistory(prev => {
      const updated = [...prev, dataPoint];
      return updated.slice(-300);
    });

    // Update filtered data for graphs at slower rate (5Hz) with exponential smoothing
    const GRAPH_UPDATE_INTERVAL = 200; // 200ms = 5Hz
    if (now - lastGraphUpdateRef.current >= GRAPH_UPDATE_INTERVAL) {
      lastGraphUpdateRef.current = now;
      
      setFilteredDataHistory(prev => {
        const lastFiltered = prev.length > 0 ? prev[prev.length - 1] : dataPoint;
        
        // Exponential filter: 70% previous + 30% new (smooth but responsive)
        const alpha = 0.3;
        const filteredPoint: DataPoint = {
          time: dataPoint.time,
          rpm: lastFiltered.rpm * (1 - alpha) + dataPoint.rpm * alpha,
          torque: lastFiltered.torque * (1 - alpha) + dataPoint.torque * alpha,
          power: lastFiltered.power * (1 - alpha) + dataPoint.power * alpha,
          voltage: lastFiltered.voltage * (1 - alpha) + dataPoint.voltage * alpha,
          current: lastFiltered.current * (1 - alpha) + dataPoint.current * alpha,
          efficiency: lastFiltered.efficiency * (1 - alpha) + dataPoint.efficiency * alpha,
          temperature: lastFiltered.temperature * (1 - alpha) + dataPoint.temperature * alpha,
          backEmf: (lastFiltered.backEmf || 0) * (1 - alpha) + dataPoint.backEmf * alpha
        };
        
        const updated = [...prev, filteredPoint];
        return updated.slice(-150); // Keep 150 points for graphs (30 seconds at 5Hz)
      });
    }

    if (isRecording) {
      recordedDataRef.current.push(dataPoint);
    }

    // 100Hz control loop - single requestAnimationFrame call
    animationRef.current = requestAnimationFrame(simulate);
  }, [currentLoad, currentTargetSpeed, maxSpeed, cascadedEnabled, targetCurrent, targetTorque, controlMode, targetVoltage, isTestRunning, motorConfig, isRecording, smoothingFactors, changeThresholds]);

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
    loadProfileStartTimeRef.current = Date.now();
    
    if (profile.type === 'constant') {
      setCurrentLoad(profile.targetValue);
    } else if (profile.type === 'ramp' && profile.startLoad !== undefined) {
      setCurrentLoad(profile.startLoad);
    } else if (profile.type === 'step' && profile.baseLoad !== undefined) {
      setCurrentLoad(profile.baseLoad);
    } else if (profile.type === 'sine' && profile.sineBaseLoad !== undefined) {
      setCurrentLoad(profile.sineBaseLoad);
    } else if (profile.type === 'custom' && profile.customPoints && profile.customPoints.length > 0) {
      setCurrentLoad(profile.customPoints[0].load);
    }
  };
  
  // Default brake physics handled automatically - no user controls needed

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
      'Time,RPM,Torque,Power,Voltage,Current,Efficiency,Temperature,BackEMF',
      ...recordedDataRef.current.map(d => 
        `${d.time},${d.rpm},${d.torque},${d.power},${d.voltage},${d.current},${d.efficiency},${d.temperature},${d.backEmf || 0}`
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
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden'
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px 20px',
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderBottom: '2px solid #333',
      boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
    },
    title: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#00ff41',
      textShadow: '0 0 10px rgba(0, 255, 65, 0.5)'
    },
    statusBar: {
      display: 'flex',
      gap: '20px',
      alignItems: 'center'
    },
    mainContent: {
      flex: 1,
      display: 'flex',
      position: 'relative' as const,
      overflow: 'hidden'
    },
    sidePanel: {
      position: 'absolute' as const,
      top: 0,
      height: '100%',
      width: '320px',
      background: 'linear-gradient(145deg, #1a1a1a, #222)',
      boxShadow: '0 0 20px rgba(0,0,0,0.8)',
      transition: 'transform 0.3s ease',
      zIndex: 10,
      overflowY: 'auto' as const,
      padding: '20px'
    },
    leftPanel: {
      left: 0,
      transform: leftPanelOpen ? 'translateX(0)' : 'translateX(-100%)'
    },
    rightPanel: {
      right: 0,
      transform: rightPanelOpen ? 'translateX(0)' : 'translateX(100%)'
    },
    panelToggle: {
      position: 'fixed' as const,
      top: '50%',
      transform: 'translateY(-50%)',
      width: '40px',
      height: '80px',
      background: '#00ff41',
      color: '#000',
      border: 'none',
      cursor: 'pointer',
      fontSize: '20px',
      fontWeight: 'bold',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 0 15px rgba(0, 255, 65, 0.5)',
      zIndex: 20,
      transition: 'all 0.3s ease'
    },
    leftToggle: {
      left: leftPanelOpen ? '320px' : '0px',
      borderRadius: '0 8px 8px 0'
    },
    rightToggle: {
      right: rightPanelOpen ? '320px' : '0px',
      borderRadius: '8px 0 0 8px'
    },
    centerContent: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '320px 1fr',
      gap: '15px',
      padding: '15px',
      marginLeft: '40px',
      marginRight: '40px',
      height: 'calc(100vh - 120px)'
    },
    leftControlPanel: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '15px'
    },
    rightGraphPanel: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: '15px',
      height: '100%'
    },
    dialsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)',
      gap: '10px',
      padding: '10px',
      background: 'linear-gradient(145deg, #1a1a1a, #222)',
      borderRadius: '8px',
      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
      height: '320px'
    },
    graphWindow: {
      background: 'linear-gradient(145deg, #1a1a1a, #222)',
      borderRadius: '10px',
      padding: '15px',
      boxShadow: 'inset 0 0 15px rgba(0,0,0,0.5)',
      textAlign: 'center' as const,
      border: '1px solid #333',
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%'
    },
    graphTitle: {
      color: '#00ff41',
      fontSize: '12px',
      fontWeight: 'bold' as const,
      margin: '0 0 5px 0',
      textTransform: 'uppercase' as const
    },
    graphValue: {
      color: '#ffffff',
      fontSize: '28px',
      fontWeight: 'bold' as const,
      margin: '10px 0'
    },
    graphUnit: {
      color: '#999',
      fontSize: '18px',
      fontWeight: 'normal' as const,
      marginLeft: '5px'
    },
    graphMini: {
      color: '#666',
      fontSize: '12px',
      marginTop: '8px'
    },
    controlCard: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '8px',
      padding: '12px',
      boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a'
    },
    infoGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '15px',
      marginBottom: '20px'
    },
    infoCard: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '8px',
      padding: '15px',
      textAlign: 'center' as const,
      boxShadow: '3px 3px 10px #0a0a0a'
    },
    infoLabel: {
      fontSize: '11px',
      color: '#888',
      marginBottom: '5px',
      textTransform: 'uppercase' as const
    },
    infoValue: {
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#00ff41',
      fontFamily: 'monospace'
    },
    infoUnit: {
      fontSize: '12px',
      color: '#666',
      marginLeft: '4px'
    },
    button: {
      backgroundColor: '#00ff41',
      color: '#000',
      border: 'none',
      padding: '10px 20px',
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
      padding: '12px 24px',
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
        <div style={styles.title}>Motor Dyno | LabonWheels by Reynlab</div>
        <div style={styles.statusBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#00ff41',
              animation: 'pulse 2s infinite'
            }} />
            <span>Connected • 1000 Hz</span>
          </div>
          {isRecording && <span style={{ color: '#ff3333' }}>● RECORDING</span>}
          
          {/* Data Recording Controls */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button 
              style={{
                padding: '6px 12px',
                backgroundColor: isRecording ? '#ff3333' : '#00ff41',
                color: isRecording ? '#fff' : '#000',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
              onClick={() => {
                if (!isRecording) {
                  setIsRecording(true);
                  recordedDataRef.current = [];
                } else {
                  setIsRecording(false);
                }
              }}
            >
              {isRecording ? 'STOP REC' : 'RECORD'}
            </button>
            <button 
              style={{
                padding: '6px 12px',
                backgroundColor: recordedDataRef.current.length > 0 ? '#ffcc00' : '#444',
                color: recordedDataRef.current.length > 0 ? '#000' : '#666',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: recordedDataRef.current.length > 0 ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
              onClick={handleExportData}
              disabled={recordedDataRef.current.length === 0}
            >
              EXPORT
            </button>
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

      <div style={styles.mainContent}>
        {/* Left Panel - Motor Selection */}
        <div style={{...styles.sidePanel, ...styles.leftPanel}}>
          <MotorSelector 
            onMotorSelect={handleMotorSelect}
            currentMotor={motorConfig}
          />
        </div>

        {/* Right Panel - Load Control & Test Controls */}
        <div style={{...styles.sidePanel, ...styles.rightPanel}}>
          <LoadControl
            onLoadChange={handleLoadChange}
            currentLoad={currentLoad}
            maxLoad={100}
          />
          
          <div style={{ marginTop: '20px' }}>
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
          
          {/* Professional Test Results Panel */}
          {showTestResults && (
            <div style={{ marginTop: '20px' }}>
              <TestResults
                currentTest={professionalTestEngine.currentTest}
                testResult={professionalTestEngine.testResult}
                isRunning={professionalTestEngine.isRunning}
                isPaused={professionalTestEngine.isPaused}
                onAbortTest={() => professionalTestEngine.abortTest('User requested abort')}
                onPauseTest={() => professionalTestEngine.setIsPaused(true)}
                onResumeTest={() => professionalTestEngine.setIsPaused(false)}
                motorData={motorData}
              />
            </div>
          )}
          
          {/* Professional Test Reporting Panel */}
          {showTestReports && (
            <div style={{ marginTop: '20px' }}>
              <TestReporting
                testResults={professionalTestResults}
                motorConfig={{
                  name: motorConfig.name,
                  type: motorConfig.type,
                  maxRpm: motorConfig.maxRpm,
                  maxPower: motorConfig.maxPower,
                  ratedVoltage: motorConfig.ratedVoltage
                }}
              />
            </div>
          )}
        </div>

        {/* Toggle Buttons - Now positioned independently */}
        <button 
          style={{...styles.panelToggle, ...styles.leftToggle}}
          onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          title="Motor Selection"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#44ff77';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#00ff41';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          {leftPanelOpen ? '◀' : '▶'}
        </button>

        <button 
          style={{...styles.panelToggle, ...styles.rightToggle}}
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          title="Load & Test Controls"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#44ff77';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#00ff41';
            e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
          }}
        >
          {rightPanelOpen ? '▶' : '◀'}
        </button>

        {/* Center Content */}
        <div style={styles.centerContent}>
          {/* Left Control Panel */}
          <div style={styles.leftControlPanel}>

            {/* Dials Grid */}
            <div style={styles.dialsGrid}>
              <AnalogDial
                value={motorData.rpm}
                max={motorConfig.maxRpm}
                unit="RPM"
                label="RPM"
                warningZone={motorConfig.maxRpm * 0.8}
                dangerZone={motorConfig.maxRpm * 0.95}
                size={150}
                showMarkings={false}
              />
              <AnalogDial
                value={motorData.temperature}
                max={120}
                min={0}
                unit="°C"
                label="Temperature"
                warningZone={80}
                dangerZone={100}
                size={150}
                showMarkings={false}
              />
              <AnalogDial
                value={motorData.voltage}
                max={60}
                min={0}
                unit="V"
                label="Voltage"
                warningZone={50}
                dangerZone={55}
                size={150}
                showMarkings={false}
              />
              <AnalogDial
                value={motorData.efficiency}
                max={100}
                min={0}
                unit="%"
                label="Efficiency"
                warningZone={80}
                dangerZone={90}
                decimals={0}
                size={150}
                showMarkings={false}
              />
            </div>

            {/* Speed Control Card */}
            <div style={{...styles.controlCard, padding: '10px'}}>
              <h3 style={{ color: '#00ff41', marginTop: 0, marginBottom: '8px', fontSize: '13px' }}>Speed Control</h3>
              <input
                type="range"
                min="0"
                max={motorConfig.maxRpm}
                step="10"
                value={targetSpeed}
                onChange={(e) => setTargetSpeed(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '15px' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '10px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Requested</div>
                  <div style={{ fontSize: '20px', color: '#00ff41', fontWeight: 'bold' }}>{targetSpeed}</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>RPM</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#888', marginBottom: '3px' }}>Motor</div>
                  <div style={{ fontSize: '20px', color: '#ffcc00', fontWeight: 'bold' }}>{Math.round(motorData.rpm)}</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>RPM</div>
                </div>
              </div>
              <button
                onClick={() => setTargetSpeed(0)}
                style={{
                  width: '100%',
                  padding: '6px',
                  backgroundColor: targetSpeed > 0 ? '#ff3333' : '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                STOP
              </button>
            </div>

          </div>

          {/* Right Graph Panel */}
          <div style={styles.rightGraphPanel}>
            {/* RPM Graph */}
            <div style={styles.graphWindow}>
              <h4 style={styles.graphTitle}>RPM - {motorData.rpm.toFixed(0)} rpm</h4>
              <SimpleGraph data={filteredDataHistory} metric="rpm" width={500} height={280} yMin={0} yMax={4000} />
              <div style={styles.graphMini}>
                Target: {targetSpeed} rpm
              </div>
            </div>
            
            {/* Current Graph */}
            <div style={styles.graphWindow}>
              <h4 style={styles.graphTitle}>Current - {Math.abs(motorData.current) < 0.1 ? '0.0' : motorData.current.toFixed(1)} A</h4>
              <SimpleGraph data={filteredDataHistory} metric="current" width={500} height={280} yMin={0} yMax={60} />
              <div style={styles.graphMini}>
                Max: {motorConfig.maxCurrent} A
              </div>
            </div>
            
            {/* Torque Output Graph */}
            <div style={styles.graphWindow}>
              <h4 style={styles.graphTitle}>Torque - {motorData.torque.toFixed(1)} Nm</h4>
              <SimpleGraph data={filteredDataHistory} metric="torque" width={500} height={280} yMin={0} yMax={15} />
              <div style={styles.graphMini}>
                Max: {(motorConfig.kt * motorConfig.maxCurrent).toFixed(1)} Nm
              </div>
            </div>
            
            {/* Back EMF Graph */}
            <div style={styles.graphWindow}>
              <h4 style={styles.graphTitle}>Back EMF - {(filteredDataHistory[filteredDataHistory.length - 1]?.backEmf || 0).toFixed(1)} V</h4>
              <SimpleGraph data={filteredDataHistory} metric="backEmf" width={500} height={280} yMin={-30} yMax={30} />
              <div style={styles.graphMini}>
                Trapezoidal BLDC Waveform
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simulation Validator Overlay */}
      <SimulationValidator
        motorData={motorData}
        motorConfig={motorConfig}
        targetSpeed={currentTargetSpeed}
        loadTorque={currentLoad}
        isVisible={validatorOpen}
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

export default DynoAppV2;