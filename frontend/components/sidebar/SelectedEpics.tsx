'use client';

import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import type { JiraEpic } from '@/shared/types';

interface SelectedEpicsProps {
  epics: JiraEpic[];
  onRemove: (epicKey: string) => void;
}

const SelectedEpics = ({ epics, onRemove }: SelectedEpicsProps) => {
  if (epics.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          No epics selected
        </Typography>
      </Paper>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Selected Epics ({epics.length})
      </Typography>
      <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
        <List dense disablePadding>
          {epics.map((epic) => (
            <ListItem
              key={epic.key}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => onRemove(epic.key)}
                  aria-label={`Remove ${epic.key}`}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
              sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <ListItemText
                primary={epic.key}
                secondary={epic.summary}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 'medium' }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  noWrap: true,
                  sx: { maxWidth: 180 },
                }}
              />
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
};

export default SelectedEpics;
