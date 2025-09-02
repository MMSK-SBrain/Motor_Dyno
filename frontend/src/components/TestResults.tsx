import React, { useState, useEffect, useRef } from 'react';
import { TestResult, TestPoint, ProfessionalTestSequence } from './TestSequenceEngine';

interface TestResultsProps {
  currentTest: ProfessionalTestSequence | null;
  testResult: TestResult | null;
  isRunning: boolean;
  isPaused: boolean;
  onAbortTest: () => void;
  onPauseTest: () => void;
  onResumeTest: () => void;
  motorData: {
    rpm: number;
    torque: number;
    power: number;
    voltage: number;
    current: number;
    temperature: number;
    efficiency: number;
  };
}

interface PassFailIndicatorProps {
  criteria: any;
  currentData: TestPoint[];
  motorData: any;
}

const PassFailIndicator: React.FC<PassFailIndicatorProps> = ({ criteria, currentData, motorData }) => {
  const [status, setStatus] = useState<'unknown' | 'passing' | 'warning' | 'failing'>('unknown');
  const [violations, setViolations] = useState<string[]>([]);

  useEffect(() => {
    const newViolations: string[] = [];
    let newStatus: 'unknown' | 'passing' | 'warning' | 'failing' = 'passing';

    // Check temperature limits
    if (criteria.maxTemperature && motorData.temperature > criteria.maxTemperature) {
      newViolations.push(`Temperature ${motorData.temperature.toFixed(1)}°C > ${criteria.maxTemperature}°C`);
      newStatus = 'failing';
    } else if (criteria.maxTemperature && motorData.temperature > criteria.maxTemperature * 0.9) {
      newStatus = 'warning';
    }

    // Check efficiency
    if (criteria.minEfficiency && motorData.efficiency < criteria.minEfficiency && motorData.efficiency > 0) {
      newViolations.push(`Efficiency ${motorData.efficiency.toFixed(1)}% < ${criteria.minEfficiency}%`);
      newStatus = 'failing';
    } else if (criteria.minEfficiency && motorData.efficiency < criteria.minEfficiency * 1.1 && motorData.efficiency > 0) {
      newStatus = 'warning';
    }

    // Check torque limits
    if (criteria.maxTorque && motorData.torque > criteria.maxTorque) {
      newViolations.push(`Torque ${motorData.torque.toFixed(1)}Nm > ${criteria.maxTorque}Nm`);
      newStatus = 'failing';
    }
    if (criteria.minTorque && motorData.torque < criteria.minTorque) {
      newViolations.push(`Torque ${motorData.torque.toFixed(1)}Nm < ${criteria.minTorque}Nm`);
      newStatus = 'failing';
    }

    setViolations(newViolations);
    setStatus(newStatus);
  }, [criteria, motorData, currentData]);

  const getStatusColor = () => {
    switch (status) {
      case 'passing': return '#00ff41';
      case 'warning': return '#ffcc00';
      case 'failing': return '#ff6666';
      default: return '#888';
    }
  };

  return (
    <div style={{ marginBottom: '15px' }}>
      <div style={{
        padding: '10px',
        backgroundColor: '#1a1a1a',
        borderRadius: '5px',
        border: `2px solid ${getStatusColor()}`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '8px'
        }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: getStatusColor(),
            marginRight: '8px',
            animation: status === 'failing' ? 'pulse 1s infinite' : 'none'
          }} />
          <div style={{
            fontSize: '12px',
            fontWeight: 'bold',
            color: getStatusColor(),
            textTransform: 'uppercase'
          }}>
            {status === 'unknown' ? 'Evaluating...' : 
             status === 'passing' ? 'Criteria Passing' :
             status === 'warning' ? 'Warning - Near Limits' :
             'Criteria Failing'}
          </div>
        </div>
        
        {violations.length > 0 && (
          <div style={{ fontSize: '11px', color: '#ff6666' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Active Violations:</div>
            {violations.map((violation, index) => (
              <div key={index} style={{ marginLeft: '8px' }}>• {violation}</div>
            ))}
          </div>
        )}
        
        {status === 'passing' && violations.length === 0 && (
          <div style={{ fontSize: '11px', color: '#00ff41' }}>
            All acceptance criteria within limits
          </div>
        )}
      </div>
    </div>
  );
};

const TestResults: React.FC<TestResultsProps> = ({
  currentTest,
  testResult,
  isRunning,
  isPaused,
  onAbortTest,
  onPauseTest,
  onResumeTest,
  motorData
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [realTimeChart, setRealTimeChart] = useState<TestPoint[]>([]);
  const intervalRef = useRef<number>();

  // Update elapsed time
  useEffect(() => {
    if (isRunning && !isPaused && testResult) {
      intervalRef.current = window.setInterval(() => {
        const now = Date.now();
        const elapsed = (now - testResult.startTime.getTime()) / 1000;
        setElapsedTime(elapsed);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused, testResult]);

  // Update real-time chart data
  useEffect(() => {
    if (isRunning && testResult) {
      const newPoint: TestPoint = {
        time: elapsedTime,
        speed: motorData.rpm,
        torque: motorData.torque,
        power: motorData.power,
        efficiency: motorData.efficiency,
        temperature: motorData.temperature,
        voltage: motorData.voltage,
        current: motorData.current
      };
      
      setRealTimeChart(prev => {
        const updated = [...prev, newPoint];
        return updated.slice(-100); // Keep last 100 points for chart
      });
    }
  }, [elapsedTime, motorData, isRunning, testResult]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTestPhaseDescription = (test: ProfessionalTestSequence | null, progress: number) => {
    if (!test) return 'No active test';
    
    switch (test.type) {
      case 'efficiency_map':
        const totalPoints = (test.parameters.gridPoints?.speed || 8) * (test.parameters.gridPoints?.torque || 6);
        const currentPoint = Math.floor(progress * totalPoints / 100);
        return `Mapping efficiency point ${currentPoint + 1}/${totalPoints}`;
        
      case 'performance_curve':
        const currentSpeed = test.parameters.speedSweep?.start || 0 + 
          progress * ((test.parameters.speedSweep?.end || 4000) - (test.parameters.speedSweep?.start || 0)) / 100;
        return `Speed sweep at ${currentSpeed.toFixed(0)} RPM`;
        
      case 'thermal_test':
        return `Thermal characterization - ${formatTime(elapsedTime)} elapsed`;
        
      case 'step_response':
        return elapsedTime < 5 ? 'Pre-step steady state' : 'Analyzing step response';
        
      case 'endurance_test':
        const totalHours = (test.parameters.totalDuration || 3600) / 3600;
        const elapsedHours = elapsedTime / 3600;
        return `Endurance testing: ${elapsedHours.toFixed(1)}/${totalHours.toFixed(1)} hours`;
        
      default:
        if (!test) return 'Unknown test in progress';
        const testType = test.type as string;
        return `${testType.replace('_', ' ')} in progress`;
    }
  };

  const styles = {
    container: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      padding: '20px',
      color: '#ddd',
      fontFamily: 'sans-serif',
      height: 'fit-content'
    },
    title: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#00ccff',
      borderBottom: '2px solid #00ccff',
      paddingBottom: '5px'
    },
    statusSection: {
      marginBottom: '20px'
    },
    testHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '15px',
      padding: '12px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px',
      border: `2px solid ${isRunning ? '#00ff41' : '#666'}`
    },
    testName: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: isRunning ? '#00ff41' : '#666'
    },
    testStatus: {
      fontSize: '12px',
      color: isPaused ? '#ffcc00' : isRunning ? '#00ff41' : '#666',
      fontWeight: 'bold'
    },
    progressSection: {
      marginBottom: '15px'
    },
    progressBar: {
      width: '100%',
      height: '20px',
      backgroundColor: '#333',
      borderRadius: '10px',
      overflow: 'hidden',
      marginBottom: '8px'
    },
    progressFill: {
      height: '100%',
      background: isRunning ? 
        'linear-gradient(90deg, #00ff41 0%, #44ff77 50%, #00ff41 100%)' : 
        'linear-gradient(90deg, #666 0%, #888 50%, #666 100%)',
      borderRadius: '10px',
      transition: 'width 0.3s ease',
      animation: isRunning && !isPaused ? 'shimmer 2s infinite' : 'none'
    },
    progressText: {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '11px',
      color: '#aaa'
    },
    timeInfo: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '10px',
      marginBottom: '15px'
    },
    timeCard: {
      padding: '8px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      textAlign: 'center' as const
    },
    timeLabel: {
      fontSize: '10px',
      color: '#888',
      marginBottom: '4px',
      textTransform: 'uppercase' as const
    },
    timeValue: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#00ccff',
      fontFamily: 'monospace'
    },
    phaseInfo: {
      padding: '10px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px',
      marginBottom: '15px'
    },
    phaseLabel: {
      fontSize: '11px',
      color: '#888',
      marginBottom: '4px',
      fontWeight: 'bold'
    },
    phaseDescription: {
      fontSize: '12px',
      color: '#ddd'
    },
    liveDataSection: {
      marginBottom: '15px'
    },
    liveDataGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '8px'
    },
    liveDataCard: {
      padding: '8px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px'
    },
    liveDataLabel: {
      fontSize: '10px',
      color: '#888',
      marginBottom: '2px'
    },
    liveDataValue: {
      fontSize: '12px',
      fontWeight: 'bold',
      color: '#00ff41',
      fontFamily: 'monospace'
    },
    controlButtons: {
      display: 'flex',
      gap: '8px',
      marginTop: '15px'
    },
    controlButton: {
      flex: 1,
      padding: '10px',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      transition: 'all 0.3s'
    },
    pauseButton: {
      backgroundColor: '#ffcc00',
      color: '#000'
    },
    resumeButton: {
      backgroundColor: '#00ff41',
      color: '#000'
    },
    abortButton: {
      backgroundColor: '#ff6666',
      color: '#fff'
    },
    chartSection: {
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px'
    },
    chartTitle: {
      fontSize: '12px',
      fontWeight: 'bold',
      color: '#00ccff',
      marginBottom: '10px'
    },
    miniChart: {
      height: '80px',
      backgroundColor: '#222',
      borderRadius: '3px',
      position: 'relative' as const,
      overflow: 'hidden'
    },
    noTest: {
      textAlign: 'center' as const,
      color: '#666',
      padding: '40px 20px',
      fontSize: '14px'
    }
  };

  if (!isRunning && !testResult) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Test Status</div>
        <div style={styles.noTest}>
          No active test running<br/>
          <span style={{ fontSize: '12px' }}>Select and start a test to monitor progress</span>
        </div>
      </div>
    );
  }

  const duration = currentTest?.parameters.duration || 60;
  const progress = testResult?.progress || 0;
  const remainingTime = Math.max(0, duration - elapsedTime);

  return (
    <div style={styles.container}>
      <div style={styles.title}>
        Real-Time Test Status
        {testResult && (
          <span style={{ fontSize: '12px', color: '#888', marginLeft: '10px' }}>
            ID: {testResult.testId}
          </span>
        )}
      </div>

      {/* Test Header */}
      <div style={styles.testHeader}>
        <div>
          <div style={styles.testName}>
            {currentTest?.name || 'Unknown Test'}
          </div>
          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
            {currentTest?.description}
          </div>
        </div>
        <div style={styles.testStatus}>
          {isPaused ? 'PAUSED' : isRunning ? 'RUNNING' : 'COMPLETED'}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressBar}>
          <div 
            style={{
              ...styles.progressFill,
              width: `${progress}%`
            }}
          />
        </div>
        <div style={styles.progressText}>
          <span>Progress: {progress.toFixed(1)}%</span>
          <span>{testResult?.currentPhase || 'Initializing...'}</span>
        </div>
      </div>

      {/* Time Information */}
      <div style={styles.timeInfo}>
        <div style={styles.timeCard}>
          <div style={styles.timeLabel}>Elapsed</div>
          <div style={styles.timeValue}>{formatTime(elapsedTime)}</div>
        </div>
        <div style={styles.timeCard}>
          <div style={styles.timeLabel}>Remaining</div>
          <div style={styles.timeValue}>{formatTime(remainingTime)}</div>
        </div>
        <div style={styles.timeCard}>
          <div style={styles.timeLabel}>Total</div>
          <div style={styles.timeValue}>{formatTime(duration)}</div>
        </div>
      </div>

      {/* Current Phase */}
      <div style={styles.phaseInfo}>
        <div style={styles.phaseLabel}>Current Phase</div>
        <div style={styles.phaseDescription}>
          {getTestPhaseDescription(currentTest, progress)}
        </div>
      </div>

      {/* Pass/Fail Indicator */}
      {currentTest && (
        <PassFailIndicator
          criteria={currentTest.acceptanceCriteria}
          currentData={testResult?.dataPoints || []}
          motorData={motorData}
        />
      )}

      {/* Live Data */}
      <div style={styles.liveDataSection}>
        <div style={styles.chartTitle}>Live Motor Data</div>
        <div style={styles.liveDataGrid}>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Speed</div>
            <div style={styles.liveDataValue}>{motorData.rpm.toFixed(0)} RPM</div>
          </div>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Torque</div>
            <div style={styles.liveDataValue}>{motorData.torque.toFixed(1)} Nm</div>
          </div>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Power</div>
            <div style={styles.liveDataValue}>{(motorData.power / 1000).toFixed(2)} kW</div>
          </div>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Efficiency</div>
            <div style={styles.liveDataValue}>{motorData.efficiency.toFixed(1)}%</div>
          </div>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Temperature</div>
            <div style={styles.liveDataValue}>{motorData.temperature.toFixed(1)}°C</div>
          </div>
          <div style={styles.liveDataCard}>
            <div style={styles.liveDataLabel}>Current</div>
            <div style={styles.liveDataValue}>{Math.abs(motorData.current).toFixed(1)} A</div>
          </div>
        </div>
      </div>

      {/* Control Buttons */}
      {isRunning && (
        <div style={styles.controlButtons}>
          {!isPaused ? (
            <button
              style={{...styles.controlButton, ...styles.pauseButton}}
              onClick={onPauseTest}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffdd44'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffcc00'}
            >
              PAUSE TEST
            </button>
          ) : (
            <button
              style={{...styles.controlButton, ...styles.resumeButton}}
              onClick={onResumeTest}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ff77'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ff41'}
            >
              RESUME TEST
            </button>
          )}
          <button
            style={{...styles.controlButton, ...styles.abortButton}}
            onClick={onAbortTest}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ff8888'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff6666'}
          >
            ABORT TEST
          </button>
        </div>
      )}

      {/* Mini Chart */}
      <div style={styles.chartSection}>
        <div style={styles.chartTitle}>Real-Time Trend (Last 100 samples)</div>
        <div style={styles.miniChart}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '11px'
          }}>
            {realTimeChart.length > 0 ? 
              `${realTimeChart.length} data points collected` : 
              'Waiting for data...'}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
    </div>
  );
};

export default TestResults;