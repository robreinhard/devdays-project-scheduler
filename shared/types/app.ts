import type { SprintCapacity } from './scheduling';

/**
 * Application state stored in URL query params
 * This enables shareable URLs
 */
export interface AppState {
  projectKey?: string;             // Selected JIRA project key
  boardId?: number;                // Selected JIRA board ID
  epicKeys: string[];              // Selected epic keys (e.g., ["PROJ-1", "PROJ-2"])
  sprintCapacities: SprintCapacity[]; // Selected sprints with their capacities
  viewStartDate?: string;          // Chart X-axis start date (ISO)
  viewEndDate?: string;            // Chart X-axis end date (ISO)
  maxDevelopers: number;           // Points per day capacity (e.g., 5 devs = 5 pts/day)
}

/**
 * Default app state
 */
export const DEFAULT_APP_STATE: AppState = {
  epicKeys: [],
  sprintCapacities: [],
  maxDevelopers: 5,
};

/**
 * Query param keys
 */
export const QUERY_PARAM_KEYS = {
  PROJECT: 'project',
  BOARD: 'board',
  SPRINT_FILTER: 'sf',
  EPICS: 'epics',
  SPRINTS: 'sprints',
  START_DATE: 'start',
  END_DATE: 'end',
  MAX_DEVS: 'maxDevs',
  DAILY_CAPS: 'dc',
} as const;
