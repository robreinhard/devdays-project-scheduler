'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  epicKeys: string[];
  epics: JiraEpic[];
  sprintCapacities: SprintCapacity[];
  viewStartDate?: string;
  viewEndDate?: string;
  maxDevelopers: number;
  dailyCapacityOverrides: DailyCapacityOverride[];
  isLoading: boolean;

  // Actions
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

  // Track loaded epic keys to prevent duplicates
  const loadedKeysRef = useRef<Set<string>>(new Set());

  // Track pending epic keys (updates synchronously to handle rapid additions)
  const pendingEpicKeysRef = useRef<string[]>([]);

  // Parse state from URL
  const epicKeysFromUrl = searchParams.get(QUERY_PARAM_KEYS.EPICS)?.split(',').filter(Boolean) ?? [];
  const sprintCapacities = parseSprintCapacities(searchParams.get(QUERY_PARAM_KEYS.SPRINTS));
  const viewStartDate = searchParams.get(QUERY_PARAM_KEYS.START_DATE) ?? undefined;
  const viewEndDate = searchParams.get(QUERY_PARAM_KEYS.END_DATE) ?? undefined;
  const maxDevelopers = parseInt(searchParams.get(QUERY_PARAM_KEYS.MAX_DEVS) ?? '', 10) || DEFAULT_APP_STATE.maxDevelopers;
  const dailyCapacityOverrides = parseDailyCapacityOverrides(searchParams.get(QUERY_PARAM_KEYS.DAILY_CAPS));

  // Sync pending ref with URL when URL updates
  if (pendingEpicKeysRef.current.length === 0 ||
      (epicKeysFromUrl.length > 0 && epicKeysFromUrl.join(',') !== pendingEpicKeysRef.current.join(','))) {
    pendingEpicKeysRef.current = epicKeysFromUrl;
  }

  // Use pending keys as the source of truth
  const epicKeys = pendingEpicKeysRef.current;

  // Update URL with new params (using ref for current state)
  const updateUrlRef = useRef<(key: string, value: string | null) => void>(() => {});
  updateUrlRef.current = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  };

  const updateUrl = useCallback((key: string, value: string | null) => {
    updateUrlRef.current?.(key, value);
  }, []);

  // Actions
  const addEpic = useCallback((epic: JiraEpic) => {
    // Check against pending keys (synchronous)
    if (pendingEpicKeysRef.current.includes(epic.key)) return;

    // Update pending keys synchronously
    pendingEpicKeysRef.current = [...pendingEpicKeysRef.current, epic.key];

    // Add to local state
    setEpics((prev) => {
      if (prev.some((e) => e.key === epic.key)) return prev;
      return [...prev, epic];
    });
    loadedKeysRef.current.add(epic.key);

    // Update URL
    updateUrl(QUERY_PARAM_KEYS.EPICS, pendingEpicKeysRef.current.join(','));
  }, [updateUrl]);

  const removeEpic = useCallback((epicKey: string) => {
    setEpics((prev) => prev.filter((e) => e.key !== epicKey));
    loadedKeysRef.current.delete(epicKey);

    // Update pending keys synchronously
    pendingEpicKeysRef.current = pendingEpicKeysRef.current.filter((k) => k !== epicKey);

    updateUrl(QUERY_PARAM_KEYS.EPICS, pendingEpicKeysRef.current.length > 0 ? pendingEpicKeysRef.current.join(',') : null);
  }, [updateUrl]);

  const loadEpicsByKeys = useCallback(async (keys: string[]) => {
    const keysToLoad = keys.filter((key) => !loadedKeysRef.current.has(key));
    if (keysToLoad.length === 0) return;

    setIsLoading(true);
    const newEpics: JiraEpic[] = [];
    const loadedKeys: string[] = [];

    for (const key of keysToLoad) {
      try {
        const response = await fetch(`/api/epics/${key}`);
        const data = await response.json();

        if (data.epic) {
          newEpics.push(data.epic);
          loadedKeysRef.current.add(key);
          loadedKeys.push(key);
        }
      } catch (error) {
        console.error(`Failed to load epic ${key}:`, error);
      }
    }

    if (newEpics.length > 0) {
      setEpics((prev) => [...prev, ...newEpics]);

      // Update pending keys and URL with successfully loaded keys
      const newPendingKeys = [...pendingEpicKeysRef.current];
      for (const key of loadedKeys) {
        if (!newPendingKeys.includes(key)) {
          newPendingKeys.push(key);
        }
      }
      pendingEpicKeysRef.current = newPendingKeys;
      updateUrl(QUERY_PARAM_KEYS.EPICS, newPendingKeys.join(','));
    }

    setIsLoading(false);
  }, [updateUrl]);

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
    const params = new URLSearchParams(searchParams.toString());
    params.set(QUERY_PARAM_KEYS.MAX_DEVS, maxDevs.toString());
    params.delete(QUERY_PARAM_KEYS.DAILY_CAPS);
    const newUrl = params.toString() ? `?${params.toString()}` : '/';
    router.push(newUrl, { scroll: false });
  }, [searchParams, router]);

  const setDailyCapacityOverride = useCallback((date: string, sprintId: number, capacity: number) => {
    // Update or add the override
    const existingOverrides = parseDailyCapacityOverrides(searchParams.get(QUERY_PARAM_KEYS.DAILY_CAPS));
    const existingIndex = existingOverrides.findIndex((o) => o.date === date);

    let newOverrides: DailyCapacityOverride[];
    if (existingIndex >= 0) {
      newOverrides = [...existingOverrides];
      newOverrides[existingIndex] = { date, sprintId, capacity };
    } else {
      newOverrides = [...existingOverrides, { date, sprintId, capacity }];
    }

    updateUrl(QUERY_PARAM_KEYS.DAILY_CAPS, serializeDailyCapacityOverrides(newOverrides));
  }, [searchParams, updateUrl]);

  const clearDailyCapacityOverrides = useCallback(() => {
    updateUrl(QUERY_PARAM_KEYS.DAILY_CAPS, null);
  }, [updateUrl]);

  // Load epics from URL when epicKeys change
  useEffect(() => {
    if (epicKeys.length > 0) {
      loadEpicsByKeys(epicKeys);
    }
  }, [epicKeys.join(','), loadEpicsByKeys]);

  return {
    epicKeys,
    epics,
    sprintCapacities,
    viewStartDate,
    viewEndDate,
    maxDevelopers,
    dailyCapacityOverrides,
    isLoading,
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
