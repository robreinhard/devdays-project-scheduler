import { NextRequest, NextResponse } from 'next/server';
import { getJiraClient } from '@/backend/jira';
import type { SlotTicketsRequest, SlotTicketsResponse } from '@/shared/types';

export const POST = async (request: NextRequest) => {
  try {
    const body: SlotTicketsRequest = await request.json();
    const { updates } = body;

    if (!updates || updates.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    const client = getJiraClient();
    const fieldConfig = client.getFieldConfig();
    const errors: Array<{ ticketKey: string; error: string }> = [];
    let updatedCount = 0;

    for (const update of updates) {
      try {
        const fields: Record<string, unknown> = {
          [fieldConfig.sprint]: update.sprintId,  // Sprint accepts single ID
        };

        // Only add planned dates if env vars are configured (fields will be undefined if not set)
        // This ensures we don't send empty/null values to JIRA for unconfigured fields
        if (fieldConfig.plannedStartDate && update.plannedStartDate) {
          fields[fieldConfig.plannedStartDate] = update.plannedStartDate;
        }
        if (fieldConfig.plannedEndDate && update.plannedEndDate) {
          fields[fieldConfig.plannedEndDate] = update.plannedEndDate;
        }

        await client.updateIssue(update.ticketKey, fields);
        updatedCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ ticketKey: update.ticketKey, error: message });
      }
    }

    const response: SlotTicketsResponse = {
      success: errors.length === 0,
      updatedCount,
      errors,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Slot tickets failed:', error);
    return NextResponse.json(
      { error: message, message: `Slot tickets failed: ${message}` },
      { status: 500 }
    );
  }
};
