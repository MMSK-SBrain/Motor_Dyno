import React, { useState, useRef } from 'react';
import { TestResult, TestPoint } from './TestSequenceEngine';

interface TestReportingProps {
  testResults: TestResult[];
  motorConfig: {
    name: string;
    type: string;
    maxRpm: number;
    maxPower: number;
    ratedVoltage: number;
  };
}

interface ReportConfig {
  includeGraphs: boolean;
  includeRawData: boolean;
  includeStatistics: boolean;
  format: 'PDF' | 'CSV' | 'JSON';
  testIds: string[];
}

const TestReporting: React.FC<TestReportingProps> = ({ testResults, motorConfig }) => {
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [reportConfig, setReportConfig] = useState<ReportConfig>({
    includeGraphs: true,
    includeRawData: false,
    includeStatistics: true,
    format: 'PDF',
    testIds: []
  });
  const [showReportDialog, setShowReportDialog] = useState(false);
  const chartCanvasRef = useRef<HTMLCanvasElement>(null);

  const generateTestReport = (result: TestResult) => {
    const reportData = {
      testInfo: {
        testId: result.testId,
        testName: result.testId.replace('_', ' ').toUpperCase(),
        startTime: result.startTime.toISOString(),
        endTime: result.endTime?.toISOString(),
        duration: result.endTime ? 
          ((result.endTime.getTime() - result.startTime.getTime()) / 1000).toFixed(0) + 's' : 'N/A',
        status: result.status,
        passFailStatus: result.passFailStatus
      },
      motorInfo: {
        name: motorConfig.name,
        type: motorConfig.type,
        maxRpm: motorConfig.maxRpm,
        maxPower: motorConfig.maxPower,
        ratedVoltage: motorConfig.ratedVoltage
      },
      testResults: {
        summary: result.summary,
        failureReasons: result.failureReasons,
        dataPoints: result.dataPoints.length
      },
      statistics: calculateStatistics(result.dataPoints),
      dataPoints: reportConfig.includeRawData ? result.dataPoints : []
    };

    return reportData;
  };

  const calculateStatistics = (dataPoints: TestPoint[]) => {
    if (dataPoints.length === 0) return null;

    const stats = {
      speed: calculateStats(dataPoints.map(p => p.speed)),
      torque: calculateStats(dataPoints.map(p => p.torque)),
      power: calculateStats(dataPoints.map(p => p.power)),
      efficiency: calculateStats(dataPoints.map(p => p.efficiency)),
      temperature: calculateStats(dataPoints.map(p => p.temperature)),
      voltage: calculateStats(dataPoints.map(p => p.voltage)),
      current: calculateStats(dataPoints.map(p => p.current))
    };

    return stats;
  };

  const calculateStats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return {
      min: Math.min(...values),
      max: Math.max(...values),
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      stdDev,
      range: Math.max(...values) - Math.min(...values)
    };
  };

  const exportToCSV = (result: TestResult) => {
    const reportData = generateTestReport(result);
    
    let csv = '# Professional Dynamometer Test Report\n';
    csv += `# Test: ${reportData.testInfo.testName}\n`;
    csv += `# Motor: ${reportData.motorInfo.name}\n`;
    csv += `# Date: ${reportData.testInfo.startTime}\n`;
    csv += `# Status: ${reportData.testInfo.passFailStatus?.toUpperCase()}\n#\n`;
    
    if (reportData.testResults.summary) {
      csv += '# Summary Results\n';
      csv += `# Peak Power: ${reportData.testResults.summary.peakPower.toFixed(1)} W\n`;
      csv += `# Average Efficiency: ${reportData.testResults.summary.avgEfficiency.toFixed(1)} %\n`;
      csv += `# Maximum Temperature: ${reportData.testResults.summary.maxTemperature.toFixed(1)} °C\n`;
      csv += `# Energy Consumed: ${reportData.testResults.summary.energyConsumed.toFixed(3)} kWh\n#\n`;
    }

    csv += 'Time_s,Speed_RPM,Torque_Nm,Power_W,Efficiency_%,Temperature_C,Voltage_V,Current_A\n';
    result.dataPoints.forEach(point => {
      csv += `${point.time.toFixed(2)},${point.speed.toFixed(1)},${point.torque.toFixed(2)},${point.power.toFixed(1)},${point.efficiency.toFixed(1)},${point.temperature.toFixed(1)},${point.voltage.toFixed(1)},${point.current.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.testId}_report_${result.startTime.toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = (result: TestResult) => {
    const reportData = generateTestReport(result);
    
    const json = JSON.stringify(reportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.testId}_report_${result.startTime.toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generatePDFReport = (result: TestResult) => {
    // For PDF generation, we would typically use a library like jsPDF
    // For now, we'll create a formatted HTML report that can be printed to PDF
    const reportData = generateTestReport(result);
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dynamometer Test Report - ${reportData.testInfo.testName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { border-bottom: 3px solid #00ccff; padding-bottom: 20px; margin-bottom: 30px; }
        .title { font-size: 24px; font-weight: bold; color: #00ccff; }
        .subtitle { font-size: 16px; color: #666; margin-top: 5px; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: bold; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 15px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
        .info-card { background: #f9f9f9; padding: 15px; border-radius: 5px; }
        .info-label { font-weight: bold; color: #666; font-size: 12px; }
        .info-value { font-size: 16px; color: #333; margin-top: 5px; }
        .pass { color: #00ff41; font-weight: bold; }
        .fail { color: #ff6666; font-weight: bold; }
        .stats-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .stats-table th, .stats-table td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        .stats-table th { background-color: #f2f2f2; font-weight: bold; }
        .chart-placeholder { height: 300px; background: #f5f5f5; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">Professional Dynamometer Test Report</div>
        <div class="subtitle">${reportData.testInfo.testName}</div>
        <div class="subtitle">Generated: ${new Date().toLocaleString()}</div>
      </div>

      <div class="section">
        <div class="section-title">Test Information</div>
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">Test ID</div>
            <div class="info-value">${reportData.testInfo.testId}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Test Status</div>
            <div class="info-value ${reportData.testInfo.passFailStatus}">
              ${reportData.testInfo.passFailStatus?.toUpperCase() || 'PENDING'}
            </div>
          </div>
          <div class="info-card">
            <div class="info-label">Start Time</div>
            <div class="info-value">${new Date(reportData.testInfo.startTime).toLocaleString()}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Duration</div>
            <div class="info-value">${reportData.testInfo.duration}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Motor Configuration</div>
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">Motor Name</div>
            <div class="info-value">${reportData.motorInfo.name}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Motor Type</div>
            <div class="info-value">${reportData.motorInfo.type}</div>
          </div>
          <div class="info-card">
            <div class="info-label">Max Speed</div>
            <div class="info-value">${reportData.motorInfo.maxRpm} RPM</div>
          </div>
          <div class="info-card">
            <div class="info-label">Max Power</div>
            <div class="info-value">${reportData.motorInfo.maxPower} W</div>
          </div>
        </div>
      </div>

      ${reportData.testResults.summary ? `
      <div class="section">
        <div class="section-title">Test Summary</div>
        <div class="info-grid">
          <div class="info-card">
            <div class="info-label">Peak Power</div>
            <div class="info-value">${reportData.testResults.summary.peakPower.toFixed(1)} W</div>
          </div>
          <div class="info-card">
            <div class="info-label">Average Efficiency</div>
            <div class="info-value">${reportData.testResults.summary.avgEfficiency.toFixed(1)} %</div>
          </div>
          <div class="info-card">
            <div class="info-label">Maximum Temperature</div>
            <div class="info-value">${reportData.testResults.summary.maxTemperature.toFixed(1)} °C</div>
          </div>
          <div class="info-card">
            <div class="info-label">Energy Consumed</div>
            <div class="info-value">${reportData.testResults.summary.energyConsumed.toFixed(3)} kWh</div>
          </div>
        </div>
      </div>
      ` : ''}

      ${reportData.testResults.failureReasons && reportData.testResults.failureReasons.length > 0 ? `
      <div class="section">
        <div class="section-title">Test Failures</div>
        <ul>
          ${reportData.testResults.failureReasons.map(reason => `<li>${reason}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${reportData.statistics ? `
      <div class="section">
        <div class="section-title">Statistical Analysis</div>
        <table class="stats-table">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Min</th>
              <th>Max</th>
              <th>Mean</th>
              <th>Std Dev</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Speed (RPM)</td><td>${reportData.statistics.speed.min.toFixed(1)}</td><td>${reportData.statistics.speed.max.toFixed(1)}</td><td>${reportData.statistics.speed.mean.toFixed(1)}</td><td>${reportData.statistics.speed.stdDev.toFixed(1)}</td></tr>
            <tr><td>Torque (Nm)</td><td>${reportData.statistics.torque.min.toFixed(2)}</td><td>${reportData.statistics.torque.max.toFixed(2)}</td><td>${reportData.statistics.torque.mean.toFixed(2)}</td><td>${reportData.statistics.torque.stdDev.toFixed(2)}</td></tr>
            <tr><td>Power (W)</td><td>${reportData.statistics.power.min.toFixed(1)}</td><td>${reportData.statistics.power.max.toFixed(1)}</td><td>${reportData.statistics.power.mean.toFixed(1)}</td><td>${reportData.statistics.power.stdDev.toFixed(1)}</td></tr>
            <tr><td>Efficiency (%)</td><td>${reportData.statistics.efficiency.min.toFixed(1)}</td><td>${reportData.statistics.efficiency.max.toFixed(1)}</td><td>${reportData.statistics.efficiency.mean.toFixed(1)}</td><td>${reportData.statistics.efficiency.stdDev.toFixed(1)}</td></tr>
            <tr><td>Temperature (°C)</td><td>${reportData.statistics.temperature.min.toFixed(1)}</td><td>${reportData.statistics.temperature.max.toFixed(1)}</td><td>${reportData.statistics.temperature.mean.toFixed(1)}</td><td>${reportData.statistics.temperature.stdDev.toFixed(1)}</td></tr>
          </tbody>
        </table>
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">Performance Charts</div>
        <div class="chart-placeholder">
          Charts would be rendered here<br/>
          (Speed vs Time, Torque vs Time, Efficiency vs Speed, etc.)
        </div>
      </div>

      <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
        Generated by Professional Dynamometer Control System v2.0<br/>
        Report ID: ${result.testId}_${result.startTime.getTime()}
      </div>
    </body>
    </html>
    `;

    const newWindow = window.open('', '_blank');
    if (newWindow) {
      newWindow.document.write(htmlContent);
      newWindow.document.close();
      setTimeout(() => {
        newWindow.print();
      }, 1000);
    }
  };

  const exportBatchReport = () => {
    const selectedResults = testResults.filter(result => 
      reportConfig.testIds.includes(result.testId)
    );

    if (selectedResults.length === 0) {
      alert('No tests selected for batch export');
      return;
    }

    // Create combined CSV for batch export
    let batchCSV = '# Professional Dynamometer Batch Test Report\n';
    batchCSV += `# Generated: ${new Date().toISOString()}\n`;
    batchCSV += `# Number of Tests: ${selectedResults.length}\n#\n`;

    selectedResults.forEach((result, index) => {
      batchCSV += `\n# Test ${index + 1}: ${result.testId}\n`;
      batchCSV += `# Status: ${result.passFailStatus?.toUpperCase()}\n`;
      if (result.summary) {
        batchCSV += `# Peak Power: ${result.summary.peakPower.toFixed(1)}W, Avg Efficiency: ${result.summary.avgEfficiency.toFixed(1)}%\n`;
      }
      batchCSV += 'Time_s,Speed_RPM,Torque_Nm,Power_W,Efficiency_%,Temperature_C,Voltage_V,Current_A\n';
      
      result.dataPoints.forEach(point => {
        batchCSV += `${point.time.toFixed(2)},${point.speed.toFixed(1)},${point.torque.toFixed(2)},${point.power.toFixed(1)},${point.efficiency.toFixed(1)},${point.temperature.toFixed(1)},${point.voltage.toFixed(1)},${point.current.toFixed(2)}\n`;
      });
    });

    const blob = new Blob([batchCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_test_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const styles = {
    container: {
      background: 'linear-gradient(145deg, #1e1e1e, #2a2a2a)',
      borderRadius: '10px',
      padding: '20px',
      color: '#ddd',
      fontFamily: 'sans-serif'
    },
    title: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '15px',
      color: '#00ccff',
      borderBottom: '2px solid #00ccff',
      paddingBottom: '5px'
    },
    resultsGrid: {
      display: 'grid',
      gridTemplateColumns: '1fr',
      gap: '10px',
      marginBottom: '20px'
    },
    resultCard: {
      padding: '12px',
      backgroundColor: '#2a2a2a',
      borderRadius: '5px',
      cursor: 'pointer',
      transition: 'all 0.3s',
      border: '1px solid #444'
    },
    selectedCard: {
      border: '2px solid #00ccff',
      backgroundColor: '#333'
    },
    resultHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    },
    resultName: {
      fontSize: '13px',
      fontWeight: 'bold',
      color: '#ddd'
    },
    resultStatus: {
      fontSize: '11px',
      fontWeight: 'bold',
      padding: '2px 8px',
      borderRadius: '3px'
    },
    passStatus: {
      backgroundColor: '#00ff41',
      color: '#000'
    },
    failStatus: {
      backgroundColor: '#ff6666',
      color: '#fff'
    },
    pendingStatus: {
      backgroundColor: '#ffcc00',
      color: '#000'
    },
    resultDetails: {
      fontSize: '11px',
      color: '#aaa'
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '8px',
      marginTop: '8px'
    },
    summaryItem: {
      fontSize: '10px',
      color: '#888'
    },
    exportSection: {
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#1a1a1a',
      borderRadius: '5px'
    },
    exportTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#ffcc00',
      marginBottom: '10px'
    },
    exportButtons: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap' as const
    },
    exportButton: {
      padding: '8px 12px',
      backgroundColor: '#00ccff',
      color: '#000',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 'bold',
      transition: 'all 0.3s'
    },
    batchSection: {
      marginTop: '15px',
      padding: '10px',
      backgroundColor: '#222',
      borderRadius: '5px'
    },
    checkboxList: {
      maxHeight: '150px',
      overflowY: 'auto' as const,
      marginBottom: '10px'
    },
    checkboxItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '4px 0',
      fontSize: '11px'
    },
    checkbox: {
      marginRight: '8px'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.title}>Test Reporting & Export</div>
      
      {testResults.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
          No test results available for reporting
        </div>
      ) : (
        <>
          {/* Test Results List */}
          <div style={styles.resultsGrid}>
            {testResults.map((result, index) => (
              <div
                key={`${result.testId}-${index}`}
                style={{
                  ...styles.resultCard,
                  ...(selectedResult?.testId === result.testId ? styles.selectedCard : {})
                }}
                onClick={() => setSelectedResult(result)}
              >
                <div style={styles.resultHeader}>
                  <div style={styles.resultName}>
                    {result.testId.replace('_', ' ').toUpperCase()}
                  </div>
                  <div style={{
                    ...styles.resultStatus,
                    ...(result.passFailStatus === 'pass' ? styles.passStatus :
                        result.passFailStatus === 'fail' ? styles.failStatus :
                        styles.pendingStatus)
                  }}>
                    {result.passFailStatus?.toUpperCase() || 'PENDING'}
                  </div>
                </div>
                <div style={styles.resultDetails}>
                  Started: {result.startTime.toLocaleString()}
                  {result.endTime && ` | Duration: ${((result.endTime.getTime() - result.startTime.getTime()) / 1000).toFixed(0)}s`}
                </div>
                {result.summary && (
                  <div style={styles.summaryGrid}>
                    <div style={styles.summaryItem}>
                      Peak: {result.summary.peakPower.toFixed(0)}W
                    </div>
                    <div style={styles.summaryItem}>
                      Eff: {result.summary.avgEfficiency.toFixed(1)}%
                    </div>
                    <div style={styles.summaryItem}>
                      Temp: {result.summary.maxTemperature.toFixed(0)}°C
                    </div>
                    <div style={styles.summaryItem}>
                      Points: {result.dataPoints.length}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Export Controls */}
          <div style={styles.exportSection}>
            <div style={styles.exportTitle}>Export Options</div>
            
            {selectedResult && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                  Selected: {selectedResult.testId.replace('_', ' ').toUpperCase()}
                </div>
                <div style={styles.exportButtons}>
                  <button
                    style={styles.exportButton}
                    onClick={() => exportToCSV(selectedResult)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ddff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ccff'}
                  >
                    Export CSV
                  </button>
                  <button
                    style={styles.exportButton}
                    onClick={() => exportToJSON(selectedResult)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ddff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ccff'}
                  >
                    Export JSON
                  </button>
                  <button
                    style={styles.exportButton}
                    onClick={() => generatePDFReport(selectedResult)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ddff'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ccff'}
                  >
                    Generate PDF Report
                  </button>
                </div>
              </div>
            )}

            {/* Batch Export */}
            <div style={styles.batchSection}>
              <div style={styles.exportTitle}>Batch Export</div>
              <div style={styles.checkboxList}>
                {testResults.map((result, index) => (
                  <div key={`batch-${result.testId}-${index}`} style={styles.checkboxItem}>
                    <input
                      type="checkbox"
                      style={styles.checkbox}
                      checked={reportConfig.testIds.includes(result.testId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setReportConfig(prev => ({
                            ...prev,
                            testIds: [...prev.testIds, result.testId]
                          }));
                        } else {
                          setReportConfig(prev => ({
                            ...prev,
                            testIds: prev.testIds.filter(id => id !== result.testId)
                          }));
                        }
                      }}
                    />
                    {result.testId.replace('_', ' ').toUpperCase()} - {result.passFailStatus?.toUpperCase() || 'PENDING'}
                  </div>
                ))}
              </div>
              <button
                style={styles.exportButton}
                onClick={exportBatchReport}
                disabled={reportConfig.testIds.length === 0}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#44ddff'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#00ccff'}
              >
                Export Batch Report ({reportConfig.testIds.length} selected)
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TestReporting;