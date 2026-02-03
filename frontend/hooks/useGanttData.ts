'use client';

import { useState, useCallback, useRef } from 'react';
import type { GanttData, SprintCapacity, JiraEpic, JiraTicket, JiraSprint, SprintDateOverride } from '@/shared/types';
import { scheduleTickets } from '@/shared/scheduler';
import { applySprintDateOverrides, autoAdjustSprintDates } from '@/shared/utils/sprints';

interface CachedData {
  epics: JiraEpic[];
  tickets: JiraTicket[];
  sprints: JiraSprint[];
  doneStatuses: string[];
  activeSprints: JiraSprint[];
  epicKeys: string[];
  sprintIds: number[];
  boardId?: number;
}

interface GenerateOptions {
  sprintDateOverrides?: SprintDateOverride[];
  autoAdjustStartDate?: boolean;
  boardId?: number;
}

interface UseGanttDataResult {
  ganttData: GanttData | null;
  isLoading: boolean;
  error: string | null;
  generate: (epicKeys: string[], sprintCapacities: SprintCapacity[], maxDevelopers: number, options?: GenerateOptions) => Promise<void>;
  clear: () => void;
  clearCache: () => void;
}

export const useGanttData = (): UseGanttDataResult => {
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache JIRA data to avoid refetching when only capacity changes
  const cachedDataRef = useRef<CachedData | null>(null);

  const generate = useCallback(async (
    epicKeys: string[],
    sprintCapacities: SprintCapacity[],
    maxDevelopers: number,
    options: GenerateOptions = {}
  ) => {
    const { sprintDateOverrides = [], autoAdjustStartDate = true, boardId } = options;
    setIsLoading(true);
    setError(null);

    try {
      const sprintIds = sprintCapacities.map(sc => sc.sprintId);

      // Check if we need to refetch data
      const cached = cachedDataRef.current;
      const needsFetch = !cached ||
        cached.epicKeys.join(',') !== epicKeys.join(',') ||
        cached.sprintIds.join(',') !== sprintIds.join(',') ||
        cached.boardId !== boardId;

      let epics: JiraEpic[];
      let tickets: JiraTicket[];
      let sprints: JiraSprint[];
      let doneStatuses: string[];
      let activeSprints: JiraSprint[];

      if (needsFetch) {
        // Fetch data from API
        const response = await fetch('/api/gantt/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epicKeys, sprintIds, boardId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to fetch data');
        }

        epics = data.epics;
        tickets = data.tickets;
        sprints = data.sprints;
        doneStatuses = data.doneStatuses;
        activeSprints = data.activeSprints;

        // Cache the data
        cachedDataRef.current = { epics, tickets, sprints, doneStatuses, activeSprints, epicKeys, sprintIds, boardId };
      } else {
        // Use cached data
        epics = cached.epics;
        tickets = cached.tickets;
        sprints = cached.sprints;
        doneStatuses = cached.doneStatuses;
        activeSprints = cached.activeSprints;
      }

      // Apply auto-adjust and sprint date overrides before scheduling
      // Auto-adjust is applied first, then manual overrides take precedence
      let effectiveSprints = autoAdjustStartDate ? autoAdjustSprintDates(sprints) : sprints;
      effectiveSprints = applySprintDateOverrides(effectiveSprints, sprintDateOverrides);

      // Run scheduling algorithm client-side
      const result = scheduleTickets({
        epics,
        tickets,
        sprints: effectiveSprints,
        sprintCapacities,
        maxDevelopers,
        doneStatuses,
        activeSprints,
      });

      setGanttData(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setGanttData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setGanttData(null);
    setError(null);
    cachedDataRef.current = null;
  }, []);

  const clearCache = useCallback(() => {
    cachedDataRef.current = null;
  }, []);

  return { ganttData, isLoading, error, generate, clear, clearCache };
};
