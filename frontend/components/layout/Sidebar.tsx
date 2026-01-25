'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';

interface SidebarProps {
  children?: React.ReactNode;
}

const SIDEBAR_WIDTH = 300;

const Sidebar = ({ children }: SidebarProps) => {
  return (
    <Paper
      elevation={0}
      sx={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        height: '100%',
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Configuration
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children ?? (
          <Typography variant="body2" color="text.secondary">
            Sidebar controls will appear here
          </Typography>
        )}
      </Box>
    </Paper>
  );
};

export default Sidebar;
export { SIDEBAR_WIDTH };
