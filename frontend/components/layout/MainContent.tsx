'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface MainContentProps {
  children?: React.ReactNode;
}

const MainContent = ({ children }: MainContentProps) => {
  return (
    <Box
      sx={{
        flexGrow: 1,
        height: '100%',
        overflow: 'auto',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      {children ?? (
        <Paper
          sx={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography variant="body1" color="text.secondary">
            GANTT chart will appear here
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default MainContent;
