import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToEpics } from '@/backend/jira';

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Query parameter "q" must be at least 2 characters' },
      { status: 400 }
    );
  }

  try {
    const client = getJiraClient();
    const response = await client.searchEpics(query);
    const epics = mapToEpics(response.issues);

    return NextResponse.json({
      results: epics,
      total: response.total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: message,
        message: `❌ EPIC SEARCH FAILED: ${message}`,
      },
      { status: 500 }
    );
  }
};
