import { NextResponse } from 'next/server';
import { getJiraClient, mapToProjects } from '@/backend/jira';

export const GET = async () => {
  try {
    const client = getJiraClient();
    const projectsResponse = await client.getProjects();
    const projects = mapToProjects(projectsResponse);

    return NextResponse.json({
      projects,
      total: projects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: message,
        message: `Failed to fetch projects: ${message}`,
      },
      { status: 500 }
    );
  }
};
