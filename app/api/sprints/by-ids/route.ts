import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToSprints } from '@/backend/jira';

export const POST = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { sprintIds } = body as { sprintIds: number[] };

    if (!sprintIds || !Array.isArray(sprintIds) || sprintIds.length === 0) {
      return NextResponse.json(
        { error: 'sprintIds array is required' },
        { status: 400 }
      );
    }

    const client = getJiraClient();
    const sprintsResponse = await client.getSprintsByIds(sprintIds);
    const sprints = mapToSprints(sprintsResponse);

    return NextResponse.json({ sprints });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
};
