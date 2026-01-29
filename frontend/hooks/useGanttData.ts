'use client';

import { useState, useCallback, useRef } from 'react';
import type { GanttData, SprintCapacity, JiraEpic, JiraTicket, JiraSprint } from '@/shared/types';
import { scheduleTickets } from '@/shared/scheduler';

interface CachedData {
  epics: JiraEpic[];
  tickets: JiraTicket[];
  sprints: JiraSprint[];
  epicKeys: string[];
  sprintIds: number[];
}

interface UseGanttDataResult {
  ganttData: GanttData | null;
  isLoading: boolean;
  error: string | null;
  generate: (epicKeys: string[], sprintCapacities: SprintCapacity[], maxDevelopers: number) => Promise<void>;
  clear: () => void;
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
    maxDevelopers: number
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const sprintIds = sprintCapacities.map(sc => sc.sprintId);

      // Check if we need to refetch data
      const cached = cachedDataRef.current;
      const needsFetch = !cached ||
        cached.epicKeys.join(',') !== epicKeys.join(',') ||
        cached.sprintIds.join(',') !== sprintIds.join(',');

      let epics: JiraEpic[];
      let tickets: JiraTicket[];
      let sprints: JiraSprint[];

      if (needsFetch) {
        // Fetch data from API
        const response = await fetch('/api/gantt/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epicKeys, sprintIds }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || 'Failed to fetch data');
        }

        epics = data.epics;
        tickets = data.tickets;
        sprints = data.sprints;

        // Cache the data
        cachedDataRef.current = { epics, tickets, sprints, epicKeys, sprintIds };
      } else {
        // Use cached data
        epics = cached.epics;
        tickets = cached.tickets;
        sprints = cached.sprints;
      }

      // Run scheduling algorithm client-side
      const result = scheduleTickets({
        epics,
        tickets,
        sprints,
        sprintCapacities,
        maxDevelopers,
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

  return { ganttData, isLoading, error, generate, clear };
};
