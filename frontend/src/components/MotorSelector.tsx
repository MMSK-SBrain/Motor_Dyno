import React, { useState } from 'react';

export interface MotorConfig {
  id: string;
  name: string;
  type: string;
  resistance: number;
  inductance: number;
  ke: number;
  kt: number;
  maxRpm: number;
  maxCurrent: number;
  maxPower: number;
  ratedVoltage: number;
  poles: number;
  inertia: number;
  damping: number;
}

const predefinedMotors: MotorConfig[] = [
  {
    id: 'bldc-2000w-48v',
    name: 'BLDC 2000W 48V',
    type: 'BLDC',
    resistance: 0.05,     // 50 mΩ - realistic for 2kW motor
    inductance: 0.0003,   // 0.3 mH
    ke: 0.032,           // V·s/rad for 48V at 1500 rad/s
    kt: 0.032,           // Nm/A (equals Ke in SI)
    maxRpm: 4000,
    maxCurrent: 45,      // 2000W / 48V ≈ 42A + margin
    maxPower: 2000,
    ratedVoltage: 48,
    poles: 8,
    inertia: 0.002,
    damping: 0.005
  },
  {
    id: 'bldc-5000w-96v',
    name: 'BLDC 5000W 96V',
    type: 'BLDC',
    resistance: 0.03,     // Lower resistance for higher power
    inductance: 0.0002,   
    ke: 0.064,           // V·s/rad for 96V at 1500 rad/s
    kt: 0.064,           // Nm/A
    maxRpm: 6000,
    maxCurrent: 55,      // 5000W / 96V ≈ 52A + margin
    maxPower: 5000,
    ratedVoltage: 96,
    poles: 10,
    inertia: 0.004,      // Higher inertia for bigger motor
    damping: 0.008
  },
  {
    id: 'bldc-1000w-24v',
    name: 'BLDC 1000W 24V',
    type: 'BLDC',
    resistance: 0.08,     // Higher resistance for smaller motor
    inductance: 0.0004,
    ke: 0.016,           // V·s/rad for 24V at 1500 rad/s  
    kt: 0.016,           // Nm/A
    maxRpm: 3000,
    maxCurrent: 45,      // 1000W / 24V ≈ 42A + margin
    maxPower: 1000,
    ratedVoltage: 24,
    poles: 6,
    inertia: 0.001,      // Lower inertia for smaller motor
    damping: 0.004
  }
];

interface MotorSelectorProps {
  onMotorSelect: (motor: MotorConfig) => void;
  currentMotor?: MotorConfig;
}

