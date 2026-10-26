export type AttendanceStatus = "working" | "paused" | "out";
export type AttendanceAction = "entry" | "pause" | "resume" | "exit";
export interface EmployeeSchedule {
  enabled: boolean;
  entryTime: string;
  exitTime: string;
  toleranceMinutes: number;
}
export interface PunchWindow {
  enabled: boolean;
  allowed: boolean;
  enforced?: boolean;
  time: string | null;
  min: string | null;
  max: string | null;
}
export interface Employee {
  id: string;
  name: string;
  role: "manager" | "employee";
  active: boolean;
  schedule?: EmployeeSchedule;
}
export interface AttendanceEvent {
  id: string;
  employeeId: string;
  action: AttendanceAction;
  at: string;
  schedule?: EmployeeSchedule;
  window?: { min: string; max: string; enforced?: boolean };
}
export interface Journey {
  id: string;
  employeeId: string;
  employeeName: string;
  startedAt: string;
  endedAt: string | null;
  workedMs: number;
  breakMs: number;
  status: AttendanceStatus;
  events: AttendanceEvent[];
}
export interface AttendanceOverview {
  employee: Employee;
  punchWindows?: { entry: PunchWindow; exit: PunchWindow };
  employees: (Employee & { status: AttendanceStatus; lastAt: string | null })[];
  journeys: Journey[];
  serverNow: string;
}
