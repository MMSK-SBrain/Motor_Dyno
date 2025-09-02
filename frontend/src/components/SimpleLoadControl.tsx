import React, { useState } from 'react';
import { LoadProfile } from './LoadControl';

interface SimpleLoadControlProps {
  onLoadChange: (load: LoadProfile) => void;
  currentLoad: number;
  maxLoad: number;
}

const SimpleLoadControl: React.FC<SimpleLoadControlProps> = ({ onLoadChange, currentLoad, maxLoad }) => {
  const [targetLoad, setTargetLoad] = useState(0);

  const handleApplyLoad = () => {
    onLoadChange({ type: 'constant', targetValue: targetLoad });
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '10px'
    },
    currentLoad: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#ffcc00',
      textAlign: 'center' as const,
      marginBottom: '10px',
      fontFamily: 'monospace'
    },
    loadBar: {
      width: '100%',
      height: '8px',
      backgroundColor: '#333',
      borderRadius: '4px',
      overflow: 'hidden',
      marginBottom: '10px'
    },
    loadFill: {
      height: '100%',
      background: 'linear-gradient(90deg, #00ff41, #ffcc00, #ff3333)',
      transition: 'width 0.3s ease'
    },
    input: {
      width: '100%',
      padding: '8px',
      backgroundColor: '#222',
      color: '#ffcc00',
      border: '1px solid #444',
      borderRadius: '5px',
      fontSize: '14px',
      fontFamily: 'monospace',
      marginBottom: '10px'
    },
    button: {
      width: '100%',
      backgroundColor: '#ffcc00',
      color: '#000',
      border: 'none',
      padding: '8px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '12px',
      transition: 'all 0.3s'
    },
    emergency: {
      width: '100%',
      backgroundColor: '#ff3333',
      color: '#fff',
      border: 'none',
      padding: '8px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '12px',
      marginTop: '5px'
    }
  };

  const loadPercentage = (currentLoad / maxLoad) * 100;

  return (
    <div style={styles.container}>
      <div style={styles.currentLoad}>
        Load: {currentLoad.toFixed(1)} Nm
      </div>
      
      <div style={styles.loadBar}>
        <div 
          style={{
            ...styles.loadFill,
            width: `${Math.min(loadPercentage, 100)}%`
          }}
        />
      </div>

      <input
        style={styles.input}
        type="number"
        min="0"
        max={maxLoad}
        step="0.1"
        value={targetLoad}
        onChange={(e) => setTargetLoad(parseFloat(e.target.value) || 0)}
        placeholder="Target Load (Nm)"
      />

      <button 
        style={styles.button}
        onClick={handleApplyLoad}
      >
        Apply Load
      </button>

      <button 
        style={styles.emergency}
        onClick={() => onLoadChange({ type: 'constant', targetValue: 0 })}
      >
        Clear Load
      </button>
    </div>
  );
};

export default SimpleLoadControl;