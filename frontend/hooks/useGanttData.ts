'use client';

import { useState, useCallback } from 'react';
import type { GanttData, SprintCapacity, ViewMode } from '@/shared/types';

interface UseGanttDataResult {
  ganttData: GanttData | null;
  isLoading: boolean;
  error: string | null;
  generate: (epicKeys: string[], sprintCapacities: SprintCapacity[], viewMode: ViewMode, maxDevelopers: number, includeWeekends: boolean) => Promise<void>;
  clear: () => void;
}

export const useGanttData = (): UseGanttDataResult => {
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    epicKeys: string[],
    sprintCapacities: SprintCapacity[],
    viewMode: ViewMode,
    maxDevelopers: number,
    includeWeekends: boolean
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gantt/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicKeys, sprintCapacities, viewMode, maxDevelopers, includeWeekends }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to generate GANTT');
      }

      setGanttData(data);
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
  }, []);

  return { ganttData, isLoading, error, generate, clear };
};
