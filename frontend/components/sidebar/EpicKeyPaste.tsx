'use client';

import { useState } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

interface EpicKeyPasteProps {
  onLoadEpics: (keys: string[]) => void;
  loading?: boolean;
  initialKeys?: string[];
}

const EpicKeyPaste = ({ onLoadEpics, loading = false, initialKeys = [] }: EpicKeyPasteProps) => {
  const [inputValue, setInputValue] = useState(() =>
    initialKeys.length > 0 ? initialKeys.join(', ') : ''
  );

  const handleLoad = () => {
    const keys = inputValue
      .split(/[,\n]+/)
      .map((key) => key.trim().toUpperCase())
      .filter((key) => key.length > 0);

    if (keys.length > 0) {
      onLoadEpics(keys);
      setInputValue('');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && event.metaKey) {
      handleLoad();
    }
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Or paste epic keys (comma or newline separated)
      </Typography>
      <TextField
        multiline
        rows={3}
        fullWidth
        size="small"
        placeholder="PROJ-1, PROJ-2&#10;PROJ-3"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      <Button
        variant="contained"
        size="small"
        fullWidth
        sx={{ mt: 1 }}
        onClick={handleLoad}
        disabled={loading || inputValue.trim().length === 0}
        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
      >
        {loading ? 'Loading...' : 'Load Epics'}
      </Button>
    </Box>
  );
};

export default EpicKeyPaste;
