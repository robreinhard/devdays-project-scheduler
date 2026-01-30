import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToSprints } from '@/backend/jira';
import { parseDate } from '@/shared/utils/dates';

/**
 * GET /api/sprints - Fetch sprints from JIRA
 *
 * Query params:
 * - state: 'active' | 'closed' | 'future' (passed to JIRA API)
 * - boardId: number (passed to JIRA API)
 * - q: string (name filter - applied post-fetch, JIRA API doesn't support name search)
 *
 * Note: The JIRA Board Sprint API (/rest/agile/1.0/board/{boardId}/sprint) only supports
 * filtering by `state`. Name filtering must be done post-fetch as JIRA doesn't support it.
 */
export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state') as 'active' | 'closed' | 'future' | null;
  const boardIdParam = searchParams.get('boardId');
  const boardId = boardIdParam ? parseInt(boardIdParam, 10) : undefined;
  const filterQuery = searchParams.get('q')?.toLowerCase();

  try {
    const client = getJiraClient();
    // State and boardId are passed to JIRA API
    const sprintsResponse = await client.getSprints(state ?? undefined, boardId);
    let sprints = mapToSprints(sprintsResponse);

    // Name filtering must be done post-fetch (JIRA Sprint API doesn't support name search)
    if (filterQuery) {
      sprints = sprints.filter((sprint) =>
        sprint.name.toLowerCase().includes(filterQuery)
      );
    }

    // Sort by start date ascending
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
