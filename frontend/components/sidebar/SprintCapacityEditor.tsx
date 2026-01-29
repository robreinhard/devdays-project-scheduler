'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import type { JiraSprint, SprintCapacity } from '@/shared/types';

interface SprintOverlap {
  sprint1: JiraSprint;
  sprint2: JiraSprint;
}

/**
 * Detect overlapping sprints from selected sprints.
 */
function detectSprintOverlaps(
  sprints: JiraSprint[],
  selectedSprintIds: number[]
): SprintOverlap[] {
  const selectedSprints = sprints
    .filter((s) => selectedSprintIds.includes(s.id))
    .filter((s) => s.startDate && s.endDate)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const overlaps: SprintOverlap[] = [];

  for (let i = 0; i < selectedSprints.length; i++) {
    for (let j = i + 1; j < selectedSprints.length; j++) {
      const sprint1 = selectedSprints[i];
      const sprint2 = selectedSprints[j];

      const start1 = new Date(sprint1.startDate).getTime();
      const end1 = new Date(sprint1.endDate).getTime();
      const start2 = new Date(sprint2.startDate).getTime();
      const end2 = new Date(sprint2.endDate).getTime();

      const overlaps12 = start1 < end2 && start2 < end1 && end1 !== start2;

      if (overlaps12) {
        overlaps.push({ sprint1, sprint2 });
      }
    }
  }

  return overlaps;
}

interface SprintCapacityEditorProps {
  sprintCapacities: SprintCapacity[];
  onChange: (capacities: SprintCapacity[]) => void;
  onOverlapError?: (hasOverlap: boolean) => void;
  defaultCapacity?: number;
  boardId?: number;
  filter?: string;
  onFilterChange?: (filter: string | undefined) => void;
}

const DEBOUNCE_DELAY = 300;

