'use client';

import { useState, useCallback, useEffect, useRef, startTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { JiraEpic, SprintCapacity, SprintDateOverride } from '@/shared/types';
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

/**
 * Parse sprint date overrides from URL format: "1:2025-01-28:2025-02-10,2:2025-02-11:2025-02-24"
 * Format is sprintId:startDate:endDate
 */
const parseSprintDateOverrides = (value: string | null): SprintDateOverride[] => {
  if (!value) return [];

  return value.split(',').map((entry) => {
    const [sprintId, startDate, endDate] = entry.split(':');
    return {
      sprintId: parseInt(sprintId, 10),
      startDate,
      endDate,
    };
  }).filter((sdo) => !isNaN(sdo.sprintId) && sdo.startDate && sdo.endDate);
};

/**
 * Serialize sprint date overrides to URL format
 */
const serializeSprintDateOverrides = (overrides: SprintDateOverride[]): string => {
  return overrides.map((sdo) => `${sdo.sprintId}:${sdo.startDate}:${sdo.endDate}`).join(',');
};

interface UseAppStateResult {
  // State
  projectKey?: string;
  boardId?: number;
  epicKeys: string[];
  epics: JiraEpic[];
  sprintCapacities: SprintCapacity[];
  viewStartDate?: string;
  viewEndDate?: string;
  maxDevelopers: number;
  dailyCapacityOverrides: DailyCapacityOverride[];
  sprintDateOverrides: SprintDateOverride[];
  autoAdjustStartDate: boolean;
  sidebarCollapsed: boolean;
  isLoading: boolean;

  // Actions
  setProjectKey: (projectKey: string | undefined) => void;
  setBoardId: (boardId: number | undefined) => void;
  addEpic: (epic: JiraEpic) => void;
  removeEpic: (epicKey: string) => void;
  loadEpicsByKeys: (keys: string[], updateUrlWithKeys?: boolean) => Promise<void>;
  setSprintCapacities: (capacities: SprintCapacity[]) => void;
  setViewStartDate: (date: string | undefined) => void;
  setViewEndDate: (date: string | undefined) => void;
  setMaxDevelopers: (maxDevs: number) => void;
  setDailyCapacityOverride: (date: string, sprintId: number, capacity: number) => void;
  clearDailyCapacityOverrides: () => void;
  setSprintDateOverride: (sprintId: number, startDate: string, endDate: string) => void;
  clearSprintDateOverride: (sprintId: number) => void;
  setAutoAdjustStartDate: (enabled: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAppState = (): UseAppStateResult => {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for epics (includes full epic data)
  const [epics, setEpics] = useState<JiraEpic[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Local state for sidebar (for instant updates without re-render)
  const initialSidebarCollapsed = searchParams.get(QUERY_PARAM_KEYS.SIDEBAR_COLLAPSED) === '1';
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(initialSidebarCollapsed);

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
  const sprintDateOverrides = parseSprintDateOverrides(searchParams.get(QUERY_PARAM_KEYS.SPRINT_DATES));
  // Default to true (on) - only false if explicitly set to '0' or 'false'
  const autoAdjustParam = searchParams.get(QUERY_PARAM_KEYS.AUTO_ADJUST_START);
  const autoAdjustStartDate = autoAdjustParam !== '0' && autoAdjustParam !== 'false';

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
    // Clear dependent state: boardId, sprints, dailyCapacities, sprintDateOverrides
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (newProjectKey) {
      params.set(QUERY_PARAM_KEYS.PROJECT, newProjectKey);
    } else {
      params.delete(QUERY_PARAM_KEYS.PROJECT);
    }
    params.delete(QUERY_PARAM_KEYS.BOARD);
    params.delete(QUERY_PARAM_KEYS.SPRINTS);
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    params.delete(QUERY_PARAM_KEYS.SPRINT_DATES);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

  const setBoardId = useCallback((newBoardId: number | undefined) => {
    // Clear dependent state: sprints, dailyCapacities, sprintDateOverrides
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (newBoardId !== undefined) {
      params.set(QUERY_PARAM_KEYS.BOARD, newBoardId.toString());
    } else {
      params.delete(QUERY_PARAM_KEYS.BOARD);
    }
    params.delete(QUERY_PARAM_KEYS.SPRINTS);
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    params.delete(QUERY_PARAM_KEYS.SPRINT_DATES);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

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

    // Remove from loaded keys ref so it can be reloaded later
    loadedKeysRef.current.delete(epicKey);

    // Update URL - read current epicKeys from searchParams ref
    const currentKeys = searchParamsRef.current.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
    const newKeys = currentKeys.filter((k) => k !== epicKey);
    updateUrl(QUERY_PARAM_KEYS.EPICS, newKeys.length > 0 ? newKeys.join(',') : null);
  }, [updateUrl]);

  const loadEpicsByKeys = useCallback(async (keys: string[], updateUrlWithKeys = false) => {
    const keysToLoad = keys.filter((key) => !loadedKeysRef.current.has(key));
    if (keysToLoad.length === 0) {
      // Even if no keys to load, we may need to update URL (for paste functionality)
      if (updateUrlWithKeys && keys.length > 0) {
        const currentKeys = searchParamsRef.current.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
        const newKeys = [...new Set([...currentKeys, ...keys])];
        if (newKeys.length !== currentKeys.length || !newKeys.every((k, i) => k === currentKeys[i])) {
          updateUrl(QUERY_PARAM_KEYS.EPICS, newKeys.join(','));
        }
      }
      return;
    }

    setIsLoading(true);
    const newEpics: JiraEpic[] = [];
    const successfulKeys: string[] = [];

    for (const key of keysToLoad) {
      try {
        const response = await fetch(`/api/epics/${key}`);
        const data = await response.json();

        if (data.epic) {
          newEpics.push(data.epic);
          loadedKeysRef.current.add(key);
          successfulKeys.push(key);
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

      // Update URL with successfully loaded keys (when called from paste)
      if (updateUrlWithKeys) {
        const currentKeys = searchParamsRef.current.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
        const newKeys = [...new Set([...currentKeys, ...successfulKeys])];
        updateUrl(QUERY_PARAM_KEYS.EPICS, newKeys.join(','));
      }
    }

    setIsLoading(false);
  }, [updateUrl]);

  const setSprintCapacities = useCallback((capacities: SprintCapacity[]) => {
    // When sprints change, clean up orphaned sprint date overrides
    const params = new URLSearchParams(searchParamsRef.current.toString());
    const value = capacities.length > 0 ? serializeSprintCapacities(capacities) : null;

    if (value) {
      params.set(QUERY_PARAM_KEYS.SPRINTS, value);
    } else {
      params.delete(QUERY_PARAM_KEYS.SPRINTS);
    }

    // Filter sprint date overrides to only keep those for selected sprints
    const selectedSprintIds = new Set(capacities.map((c) => c.sprintId));
    const existingDateOverrides = parseSprintDateOverrides(params.get(QUERY_PARAM_KEYS.SPRINT_DATES));
    const validDateOverrides = existingDateOverrides.filter((o) => selectedSprintIds.has(o.sprintId));

    if (validDateOverrides.length > 0) {
      params.set(QUERY_PARAM_KEYS.SPRINT_DATES, serializeSprintDateOverrides(validDateOverrides));
    } else {
      params.delete(QUERY_PARAM_KEYS.SPRINT_DATES);
    }

    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [router]);

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

  const setSprintDateOverride = useCallback((sprintId: number, startDate: string, endDate: string) => {
    const existingOverrides = parseSprintDateOverrides(searchParamsRef.current.get(QUERY_PARAM_KEYS.SPRINT_DATES));
    const existingIndex = existingOverrides.findIndex((o) => o.sprintId === sprintId);

    let newOverrides: SprintDateOverride[];
    if (existingIndex >= 0) {
      newOverrides = [...existingOverrides];
      newOverrides[existingIndex] = { sprintId, startDate, endDate };
    } else {
      newOverrides = [...existingOverrides, { sprintId, startDate, endDate }];
    }

    updateUrl(
      QUERY_PARAM_KEYS.SPRINT_DATES,
      newOverrides.length > 0 ? serializeSprintDateOverrides(newOverrides) : null
    );
  }, [updateUrl]);

  const clearSprintDateOverride = useCallback((sprintId: number) => {
    const existingOverrides = parseSprintDateOverrides(searchParamsRef.current.get(QUERY_PARAM_KEYS.SPRINT_DATES));
    const newOverrides = existingOverrides.filter((o) => o.sprintId !== sprintId);

    updateUrl(
      QUERY_PARAM_KEYS.SPRINT_DATES,
      newOverrides.length > 0 ? serializeSprintDateOverrides(newOverrides) : null
    );
  }, [updateUrl]);

  const setAutoAdjustStartDate = useCallback((enabled: boolean) => {
    // Only store in URL if disabled (since default is enabled)
    updateUrl(QUERY_PARAM_KEYS.AUTO_ADJUST_START, enabled ? null : '0');
  }, [updateUrl]);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    // Update local state for instant feedback
    setSidebarCollapsedState(collapsed);

    // Use replaceState directly to avoid Next.js navigation/re-render
    const params = new URLSearchParams(window.location.search);
    if (collapsed) {
      params.set(QUERY_PARAM_KEYS.SIDEBAR_COLLAPSED, '1');
    } else {
      params.delete(QUERY_PARAM_KEYS.SIDEBAR_COLLAPSED);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, []);

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
    epicKeys,
    epics,
    sprintCapacities,
    viewStartDate,
    viewEndDate,
    maxDevelopers,
    dailyCapacityOverrides,
    sprintDateOverrides,
    autoAdjustStartDate,
    sidebarCollapsed,
    isLoading,
    setProjectKey,
    setBoardId,
    addEpic,
    removeEpic,
    loadEpicsByKeys,
    setSprintCapacities,
    setViewStartDate,
    setViewEndDate,
    setMaxDevelopers,
    setDailyCapacityOverride,
    clearDailyCapacityOverrides,
    setSprintDateOverride,
    clearSprintDateOverride,
    setAutoAdjustStartDate,
    setSidebarCollapsed,
  };
};
