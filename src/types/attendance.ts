export type AttendanceStatus = "working" | "paused" | "out";
export type AttendanceAction = "entry" | "pause" | "resume" | "exit";
export interface Employee {
  id: string;
  name: string;
  role: "manager" | "employee";
  active: boolean;
}
export interface AttendanceEvent {
  id: string;
  employeeId: string;
  action: AttendanceAction;
  at: string;
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
  employees: (Employee & { status: AttendanceStatus; lastAt: string | null })[];
  journeys: Journey[];
  serverNow: string;
}
