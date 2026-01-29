'use client';

import { useState, useMemo } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { JiraEpic } from '@/shared/types';

// Simple debounce implementation
const debounce = <T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

interface EpicSearchProps {
  onEpicSelect: (epic: JiraEpic) => void;
  selectedEpicKeys?: string[];
}

const EpicSearch = ({ onEpicSelect, selectedEpicKeys = [] }: EpicSearchProps) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<JiraEpic[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const searchEpics = useMemo(
    () =>
      debounce(async (query: string) => {
        if (query.length < 2) {
          setOptions([]);
          return;
        }

        setLoading(true);
        try {
          const response = await fetch(`/api/epics/search?q=${encodeURIComponent(query)}`);
          const data = await response.json();

          if (data.results) {
            // Filter out already selected epics
            const filtered = data.results.filter(
              (epic: JiraEpic) => !selectedEpicKeys.includes(epic.key)
            );
            setOptions(filtered);
          }
        } catch (error) {
          console.error('Epic search failed:', error);
          setOptions([]);
        } finally {
          setLoading(false);
        }
      }, 300),
    [selectedEpicKeys]
  );

  const handleInputChange = (_event: React.SyntheticEvent, value: string) => {
    setInputValue(value);
    searchEpics(value);
  };

  const handleChange = (_event: React.SyntheticEvent, value: JiraEpic | null) => {
    if (value) {
      onEpicSelect(value);
      setInputValue('');
      setOptions([]);
    }
  };

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={options}
      loading={loading}
      value={null}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={handleChange}
      getOptionLabel={(option) => `${option.key}: ${option.summary}`}
      isOptionEqualToValue={(option, value) => option.key === value.key}
      filterOptions={(x) => x} // Disable client-side filtering, server handles it
      noOptionsText={inputValue.length < 2 ? 'Type to search...' : 'No epics found'}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search Epics"
          placeholder="Enter epic key or name"
          size="small"
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
              <Typography variant="body2" fontWeight="medium">
                {option.key}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {option.summary}
              </Typography>
            </Box>
          </Box>
        );
      }}
    />
  );
};

export default EpicSearch;
