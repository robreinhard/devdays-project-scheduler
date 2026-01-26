'use client';

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useAppState } from '@/frontend/hooks';
import EpicSearch from './EpicSearch';
import EpicKeyPaste from './EpicKeyPaste';
import SelectedEpics from './SelectedEpics';
import SprintCapacityEditor from './SprintCapacityEditor';
import DateRangePicker from './DateRangePicker';

interface SidebarContentProps {
  onGenerate?: () => void;
  isGenerating?: boolean;
}

const SidebarContent = ({ onGenerate, isGenerating = false }: SidebarContentProps) => {
  const {
    epics,
    epicKeys,
    sprintCapacities,
    viewStartDate,
    viewEndDate,
    maxDevelopers,
    isLoading,
    addEpic,
    removeEpic,
    loadEpicsByKeys,
    setSprintCapacities,
    setViewStartDate,
    setViewEndDate,
    setMaxDevelopers,
  } = useAppState();

  const canGenerate = epics.length > 0 && sprintCapacities.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      {/* Epic Selection */}
      <EpicSearch onEpicSelect={addEpic} selectedEpicKeys={epicKeys} />

      <EpicKeyPaste onLoadEpics={loadEpicsByKeys} loading={isLoading} />

      <SelectedEpics epics={epics} onRemove={removeEpic} />

      <Divider />

      {/* Capacity Configuration */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Points Per Day (Dev Capacity)
        </Typography>
        <TextField
          type="number"
          size="small"
          fullWidth
          value={maxDevelopers}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (value >= 1) {
              setMaxDevelopers(value);
            }
          }}
          inputProps={{ min: 1 }}
          helperText="Story points that can be completed per day"
        />
      </Box>

      <DateRangePicker
        startDate={viewStartDate}
        endDate={viewEndDate}
        onStartDateChange={setViewStartDate}
        onEndDateChange={setViewEndDate}
      />

      <Divider />

      {/* Generate Button */}
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onGenerate}
        disabled={!canGenerate || isGenerating}
        startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : null}
      >
        {isGenerating ? 'Generating...' : 'Generate GANTT'}
      </Button>

      {!canGenerate && (
        <Box sx={{ textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
          Select at least one epic and one sprint to generate
        </Box>
      )}
    </Box>
  );
};

export default SidebarContent;
