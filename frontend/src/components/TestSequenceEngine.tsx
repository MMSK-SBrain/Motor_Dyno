import React, { useState, useRef, useCallback, useEffect } from 'react';

// Professional Test Sequence Types
export interface TestPoint {
  time: number;
  speed: number;
  torque: number;
  efficiency: number;
  temperature: number;
  power: number;
  voltage: number;
  current: number;
}

export interface PassFailCriteria {
  minEfficiency?: number;
  maxTemperature?: number;
  maxSettlingTime?: number;
  maxOvershoot?: number;
  minTorque?: number;
  maxTorque?: number;
  tolerancePercent?: number;
}

export interface ProfessionalTestSequence {
  id: string;
  name: string;
  type: 'efficiency_map' | 'performance_curve' | 'thermal_test' | 'step_response' | 'endurance_test';
  description: string;
  parameters: {
    // Common parameters
    duration?: number;
    
    // Efficiency Map parameters
    speedRange?: { min: number; max: number };
    torqueRange?: { min: number; max: number };
    gridPoints?: { speed: number; torque: number };
    
    // Performance Curve parameters
    speedSweep?: { start: number; end: number; step: number };
    loadType?: 'constant_voltage' | 'constant_torque';
    
    // Thermal Test parameters
    testLoad?: number;
    testSpeed?: number;
    tempLimits?: { warning: number; critical: number };
    
    // Step Response parameters
    stepSize?: number;
    responseType?: 'speed' | 'torque';
    
    // Endurance Test parameters
    testProfile?: 'constant' | 'cycling' | 'variable';
    totalDuration?: number;
    loggingInterval?: number;
  };
  acceptanceCriteria: PassFailCriteria;
  autoExport?: boolean;
}

export interface TestResult {
  testId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  progress: number;
  currentPhase: string;
  dataPoints: TestPoint[];
  passFailStatus?: 'pass' | 'fail' | 'pending';
  failureReasons?: string[];
  summary?: {
    peakPower: number;
    avgEfficiency: number;
    maxTemperature: number;
    energyConsumed: number;
  };
}

export interface TestSequenceEngineProps {
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
  onTestComplete: (result: TestResult) => void;
  onTestProgress: (progress: number, phase: string) => void;
  isConnected: boolean;
}

