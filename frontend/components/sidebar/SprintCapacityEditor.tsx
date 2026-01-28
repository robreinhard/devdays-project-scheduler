'use client';

import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import type { JiraSprint, SprintCapacity } from '@/shared/types';

interface SprintOverlap {
  sprint1: JiraSprint;
  sprint2: JiraSprint;
}

/**
 * Detect overlapping sprints from selected sprints.
 * If sprint A's endDate equals sprint B's startDate, they don't overlap
 * (the endDate sprint is treated as ending on the previous day).
 */
function detectSprintOverlaps(
  sprints: JiraSprint[],
  selectedSprintIds: number[]
): SprintOverlap[] {
  const selectedSprints = sprints
    .filter((s) => selectedSprintIds.includes(s.id))
    .filter((s) => s.startDate && s.endDate) // Only check sprints with valid dates
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

      // Check for overlap: ranges overlap if one starts before the other ends
      // Special case: if end1 === start2, treat as no overlap (adjacent sprints)
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
}

const SprintCapacityEditor = ({
  sprintCapacities,
  onChange,
  onOverlapError,
  defaultCapacity = 20,
}: SprintCapacityEditorProps) => {
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSprintIds = useMemo(
    () => sprintCapacities.map((sc) => sc.sprintId),
    [sprintCapacities]
  );

  const overlaps = useMemo(
    () => detectSprintOverlaps(sprints, selectedSprintIds),
    [sprints, selectedSprintIds]
  );

  // Notify parent of overlap state changes
  useEffect(() => {
    onOverlapError?.(overlaps.length > 0);
  }, [overlaps.length, onOverlapError]);

  useEffect(() => {
    const fetchSprints = async () => {
      try {
        const response = await fetch('/api/sprints');
        const data = await response.json();

        if (data.error) {
          setError(data.message || data.error);
        } else {
          setSprints(data.sprints || []);
        }
      } catch (err) {
        setError('Failed to load sprints');
      } finally {
        setLoading(false);
      }
    };

    fetchSprints();
  }, []);

  const isSelected = (sprintId: number) =>
    sprintCapacities.some((sc) => sc.sprintId === sprintId);

  const handleToggle = (sprintId: number) => {
    if (isSelected(sprintId)) {
      onChange(sprintCapacities.filter((sc) => sc.sprintId !== sprintId));
    } else {
      onChange([
        ...sprintCapacities,
        { sprintId, devDaysCapacity: defaultCapacity },
      ]);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress size={24} />
      </Box>
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
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Sprints
      </Typography>
      {overlaps.length > 0 && (
        <Alert severity="error" sx={{ mb: 1 }}>
          Sprint overlap detected: {overlaps.map((o) =>
            `"${o.sprint1.name}" and "${o.sprint2.name}"`
          ).join(', ')}. Please resolve overlapping sprint dates before generating.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
        {sprints.map((sprint) => (
          <Box
            key={sprint.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 1,
              py: 0.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: isSelected(sprint.id) ? 'action.selected' : 'transparent',
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={isSelected(sprint.id)}
                  onChange={() => handleToggle(sprint.id)}
                />
              }
              label={
                <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                  {sprint.name}
                </Typography>
              }
              sx={{ flex: 1 }}
            />
          </Box>
        ))}
      </Paper>
    </Box>
  );
};

export default SprintCapacityEditor;
