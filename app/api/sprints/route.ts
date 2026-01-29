import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToSprints } from '@/backend/jira';
import { parseDate } from '@/shared/utils/dates';

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state') as 'active' | 'closed' | 'future' | null;
  const boardIdParam = searchParams.get('boardId');
  const boardId = boardIdParam ? parseInt(boardIdParam, 10) : undefined;
  const filterQuery = searchParams.get('q')?.toLowerCase();

  try {
    const client = getJiraClient();
    const sprintsResponse = await client.getSprints(state ?? undefined, boardId);
    let sprints = mapToSprints(sprintsResponse);

    // Filter by name if query provided
    if (filterQuery) {
      sprints = sprints.filter((sprint) =>
        sprint.name.toLowerCase().includes(filterQuery)
      );
    }

    // Sort by start date (most recent first for active/future, oldest first for closed)
    sprints.sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return parseDate(a.startDate).toMillis() - parseDate(b.startDate).toMillis();
    });

    return NextResponse.json({
      sprints,
      total: sprints.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for board ID issues
    if (message.includes('404') || message.includes('Board')) {
      return NextResponse.json(
        {
          error: message,
          message: `❌ SPRINT FETCH FAILED: Check JIRA_BOARD_ID in .env.local - ${message}`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: message,
        message: `❌ SPRINT FETCH FAILED: ${message}`,
      },
      { status: 500 }
    );
  }
};
