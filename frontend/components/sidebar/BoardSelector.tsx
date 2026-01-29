'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { JiraBoard } from '@/shared/types';

interface BoardSelectorProps {
  projectKey?: string;
  selectedBoardId?: number;
  onBoardSelect: (boardId: number) => void;
  disabled?: boolean;
}

const BoardSelector = ({
  projectKey,
  selectedBoardId,
  onBoardSelect,
  disabled = false,
}: BoardSelectorProps) => {
  const [boards, setBoards] = useState<JiraBoard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectKey) {
      setBoards([]);
      return;
    }

    const fetchBoards = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/boards?projectKey=${encodeURIComponent(projectKey)}`);
        const data = await response.json();

        if (data.error) {
          setError(data.message || data.error);
          setBoards([]);
        } else {
          setBoards(data.boards || []);
        }
      } catch {
        setError('Failed to load boards');
        setBoards([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBoards();
  }, [projectKey]);

  const handleChange = (event: { target: { value: unknown } }) => {
    const value = event.target.value;
    if (typeof value === 'number') {
      onBoardSelect(value);
    }
  };

  if (!projectKey) {
    return (
      <FormControl fullWidth size="small" disabled>
        <InputLabel>Select Board</InputLabel>
        <Select value="" label="Select Board">
          <MenuItem value="">Select a project first</MenuItem>
        </Select>
      </FormControl>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          Loading boards...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Typography variant="body2" color="error">
        {error}
      </Typography>
    );
  }

  return (
    <FormControl fullWidth size="small" disabled={disabled}>
      <InputLabel>Select Board</InputLabel>
      <Select
        value={selectedBoardId ?? ''}
        onChange={handleChange}
        label="Select Board"
      >
        {boards.length === 0 ? (
          <MenuItem value="" disabled>
            No boards found
          </MenuItem>
        ) : (
          boards.map((board) => (
            <MenuItem key={board.id} value={board.id}>
              {board.name} ({board.type})
            </MenuItem>
          ))
        )}
      </Select>
    </FormControl>
  );
};

export default BoardSelector;
