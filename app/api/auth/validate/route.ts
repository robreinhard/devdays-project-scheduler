import { NextResponse } from 'next/server';
import { getJiraClient } from '@/backend/jira';

export const GET = async () => {
  try {
    const client = getJiraClient();
    const result = await client.validateConnection();

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error,
          message: '❌ JIRA CONNECTION FAILED - Check your environment variables',
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: result.email,
      message: '✅ JIRA connection successful',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        valid: false,
        error: message,
        message: `❌ JIRA CONNECTION ERROR: ${message}`,
      },
      { status: 500 }
    );
  }
};
