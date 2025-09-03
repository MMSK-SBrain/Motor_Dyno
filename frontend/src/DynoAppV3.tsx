import React, { useState, useEffect, useRef, useCallback } from 'react';
import AnalogDial from './components/AnalogDial';
import MotorSelector, { MotorConfig } from './components/MotorSelector';
import SimpleLoadControl from './components/SimpleLoadControl';
import { LoadProfile } from './components/LoadControl';
import TestControl, { TestSequence } from './components/TestControl';
import DynoCharts from './components/DynoCharts';

interface SimulationData {
  timestamp: number;
  speed_rpm: number;
  torque_nm: number;
  current_a: number;
  voltage_v: number;
  power_w: number;
  efficiency: number;
  temperature_c: number;
  target_speed_rpm?: number;
  target_current_a?: number;
  control_input?: number;
  load_torque?: number;
  duty_cycle?: number;
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  sessionId?: string;
  errorMessage?: string;
}

const DynoAppV3: React.FC = () => {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected'
  });
  
  // Motor and session management
  const [selectedMotorId, setSelectedMotorId] = useState('bldc-2000w-48v');
  const [availableMotors, setAvailableMotors] = useState<MotorConfig[]>([]);
  
  // Real-time data from backend
  const [motorData, setMotorData] = useState<SimulationData>({
    timestamp: 0,
    speed_rpm: 0,
    torque_nm: 0,
    current_a: 0,
    voltage_v: 0,
    power_w: 0,
    efficiency: 0,
    temperature_c: 25
  });
  
  const [dataHistory, setDataHistory] = useState<SimulationData[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  
  // Control inputs (sent to backend)
  const [targetSpeed, setTargetSpeed] = useState(0);
  const [currentLoad, setCurrentLoad] = useState(0);
  const [controlMode, setControlMode] = useState<'speed' | 'current' | 'voltage' | 'torque'>('speed');
  
  // Test management
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testSequence, setTestSequence] = useState<TestSequence | null>(null);
  
  // Refs for WebSocket and intervals
  const wsRef = useRef<WebSocket | null>(null);
  const recordedDataRef = useRef<SimulationData[]>([]);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // API base URL
  const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  
  // Load available motors from backend
  useEffect(() => {
    const loadMotors = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/motor`);
        const data = await response.json();
        
        // Convert backend motor data to frontend format
        const motors: MotorConfig[] = Object.entries(data.available_motors || {}).map(([id, info]: [string, any]) => ({
          id,
          name: info.name || id,
          type: info.type || 'BLDC',
          resistance: info.parameters?.resistance || 0.05,
          inductance: info.parameters?.inductance || 0.001,
          ke: info.parameters?.ke || 0.142,
          kt: info.parameters?.kt || 0.142,
          maxRpm: info.specifications?.max_speed_rpm || 4000,
          maxCurrent: info.specifications?.max_current_a || 50,
          maxPower: info.specifications?.rated_power_kw * 1000 || 2000,
          ratedVoltage: info.specifications?.rated_voltage_v || 48,
          poles: info.parameters?.pole_pairs * 2 || 8,
          inertia: info.parameters?.inertia || 0.001,
          damping: info.parameters?.friction || 0.01
        }));
        
        setAvailableMotors(motors);
      } catch (error) {
        console.error('Failed to load motors:', error);
        // Use default motor if backend is unavailable
        setAvailableMotors([{
          id: 'bldc-2000w-48v',
          name: 'BLDC 2000W 48V',
          type: 'BLDC',
          resistance: 0.05,
          inductance: 0.001,
          ke: 0.142,
          kt: 0.142,
          maxRpm: 4000,
          maxCurrent: 50,
          maxPower: 2000,
          ratedVoltage: 48,
          poles: 8,
          inertia: 0.001,
          damping: 0.01
        }]);
      }
    };
    
    loadMotors();
  }, []);

  // Start simulation session
  const startSimulation = useCallback(async () => {
    if (connectionState.status === 'connecting' || connectionState.status === 'connected') {
      return;
    }

    try {
      setConnectionState(prev => ({ ...prev, status: 'connecting' }));
      
      // Start simulation session
      const response = await fetch(`${API_BASE}/api/simulation/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          motor_id: selectedMotorId,
          control_mode: controlMode,
          initial_params: {
            target_speed_rpm: targetSpeed,
            load_torque_percent: currentLoad
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start simulation: ${response.status}`);
      }

      const sessionData = await response.json();
      const sessionId = sessionData.session_id;

      // Connect to WebSocket
      const wsUrl = `ws://localhost:8000/ws/${sessionId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionState({
          status: 'connected',
          sessionId: sessionId
        });
      };

      ws.onmessage = (event) => {
        try {
          const data: SimulationData = JSON.parse(event.data);
          
          // Update current motor data
          setMotorData(data);
          
          // Add to history (limit to last 300 points)
          setDataHistory(prev => {
            const updated = [...prev, data];
            return updated.slice(-300);
          });
          
          // Add to recorded data if recording
          if (isRecording) {
            recordedDataRef.current.push(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState(prev => ({
          ...prev,
          status: 'error',
          errorMessage: 'WebSocket connection error'
        }));
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
        
        // Auto-reconnect after delay
        if (connectionState.status === 'connected') {
          reconnectTimeoutRef.current = setTimeout(() => {
            startSimulation();
          }, 5000);
        }
      };

      wsRef.current = ws;

    } catch (error) {
      console.error('Failed to start simulation:', error);
      setConnectionState({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [selectedMotorId, controlMode, targetSpeed, currentLoad, connectionState.status, isRecording]);

  // Stop simulation
  const stopSimulation = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (connectionState.sessionId) {
      try {
        await fetch(`${API_BASE}/api/simulation/${connectionState.sessionId}/stop`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Failed to stop simulation:', error);
      }
    }

    setConnectionState({ status: 'disconnected' });
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
  }, [connectionState.sessionId]);

  // Send control updates to backend
  const updateControlParameters = useCallback(async (params: any) => {
    if (connectionState.status !== 'connected' || !connectionState.sessionId) {
      return;
    }

    try {
      await fetch(`${API_BASE}/api/simulation/${connectionState.sessionId}/control`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
    } catch (error) {
      console.error('Failed to update control parameters:', error);
    }
  }, [connectionState]);

  // Handle motor selection
  const handleMotorSelect = useCallback((motor: MotorConfig) => {
    if (connectionState.status === 'connected') {
      stopSimulation();
    }
    setSelectedMotorId(motor.id);
  }, [connectionState.status, stopSimulation]);

  // Handle control parameter changes
  useEffect(() => {
    if (connectionState.status === 'connected') {
      updateControlParameters({
        target_speed_rpm: targetSpeed,
        load_torque_percent: currentLoad,
        control_mode: controlMode
      });
    }
  }, [targetSpeed, currentLoad, controlMode, connectionState.status, updateControlParameters]);

  // Handle load changes
  const handleLoadChange = useCallback((profile: LoadProfile) => {
    const newLoad = profile.targetValue;
    setCurrentLoad(newLoad);
  }, []);

  // Test management
  const handleTestStart = useCallback((test: TestSequence) => {
    setTestSequence(test);
    setIsTestRunning(true);
    setIsRecording(true);
    recordedDataRef.current = [];
    
    if (connectionState.status === 'connected') {
      updateControlParameters({
        test_sequence: test
      });
    }
  }, [connectionState.status, updateControlParameters]);

  const handleTestStop = useCallback(() => {
    setIsTestRunning(false);
    setIsRecording(false);
    setTestSequence(null);
    
    if (connectionState.status === 'connected') {
      updateControlParameters({
        test_sequence: null
      });
    }
  }, [connectionState.status, updateControlParameters]);

  // Export recorded data
  const handleExportData = useCallback(() => {
    const csv = [
      'Time,RPM,Torque,Power,Voltage,Current,Efficiency,Temperature',
      ...recordedDataRef.current.map(d => 
        `${d.timestamp},${d.speed_rpm},${d.torque_nm},${d.power_w},${d.voltage_v},${d.current_a},${d.efficiency},${d.temperature_c}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dyno_data_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Emergency stop
  const emergencyStop = useCallback(() => {
    setTargetSpeed(0);
    setCurrentLoad(0);
    handleTestStop();
    
    if (connectionState.status === 'connected') {
      updateControlParameters({
        target_speed_rpm: 0,
        load_torque_percent: 0,
        emergency_stop: true
      });
    }
  }, [connectionState.status, updateControlParameters, handleTestStop]);

  // Auto-connect on mount
  useEffect(() => {
    if (availableMotors.length > 0 && connectionState.status === 'disconnected') {
      startSimulation();
    }
  }, [availableMotors, connectionState.status, startSimulation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSimulation();
    };
  }, [stopSimulation]);

  // Find current motor config
  const currentMotor = availableMotors.find(m => m.id === selectedMotorId) || availableMotors[0];

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
    connectionIndicator: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      backgroundColor: 
        connectionState.status === 'connected' ? '#00ff41' : 
        connectionState.status === 'connecting' ? '#ffcc00' : 
        connectionState.status === 'error' ? '#ff3333' : '#666',
      animation: connectionState.status === 'connecting' ? 'pulse 2s infinite' : 'none'
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
    },
    connectionButton: {
      backgroundColor: connectionState.status === 'connected' ? '#ff3333' : '#00ff41',
      color: connectionState.status === 'connected' ? '#fff' : '#000',
      border: 'none',
      padding: '10px 20px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '12px'
    }
  };

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.title}>Motor Dyno Control System V3</div>
        <div style={styles.statusBar}>
          <div style={styles.statusItem}>
            <div style={styles.connectionIndicator} />
            <span>{connectionState.status}</span>
            {connectionState.sessionId && <span>({connectionState.sessionId.substring(0, 8)})</span>}
          </div>
          <button 
            style={styles.connectionButton}
            onClick={connectionState.status === 'connected' ? stopSimulation : startSimulation}
          >
            {connectionState.status === 'connected' ? 'Disconnect' : 'Connect'}
          </button>
          <div style={styles.statusItem}>
            {isRecording && <span style={{ color: '#ff3333' }}>● REC</span>}
            {!isRecording && <span>Ready</span>}
          </div>
          <button 
            style={styles.emergencyStop}
            onClick={emergencyStop}
          >
            EMERGENCY STOP
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        <div style={styles.leftPanel}>
          <MotorSelector 
            onMotorSelect={handleMotorSelect}
            currentMotor={currentMotor}
            availableMotors={availableMotors}
          />
        </div>

        <div style={styles.centerPanel}>
          <div style={styles.dialsContainer}>
            <AnalogDial
              value={motorData.speed_rpm}
              max={currentMotor?.maxRpm || 4000}
              unit="RPM"
              label="Speed"
              warningZone={(currentMotor?.maxRpm || 4000) * 0.8}
              dangerZone={(currentMotor?.maxRpm || 4000) * 0.95}
            />
            <AnalogDial
              value={motorData.torque_nm}
              max={10}
              unit="Nm"
              label="Torque"
              warningZone={8}
              dangerZone={9}
            />
            <AnalogDial
              value={motorData.power_w / 1000}
              max={(currentMotor?.maxPower || 2000) / 1000}
              unit="kW"
              label="Power"
              warningZone={(currentMotor?.maxPower || 2000) / 1000 * 0.8}
              dangerZone={(currentMotor?.maxPower || 2000) / 1000 * 0.95}
              decimals={2}
            />
            <AnalogDial
              value={motorData.temperature_c}
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
                max={currentMotor?.maxRpm || 4000}
                value={targetSpeed}
                onChange={(e) => setTargetSpeed(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '10px' }}
                disabled={connectionState.status !== 'connected'}
              />
              <input
                type="number"
                value={targetSpeed}
                onChange={(e) => setTargetSpeed(Number(e.target.value))}
                style={styles.input}
                placeholder="Target RPM"
                disabled={connectionState.status !== 'connected'}
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
            disabled={connectionState.status !== 'connected'}
          />
          <TestControl
            onTestStart={handleTestStart}
            onTestStop={handleTestStop}
            isRunning={isTestRunning}
            motorData={{
              rpm: motorData.speed_rpm,
              torque: motorData.torque_nm,
              power: motorData.power_w / 1000, // Convert to kW
              voltage: motorData.voltage_v,
              current: motorData.current_a,
              temperature: motorData.temperature_c,
              efficiency: motorData.efficiency
            }}
            onSpeedControl={setTargetSpeed}
            onLoadControl={(targetLoad: number) => setCurrentLoad(targetLoad)}
            isConnected={connectionState.status === 'connected'}
            disabled={connectionState.status !== 'connected'}
          />
        </div>
      </div>

      <DynoCharts
        data={dataHistory.map(d => ({
          time: d.timestamp / 1000,
          rpm: d.speed_rpm,
          torque: d.torque_nm,
          power: d.power_w,
          voltage: d.voltage_v,
          current: d.current_a,
          efficiency: d.efficiency,
          temperature: d.temperature_c
        }))}
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

export default DynoAppV3;