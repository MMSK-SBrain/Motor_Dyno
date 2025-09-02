// TypeScript type definitions for Motor Dyno MVP

export interface Motor {
  id: string;
  name: string;
  type: 'BLDC' | 'PMSM' | 'SRM' | 'ACIM';
  description?: string;
  electrical_specs: ElectricalSpecs;
  physical_parameters: PhysicalParameters;
  operating_limits: OperatingLimits;
}

export interface ElectricalSpecs {
  rated_power_kw: number;
  rated_voltage_v: number;
  rated_current_a: number;
  rated_speed_rpm: number;
  rated_torque_nm: number;
  max_speed_rpm: number;
  max_torque_nm: number;
  efficiency_percent: number;
}

export interface PhysicalParameters {
  poles: number;
  stator_slots?: number;
  configuration: string;
  phase_resistance_ohm: number;
  phase_inductance_mh: number;
  torque_constant_nm_per_a: number;
  back_emf_constant_v_per_rad_per_s: number;
  rotor_inertia_kg_m2: number;
}

export interface OperatingLimits {
  max_current_a: number;
  max_voltage_v: number;
  max_temperature_c: number;
  min_speed_rpm: number;
  continuous_power_kw: number;
  peak_power_kw: number;
}

export interface PIDParams {
  kp: number;
  ki: number;
  kd: number;
  max_output: number;
  max_integral: number;
}

export interface SimulationConfig {
  timestep_ms: number;
  max_duration_s: number;
  data_logging_enabled: boolean;
  pid_params: PIDParams;
}

export interface SimulationSession {
  session_id: string;
  motor_id: string;
  status: 'started' | 'stopped' | 'paused' | 'error';
  websocket_url: string;
  created_at: string;
  control_mode: 'manual' | 'drive_cycle' | 'pid_test';
  session_name?: string;
  configuration?: SimulationConfig;
}

export interface SimulationData {
  timestamp: number;
  speed_rpm: number;
  torque_nm: number;
  current_a: number;
  voltage_v: number;
  efficiency_percent: number;
  power_w: number;
  temperature_c: number;
  pid_output: number;
  pid_error?: number;
}

export interface ControlCommand {
  target_speed_rpm?: number;
  target_torque_nm?: number;
  load_torque_percent?: number;
  pid_params?: Partial<PIDParams>;
}

export interface WebSocketMessage {
  type: 'control' | 'simulation_data' | 'status' | 'error' | 'alert' | 'configure';
  timestamp: number;
  payload: any;
}

export interface BinaryMessageHeader {
  message_type: number;
  payload_length: number;
  timestamp_ms: number;
}

export interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastConnected?: Date;
  errorMessage?: string;
  reconnectAttempts: number;
  dataRate: number; // messages per second
}

export interface PlotDataPoint {
  x: number; // timestamp or index
  y: number; // value
}

export interface PlotSeries {
  name: string;
  data: PlotDataPoint[];
  color: string;
  unit: string;
  visible: boolean;
}

export interface PlotConfig {
  maxDataPoints: number;
  updateInterval: number; // ms
  autoScale: boolean;
  timeWindow: number; // seconds
  series: PlotSeries[];
}

export interface PerformanceMetrics {
  frameRate: number;
  dataPoints: number;
  cpuUsage?: number;
  memoryUsage?: number;
  networkLatency?: number;
  droppedFrames: number;
}

export interface AlertMessage {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: Date;
  autoHide?: boolean;
  duration?: number;
}

export interface DriveCycle {
  id: string;
  name: string;
  type: 'standard' | 'custom';
  duration_s: number;
  max_speed_rpm: number;
  description?: string;
  uploaded_by?: string;
  data_points?: DriveCyclePoint[];
}

export interface DriveCyclePoint {
  time_s: number;
  speed_rpm: number;
  load_torque_percent: number;
}

export interface EfficiencyMapPoint {
  speed_rpm: number;
  torque_nm: number;
  efficiency_percent: number;
  current_a: number;
  voltage_v: number;
  power_w: number;
  temperature_c: number;
}

export interface SessionResults {
  session_id: string;
  motor_id: string;
  session_info: {
    start_time: string;
    end_time: string;
    duration_s: number;
    control_mode: string;
    cycle_name?: string;
  };
  performance_metrics: {
    energy_consumption_wh: number;
    regenerative_recovery_wh?: number;
    net_consumption_wh?: number;
    average_efficiency_percent: number;
    peak_power_kw: number;
    speed_tracking_rms_error_rpm?: number;
    max_speed_error_rpm?: number;
  };
  control_quality?: {
    pid_settling_time_avg_s: number;
    pid_overshoot_avg_percent: number;
    steady_state_error_rms_rpm: number;
    control_effort_rms: number;
  };
  raw_data?: SimulationData[];
}

export interface APIError {
  error: string;
  message: string;
  details?: {
    [key: string]: any;
  };
}

// UI State Interfaces
export interface AppState {
  selectedMotor?: Motor;
  currentSession?: SimulationSession;
  connectionState: ConnectionState;
  simulationData: SimulationData[];
  controlParams: ControlCommand;
  plotConfig: PlotConfig;
  performanceMetrics: PerformanceMetrics;
  alerts: AlertMessage[];
  isLoading: boolean;
}

export interface MotorControlState {
  targetSpeed: number;
  targetTorque: number;
  loadTorque: number;
  pidParams: PIDParams;
  controlMode: 'speed' | 'torque';
  isActive: boolean;
}