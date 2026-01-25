import type { SprintCapacity, ViewMode } from './scheduling';

/**
 * Application state stored in URL query params
 * This enables shareable URLs
 */
export interface AppState {
  epicKeys: string[];              // Selected epic keys (e.g., ["PROJ-1", "PROJ-2"])
  sprintCapacities: SprintCapacity[]; // Selected sprints with their capacities
  viewStartDate?: string;          // Chart X-axis start date (ISO)
  viewEndDate?: string;            // Chart X-axis end date (ISO)
  viewMode: ViewMode;
  maxDevelopers: number;           // Max parallel tickets on any given day
  includeWeekends: boolean;        // Whether weekends count as working days
}

/**
 * Default app state
 */
export const DEFAULT_APP_STATE: AppState = {
  epicKeys: [],
  sprintCapacities: [],
  viewMode: 'best',
  maxDevelopers: 5,
  includeWeekends: false,
};

/**
 * Query param keys
 */
export const QUERY_PARAM_KEYS = {
  EPICS: 'epics',
  SPRINTS: 'sprints',
  VIEW_MODE: 'viewMode',
  START_DATE: 'start',
  END_DATE: 'end',
  MAX_DEVS: 'maxDevs',
  INCLUDE_WEEKENDS: 'weekends',
} as const;
