'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
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
}

const DEBOUNCE_DELAY = 300;

const SprintCapacityEditor = ({
  sprintCapacities,
  onChange,
  onOverlapError,
  defaultCapacity = 20,
  boardId,
}: SprintCapacityEditorProps) => {
  const [options, setOptions] = useState<JiraSprint[]>([]);
  const [selectedSprintsCache, setSelectedSprintsCache] = useState<Map<number, JiraSprint>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [open, setOpen] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchedSprintIdsRef = useRef<Set<number>>(new Set());

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

  // Fetch selected sprint details on mount/when sprintCapacities changes
  useEffect(() => {
    const missingSprintIds = sprintCapacities
      .map((sc) => sc.sprintId)
      .filter((id) => !fetchedSprintIdsRef.current.has(id));

    if (missingSprintIds.length === 0) return;

    // Mark these IDs as being fetched
    for (const id of missingSprintIds) {
      fetchedSprintIdsRef.current.add(id);
    }

    const fetchMissingSprints = async () => {
      try {
        const response = await fetch('/api/sprints/by-ids', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sprintIds: missingSprintIds }),
        });
        const data = await response.json();

        if (data.sprints && Array.isArray(data.sprints)) {
          setSelectedSprintsCache((prev) => {
            const newCache = new Map(prev);
            for (const sprint of data.sprints) {
              newCache.set(sprint.id, sprint);
            }
            return newCache;
          });
        }
      } catch (err) {
        console.error('Failed to fetch selected sprints:', err);
      }
    };

    fetchMissingSprints();
  }, [sprintCapacities]);

  const selectedSprintIds = useMemo(
    () => sprintCapacities.map((sc) => sc.sprintId),
    [sprintCapacities]
  );

  // Debounced fetch sprints
  const fetchSprints = useCallback(async (query: string) => {
    if (boardId === undefined) {
      setOptions([]);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('boardId', boardId.toString());
      if (query) {
        params.set('q', query);
      }

      const response = await fetch(`/api/sprints?${params}`, {
        signal: abortControllerRef.current?.signal,
      });
      const data = await response.json();

      if (data.error) {
        setError(data.message || data.error);
        setOptions([]);
      } else {
        const sprintsWithDates = (data.sprints || []).filter(
          (sprint: JiraSprint) => sprint.startDate && sprint.endDate
        );
        // Filter out already selected sprints from dropdown options
        const availableSprints = sprintsWithDates.filter(
          (sprint: JiraSprint) => !selectedSprintIds.includes(sprint.id)
        );
        setOptions(availableSprints);

        // Cache all sprints we receive
        setSelectedSprintsCache((prev) => {
          const newCache = new Map(prev);
          for (const sprint of sprintsWithDates) {
            newCache.set(sprint.id, sprint);
          }
          return newCache;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return; // Ignore abort errors
      }
      setError('Failed to load sprints');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, selectedSprintIds]);

  // Debounced input change handler
  const handleInputChange = useCallback((_event: React.SyntheticEvent, value: string) => {
    setInputValue(value);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchSprints(value);
    }, DEBOUNCE_DELAY);
  }, [fetchSprints]);

  // Fetch initial sprints when dropdown opens
  const handleOpen = useCallback(() => {
    setOpen(true);
    fetchSprints(inputValue);
  }, [fetchSprints, inputValue]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  // Get selected sprints from cache
  const selectedSprints = useMemo(() => {
    return selectedSprintIds
      .map((id) => selectedSprintsCache.get(id))
      .filter((sprint): sprint is JiraSprint => sprint !== undefined)
      .sort((a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });
  }, [selectedSprintIds, selectedSprintsCache]);

  // Use cached sprints for overlap detection
  const overlaps = useMemo(
    () => detectSprintOverlaps(selectedSprints, selectedSprintIds),
    [selectedSprints, selectedSprintIds]
  );

  // Notify parent of overlap state changes
  useEffect(() => {
    onOverlapError?.(overlaps.length > 0);
  }, [overlaps.length, onOverlapError]);

  // Handle sprint selection from dropdown
  const handleSelect = useCallback((_event: React.SyntheticEvent, value: JiraSprint | null) => {
    if (value) {
      // Cache the sprint
      setSelectedSprintsCache((prev) => {
        const newCache = new Map(prev);
        newCache.set(value.id, value);
        return newCache;
      });
      // Add to selected capacities
      onChange([
        ...sprintCapacities,
        { sprintId: value.id, devDaysCapacity: defaultCapacity },
      ]);
      // Clear input and refresh options
      setInputValue('');
      fetchSprints('');
    }
  }, [onChange, sprintCapacities, defaultCapacity, fetchSprints]);

  // Handle removing a selected sprint
  const handleRemove = useCallback((sprintId: number) => {
    onChange(sprintCapacities.filter((sc) => sc.sprintId !== sprintId));
  }, [onChange, sprintCapacities]);

  if (boardId === undefined) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Select a board to view sprints
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Autocomplete
        open={open}
        onOpen={handleOpen}
        onClose={handleClose}
        options={options}
        loading={loading}
        value={null}
        inputValue={inputValue}
        onInputChange={handleInputChange}
        onChange={handleSelect}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        filterOptions={(x) => x}
        noOptionsText={error || (inputValue.length === 0 ? 'Type to search sprints...' : 'No sprints found')}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Search sprints..."
            size="small"
            error={!!error}
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && <CircularProgress color="inherit" size={16} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...restProps } = props;
          return (
            <Box component="li" key={key} {...restProps}>
              <Box>
                <Typography variant="body2">{option.name}</Typography>
                {option.startDate && option.endDate && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(option.startDate).toLocaleDateString()} - {new Date(option.endDate).toLocaleDateString()}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
        sx={{ mb: 1 }}
      />

      {overlaps.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Sprint overlap detected: {overlaps.map((o) =>
            `"${o.sprint1.name}" and "${o.sprint2.name}"`
          ).join(', ')}. Please resolve overlapping sprint dates before generating.
        </Alert>
      )}

      {selectedSprints.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Selected sprints ({selectedSprints.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {selectedSprints.map((sprint) => (
              <Chip
                key={sprint.id}
                label={sprint.name}
                size="small"
                onDelete={() => handleRemove(sprint.id)}
              />
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default SprintCapacityEditor;
