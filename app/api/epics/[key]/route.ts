import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient, mapToEpic, mapToTickets } from '@/backend/jira';

interface RouteParams {
  params: Promise<{ key: string }>;
}

export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { key } = await params;

  if (!key) {
    return NextResponse.json(
      { error: 'Epic key is required' },
      { status: 400 }
    );
  }

  try {
    const client = getJiraClient();
    const fieldConfig = client.getFieldConfig();

    // Fetch the epic itself
    const epicResponse = await client.getIssue(key);
    const epic = mapToEpic(epicResponse);

    // Fetch all issues under this epic
    const issuesResponse = await client.getEpicIssues(key);
    const tickets = mapToTickets(issuesResponse.issues, key, fieldConfig);

    // Sort tickets by key for consistent display
    tickets.sort((a, b) => a.key.localeCompare(b.key));

    // Calculate total dev days
    const totalDevDays = tickets.reduce((sum, t) => sum + t.devDays, 0);

    return NextResponse.json({
      epic,
      tickets,
      totalDevDays,
      ticketCount: tickets.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check for common issues
    if (message.includes('404') || message.includes('not found')) {
      return NextResponse.json(
        {
          error: `Epic "${key}" not found`,
          message: `❌ EPIC NOT FOUND: "${key}" - verify the epic key exists`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: message,
        message: `❌ FAILED TO FETCH EPIC: ${message}`,
      },
      { status: 500 }
    );
  }
};
