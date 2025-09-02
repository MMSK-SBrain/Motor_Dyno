import React, { useState, useEffect } from 'react';

export interface ValidationResult {
  test: string;
  expected: number | string;
  actual: number | string;
  passed: boolean;
  tolerance?: number;
  error?: string;
}

export interface MotorData {
  rpm: number;
  torque: number;
  power: number;
  voltage: number;
  current: number;
  efficiency: number;
  temperature: number;
}

export interface MotorConfig {
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

export class MotorSimulationValidator {
  private config: MotorConfig;
  private tolerance = 0.05; // 5% tolerance for most tests

  constructor(config: MotorConfig) {
    this.config = config;
  }

  validateMotorData(data: MotorData, targetSpeed: number, loadTorque: number): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Test 1: Voltage Range Validation
    results.push(this.validateVoltageRange(data.voltage));

    // Test 2: Power Calculation (Mechanical Power = Torque × Angular Velocity)
    results.push(this.validateMechanicalPower(data.rpm, data.torque, data.power));

    // Test 3: Electrical Power vs Mechanical Power
    results.push(this.validateElectricalPower(data.voltage, data.current, data.power, data.efficiency));

    // Test 4: Back-EMF Validation (Ke × Angular Velocity)
    results.push(this.validateBackEMF(data.rpm, data.voltage, data.current));

    // Test 5: Torque Constant Validation (Kt × Current)
    results.push(this.validateTorqueConstant(data.current, data.torque));

    // Test 6: Efficiency Range Check
    results.push(this.validateEfficiency(data.efficiency));

    // Test 7: Current Range Check
    results.push(this.validateCurrentRange(data.current));

    // Test 8: Speed Control Validation
    results.push(this.validateSpeedControl(data.rpm, targetSpeed));

    // Test 9: Temperature Physics Check
    results.push(this.validateTemperature(data.temperature, data.current));

    // Test 10: Motor Parameter Consistency
    results.push(this.validateMotorConstants());

    return results;
  }

  private validateVoltageRange(voltage: number): ValidationResult {
    const minExpected = this.config.ratedVoltage * 0.5; // At least 50% of rated
    const maxExpected = this.config.ratedVoltage * 1.3; // At most 130% of rated
    const passed = voltage >= minExpected && voltage <= maxExpected;
    
    return {
      test: 'Voltage Range Check',
      expected: `${minExpected.toFixed(1)} - ${maxExpected.toFixed(1)}V`,
      actual: `${voltage.toFixed(1)}V`,
      passed,
      error: !passed ? `Voltage ${voltage.toFixed(1)}V is outside expected range for ${this.config.ratedVoltage}V motor` : undefined
    };
  }

  private validateMechanicalPower(rpm: number, torque: number, power: number): ValidationResult {
    const angularVelocity = (rpm * Math.PI) / 30; // Convert RPM to rad/s
    const expectedPower = (torque * angularVelocity) / 1000; // Convert to kW
    const error = Math.abs(expectedPower - power);
    const tolerance = Math.max(0.1, expectedPower * this.tolerance);
    const passed = error <= tolerance;

    return {
      test: 'Mechanical Power Calculation',
      expected: `${expectedPower.toFixed(3)} kW`,
      actual: `${power.toFixed(3)} kW`,
      passed,
      tolerance,
      error: !passed ? `Power mismatch: Expected P = T × ω = ${expectedPower.toFixed(3)} kW, got ${power.toFixed(3)} kW` : undefined
    };
  }

  private validateElectricalPower(voltage: number, current: number, mechanicalPower: number, efficiency: number): ValidationResult {
    const electricalPower = (voltage * Math.abs(current)) / 1000; // kW
    const expectedMechanicalPower = electricalPower * (efficiency / 100);
    const error = Math.abs(expectedMechanicalPower - mechanicalPower);
    const tolerance = Math.max(0.1, mechanicalPower * this.tolerance * 2); // Allow more tolerance for efficiency calculations
    const passed = error <= tolerance || efficiency < 1; // Pass if efficiency is near zero

    return {
      test: 'Electrical vs Mechanical Power',
      expected: `${expectedMechanicalPower.toFixed(3)} kW (from ${electricalPower.toFixed(3)} kW × ${efficiency.toFixed(1)}%)`,
      actual: `${mechanicalPower.toFixed(3)} kW`,
      passed,
      tolerance,
      error: !passed ? `Power efficiency mismatch: Expected ${expectedMechanicalPower.toFixed(3)} kW, got ${mechanicalPower.toFixed(3)} kW` : undefined
    };
  }

