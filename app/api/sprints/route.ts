import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToSprints } from '@/backend/jira';

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const state = searchParams.get('state') as 'active' | 'closed' | 'future' | null;

  try {
    const client = getJiraClient();
    const sprintsResponse = await client.getSprints(state ?? undefined);
    const sprints = mapToSprints(sprintsResponse);

    // Sort by start date (most recent first for active/future, oldest first for closed)
    sprints.sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
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
