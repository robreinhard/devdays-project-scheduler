import type { JiraEpic, JiraTicket, JiraSprint } from './jira';

/**
 * Sprint capacity (managed in-app, not in JIRA)
 */
export interface SprintCapacity {
  sprintId: number;
  devDaysCapacity: number;
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
  startDay: number;      // Day offset from project start
  endDay: number;        // Day offset from project start
  sprintId: number;      // Which sprint it's slotted in
  parallelGroup: number; // For UI: which "lane" for parallel tickets
}

/**
 * Scheduled epic with all its scheduled tickets
 */
export interface ScheduledEpic extends JiraEpic {
  tickets: ScheduledTicket[];
  totalDevDays: number;
  startDay: number;
  endDay: number;
}

/**
 * View mode for the GANTT chart
 */
export type ViewMode = 'best' | 'worst';

/**
 * Complete GANTT data returned from the scheduling algorithm
 */
export interface GanttData {
  epics: ScheduledEpic[];
  sprints: SprintWithCapacity[];
  projectStartDate: string;
  projectEndDate: string;
  totalDevDays: number;
  totalDays: number; // Work days when weekends excluded, calendar days when included
  viewMode: ViewMode;
  includeWeekends: boolean;
}

/**
 * Input parameters for the scheduling algorithm
 */
export interface SchedulingInput {
  epics: JiraEpic[];
  tickets: JiraTicket[];
  sprints: JiraSprint[];
  sprintCapacities: SprintCapacity[];
  viewMode: ViewMode;
  maxDevelopers: number;  // Max parallel tickets on any given day
  includeWeekends: boolean;  // Whether to count weekends as working days
}
