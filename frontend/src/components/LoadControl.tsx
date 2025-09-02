import React, { useState } from 'react';

// Enhanced LoadProfile interface for Phase 2 Advanced Load Control
export interface LoadProfile {
  type: 'constant' | 'ramp' | 'step' | 'sine' | 'custom';
  targetValue: number;
  
  // Ramp profile parameters
  startLoad?: number;
  endLoad?: number;
  rampTime?: number;
  rampRate?: number;
  
  // Step profile parameters
  baseLoad?: number;
  stepLoad?: number;
  stepTime?: number;
  
  // Sine wave profile parameters
  frequency?: number;
  amplitude?: number;
  sineBaseLoad?: number;
  
  // Custom profile parameters
  customPoints?: Array<{time: number, load: number}>;
  duration?: number;
}

// Default brake model (Eddy Current - most common in dyno testing)
// Physics: Torque = k * speed^2 * brake_current (built into motor simulation)

interface LoadControlProps {
  onLoadChange: (load: LoadProfile) => void;
  currentLoad: number;
  maxLoad: number;
}

const LoadControl: React.FC<LoadControlProps> = ({ 
  onLoadChange, 
  currentLoad, 
  maxLoad 
}) => {
  const [loadType, setLoadType] = useState<LoadProfile['type']>('constant');
  const [targetLoad, setTargetLoad] = useState(0);
  
  // Ramp profile parameters
  const [startLoad, setStartLoad] = useState(0);
  const [endLoad, setEndLoad] = useState(50);
  const [rampTime, setRampTime] = useState(10);
  
  // Step profile parameters
  const [baseLoad, setBaseLoad] = useState(10);
  const [stepLoad, setStepLoad] = useState(50);
  const [stepTime, setStepTime] = useState(5);
  
  // Sine wave parameters
  const [frequency, setFrequency] = useState(0.5);
  const [amplitude, setAmplitude] = useState(10);
  const [sineBaseLoad, setSineBaseLoad] = useState(20);
  
  // Custom profile parameters
  const [customPoints, setCustomPoints] = useState<Array<{time: number, load: number}>>([]);
  const [csvInput, setCsvInput] = useState('');
  
  // Default eddy current brake model parameters (internal use)
  // These provide realistic dyno brake behavior without UI complexity

  const handleApplyLoad = () => {
    let profile: LoadProfile = {
      type: loadType,
      targetValue: targetLoad
    };
    
    switch (loadType) {
      case 'ramp':
        profile = {
          ...profile,
          startLoad,
          endLoad,
          rampTime,
          rampRate: Math.abs(endLoad - startLoad) / rampTime
        };
        break;
      case 'step':
        profile = {
          ...profile,
          baseLoad,
          stepLoad,
          stepTime
        };
        break;
      case 'sine':
        profile = {
          ...profile,
          sineBaseLoad,
          frequency,
          amplitude
        };
        break;
      case 'custom':
        profile = {
          ...profile,
          customPoints,
          duration: customPoints.length > 0 ? Math.max(...customPoints.map(p => p.time)) : 0
        };
        break;
    }
    
    onLoadChange(profile);
  };
  
  
  const handleCsvImport = () => {
    try {
      const lines = csvInput.trim().split('\n');
      const points: Array<{time: number, load: number}> = [];
      
      lines.forEach((line, index) => {
        if (index === 0 && line.toLowerCase().includes('time')) return; // Skip header
        const [timeStr, loadStr] = line.split(',');
        const time = parseFloat(timeStr?.trim());
        const load = parseFloat(loadStr?.trim());
        
        if (!isNaN(time) && !isNaN(load)) {
          points.push({ time, load });
        }
      });
      
      if (points.length > 0) {
        setCustomPoints(points.sort((a, b) => a.time - b.time));
        setLoadType('custom');
        alert(`Successfully imported ${points.length} load points`);
      } else {
        alert('No valid data points found. Format: time,load\n0,10\n5,20\n...');
      }
    } catch (error) {
      alert('Error parsing CSV data. Please check the format.');
    }
  };

  const styles = {
    container: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      padding: '20px',
      color: '#ddd',
      fontFamily: 'sans-serif',
      boxShadow: '5px 5px 15px #0a0a0a, -5px -5px 15px #3a3a3a'
    },
    title: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#ffcc00',
      borderBottom: '2px solid #ffcc00',
      paddingBottom: '5px'
    },
    currentLoad: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#00ff41',
      textAlign: 'center' as const,
      marginBottom: '15px',
      fontFamily: 'monospace'
    },
    loadBar: {
      width: '100%',
      height: '20px',
      backgroundColor: '#333',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '15px'
    },
    loadFill: {
      height: '100%',
      background: 'linear-gradient(90deg, #00ff41, #ffcc00, #ff3333)',
      transition: 'width 0.3s ease'
    },
    select: {
      width: '100%',
      padding: '8px',
      backgroundColor: '#333',
      color: '#ddd',
      border: '1px solid #555',
      borderRadius: '5px',
      fontSize: '14px',
      marginBottom: '10px'
    },
    input: {
      width: '100%',
      padding: '8px',
      backgroundColor: '#222',
      color: '#00ff41',
      border: '1px solid #444',
      borderRadius: '5px',
      fontSize: '14px',
      fontFamily: 'monospace',
      marginBottom: '10px'
    },
    label: {
      fontSize: '12px',
      color: '#888',
      marginBottom: '5px',
      display: 'block'
    },
    button: {
      width: '100%',
      backgroundColor: '#ffcc00',
      color: '#000',
      border: 'none',
      padding: '12px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
      transition: 'all 0.3s',
      marginTop: '10px'
    },
    emergency: {
      width: '100%',
      backgroundColor: '#ff3333',
      color: '#fff',
      border: 'none',
      padding: '12px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
      marginTop: '10px'
    }
  };

  const loadPercentage = (currentLoad / maxLoad) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.title}>Load Control</div>
      
      <div style={styles.currentLoad}>
        {currentLoad.toFixed(1)} Nm
      </div>
      
      <div style={styles.loadBar}>
        <div 
          style={{
            ...styles.loadFill,
            width: `${Math.min(loadPercentage, 100)}%`
          }}
        />
      </div>

      <label style={styles.label}>Load Type</label>
      <select 
        style={styles.select}
        value={loadType}
        onChange={(e) => setLoadType(e.target.value as LoadProfile['type'])}
      >
        <option value="constant">Constant Load</option>
        <option value="ramp">Ramp Load (Linear)</option>
        <option value="step">Step Load (Sudden Change)</option>
        <option value="sine">Sine Wave Load (Oscillating)</option>
        <option value="custom">Custom Profile (CSV)</option>
      </select>

      {loadType === 'constant' && (
        <>
          <label style={styles.label}>Target Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={targetLoad}
            onChange={(e) => setTargetLoad(parseFloat(e.target.value) || 0)}
          />
        </>
      )}

      {loadType === 'ramp' && (
        <>
          <label style={styles.label}>Start Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={startLoad}
            onChange={(e) => setStartLoad(parseFloat(e.target.value) || 0)}
          />
          <label style={styles.label}>End Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={endLoad}
            onChange={(e) => setEndLoad(parseFloat(e.target.value) || 0)}
          />
          <label style={styles.label}>Ramp Time (seconds)</label>
          <input
            style={styles.input}
            type="number"
            min="0.1"
            max="120"
            step="0.1"
            value={rampTime}
            onChange={(e) => setRampTime(parseFloat(e.target.value) || 1)}
          />
          <div style={{...styles.label, color: '#666', fontSize: '10px'}}>
            Rate: {((endLoad - startLoad) / rampTime).toFixed(2)} Nm/s
          </div>
        </>
      )}

      {loadType === 'step' && (
        <>
          <label style={styles.label}>Base Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={baseLoad}
            onChange={(e) => setBaseLoad(parseFloat(e.target.value) || 0)}
          />
          <label style={styles.label}>Step Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={stepLoad}
            onChange={(e) => setStepLoad(parseFloat(e.target.value) || 0)}
          />
          <label style={styles.label}>Step Time (seconds)</label>
          <input
            style={styles.input}
            type="number"
            min="0.1"
            max="120"
            step="0.1"
            value={stepTime}
            onChange={(e) => setStepTime(parseFloat(e.target.value) || 1)}
          />
        </>
      )}

      {loadType === 'sine' && (
        <>
          <label style={styles.label}>Base Load (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad}
            step="0.1"
            value={sineBaseLoad}
            onChange={(e) => setSineBaseLoad(parseFloat(e.target.value) || 0)}
          />
          <label style={styles.label}>Amplitude (Nm)</label>
          <input
            style={styles.input}
            type="number"
            min="0"
            max={maxLoad/2}
            step="0.1"
            value={amplitude}
            onChange={(e) => setAmplitude(parseFloat(e.target.value) || 10)}
          />
          <label style={styles.label}>Frequency (Hz)</label>
          <input
            style={styles.input}
            type="number"
            min="0.01"
            max="5"
            step="0.01"
            value={frequency}
            onChange={(e) => setFrequency(parseFloat(e.target.value) || 0.5)}
          />
          <div style={{...styles.label, color: '#666', fontSize: '10px'}}>
            Range: {(sineBaseLoad - amplitude).toFixed(1)} to {(sineBaseLoad + amplitude).toFixed(1)} Nm
          </div>
        </>
      )}

      {loadType === 'custom' && (
        <>
          <label style={styles.label}>CSV Import (time,load)</label>
          <textarea
            style={{...styles.input, height: '80px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px'}}
            placeholder="time,load\n0,10\n5,25\n10,50\n15,20"
            value={csvInput}
            onChange={(e) => setCsvInput(e.target.value)}
          />
          <button 
            style={{...styles.button, backgroundColor: '#00ccff', marginBottom: '10px'}}
            onClick={handleCsvImport}
          >
            Import CSV Data
          </button>
          {customPoints.length > 0 && (
            <div style={{...styles.label, color: '#00ff41'}}>
              ✓ {customPoints.length} points loaded ({customPoints[0]?.time}s - {customPoints[customPoints.length-1]?.time}s)
            </div>
          )}
        </>
      )}

      {/* Simplified Load Control - Brake physics handled internally */}
      
      <button 
        style={{...styles.button, marginTop: '15px'}}
        onClick={handleApplyLoad}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffdd44'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffcc00'}
      >
        Apply Load Profile
      </button>

    </div>
  );
};

export default LoadControl;