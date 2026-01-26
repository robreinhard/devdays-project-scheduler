import type {
  CommitType,
  JiraEpic,
  JiraTicket,
  JiraSprint,
  JiraIssueResponse,
  JiraSprintResponse,
} from '@/shared/types';

/**
 * Field configuration for mapping custom fields
 */
interface FieldConfig {
  devDays: string;
  timelineOrder: string;
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
 * Map a JIRA issue response to a JiraTicket
 */
export const mapToTicket = (
  issue: JiraIssueResponse,
  epicKey: string,
  fieldConfig: FieldConfig
): JiraTicket => {
  const devDaysValue = issue.fields[fieldConfig.devDays];
  const timelineOrderValue = issue.fields[fieldConfig.timelineOrder];

  // Check if estimate is missing (null, undefined, 0, or non-number)
  const hasEstimate = typeof devDaysValue === 'number' && devDaysValue > 0;
  const devDays = hasEstimate ? devDaysValue : DEFAULT_DEV_DAYS;

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    epicKey,
    devDays,
    timelineOrder: typeof timelineOrderValue === 'number' ? timelineOrderValue : 999,
    assignee: issue.fields.assignee?.displayName,
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
