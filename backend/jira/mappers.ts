import type {
  CommitType,
  JiraEpic,
  JiraTicket,
  JiraSprint,
  JiraProject,
  JiraBoard,
  JiraIssueResponse,
  JiraSprintResponse,
  JiraProjectResponse,
  JiraBoardResponse,
  JiraIssueLink,
} from '@/shared/types';

/**
 * Field configuration for mapping custom fields
 */
interface FieldConfig {
  devDays: string;
}

/**
 * Parse commit type and priority override from labels
 * Supports: "Commit", "Commit-1", "Stretch", "Stretch-2", etc.
 */
const parseCommitLabel = (labels: string[] = []): { commitType: CommitType; priorityOverride?: number } => {
  for (const label of labels) {
    const lowerLabel = label.toLowerCase();

    // Check for "Commit-N" pattern
    const commitMatch = lowerLabel.match(/^commit-?(\d+)?$/);
    if (commitMatch) {
      return {
        commitType: 'commit',
        priorityOverride: commitMatch[1] ? parseInt(commitMatch[1], 10) : undefined,
      };
    }

    // Check for "Stretch-N" pattern
    const stretchMatch = lowerLabel.match(/^stretch-?(\d+)?$/);
    if (stretchMatch) {
      return {
        commitType: 'stretch',
        priorityOverride: stretchMatch[1] ? parseInt(stretchMatch[1], 10) : undefined,
      };
    }
  }

  // Default to stretch if no label found
  return { commitType: 'stretch' };
};

/**
 * Map a JIRA issue response to a JiraEpic
 */
export const mapToEpic = (issue: JiraIssueResponse): JiraEpic => {
  const { commitType, priorityOverride } = parseCommitLabel(issue.fields.labels);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    commitType,
    priorityOverride,
  };
};

/**
 * Default story points when no estimate is provided
 */
const DEFAULT_DEV_DAYS = 5;

/**
 * Extract blocker relationships from issue links
 * Returns an array of ticket keys that block this ticket
 */
const extractBlockedBy = (issuelinks: JiraIssueLink[] = []): string[] => {
  const blockedBy: string[] = [];

  for (const link of issuelinks) {
    // Check if this is a "Blocks" type link where another issue blocks this one
    // When inwardIssue exists with "Blocks" type, it means inwardIssue blocks this ticket
    if (link.type.name === 'Blocks' && link.inwardIssue) {
      blockedBy.push(link.inwardIssue.key);
    }
  }

  return blockedBy;
};

/**
 * Map a JIRA issue response to a JiraTicket
 */
export const mapToTicket = (
  issue: JiraIssueResponse,
  epicKey: string,
  fieldConfig: FieldConfig
): JiraTicket => {
  const devDaysValue = issue.fields[fieldConfig.devDays];

  // Check if estimate is missing (null, undefined, 0, or non-number)
  const hasEstimate = typeof devDaysValue === 'number' && devDaysValue > 0;
  const devDays = hasEstimate ? devDaysValue : DEFAULT_DEV_DAYS;

  // Extract blocker relationships from issue links
  const blockedBy = extractBlockedBy(issue.fields.issuelinks);

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    epicKey,
    devDays,
    blockedBy,
    assignee: issue.fields.assignee?.displayName,
    assigneeAvatarUrl: issue.fields.assignee?.avatarUrls?.['24x24'],
    isMissingEstimate: !hasEstimate,
  };
};

/**
 * Map a JIRA sprint response to a JiraSprint
 */
export const mapToSprint = (sprint: JiraSprintResponse): JiraSprint => ({
  id: sprint.id,
  name: sprint.name,
  state: sprint.state as 'active' | 'closed' | 'future',
  startDate: sprint.startDate ?? '',
  endDate: sprint.endDate ?? '',
});

/**
 * Map multiple issues to epics
 */
export const mapToEpics = (issues: JiraIssueResponse[]): JiraEpic[] =>
  issues.map(mapToEpic);

/**
 * Map multiple issues to tickets
 */
export const mapToTickets = (
  issues: JiraIssueResponse[],
  epicKey: string,
  fieldConfig: FieldConfig
): JiraTicket[] =>
  issues.map((issue) => mapToTicket(issue, epicKey, fieldConfig));

/**
 * Map multiple sprints
 */
export const mapToSprints = (sprints: JiraSprintResponse[]): JiraSprint[] =>
  sprints.map(mapToSprint);

/**
 * Map a JIRA project response to a JiraProject
 */
export const mapToProject = (project: JiraProjectResponse): JiraProject => ({
  key: project.key,
  name: project.name,
});

/**
 * Map multiple projects
 */
export const mapToProjects = (projects: JiraProjectResponse[]): JiraProject[] =>
  projects.map(mapToProject);

/**
 * Map a JIRA board response to a JiraBoard
 */
export const mapToBoard = (board: JiraBoardResponse): JiraBoard => ({
  id: board.id,
  name: board.name,
  type: board.type,
});

/**
 * Map multiple boards
 */
export const mapToBoards = (boards: JiraBoardResponse[]): JiraBoard[] =>
  boards.map(mapToBoard);