  private validateBackEMF(rpm: number, voltage: number, current: number): ValidationResult {
    const angularVelocity = (rpm * Math.PI) / 30; // rad/s
    const backEMF = this.config.ke * angularVelocity;
    const resistiveDrop = this.config.resistance * Math.abs(current);
    const expectedVoltage = backEMF + resistiveDrop;
    const error = Math.abs(expectedVoltage - voltage);
    const tolerance = Math.max(2.0, expectedVoltage * this.tolerance);
    const passed = error <= tolerance;

    return {
      test: 'Back-EMF Validation',
      expected: `${expectedVoltage.toFixed(1)}V (BackEMF: ${backEMF.toFixed(1)}V + R×I: ${resistiveDrop.toFixed(1)}V)`,
      actual: `${voltage.toFixed(1)}V`,
      passed,
      tolerance,
      error: !passed ? `Voltage equation mismatch: V = Ke×ω + R×I = ${expectedVoltage.toFixed(1)}V, got ${voltage.toFixed(1)}V` : undefined
    };
  }

  private validateTorqueConstant(current: number, torque: number): ValidationResult {
    const expectedTorque = this.config.kt * current;
    const error = Math.abs(expectedTorque - torque);
    const tolerance = Math.max(0.5, Math.abs(expectedTorque) * this.tolerance);
    const passed = error <= tolerance;

    return {
      test: 'Torque Constant Validation',
      expected: `${expectedTorque.toFixed(2)} Nm (Kt × I)`,
      actual: `${torque.toFixed(2)} Nm`,
      passed,
      tolerance,
      error: !passed ? `Torque mismatch: T = Kt × I = ${expectedTorque.toFixed(2)} Nm, got ${torque.toFixed(2)} Nm` : undefined
    };
  }

  private validateEfficiency(efficiency: number): ValidationResult {
    const passed = efficiency >= 0 && efficiency <= 100;
    
    return {
      test: 'Efficiency Range Check',
      expected: '0% - 100%',
      actual: `${efficiency.toFixed(1)}%`,
      passed,
      error: !passed ? `Efficiency ${efficiency.toFixed(1)}% is outside valid range` : undefined
    };
  }

  private validateCurrentRange(current: number): ValidationResult {
    const maxCurrent = this.config.maxCurrent;
    const passed = Math.abs(current) <= maxCurrent * 1.1; // Allow 10% over max
    
    return {
      test: 'Current Range Check',
      expected: `±${maxCurrent}A`,
      actual: `${current.toFixed(1)}A`,
      passed,
      error: !passed ? `Current ${current.toFixed(1)}A exceeds motor rating of ${maxCurrent}A` : undefined
    };
  }

  private validateSpeedControl(actualRpm: number, targetRpm: number): ValidationResult {
    const error = Math.abs(actualRpm - targetRpm);
    const tolerance = Math.max(50, targetRpm * 0.1); // 10% or 50 RPM, whichever is larger
    const passed = error <= tolerance || targetRpm === 0;
    
    return {
      test: 'Speed Control Accuracy',
      expected: `${targetRpm.toFixed(0)} RPM`,
      actual: `${actualRpm.toFixed(0)} RPM`,
      passed,
      tolerance,
      error: !passed ? `Speed error ${error.toFixed(0)} RPM exceeds tolerance of ${tolerance.toFixed(0)} RPM` : undefined
    };
  }

  private validateTemperature(temperature: number, current: number): ValidationResult {
    const powerLoss = current * current * this.config.resistance;
    const minTemp = 25; // Ambient
    const maxTemp = 120; // Thermal limit
    const passed = temperature >= minTemp && temperature <= maxTemp;
    
    return {
      test: 'Temperature Physics Check',
      expected: `${minTemp}°C - ${maxTemp}°C`,
      actual: `${temperature.toFixed(1)}°C`,
      passed,
      error: !passed ? `Temperature ${temperature.toFixed(1)}°C is outside physical limits` : undefined
    };
  }

