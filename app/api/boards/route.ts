import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToBoards } from '@/backend/jira';

export const GET = async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const projectKey = searchParams.get('projectKey');

  if (!projectKey) {
    return NextResponse.json(
      { error: 'Query parameter "projectKey" is required' },
      { status: 400 }
    );
  }

  try {
    const client = getJiraClient();
    const boardsResponse = await client.getBoardsForProject(projectKey);
    const boards = mapToBoards(boardsResponse);

    return NextResponse.json({
      boards,
      total: boards.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: message,
        message: `Failed to fetch boards for project ${projectKey}: ${message}`,
      },
      { status: 500 }
    );
  }
};
