/**
 * JIRA Data Types
 * These represent data as it comes from the JIRA API
 */

/**
 * Commit type for epics - determines scheduling priority
 * - 'commit': High priority epics that are scheduled first
 * - 'stretch': Lower priority epics that fill gaps after commits
 */
export type CommitType = 'commit' | 'stretch';

export interface JiraEpic {
  key: string;           // e.g., "PROJ-123"
  summary: string;       // Epic title
  status: string;        // e.g., "In Progress"
  commitType: CommitType; // From labels: "Commit" or "Stretch" (default: stretch)
  priorityOverride?: number; // From labels like "Commit-1", "Stretch-2" for manual ordering
}

export interface JiraTicket {
  key: string;           // e.g., "PROJ-456"
  summary: string;       // Ticket title
  status: string;
  epicKey: string;       // Parent epic key
  devDays: number;       // Custom field: Story Points / Dev Days (default: 5 if missing)
  blockedBy?: string[];  // Ticket keys that block this ticket
  assignee?: string;
  assigneeAvatarUrl?: string; // Profile photo URL from JIRA
  isMissingEstimate: boolean; // True if devDays was defaulted (no estimate in JIRA)
  sprintIds?: number[];  // Sprint IDs from JIRA (ticket can be in multiple sprints)
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate: string;     // ISO date string
  endDate: string;       // ISO date string
}

/**
 * JIRA issue link structure
 */
export interface JiraIssueLink {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;   // e.g., "is blocked by"
    outward: string;  // e.g., "blocks"
  };
  inwardIssue?: {
    key: string;
    fields: {
      summary: string;
    };
  };
  outwardIssue?: {
    key: string;
    fields: {
      summary: string;
    };
  };
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
      avatarUrls?: {
        '48x48'?: string;
        '32x32'?: string;
        '24x24'?: string;
        '16x16'?: string;
      };
    } | null;
    parent?: {
      key: string;
    };
    labels?: string[]; // JIRA labels array
    issuelinks?: JiraIssueLink[]; // Issue links for blockers
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

export interface JiraProject {
  key: string;      // e.g., "PROJ"
  name: string;     // e.g., "Project Name"
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;     // 'scrum' | 'kanban' | 'simple'
}

export interface JiraProjectResponse {
  key: string;
  name: string;
}

export interface JiraBoardResponse {
  id: number;
  name: string;
  type: string;
}
