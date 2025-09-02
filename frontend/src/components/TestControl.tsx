import React, { useState, useEffect } from 'react';
import useTestSequenceEngine, { ProfessionalTestSequence, TestResult } from './TestSequenceEngine';

export interface TestSequence {
  name: string;
  type: 'speed_sweep' | 'load_ramp' | 'efficiency_map' | 'step_response' | 'custom';
  parameters: {
    startValue: number;
    endValue: number;
    duration: number;
    steps?: number;
    holdTime?: number;
  };
}

interface TestControlProps {
  onTestStart: (test: TestSequence) => void;
  onTestStop: () => void;
  isRunning: boolean;
  motorData: {
    rpm: number;
    torque: number;
    power: number;
    voltage: number;
    current: number;
    temperature: number;
    efficiency: number;
  };
  onSpeedControl: (targetRpm: number) => void;
  onLoadControl: (targetLoad: number) => void;
  isConnected: boolean;
}

const TestControl: React.FC<TestControlProps> = ({ 
  onTestStart, 
  onTestStop, 
  isRunning, 
  motorData, 
  onSpeedControl, 
  onLoadControl, 
  isConnected 
}) => {
  const [selectedTest, setSelectedTest] = useState<TestSequence['type']>('speed_sweep');
  const [startValue, setStartValue] = useState(0);
  const [endValue, setEndValue] = useState(3000);
  const [duration, setDuration] = useState(30);
  const [steps, setSteps] = useState(10);
  const [showProfessionalTests, setShowProfessionalTests] = useState(false);
  const [selectedProfessionalTest, setSelectedProfessionalTest] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  
  // Initialize professional test engine
  const testEngine = useTestSequenceEngine({
    motorData,
    onSpeedControl,
    onLoadControl,
    onTestComplete: (result: TestResult) => {
      setTestResults(prev => [result, ...prev.slice(0, 9)]); // Keep last 10 results
    },
    onTestProgress: (progress: number, phase: string) => {
      // Progress updates handled by TestResults component
    },
    isConnected
  });

  const predefinedTests: Record<TestSequence['type'], Partial<TestSequence>> = {
    speed_sweep: {
      name: 'Speed Sweep Test',
      parameters: { startValue: 0, endValue: 3000, duration: 30 }
    },
    load_ramp: {
      name: 'Load Ramp Test',
      parameters: { startValue: 0, endValue: 50, duration: 20 }
    },
    efficiency_map: {
      name: 'Efficiency Mapping',
      parameters: { startValue: 500, endValue: 3000, duration: 60, steps: 20 }
    },
    step_response: {
      name: 'Step Response Test',
      parameters: { startValue: 0, endValue: 2000, duration: 10, holdTime: 5 }
    },
    custom: {
      name: 'Custom Test',
      parameters: { startValue: 0, endValue: 1000, duration: 15 }
    }
  };

  const handleTestStart = () => {
    const test: TestSequence = {
      name: predefinedTests[selectedTest].name || 'Custom Test',
      type: selectedTest,
      parameters: {
        startValue,
        endValue,
        duration,
        steps: selectedTest === 'efficiency_map' ? steps : undefined,
        holdTime: selectedTest === 'step_response' ? 5 : undefined
      }
    };
    onTestStart(test);
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
      color: '#00ccff',
      borderBottom: '2px solid #00ccff',
      paddingBottom: '5px'
    },
    radioGroup: {
      marginBottom: '15px'
    },
    radioLabel: {
      display: 'block',
      padding: '8px',
      marginBottom: '5px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '13px',
      transition: 'all 0.3s'
    },
    radioInput: {
      marginRight: '8px'
    },
    paramSection: {
      marginTop: '15px',
      padding: '10px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px'
    },
    label: {
      fontSize: '12px',
      color: '#888',
      marginBottom: '5px',
      display: 'block'
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
    button: {
      width: '100%',
      backgroundColor: '#00ccff',
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
    stopButton: {
      width: '100%',
      backgroundColor: '#ff6666',
      color: '#fff',
      border: 'none',
      padding: '12px',
      borderRadius: '5px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '14px',
      marginTop: '10px'
    },
    statusIndicator: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '10px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      marginBottom: '15px'
    },
    statusDot: {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      marginRight: '8px',
      animation: isRunning ? 'pulse 1.5s infinite' : 'none'
    },
    modeToggle: {
      display: 'flex',
      marginBottom: '15px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px',
      padding: '2px'
    },
    toggleButton: {
      flex: 1,
      padding: '8px',
      border: 'none',
      backgroundColor: '#444',
      color: '#ddd',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      transition: 'all 0.3s',
      borderRadius: '3px',
      margin: '1px'
    },
    professionalTestsSection: {
      marginBottom: '15px'
    },
    testGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '8px',
      marginBottom: '15px'
    },
    professionalTestCard: {
      padding: '12px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'all 0.3s'
    },
    testCardHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    },
    testCardTitle: {
      fontSize: '13px',
      fontWeight: 'bold',
      color: '#00ccff'
    },
    testCardType: {
      fontSize: '10px',
      color: '#888',
      backgroundColor: '#1a1a1a',
      padding: '2px 6px',
      borderRadius: '3px'
    },
    testCardDescription: {
      fontSize: '11px',
      color: '#aaa',
      marginBottom: '6px',
      lineHeight: '1.3'
    },
    testCardDuration: {
      fontSize: '11px',
      color: '#00ff41',
      marginBottom: '4px'
    },
    testCardCriteria: {
      fontSize: '10px',
      color: '#ffcc00'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Professional Test Control</div>
      
      {/* Test Mode Toggle */}
      <div style={styles.modeToggle}>
        <button 
          style={{
            ...styles.toggleButton,
            backgroundColor: !showProfessionalTests ? '#00ccff' : '#444'
          }}
          onClick={() => setShowProfessionalTests(false)}
        >
          Basic Tests
        </button>
        <button 
          style={{
            ...styles.toggleButton,
            backgroundColor: showProfessionalTests ? '#00ccff' : '#444'
          }}
          onClick={() => setShowProfessionalTests(true)}
        >
          Professional Tests
        </button>
      </div>
      
      <div style={styles.statusIndicator}>
        <div 
          style={{
            ...styles.statusDot,
            backgroundColor: isRunning ? '#00ff41' : '#666'
          }}
        />
        <span>{isRunning ? 'Test Running' : 'Ready'}</span>
      </div>

      <div style={styles.radioGroup}>
        {Object.entries(predefinedTests).map(([key, test]) => (
          <label 
            key={key}
            style={{
              ...styles.radioLabel,
              backgroundColor: selectedTest === key ? '#3a3a3a' : '#2a2a2a',
              border: selectedTest === key ? '1px solid #00ccff' : '1px solid transparent'
            }}
          >
            <input
              type="radio"
              style={styles.radioInput}
              value={key}
              checked={selectedTest === key}
              onChange={(e) => {
                setSelectedTest(e.target.value as TestSequence['type']);
                if (test.parameters) {
                  setStartValue(test.parameters.startValue || 0);
                  setEndValue(test.parameters.endValue || 1000);
                  setDuration(test.parameters.duration || 30);
                }
              }}
              disabled={isRunning}
            />
            {test.name}
          </label>
        ))}
      </div>

      <div style={styles.paramSection}>
        <label style={styles.label}>
          {selectedTest === 'speed_sweep' ? 'Start Speed (RPM)' : 'Start Load (Nm)'}
        </label>
        <input
          style={styles.input}
          type="number"
          value={startValue}
          onChange={(e) => setStartValue(parseFloat(e.target.value) || 0)}
          disabled={isRunning}
        />

        <label style={styles.label}>
          {selectedTest === 'speed_sweep' ? 'End Speed (RPM)' : 'End Load (Nm)'}
        </label>
        <input
          style={styles.input}
          type="number"
          value={endValue}
          onChange={(e) => setEndValue(parseFloat(e.target.value) || 0)}
          disabled={isRunning}
        />

        <label style={styles.label}>Duration (seconds)</label>
        <input
          style={styles.input}
          type="number"
          value={duration}
          onChange={(e) => setDuration(parseFloat(e.target.value) || 30)}
          disabled={isRunning}
        />

        {selectedTest === 'efficiency_map' && (
          <>
            <label style={styles.label}>Number of Steps</label>
            <input
              style={styles.input}
              type="number"
              value={steps}
              onChange={(e) => setSteps(parseInt(e.target.value) || 10)}
              disabled={isRunning}
            />
          </>
        )}
      </div>

      {!isRunning ? (
        <button 
          style={styles.button}
          onClick={handleTestStart}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ddff'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ccff'}
        >
          Start Test
        </button>
      ) : (
        <button 
          style={styles.stopButton}
          onClick={onTestStop}
        >
          Stop Test
        </button>
      )}

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

export default TestControl;