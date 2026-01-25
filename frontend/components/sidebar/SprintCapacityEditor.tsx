'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import type { JiraSprint, SprintCapacity } from '@/shared/types';

interface SprintCapacityEditorProps {
  sprintCapacities: SprintCapacity[];
  onChange: (capacities: SprintCapacity[]) => void;
  defaultCapacity?: number;
}

const SprintCapacityEditor = ({
  sprintCapacities,
  onChange,
  defaultCapacity = 20,
}: SprintCapacityEditorProps) => {
  const [sprints, setSprints] = useState<JiraSprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localDefault, setLocalDefault] = useState(defaultCapacity);

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

  const getCapacity = (sprintId: number) => {
    const found = sprintCapacities.find((sc) => sc.sprintId === sprintId);
    return found?.devDaysCapacity ?? localDefault;
  };

  const handleToggle = (sprintId: number) => {
    if (isSelected(sprintId)) {
      onChange(sprintCapacities.filter((sc) => sc.sprintId !== sprintId));
    } else {
      onChange([
        ...sprintCapacities,
        { sprintId, devDaysCapacity: localDefault },
      ]);
    }
  };

  const handleCapacityChange = (sprintId: number, value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;

    onChange(
      sprintCapacities.map((sc) =>
        sc.sprintId === sprintId ? { ...sc, devDaysCapacity: numValue } : sc
      )
    );
  };

  const handleDefaultChange = (value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      setLocalDefault(numValue);
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
        Sprint Capacity (Dev Days)
      </Typography>
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
                <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                  {sprint.name}
                </Typography>
              }
              sx={{ flex: 1, mr: 1 }}
            />
            <TextField
              size="small"
              type="number"
              value={isSelected(sprint.id) ? getCapacity(sprint.id) : ''}
              onChange={(e) => handleCapacityChange(sprint.id, e.target.value)}
              disabled={!isSelected(sprint.id)}
              placeholder={String(localDefault)}
              slotProps={{
                input: { sx: { width: 60 } },
                htmlInput: { min: 0 },
              }}
            />
          </Box>
        ))}
      </Paper>
      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Default capacity:
        </Typography>
        <TextField
          size="small"
          type="number"
          value={localDefault}
          onChange={(e) => handleDefaultChange(e.target.value)}
          slotProps={{
            input: { sx: { width: 60 } },
            htmlInput: { min: 0 },
          }}
        />
      </Box>
    </Box>
  );
};

export default SprintCapacityEditor;