const SprintCapacityEditor = ({
  sprintCapacities,
  onChange,
  onOverlapError,
  defaultCapacity = 20,
  boardId,
  filter = '',
  onFilterChange,
}: SprintCapacityEditorProps) => {
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [selectedSprintsCache, setSelectedSprintsCache] = useState<Map<number, JiraSprint>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localFilter, setLocalFilter] = useState(filter);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync local filter with prop when it changes externally
  useEffect(() => {
    setLocalFilter(filter);
  }, [filter]);

  // Debounced filter change handler - updates URL
  const handleFilterChange = useCallback((value: string) => {
    setLocalFilter(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      onFilterChange?.(value || undefined);
    }, DEBOUNCE_DELAY);
  }, [onFilterChange]);

  const handleClearFilter = useCallback(() => {
    setLocalFilter('');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onFilterChange?.(undefined);
  }, [onFilterChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const selectedSprintIds = useMemo(
    () => sprintCapacities.map((sc) => sc.sprintId),
    [sprintCapacities]
  );

  // Fetch sprints when boardId or filter (from URL) changes
  useEffect(() => {
    if (boardId === undefined) {
      setSprints([]);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const fetchSprints = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('boardId', boardId.toString());
        if (filter) {
          params.set('q', filter);
        }

        const response = await fetch(`/api/sprints?${params}`, {
          signal: abortControllerRef.current?.signal,
        });
        const data = await response.json();

        if (data.error) {
          setError(data.message || data.error);
        } else {
          const sprintsWithDates = (data.sprints || []).filter(
            (sprint: JiraSprint) => sprint.startDate && sprint.endDate
          );
          setSprints(sprintsWithDates);

          // Cache any selected sprints we receive
          setSelectedSprintsCache((prev) => {
            const newCache = new Map(prev);
            for (const sprint of sprintsWithDates) {
              if (selectedSprintIds.includes(sprint.id)) {
                newCache.set(sprint.id, sprint);
              }
            }
            return newCache;
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Ignore abort errors
        }
        setError('Failed to load sprints');
      } finally {
        setLoading(false);
      }
    };

    fetchSprints();
  }, [boardId, filter, selectedSprintIds]);

  // Build display list: show fetched sprints + any selected sprints not in current results
  const displaySprints = useMemo(() => {
    const sprintMap = new Map<number, JiraSprint>();

    // Add all fetched sprints
    for (const sprint of sprints) {
      sprintMap.set(sprint.id, sprint);
    }

    // Add cached selected sprints that aren't in current results
    for (const sprintId of selectedSprintIds) {
      if (!sprintMap.has(sprintId) && selectedSprintsCache.has(sprintId)) {
        sprintMap.set(sprintId, selectedSprintsCache.get(sprintId)!);
      }
    }

    // Sort: selected first, then by start date
    return Array.from(sprintMap.values()).sort((a, b) => {
      const aSelected = selectedSprintIds.includes(a.id);
      const bSelected = selectedSprintIds.includes(b.id);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
  }, [sprints, selectedSprintIds, selectedSprintsCache]);

  // Use all known sprints for overlap detection
  const allKnownSprints = useMemo(() => {
    const sprintMap = new Map<number, JiraSprint>();
    for (const sprint of sprints) {
      sprintMap.set(sprint.id, sprint);
    }
    for (const [id, sprint] of selectedSprintsCache) {
      if (!sprintMap.has(id)) {
        sprintMap.set(id, sprint);
      }
    }
    return Array.from(sprintMap.values());
  }, [sprints, selectedSprintsCache]);

  const overlaps = useMemo(
    () => detectSprintOverlaps(allKnownSprints, selectedSprintIds),
    [allKnownSprints, selectedSprintIds]
  );

  // Notify parent of overlap state changes
  useEffect(() => {
    onOverlapError?.(overlaps.length > 0);
  }, [overlaps.length, onOverlapError]);

  const isSelected = (sprintId: number) =>
    sprintCapacities.some((sc) => sc.sprintId === sprintId);

  const handleToggle = (sprintId: number) => {
    const sprint = displaySprints.find((s) => s.id === sprintId);

    if (isSelected(sprintId)) {
      onChange(sprintCapacities.filter((sc) => sc.sprintId !== sprintId));
    } else {
      // Cache the sprint when selecting
      if (sprint) {
        setSelectedSprintsCache((prev) => {
          const newCache = new Map(prev);
          newCache.set(sprintId, sprint);
          return newCache;
        });
      }
      onChange([
        ...sprintCapacities,
        { sprintId, devDaysCapacity: defaultCapacity },
      ]);
    }
  };

  if (boardId === undefined) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a board to view sprints
        </Typography>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <TextField
        size="small"
        fullWidth
        placeholder="Search sprints..."
        value={localFilter}
        onChange={(e) => handleFilterChange(e.target.value)}
        sx={{ mb: 1 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                {loading && <CircularProgress size={16} sx={{ mr: 1 }} />}
                {localFilter && (
                  <IconButton size="small" onClick={handleClearFilter} edge="end">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                )}
              </InputAdornment>
            ),
          },
        }}
      />
      {overlaps.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Sprint overlap detected: {overlaps.map((o) =>
            `"${o.sprint1.name}" and "${o.sprint2.name}"`
          ).join(', ')}. Please resolve overlapping sprint dates before generating.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
        {displaySprints.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Searching...' : localFilter ? 'No sprints match search' : 'No sprints available'}
            </Typography>
          </Box>
        ) : (
          displaySprints.map((sprint) => {
            const selected = isSelected(sprint.id);
            const isFromCache = !sprints.some((s) => s.id === sprint.id);

            return (
              <Box
                key={sprint.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 1,
                  py: 0.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: selected ? 'action.selected' : 'transparent',
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={selected}
                      onChange={() => handleToggle(sprint.id)}
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        maxWidth: 180,
                        fontStyle: isFromCache && selected ? 'italic' : 'normal',
                      }}
                    >
                      {sprint.name}
                      {isFromCache && selected && ' (selected)'}
                    </Typography>
                  }
                  sx={{ flex: 1 }}
                />
              </Box>
            );
          })
        )}
      </Paper>
      {localFilter && sprints.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {sprints.length} sprint{sprints.length !== 1 ? 's' : ''} found
        </Typography>
      )}
    </Box>
  );
};

export default SprintCapacityEditor;
