/**
 * JIRA Data Types
 * These represent data as it comes from the JIRA API
 */

export interface JiraEpic {
  key: string;           // e.g., "PROJ-123"
  summary: string;       // Epic title
  status: string;        // e.g., "In Progress"
}

export interface JiraTicket {
  key: string;           // e.g., "PROJ-456"
  summary: string;       // Ticket title
  status: string;
  epicKey: string;       // Parent epic key
  devDays: number;       // Custom field: Story Points / Dev Days
  timelineOrder: number; // Custom field: Linear order within epic
  assignee?: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate: string;     // ISO date string
  endDate: string;       // ISO date string
}

/**
 * Raw JIRA API response types
 */
export interface JiraIssueResponse {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    } | null;
    parent?: {
      key: string;
    };
    [key: string]: unknown; // Custom fields accessed by ID
  };
}

export interface JiraSprintResponse {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraSearchResponse {
  issues: JiraIssueResponse[];
  total: number;
  maxResults: number;
  startAt: number;
}
