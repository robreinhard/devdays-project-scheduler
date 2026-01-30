import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToEpic, mapToTickets, mapToSprints } from '@/backend/jira';
import { scheduleTickets } from '@/backend/scheduler';
import type { JiraEpic, JiraTicket, SprintCapacity } from '@/shared/types';

interface GenerateRequest {
  epicKeys: string[];
  sprintCapacities: SprintCapacity[];
  maxDevelopers?: number;
}

export const POST = async (request: NextRequest) => {
  try {
    const body: GenerateRequest = await request.json();
    const { epicKeys, sprintCapacities, maxDevelopers = 5 } = body;

    // Validate input
    if (!epicKeys || epicKeys.length === 0) {
      return NextResponse.json(
        { error: 'At least one epic key is required' },
        { status: 400 }
      );
    }

    if (!sprintCapacities || sprintCapacities.length === 0) {
      return NextResponse.json(
        { error: 'At least one sprint with capacity is required' },
        { status: 400 }
      );
    }

    const client = getJiraClient();
    const fieldConfig = client.getFieldConfig();

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
            message: `❌ Could not load epic "${epicKey}" - verify it exists`,
          },
          { status: 404 }
        );
      }
    }

    // Fetch sprints by ID directly
    const sprintIds = sprintCapacities.map((sc) => sc.sprintId);
    const sprintsResponse = await client.getSprintsByIds(sprintIds);
    const selectedSprints = mapToSprints(sprintsResponse);

    if (selectedSprints.length === 0) {
      return NextResponse.json(
        {
          error: 'No valid sprints found',
          message: '❌ None of the selected sprint IDs were found',
        },
        { status: 400 }
      );
    }

    // Run the scheduling algorithm
    const ganttData = scheduleTickets({
      epics,
      tickets: allTickets,
      sprints: selectedSprints,
      sprintCapacities,
      maxDevelopers,
    });

    // Add debug info to response
    const sprintBoundaries: { sprintId: number; name: string; jiraStart: string; jiraEnd: string; firstDay: string; lastDay: string }[] = [];
    for (const sprint of selectedSprints) {
      const sprintDays = ganttData.dailyCapacities.filter(d => d.sprintId === sprint.id);
      sprintBoundaries.push({
        sprintId: sprint.id,
        name: sprint.name,
        jiraStart: sprint.startDate,
        jiraEnd: sprint.endDate,
        firstDay: sprintDays[0]?.date ?? 'N/A',
        lastDay: sprintDays[sprintDays.length - 1]?.date ?? 'N/A',
      });
    }

    return NextResponse.json({
      ...ganttData,
      _debug: {
        sprintBoundaries,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('GANTT generation failed:', error);

    return NextResponse.json(
      {
        error: message,
        message: `❌ GANTT GENERATION FAILED: ${message}`,
      },
      { status: 500 }
    );
  }
};
