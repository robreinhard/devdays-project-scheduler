import type { JiraEpic, JiraTicket, JiraSprint } from './jira';

/**
 * Daily capacity override for PTO tracking
 */
export interface DailyCapacity {
  date: string;     // ISO date string (YYYY-MM-DD)
  capacity: number; // Points available on this day (0 = day off)
}

/**
 * Sprint capacity (managed in-app, not in JIRA)
 */
export interface SprintCapacity {
  sprintId: number;
  devDaysCapacity: number; // Default points per day for this sprint
  dailyCapacities?: DailyCapacity[]; // Optional per-day overrides for PTO
}

/**
 * A sprint with its capacity configuration
 */
export interface SprintWithCapacity extends JiraSprint {
  devDaysCapacity: number;
  remainingCapacity?: number; // Calculated during scheduling
}

/**
 * Scheduled ticket with computed start/end days
 */
export interface ScheduledTicket extends JiraTicket {
  startDay: number;      // Day index into dailyCapacities array
  endDay: number;        // Day index into dailyCapacities array (exclusive)
  startDate: string;     // Actual start date (ISO string)
  endDate: string;       // Actual end date (ISO string) - last day of work
  sprintId: number;      // Which sprint it's slotted in
  parallelGroup: number; // Topological level (0 = no deps, higher = more deps)
  criticalPathWeight: number; // Total dev days of this ticket + all downstream tickets
  isOnCriticalPath: boolean; // True if this ticket is on the critical path
}

/**
 * Scheduled epic with all its scheduled tickets
 */
export interface ScheduledEpic extends JiraEpic {
  tickets: ScheduledTicket[];
  totalDevDays: number;
  startDay: number;
  endDay: number;
  startDate: string;     // Actual start date (ISO string)
  endDate: string;       // Actual end date (ISO string) - last day of work
}

/**
 * Daily capacity info for display in the GANTT chart
 */
export interface DayCapacityInfo {
  date: string;        // ISO date string (YYYY-MM-DD)
  dayIndex: number;    // Day offset from project start
  sprintId: number;    // Which sprint this day belongs to
  totalCapacity: number;    // Original capacity for this day
  remainingCapacity: number; // Capacity left after scheduling
  usedCapacity: number;      // Capacity used by scheduled tickets
}

/**
 * Complete GANTT data returned from the scheduling algorithm
 */
export interface GanttData {
  epics: ScheduledEpic[];
  sprints: SprintWithCapacity[];
  dailyCapacities: DayCapacityInfo[]; // Per-day capacity info for display
  projectStartDate: string;
  projectEndDate: string;
  totalDevDays: number;
  totalDays: number; // Work days (weekends always excluded)
}

/**
 * Input parameters for the scheduling algorithm
 */
export interface SchedulingInput {
  epics: JiraEpic[];
  tickets: JiraTicket[];
  sprints: JiraSprint[];
  sprintCapacities: SprintCapacity[];
  maxDevelopers: number;  // Points per day capacity (e.g., 5 devs = 5 pts/day)
}
