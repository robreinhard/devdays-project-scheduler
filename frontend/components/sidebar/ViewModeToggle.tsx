'use client';

import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import type { ViewMode } from '@/shared/types';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

const ViewModeToggle = ({ value, onChange }: ViewModeToggleProps) => {
  const handleChange = (_event: React.MouseEvent<HTMLElement>, newValue: ViewMode | null) => {
    if (newValue !== null) {
      onChange(newValue);
    }
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        View Mode
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={handleChange}
        fullWidth
        size="small"
      >
        <Tooltip title="Parallel tickets overlap (optimistic estimate)" arrow>
          <ToggleButton value="best">
            Best Case
          </ToggleButton>
        </Tooltip>
        <Tooltip title="All tickets run sequentially (pessimistic estimate)" arrow>
          <ToggleButton value="worst">
            Worst Case
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Box>
  );
};

export default ViewModeToggle;