  private validateMotorConstants(): ValidationResult {
    // Check if Ke and Kt are related properly (should be approximately equal for SI units)
    const ratio = this.config.kt / this.config.ke;
    const expectedRatio = 1.0; // For SI units, Ke (V·s/rad) ≈ Kt (N·m/A)
    const error = Math.abs(ratio - expectedRatio);
    const tolerance = 0.1;
    const passed = error <= tolerance;
    
    return {
      test: 'Motor Constants Consistency',
      expected: `Kt/Ke ≈ 1.0`,
      actual: `Kt/Ke = ${ratio.toFixed(3)}`,
      passed,
      tolerance,
      error: !passed ? `Motor constants inconsistent: Kt=${this.config.kt}, Ke=${this.config.ke}` : undefined
    };
  }
}

interface SimulationValidatorProps {
  motorData: MotorData;
  motorConfig: MotorConfig;
  targetSpeed: number;
  loadTorque: number;
  isVisible: boolean;
}

const SimulationValidator: React.FC<SimulationValidatorProps> = ({
  motorData,
  motorConfig,
  targetSpeed,
  loadTorque,
  isVisible
}) => {
  const [validator] = useState(new MotorSimulationValidator(motorConfig));
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  useEffect(() => {
    if (!isVisible) return;
    
    const interval = setInterval(() => {
      const validationResults = validator.validateMotorData(motorData, targetSpeed, loadTorque);
      setResults(validationResults);
      setLastUpdate(Date.now());
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [validator, motorData, targetSpeed, loadTorque, isVisible]);

  if (!isVisible) return null;

  const passedTests = results.filter(r => r.passed).length;
  const totalTests = results.length;
  const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

  const styles = {
    container: {
      position: 'fixed' as const,
      top: '100px',
      right: '20px',
      width: '500px',
      maxHeight: '70vh',
      backgroundColor: '#1a1a1a',
      border: '2px solid #333',
      borderRadius: '10px',
      padding: '20px',
      color: '#ddd',
      fontSize: '12px',
      fontFamily: 'monospace',
      overflowY: 'auto' as const,
      zIndex: 1000,
      boxShadow: '0 0 20px rgba(0,0,0,0.8)'
    },
    header: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: passRate >= 80 ? '#00ff41' : passRate >= 60 ? '#ffcc00' : '#ff3333',
      textAlign: 'center' as const
    },
    summary: {
      marginBottom: '15px',
      padding: '10px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      textAlign: 'center' as const
    },
    testResult: {
      marginBottom: '10px',
      padding: '8px',
      borderRadius: '5px',
      borderLeft: '4px solid'
    },
    passed: {
      backgroundColor: '#1a2a1a',
      borderLeftColor: '#00ff41'
    },
    failed: {
      backgroundColor: '#2a1a1a',
      borderLeftColor: '#ff3333'
    },
    testName: {
      fontWeight: 'bold',
      marginBottom: '3px'
    },
    values: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '10px',
      fontSize: '11px'
    },
    error: {
      color: '#ff6666',
      fontSize: '10px',
      marginTop: '3px',
      fontStyle: 'italic'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        Motor Simulation Validator
      </div>
      
      <div style={styles.summary}>
        <div>Pass Rate: {passRate.toFixed(1)}% ({passedTests}/{totalTests})</div>
        <div style={{ fontSize: '10px', marginTop: '5px' }}>
          Last Update: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      </div>

      {results.map((result, index) => (
        <div 
          key={index}
          style={{
            ...styles.testResult,
            ...(result.passed ? styles.passed : styles.failed)
          }}
        >
          <div style={styles.testName}>
            {result.passed ? '✅' : '❌'} {result.test}
          </div>
          <div style={styles.values}>
            <div>Expected: {result.expected}</div>
            <div>Actual: {result.actual}</div>
          </div>
          {result.error && (
            <div style={styles.error}>{result.error}</div>
          )}
        </div>
      ))}
    </div>
  );
};

export default SimulationValidator;