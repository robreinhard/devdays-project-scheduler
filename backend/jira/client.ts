import type {
  JiraSearchResponse,
  JiraSprintResponse,
  JiraIssueResponse,
} from '@/shared/types';

/**
 * Configuration for JIRA API client
 * All values come from environment variables
 */
interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  fieldDevDays: string;
  fieldTimelineOrder: string;
  boardId: string;
}

/**
 * Get JIRA configuration from environment variables
 */
export const getJiraConfig = (): JiraConfig => {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const fieldDevDays = process.env.JIRA_FIELD_DEV_DAYS;
  const fieldTimelineOrder = process.env.JIRA_FIELD_TIMELINE_ORDER;
  const boardId = process.env.JIRA_BOARD_ID;

  if (!baseUrl || !email || !apiToken || !fieldDevDays || !fieldTimelineOrder || !boardId) {
    throw new Error(
      'Missing required JIRA environment variables. Required: ' +
      'JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_FIELD_DEV_DAYS, ' +
      'JIRA_FIELD_TIMELINE_ORDER, JIRA_BOARD_ID'
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    email,
    apiToken,
    fieldDevDays,
    fieldTimelineOrder,
    boardId,
  };
};

/**
 * Create authorization header for JIRA API
 */
const createAuthHeader = (email: string, apiToken: string): string => {
  const credentials = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${credentials}`;
};

/**
 * JIRA API client for making authenticated requests
 */
export class JiraClient {
  private config: JiraConfig;
  private authHeader: string;

  constructor(config?: JiraConfig) {
    this.config = config ?? getJiraConfig();
    this.authHeader = createAuthHeader(this.config.email, this.config.apiToken);
  }

  /**
   * Make an authenticated request to the JIRA API
   */
  private fetch = async <T>(endpoint: string, options: RequestInit = {}): Promise<T> => {
    const url = `${this.config.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`JIRA API error (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  };

  /**
   * Search for issues using JQL (uses new /search/jql POST endpoint)
   */
  searchIssues = async (jql: string, fields: string[] = []): Promise<JiraSearchResponse> => {
    const defaultFields = [
      'summary',
      'status',
      'assignee',
      'parent',
      'labels',
      this.config.fieldDevDays,
      this.config.fieldTimelineOrder,
    ];

    const allFields = [...new Set([...defaultFields, ...fields])];

    return this.fetch<JiraSearchResponse>('/rest/api/3/search/jql', {
      method: 'POST',
      body: JSON.stringify({
        jql,
        fields: allFields,
        maxResults: 100,
      }),
    });
  };

  /**
   * Get a single issue by key
   */
  getIssue = async (issueKey: string): Promise<JiraIssueResponse> => {
    const fields = [
      'summary',
      'status',
      'assignee',
      'parent',
      'labels',
      this.config.fieldDevDays,
      this.config.fieldTimelineOrder,
    ].join(',');

    return this.fetch<JiraIssueResponse>(`/rest/api/3/issue/${issueKey}?fields=${fields}`);
  };

  /**
   * Search for epics by partial key or summary
   */
  searchEpics = async (query: string): Promise<JiraSearchResponse> => {
    const jql = `issuetype = Epic AND (key ~ "${query}" OR summary ~ "${query}") ORDER BY key ASC`;
    return this.searchIssues(jql);
  };

  /**
   * Get all issues (stories/tasks) under an epic
   */
  getEpicIssues = async (epicKey: string): Promise<JiraSearchResponse> => {
    const jql = `"Epic Link" = ${epicKey} OR parent = ${epicKey} ORDER BY key ASC`;
    return this.searchIssues(jql);
  };

  /**
   * Get sprints from the configured board
   */
  getSprints = async (state?: 'active' | 'closed' | 'future'): Promise<JiraSprintResponse[]> => {
    const params = new URLSearchParams();
    if (state) {
      params.set('state', state);
    }

    const endpoint = `/rest/agile/1.0/board/${this.config.boardId}/sprint?${params}`;

    const response = await this.fetch<{ values: JiraSprintResponse[] }>(endpoint);
    return response.values;
  };

  /**
   * Validate connection to JIRA
   */
  validateConnection = async (): Promise<{ valid: boolean; email?: string; error?: string }> => {
    try {
      const response = await this.fetch<{ emailAddress: string }>('/rest/api/3/myself');
      return { valid: true, email: response.emailAddress };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  /**
   * Get the custom field IDs for reference
   */
  getFieldConfig = () => ({
    devDays: this.config.fieldDevDays,
    timelineOrder: this.config.fieldTimelineOrder,
  });
}

/**
 * Singleton instance for use in API routes
 */
let clientInstance: JiraClient | null = null;

export const getJiraClient = (): JiraClient => {
  if (!clientInstance) {
    clientInstance = new JiraClient();
  }
  return clientInstance;
};