const MotorSelector: React.FC<MotorSelectorProps> = ({ onMotorSelect, currentMotor }) => {
  const [selectedMotor, setSelectedMotor] = useState<MotorConfig>(
    currentMotor || predefinedMotors[0]
  );
  const [showCustom, setShowCustom] = useState(false);
  const [customMotor, setCustomMotor] = useState<MotorConfig>({
    id: 'custom',
    name: 'Custom Motor',
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

  const handleMotorChange = (motorId: string) => {
    if (motorId === 'custom') {
      setShowCustom(true);
      setSelectedMotor(customMotor);
    } else {
      const motor = predefinedMotors.find(m => m.id === motorId);
      if (motor) {
        setSelectedMotor(motor);
        setShowCustom(false);
      }
    }
  };

  const handleLoadMotor = () => {
    onMotorSelect(selectedMotor);
  };

  const handleCustomChange = (field: keyof MotorConfig, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      const updated = { ...customMotor, [field]: numValue };
      setCustomMotor(updated);
      if (showCustom) {
        setSelectedMotor(updated);
      }
    }
  };

  const styles = {
    container: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      padding: '20px',
      color: '#ddd',
      fontFamily: 'sans-serif',
      width: '280px',
      boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a'
    },
    title: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#00ff41',
      borderBottom: '2px solid #00ff41',
      paddingBottom: '5px'
    },
    select: {
      width: '100%',
      padding: '8px',
      backgroundColor: '#333',
      color: '#ddd',
      border: '1px solid #555',
      borderRadius: '5px',
      fontSize: '14px',
      marginBottom: '15px'
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
      marginRight: '10px',
      transition: 'all 0.3s'
    },
    paramGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
      marginTop: '15px',
      fontSize: '13px'
    },
    paramRow: {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: '1px solid #333'
    },
    paramLabel: {
      color: '#888',
      fontSize: '12px'
    },
    paramValue: {
      color: '#00ff41',
      fontFamily: 'monospace',
      fontWeight: 'bold'
    },
    input: {
      width: '80px',
      padding: '4px',
      backgroundColor: '#222',
      color: '#00ff41',
      border: '1px solid #444',
      borderRadius: '3px',
      fontSize: '12px',
      fontFamily: 'monospace'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Motor Selection</div>
      
      <select 
        style={styles.select}
        value={showCustom ? 'custom' : selectedMotor.id}
        onChange={(e) => handleMotorChange(e.target.value)}
      >
        {predefinedMotors.map(motor => (
          <option key={motor.id} value={motor.id}>{motor.name}</option>
        ))}
        <option value="custom">Custom Motor...</option>
      </select>

      <div style={{ marginBottom: '15px' }}>
        <button style={styles.button} onClick={handleLoadMotor}>
          Load Motor
        </button>
        <button style={{...styles.button, backgroundColor: '#ffcc00'}} onClick={() => {}}>
          Save Config
        </button>
      </div>

      <div style={{ marginTop: '20px' }}>
        <div style={{...styles.title, fontSize: '16px'}}>Motor Parameters</div>
        
        {!showCustom ? (
          <div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Type:</span>
              <span style={styles.paramValue}>{selectedMotor.type}</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Resistance:</span>
              <span style={styles.paramValue}>{selectedMotor.resistance}Ω</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Inductance:</span>
              <span style={styles.paramValue}>{selectedMotor.inductance * 1000}mH</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Ke:</span>
              <span style={styles.paramValue}>{selectedMotor.ke} V/rpm</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Kt:</span>
              <span style={styles.paramValue}>{selectedMotor.kt} Nm/A</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Max RPM:</span>
              <span style={styles.paramValue}>{selectedMotor.maxRpm}</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Max Current:</span>
              <span style={styles.paramValue}>{selectedMotor.maxCurrent}A</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Rated Voltage:</span>
              <span style={styles.paramValue}>{selectedMotor.ratedVoltage}V</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Max Power:</span>
              <span style={styles.paramValue}>{selectedMotor.maxPower}W</span>
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Poles:</span>
              <span style={styles.paramValue}>{selectedMotor.poles}</span>
            </div>
          </div>
        ) : (
          <div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Resistance:</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={customMotor.resistance}
                onChange={(e) => handleCustomChange('resistance', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Inductance (H):</span>
              <input
                style={styles.input}
                type="number"
                step="0.0001"
                value={customMotor.inductance}
                onChange={(e) => handleCustomChange('inductance', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Ke (V/rpm):</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={customMotor.ke}
                onChange={(e) => handleCustomChange('ke', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Kt (Nm/A):</span>
              <input
                style={styles.input}
                type="number"
                step="0.01"
                value={customMotor.kt}
                onChange={(e) => handleCustomChange('kt', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Max RPM:</span>
              <input
                style={styles.input}
                type="number"
                step="100"
                value={customMotor.maxRpm}
                onChange={(e) => handleCustomChange('maxRpm', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Max Current:</span>
              <input
                style={styles.input}
                type="number"
                step="1"
                value={customMotor.maxCurrent}
                onChange={(e) => handleCustomChange('maxCurrent', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Voltage (V):</span>
              <input
                style={styles.input}
                type="number"
                step="1"
                value={customMotor.ratedVoltage}
                onChange={(e) => handleCustomChange('ratedVoltage', e.target.value)}
              />
            </div>
            <div style={styles.paramRow}>
              <span style={styles.paramLabel}>Power (W):</span>
              <input
                style={styles.input}
                type="number"
                step="100"
                value={customMotor.maxPower}
                onChange={(e) => handleCustomChange('maxPower', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MotorSelector;