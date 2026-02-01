'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface SidebarProps {
  children?: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const SIDEBAR_WIDTH = 300;
const SIDEBAR_COLLAPSED_WIDTH = 40;

const Sidebar = ({ children, collapsed = false, onCollapsedChange }: SidebarProps) => {

  return (
    <Paper
      elevation={0}
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        minWidth: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        height: '100%',
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease-in-out, min-width 0.2s ease-in-out',
      }}
    >
      {collapsed ? (
        // Collapsed state - just show expand button
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1 }}>
          <Tooltip title="Expand sidebar" placement="right">
            <IconButton size="small" onClick={() => onCollapsedChange?.(false)}>
              <ChevronRightIcon />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
        // Expanded state - show full content
        <>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" color="text.secondary">
              Configuration
            </Typography>
            <Tooltip title="Collapse sidebar">
              <IconButton size="small" onClick={() => onCollapsedChange?.(true)} sx={{ ml: 1 }}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <Divider />
          <Box sx={{ p: 2, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'auto' }}>
            {children ?? (
              <Typography variant="body2" color="text.secondary">
                Sidebar controls will appear here
              </Typography>
            )}
          </Box>
        </>
      )}
    </Paper>
  );
};

export default Sidebar;
export { SIDEBAR_WIDTH };
