'use client';

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useAppState } from '@/frontend/hooks';
import EpicSearch from './EpicSearch';
import EpicKeyPaste from './EpicKeyPaste';
import SelectedEpics from './SelectedEpics';
import SprintCapacityEditor from './SprintCapacityEditor';

interface SidebarContentProps {
  isGenerating?: boolean;
}

const SidebarContent = ({ isGenerating = false }: SidebarContentProps) => {
  const [hasSprintOverlap, setHasSprintOverlap] = useState(false);
  const [pendingMaxDevelopers, setPendingMaxDevelopers] = useState<number | null>(null);

  const {
    epics,
    epicKeys,
    sprintCapacities,
    maxDevelopers,
    dailyCapacityOverrides,
    isLoading,
    addEpic,
    removeEpic,
    loadEpicsByKeys,
    setSprintCapacities,
    setMaxDevelopers,
  } = useAppState();

  const handleOverlapError = useCallback((hasOverlap: boolean) => {
    setHasSprintOverlap(hasOverlap);
  }, []);

  // Workflow state
  const hasSprintsSelected = sprintCapacities.length > 0 && !hasSprintOverlap;
  const hasPointsPerDay = maxDevelopers > 0;
  const canSelectEpics = hasSprintsSelected && hasPointsPerDay;
  const hasDailyOverrides = dailyCapacityOverrides.length > 0;

  // Handle points per day change with confirmation if there are overrides
  const handlePointsPerDayChange = (value: number) => {
    if (value < 1) return;

    if (hasDailyOverrides) {
      // Show confirmation dialog
      setPendingMaxDevelopers(value);
    } else {
      // No overrides, just update
      setMaxDevelopers(value);
    }
  };

  const handleConfirmPointsChange = () => {
    if (pendingMaxDevelopers !== null) {
      setMaxDevelopers(pendingMaxDevelopers);
      setPendingMaxDevelopers(null);
    }
  };

  const handleCancelPointsChange = () => {
    setPendingMaxDevelopers(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Step 1: Sprint Selection */}
      <Box>
        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="span"
            sx={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: hasSprintsSelected ? 'success.main' : 'grey.400',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
            }}
          >
            1
          </Box>
          Select Sprints
        </Typography>
        <SprintCapacityEditor
          sprintCapacities={sprintCapacities}
          onChange={setSprintCapacities}
          onOverlapError={handleOverlapError}
        />
      </Box>

      <Divider />

      {/* Step 2: Points Per Day */}
      <Box sx={{ opacity: hasSprintsSelected ? 1 : 0.5 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="span"
            sx={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: hasSprintsSelected && hasPointsPerDay ? 'success.main' : 'grey.400',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
            }}
          >
            2
          </Box>
          Points Per Day
        </Typography>
        <TextField
          type="number"
          size="small"
          fullWidth
          value={maxDevelopers}
          onChange={(e) => handlePointsPerDayChange(parseInt(e.target.value, 10))}
          disabled={!hasSprintsSelected}
          inputProps={{ min: 1 }}
          helperText="Story points that can be completed per day"
        />
        {hasDailyOverrides && (
          <Alert severity="info" sx={{ mt: 1, py: 0, fontSize: 11 }}>
            {dailyCapacityOverrides.length} custom day capacity override{dailyCapacityOverrides.length > 1 ? 's' : ''} active
          </Alert>
        )}
      </Box>

      <Divider />

      {/* Step 3: Epic Selection */}
      <Box sx={{ opacity: canSelectEpics ? 1 : 0.5 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="span"
            sx={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              bgcolor: canSelectEpics && epics.length > 0 ? 'success.main' : 'grey.400',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 'bold',
            }}
          >
            3
          </Box>
          Select Epics
        </Typography>

        <Box sx={{ pointerEvents: canSelectEpics ? 'auto' : 'none' }}>
          <EpicSearch onEpicSelect={addEpic} selectedEpicKeys={epicKeys} />

          <Box sx={{ mt: 1.5 }}>
            <EpicKeyPaste onLoadEpics={loadEpicsByKeys} loading={isLoading} />
          </Box>

          <SelectedEpics epics={epics} onRemove={removeEpic} />
        </Box>

        {!canSelectEpics && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {!hasSprintsSelected
              ? 'Select sprints first'
              : 'Set points per day first'}
          </Typography>
        )}
      </Box>

      {/* Status indicator */}
      {isGenerating && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Updating schedule...
        </Alert>
      )}

      {/* Confirmation Dialog for changing points per day with overrides */}
      <Dialog open={pendingMaxDevelopers !== null} onClose={handleCancelPointsChange}>
        <DialogTitle>Reset Custom Day Capacities?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have {dailyCapacityOverrides.length} custom day capacity override{dailyCapacityOverrides.length > 1 ? 's' : ''} set.
            Changing the points per day will reset all custom overrides.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelPointsChange}>Cancel</Button>
          <Button onClick={handleConfirmPointsChange} variant="contained" color="primary">
            Reset & Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SidebarContent;
