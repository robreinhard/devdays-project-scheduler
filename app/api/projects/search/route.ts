import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToProjects } from '@/backend/jira';

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
    const projectsResponse = await client.searchProjects(query);
    const projects = mapToProjects(projectsResponse);

    return NextResponse.json({
      results: projects,
      total: projects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: message,
        message: `Failed to search projects: ${message}`,
      },
      { status: 500 }
    );
  }
};
