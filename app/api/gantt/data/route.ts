import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToEpic, mapToTickets, mapToSprints, mapToOtherTicket } from '@/backend/jira';
import type { JiraEpic, JiraTicket, JiraSprint, OtherTicket } from '@/shared/types';

interface DataRequest {
  epicKeys: string[];
  sprintIds: number[];
  boardId?: number;
}

export interface GanttDataResponse {
  epics: JiraEpic[];
  tickets: JiraTicket[];
  sprints: JiraSprint[];
  doneStatuses: string[];
  activeSprints: JiraSprint[]; // All active sprints from the board (for locking even if not selected)
  otherTickets: OtherTicket[]; // Tickets in future sprints not in selected epics
}

export const POST = async (request: NextRequest) => {
  try {
    const body: DataRequest = await request.json();
    const { epicKeys, sprintIds, boardId } = body;

    // Validate input
    if (!epicKeys || epicKeys.length === 0) {
      return NextResponse.json(
        { error: 'At least one epic key is required' },
        { status: 400 }
      );
    }

    if (!sprintIds || sprintIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one sprint ID is required' },
        { status: 400 }
      );
    }

    const client = getJiraClient();
    const fieldConfig = client.getFieldConfig();

    // Fetch done statuses and active sprints in parallel
    const [doneStatuses, activeSprintsResponse] = await Promise.all([
      client.getDoneStatuses(boardId),
      client.getSprints('active', boardId),
    ]);
    const activeSprints = mapToSprints(activeSprintsResponse);

    // Fetch all epics and their tickets
    const epics: JiraEpic[] = [];
    const allTickets: JiraTicket[] = [];

    for (const epicKey of epicKeys) {
      try {
        const epicResponse = await client.getIssue(epicKey);
        const epic = mapToEpic(epicResponse);
        epics.push(epic);

        const issuesResponse = await client.getEpicIssues(epicKey);
        const tickets = mapToTickets(issuesResponse.issues, epicKey, fieldConfig);
        allTickets.push(...tickets);
      } catch (error) {
        console.error(`Failed to fetch epic ${epicKey}:`, error);
        return NextResponse.json(
          {
            error: `Failed to fetch epic ${epicKey}`,
            message: `Could not load epic "${epicKey}" - verify it exists`,
          },
          { status: 404 }
        );
      }
    }

    // Fetch sprints by ID directly
    const sprintsResponse = await client.getSprintsByIds(sprintIds);
    const selectedSprints = mapToSprints(sprintsResponse);

    if (selectedSprints.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid sprints found',
          message: 'None of the selected sprint IDs were found',
        },
        { status: 400 }
      );
    }

    // Get future sprints and fetch tickets not in selected epics
    const futureSprintIds = selectedSprints
      .filter(s => s.state === 'future')
      .map(s => s.id);

    const otherTickets: OtherTicket[] = [];
    const epicSummaryCache = new Map<string, string>();

    for (const sprintId of futureSprintIds) {
      const sprint = selectedSprints.find(s => s.id === sprintId)!;
      const response = await client.getSprintTicketsExcludingEpics(sprintId, epicKeys);

      for (const issue of response.issues) {
        const ticket = mapToOtherTicket(issue, sprintId, sprint.name, fieldConfig);

        // Fetch epic summary if ticket has an epic we haven't cached
        if (ticket.epicKey && !epicSummaryCache.has(ticket.epicKey)) {
          try {
            const epicIssue = await client.getIssue(ticket.epicKey);
            epicSummaryCache.set(ticket.epicKey, epicIssue.fields.summary);
          } catch {
            epicSummaryCache.set(ticket.epicKey, '(Unknown Epic)');
          }
        }

        if (ticket.epicKey) {
          ticket.epicSummary = epicSummaryCache.get(ticket.epicKey) ?? null;
        }

        otherTickets.push(ticket);
      }
    }

    const response: GanttDataResponse = {
      epics,
      tickets: allTickets,
      sprints: selectedSprints,
      doneStatuses,
      activeSprints,
      otherTickets,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('GANTT data fetch failed:', error);

    return NextResponse.json(
      {
        error: message,
        message: `Data fetch failed: ${message}`,
      },
      { status: 500 }
    );
  }
};