const useTestSequenceEngine = ({
  motorData,
  onSpeedControl,
  onLoadControl,
  onTestComplete,
  onTestProgress,
  isConnected
}: TestSequenceEngineProps) => {
  const [currentTest, setCurrentTest] = useState<ProfessionalTestSequence | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testQueue, setTestQueue] = useState<ProfessionalTestSequence[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const testStartTimeRef = useRef<number>(0);
  const testDataRef = useRef<TestPoint[]>([]);
  const phaseStartTimeRef = useRef<number>(0);
  const animationRef = useRef<number>();

  // Standard Test Protocols
  const standardTests: ProfessionalTestSequence[] = [
    {
      id: 'efficiency_map_test',
      name: 'Efficiency Map Test',
      type: 'efficiency_map',
      description: 'Generate 3D efficiency surface plot across speed and torque operating points',
      parameters: {
        speedRange: { min: 500, max: 4000 },
        torqueRange: { min: 0, max: 80 },
        gridPoints: { speed: 8, torque: 6 },
        duration: 300 // 5 minutes
      },
      acceptanceCriteria: {
        minEfficiency: 85,
        maxTemperature: 100
      },
      autoExport: true
    },
    {
      id: 'performance_curve_test',
      name: 'Performance Curve Test',
      type: 'performance_curve',
      description: 'Generate motor characteristic curves (torque, power, efficiency vs speed)',
      parameters: {
        speedSweep: { start: 0, end: 4000, step: 100 },
        loadType: 'constant_torque',
        duration: 180
      },
      acceptanceCriteria: {
        minEfficiency: 80,
        maxTemperature: 90
      },
      autoExport: true
    },
    {
      id: 'thermal_test',
      name: 'Thermal Characterization',
      type: 'thermal_test',
      description: 'Measure temperature rise under sustained load conditions',
      parameters: {
        testLoad: 50,
        testSpeed: 2000,
        duration: 600, // 10 minutes
        tempLimits: { warning: 80, critical: 100 }
      },
      acceptanceCriteria: {
        maxTemperature: 100,
        tolerancePercent: 5
      },
      autoExport: true
    },
    {
      id: 'step_response_test',
      name: 'Step Response Test',
      type: 'step_response',
      description: 'Analyze controller dynamic response characteristics',
      parameters: {
        stepSize: 1000,
        responseType: 'speed',
        duration: 30
      },
      acceptanceCriteria: {
        maxSettlingTime: 2.0,
        maxOvershoot: 15,
        tolerancePercent: 2
      },
      autoExport: true
    },
    {
      id: 'endurance_test',
      name: 'Endurance Test',
      type: 'endurance_test',
      description: 'Long-duration reliability and performance degradation testing',
      parameters: {
        testProfile: 'cycling',
        totalDuration: 3600, // 1 hour
        loggingInterval: 10
      },
      acceptanceCriteria: {
        minEfficiency: 75,
        maxTemperature: 110
      },
      autoExport: true
    }
  ];

  // Execute test sequence based on type
  const executeTestPhase = useCallback((test: ProfessionalTestSequence, elapsedTime: number) => {
    const duration = test.parameters.duration || 60;
    const progress = Math.min(elapsedTime / duration, 1);
    
    switch (test.type) {
      case 'efficiency_map':
        executeEfficiencyMapTest(test, elapsedTime, progress);
        break;
      case 'performance_curve':
        executePerformanceCurveTest(test, elapsedTime, progress);
        break;
      case 'thermal_test':
        executeThermalTest(test, elapsedTime, progress);
        break;
      case 'step_response':
        executeStepResponseTest(test, elapsedTime, progress);
        break;
      case 'endurance_test':
        executeEnduranceTest(test, elapsedTime, progress);
        break;
    }
    
    return progress;
  }, []);

  const executeEfficiencyMapTest = (test: ProfessionalTestSequence, elapsedTime: number, progress: number) => {
    const { speedRange, torqueRange, gridPoints } = test.parameters;
    if (!speedRange || !torqueRange || !gridPoints) return;

    const totalPoints = gridPoints.speed * gridPoints.torque;
    const currentPointIndex = Math.floor(progress * totalPoints);
    const speedIndex = Math.floor(currentPointIndex / gridPoints.torque);
    const torqueIndex = currentPointIndex % gridPoints.torque;
    
    const targetSpeed = speedRange.min + (speedIndex / (gridPoints.speed - 1)) * (speedRange.max - speedRange.min);
    const targetTorque = torqueRange.min + (torqueIndex / (gridPoints.torque - 1)) * (torqueRange.max - torqueRange.min);
    
    onSpeedControl(targetSpeed);
    onLoadControl(targetTorque);
    
    const phase = `Mapping point ${currentPointIndex + 1}/${totalPoints} (${targetSpeed.toFixed(0)} RPM, ${targetTorque.toFixed(1)} Nm)`;
    onTestProgress(progress * 100, phase);
  };

  const executePerformanceCurveTest = (test: ProfessionalTestSequence, elapsedTime: number, progress: number) => {
    const { speedSweep } = test.parameters;
    if (!speedSweep) return;

    const targetSpeed = speedSweep.start + progress * (speedSweep.end - speedSweep.start);
    onSpeedControl(targetSpeed);
    
    // Maintain constant torque or voltage based on loadType
    if (test.parameters.loadType === 'constant_torque') {
      onLoadControl(30); // 30 Nm constant load
    }
    
    const phase = `Speed sweep: ${targetSpeed.toFixed(0)} RPM`;
    onTestProgress(progress * 100, phase);
  };

  const executeThermalTest = (test: ProfessionalTestSequence, elapsedTime: number, progress: number) => {
    const { testLoad, testSpeed } = test.parameters;
    if (!testLoad || !testSpeed) return;

    onSpeedControl(testSpeed);
    onLoadControl(testLoad);
    
    const phase = `Thermal characterization: ${elapsedTime.toFixed(0)}s at ${testSpeed} RPM, ${testLoad} Nm`;
    onTestProgress(progress * 100, phase);
    
    // Check temperature limits
    if (test.parameters.tempLimits) {
      const { warning, critical } = test.parameters.tempLimits;
      if (motorData.temperature > critical) {
        abortTest('Critical temperature exceeded');
      } else if (motorData.temperature > warning) {
        console.warn('Temperature warning level reached');
      }
    }
  };

  const executeStepResponseTest = (test: ProfessionalTestSequence, elapsedTime: number, progress: number) => {
    const { stepSize, responseType } = test.parameters;
    if (!stepSize || !responseType) return;

    const stepTime = 5; // Step occurs at 5 seconds
    
    if (elapsedTime < stepTime) {
      onSpeedControl(1000); // Initial speed
      onTestProgress((elapsedTime / stepTime) * 50, 'Pre-step steady state');
    } else {
      onSpeedControl(1000 + stepSize); // Step to higher speed
      const stepProgress = ((elapsedTime - stepTime) / (test.parameters.duration! - stepTime)) * 50 + 50;
      onTestProgress(stepProgress, 'Step response analysis');
    }
  };

  const executeEnduranceTest = (test: ProfessionalTestSequence, elapsedTime: number, progress: number) => {
    const { testProfile } = test.parameters;
    
    switch (testProfile) {
      case 'cycling':
        // Cycling load pattern
        const cycleTime = 60; // 1 minute cycles
        const cyclePhase = (elapsedTime % cycleTime) / cycleTime;
        const load = 20 + 40 * Math.sin(2 * Math.PI * cyclePhase); // 20-60 Nm cycling
        const speed = 2000 + 1000 * Math.sin(2 * Math.PI * cyclePhase * 0.5); // Speed variation
        
        onSpeedControl(speed);
        onLoadControl(load);
        break;
      
      case 'constant':
        onSpeedControl(2500);
        onLoadControl(40);
        break;
      
      default:
        // Variable profile - could be loaded from file
        onSpeedControl(2000 + 1000 * Math.sin(elapsedTime * 0.1));
        onLoadControl(30 + 20 * Math.cos(elapsedTime * 0.05));
    }
    
    const phase = `Endurance testing: ${(elapsedTime / 60).toFixed(1)} min elapsed`;
    onTestProgress(progress * 100, phase);
  };

  // Test execution loop
  const runTest = useCallback(() => {
    if (!currentTest || !isRunning || isPaused) return;

    const now = Date.now();
    const elapsedTime = (now - testStartTimeRef.current) / 1000;
    const duration = currentTest.parameters.duration || 60;
    
    if (elapsedTime >= duration) {
      // Test completed
      completeTest();
      return;
    }

    const progress = executeTestPhase(currentTest, elapsedTime);
    
    // Record data point
    const dataPoint: TestPoint = {
      time: elapsedTime,
      speed: motorData.rpm,
      torque: motorData.torque,
      efficiency: motorData.efficiency,
      temperature: motorData.temperature,
      power: motorData.power,
      voltage: motorData.voltage,
      current: motorData.current
    };
    
    testDataRef.current.push(dataPoint);
    
    // Update test result
    if (testResult) {
      setTestResult({
        ...testResult,
        progress: progress * 100,
        dataPoints: [...testDataRef.current]
      });
    }

    animationRef.current = requestAnimationFrame(runTest);
  }, [currentTest, isRunning, isPaused, motorData, testResult, executeTestPhase]);

  const startTest = (test: ProfessionalTestSequence) => {
    if (!isConnected) {
      alert('Motor simulation not connected');
      return;
    }

    setCurrentTest(test);
    setIsRunning(true);
    setIsPaused(false);
    testStartTimeRef.current = Date.now();
    testDataRef.current = [];
    
    const newResult: TestResult = {
      testId: test.id,
      startTime: new Date(),
      status: 'running',
      progress: 0,
      currentPhase: 'Initializing...',
      dataPoints: [],
      passFailStatus: 'pending'
    };
    
    setTestResult(newResult);
    runTest();
  };

  const completeTest = () => {
    if (!currentTest || !testResult) return;

    setIsRunning(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Evaluate pass/fail criteria
    const { passFailStatus, failureReasons } = evaluateTestCriteria(currentTest, testDataRef.current);
    
    // Calculate summary metrics
    const summary = calculateTestSummary(testDataRef.current);

    const finalResult: TestResult = {
      ...testResult,
      endTime: new Date(),
      status: 'completed',
      progress: 100,
      currentPhase: 'Test completed',
      dataPoints: testDataRef.current,
      passFailStatus: passFailStatus as 'pass' | 'fail' | 'pending',
      failureReasons,
      summary
    };

    setTestResult(finalResult);
    onTestComplete(finalResult);

    // Auto-export if enabled
    if (currentTest.autoExport) {
      exportTestResults(finalResult);
    }

    setCurrentTest(null);
  };

  const abortTest = (reason: string) => {
    setIsRunning(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (testResult) {
      const abortedResult: TestResult = {
        ...testResult,
        endTime: new Date(),
        status: 'aborted',
        passFailStatus: 'fail',
        failureReasons: [reason]
      };
      
      setTestResult(abortedResult);
      onTestComplete(abortedResult);
    }

    setCurrentTest(null);
  };

  const evaluateTestCriteria = (test: ProfessionalTestSequence, dataPoints: TestPoint[]) => {
    const criteria = test.acceptanceCriteria;
    const failureReasons: string[] = [];
    
    if (criteria.minEfficiency) {
      const avgEfficiency = dataPoints.reduce((sum, p) => sum + p.efficiency, 0) / dataPoints.length;
      if (avgEfficiency < criteria.minEfficiency) {
        failureReasons.push(`Average efficiency ${avgEfficiency.toFixed(1)}% below minimum ${criteria.minEfficiency}%`);
      }
    }
    
    if (criteria.maxTemperature) {
      const maxTemp = Math.max(...dataPoints.map(p => p.temperature));
      if (maxTemp > criteria.maxTemperature) {
        failureReasons.push(`Maximum temperature ${maxTemp.toFixed(1)}°C exceeded limit ${criteria.maxTemperature}°C`);
      }
    }
    
    // Add more criteria evaluations as needed...
    
    const passFailStatus: 'pass' | 'fail' = failureReasons.length === 0 ? 'pass' : 'fail';
    return { passFailStatus, failureReasons };
  };

  const calculateTestSummary = (dataPoints: TestPoint[]) => {
    if (dataPoints.length === 0) return undefined;
    
    return {
      peakPower: Math.max(...dataPoints.map(p => p.power)),
      avgEfficiency: dataPoints.reduce((sum, p) => sum + p.efficiency, 0) / dataPoints.length,
      maxTemperature: Math.max(...dataPoints.map(p => p.temperature)),
      energyConsumed: dataPoints.reduce((sum, p) => sum + p.power, 0) / 1000 / 60 // Approximate kWh
    };
  };

  const exportTestResults = (result: TestResult) => {
    const csv = [
      'Time,Speed_RPM,Torque_Nm,Power_W,Efficiency_%,Temperature_C,Voltage_V,Current_A',
      ...result.dataPoints.map(p => 
        `${p.time.toFixed(2)},${p.speed.toFixed(1)},${p.torque.toFixed(2)},${p.power.toFixed(1)},${p.efficiency.toFixed(1)},${p.temperature.toFixed(1)},${p.voltage.toFixed(1)},${p.current.toFixed(2)}`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.testId}_${result.startTime.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Add batch testing functionality
  const addToQueue = (test: ProfessionalTestSequence) => {
    setTestQueue(prev => [...prev, test]);
  };

  const startBatchTest = () => {
    if (testQueue.length === 0 || isRunning) return;
    
    const nextTest = testQueue[0];
    setTestQueue(prev => prev.slice(1));
    startTest(nextTest);
  };

  useEffect(() => {
    if (!isRunning && testQueue.length > 0) {
      // Auto-start next test in queue after a brief delay
      setTimeout(startBatchTest, 2000);
    }
  }, [isRunning, testQueue.length]);

  return {
    standardTests,
    currentTest,
    testResult,
    testQueue,
    isRunning,
    isPaused,
    startTest,
    completeTest,
    abortTest,
    addToQueue,
    startBatchTest,
    setIsPaused
  };
};

export default useTestSequenceEngine;
export { useTestSequenceEngine };