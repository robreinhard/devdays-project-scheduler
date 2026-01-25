import type {
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
 * Map a JIRA issue response to a JiraEpic
 */
export const mapToEpic = (issue: JiraIssueResponse): JiraEpic => ({
  key: issue.key,
  summary: issue.fields.summary,
  status: issue.fields.status.name,
});

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

  return {
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status.name,
    epicKey,
    devDays: typeof devDaysValue === 'number' ? devDaysValue : 0,
    timelineOrder: typeof timelineOrderValue === 'number' ? timelineOrderValue : 999,
    assignee: issue.fields.assignee?.displayName,
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
