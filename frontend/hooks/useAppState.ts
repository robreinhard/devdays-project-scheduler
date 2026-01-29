'use client';

import { useState, useCallback, useEffect, useRef, startTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { JiraEpic, SprintCapacity } from '@/shared/types';
import { DEFAULT_APP_STATE, QUERY_PARAM_KEYS } from '@/shared/types';

/**
 * Parse sprint capacities from URL format: "1:20,2:18,3:20"
 */
const parseSprintCapacities = (value: string | null): SprintCapacity[] => {
  if (!value) return [];

  return value.split(',').map((pair) => {
    const [id, capacity] = pair.split(':');
    return {
      sprintId: parseInt(id, 10),
      devDaysCapacity: parseInt(capacity, 10),
    };
  }).filter((sc) => !isNaN(sc.sprintId) && !isNaN(sc.devDaysCapacity));
};

/**
 * Serialize sprint capacities to URL format
 */
const serializeSprintCapacities = (capacities: SprintCapacity[]): string => {
  return capacities.map((sc) => `${sc.sprintId}:${sc.devDaysCapacity}`).join(',');
};

/**
 * Daily capacity override with sprint info
 */
export interface DailyCapacityOverride {
  date: string;
  sprintId: number;
  capacity: number;
}

/**
 * Parse daily capacity overrides from URL format: "2025-01-28:1:3,2025-01-29:1:2"
 * Format is date:sprintId:capacity
 */
const parseDailyCapacityOverrides = (value: string | null): DailyCapacityOverride[] => {
  if (!value) return [];

  return value.split(',').map((entry) => {
    const [date, sprintId, capacity] = entry.split(':');
    return {
      date,
      sprintId: parseInt(sprintId, 10),
      capacity: parseInt(capacity, 10),
    };
  }).filter((dc) => dc.date && !isNaN(dc.sprintId) && !isNaN(dc.capacity));
};

/**
 * Serialize daily capacity overrides to URL format
 */
const serializeDailyCapacityOverrides = (overrides: DailyCapacityOverride[]): string => {
  return overrides.map((dc) => `${dc.date}:${dc.sprintId}:${dc.capacity}`).join(',');
};

interface UseAppStateResult {
  // State
  projectKey?: string;
  boardId?: number;
  sprintFilter?: string;
  epicKeys: string[];
  epics: JiraEpic[];
  sprintCapacities: SprintCapacity[];
  viewStartDate?: string;
  viewEndDate?: string;
  maxDevelopers: number;
  dailyCapacityOverrides: DailyCapacityOverride[];
  isLoading: boolean;

  // Actions
  setProjectKey: (projectKey: string | undefined) => void;
  setBoardId: (boardId: number | undefined) => void;
  setSprintFilter: (filter: string | undefined) => void;
  addEpic: (epic: JiraEpic) => void;
  removeEpic: (epicKey: string) => void;
  loadEpicsByKeys: (keys: string[]) => Promise<void>;
  setSprintCapacities: (capacities: SprintCapacity[]) => void;
  setViewStartDate: (date: string | undefined) => void;
  setViewEndDate: (date: string | undefined) => void;
  setMaxDevelopers: (maxDevs: number) => void;
  setDailyCapacityOverride: (date: string, sprintId: number, capacity: number) => void;
  clearDailyCapacityOverrides: () => void;
}

export const useAppState = (): UseAppStateResult => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for epics (includes full epic data)
  const [epics, setEpics] = useState<JiraEpic[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Track loaded epic keys to prevent duplicates (only accessed in callbacks/effects)
  const loadedKeysRef = useRef<Set<string>>(new Set());

  // Ref to hold latest searchParams for stable callbacks
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  // Parse state from URL - this is the source of truth
  const projectKey = searchParams.get(QUERY_PARAM_KEYS.PROJECT) ?? undefined;
  const boardIdParam = searchParams.get(QUERY_PARAM_KEYS.BOARD);
  const boardId = boardIdParam ? parseInt(boardIdParam, 10) : undefined;
  const sprintFilter = searchParams.get(QUERY_PARAM_KEYS.SPRINT_FILTER) ?? undefined;
  const epicKeysParam = searchParams.get(QUERY_PARAM_KEYS.EPICS);
  const epicKeys = useMemo(
    () => epicKeysParam?.split(',').filter(Boolean) ?? [],
    [epicKeysParam]
  );
  const sprintCapacities = parseSprintCapacities(searchParams.get(QUERY_PARAM_KEYS.SPRINTS));
  const viewStartDate = searchParams.get(QUERY_PARAM_KEYS.START_DATE) ?? undefined;
  const viewEndDate = searchParams.get(QUERY_PARAM_KEYS.END_DATE) ?? undefined;
  const maxDevelopers = parseInt(searchParams.get(QUERY_PARAM_KEYS.MAX_DEVS) ?? '', 10) || DEFAULT_APP_STATE.maxDevelopers;
  const dailyCapacityOverrides = parseDailyCapacityOverrides(searchParams.get(QUERY_PARAM_KEYS.DAILY_CAPS));

  // Update URL helper
  const updateUrl = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

  // Actions
  const setProjectKey = useCallback((newProjectKey: string | undefined) => {
    // Clear dependent state: boardId, sprints, dailyCapacities
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (newProjectKey) {
      params.set(QUERY_PARAM_KEYS.PROJECT, newProjectKey);
    } else {
      params.delete(QUERY_PARAM_KEYS.PROJECT);
    }
    params.delete(QUERY_PARAM_KEYS.BOARD);
    params.delete(QUERY_PARAM_KEYS.SPRINTS);
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

  const setBoardId = useCallback((newBoardId: number | undefined) => {
    // Clear dependent state: sprints, sprintFilter, dailyCapacities
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (newBoardId !== undefined) {
      params.set(QUERY_PARAM_KEYS.BOARD, newBoardId.toString());
    } else {
      params.delete(QUERY_PARAM_KEYS.BOARD);
    }
    params.delete(QUERY_PARAM_KEYS.SPRINT_FILTER);
    params.delete(QUERY_PARAM_KEYS.SPRINTS);
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

  const setSprintFilter = useCallback((filter: string | undefined) => {
    updateUrl(QUERY_PARAM_KEYS.SPRINT_FILTER, filter ?? null);
  }, [updateUrl]);

  const addEpic = useCallback((epic: JiraEpic) => {
    // Add to local state
    setEpics((prev) => {
      if (prev.some((e) => e.key === epic.key)) return prev;
      return [...prev, epic];
    });

    // Update URL - read current epicKeys from searchParams ref
    const currentKeys = searchParamsRef.current.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
    if (!currentKeys.includes(epic.key)) {
      const newKeys = [...currentKeys, epic.key];
      updateUrl(QUERY_PARAM_KEYS.EPICS, newKeys.join(','));
    }
  }, [updateUrl]);

  const removeEpic = useCallback((epicKey: string) => {
    setEpics((prev) => prev.filter((e) => e.key !== epicKey));

    // Update URL - read current epicKeys from searchParams ref
    const currentKeys = searchParamsRef.current.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
    const newKeys = currentKeys.filter((k) => k !== epicKey);
    updateUrl(QUERY_PARAM_KEYS.EPICS, newKeys.length > 0 ? newKeys.join(',') : null);
  }, [updateUrl]);

  const loadEpicsByKeys = useCallback(async (keys: string[]) => {
    const keysToLoad = keys.filter((key) => !loadedKeysRef.current.has(key));
    if (keysToLoad.length === 0) return;

    setIsLoading(true);
    const newEpics: JiraEpic[] = [];

    for (const key of keysToLoad) {
      try {
        const response = await fetch(`/api/epics/${key}`);
        const data = await response.json();

        if (data.epic) {
          newEpics.push(data.epic);
          loadedKeysRef.current.add(key);
        }
      } catch (error) {
        console.error(`Failed to load epic ${key}:`, error);
      }
    }

    if (newEpics.length > 0) {
      setEpics((prev) => {
        const existingKeys = new Set(prev.map((e) => e.key));
        const uniqueNewEpics = newEpics.filter((e) => !existingKeys.has(e.key));
        return uniqueNewEpics.length > 0 ? [...prev, ...uniqueNewEpics] : prev;
      });
    }

    setIsLoading(false);
  }, []);

  const setSprintCapacities = useCallback((capacities: SprintCapacity[]) => {
    const value = capacities.length > 0 ? serializeSprintCapacities(capacities) : null;
    updateUrl(QUERY_PARAM_KEYS.SPRINTS, value);
  }, [updateUrl]);

  const setViewStartDate = useCallback((date: string | undefined) => {
    updateUrl(QUERY_PARAM_KEYS.START_DATE, date ?? null);
  }, [updateUrl]);

  const setViewEndDate = useCallback((date: string | undefined) => {
    updateUrl(QUERY_PARAM_KEYS.END_DATE, date ?? null);
  }, [updateUrl]);

  const setMaxDevelopers = useCallback((maxDevs: number) => {
    // Clear daily capacity overrides when max developers changes
    const params = new URLSearchParams(searchParamsRef.current.toString());
    params.set(QUERY_PARAM_KEYS.MAX_DEVS, maxDevs.toString());
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

  const setDailyCapacityOverride = useCallback((date: string, sprintId: number, capacity: number) => {
    // Update or add the override
    const existingOverrides = parseDailyCapacityOverrides(searchParamsRef.current.get(QUERY_PARAM_KEYS.DAILY_CAPS));
    const existingIndex = existingOverrides.findIndex((o) => o.date === date);

    let newOverrides: DailyCapacityOverride[];
    if (existingIndex >= 0) {
      newOverrides = [...existingOverrides];
      newOverrides[existingIndex] = { date, sprintId, capacity };
    } else {
      newOverrides = [...existingOverrides, { date, sprintId, capacity }];
    }

    const overridesNotEqualToMaxDevelopers = newOverrides.filter((o) => o.capacity !== maxDevelopers);

    updateUrl(QUERY_PARAM_KEYS.DAILY_CAPS, serializeDailyCapacityOverrides(overridesNotEqualToMaxDevelopers));
  }, [updateUrl, maxDevelopers]);

  const clearDailyCapacityOverrides = useCallback(() => {
    updateUrl(QUERY_PARAM_KEYS.DAILY_CAPS, null);
  }, [updateUrl]);

  // Load epics from URL when epicKeys change
  useEffect(() => {
    if (epicKeys.length > 0) {
      startTransition(() => {
        loadEpicsByKeys(epicKeys);
      });
    }
  }, [epicKeys, loadEpicsByKeys]);

  return {
    projectKey,
    boardId,
    sprintFilter,
    epicKeys,
    epics,
    sprintCapacities,
    viewStartDate,
    viewEndDate,
    maxDevelopers,
    dailyCapacityOverrides,
    isLoading,
    setProjectKey,
    setBoardId,
    setSprintFilter,
    addEpic,
    removeEpic,
    loadEpicsByKeys,
    setSprintCapacities,
    setViewStartDate,
    setViewEndDate,
    setMaxDevelopers,
    setDailyCapacityOverride,
    clearDailyCapacityOverrides,
  };
};
