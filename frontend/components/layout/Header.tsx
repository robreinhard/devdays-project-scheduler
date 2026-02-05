'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HomeIcon from '@mui/icons-material/Home';

interface NavItem {
  label: string;
  path: string;
  icon?: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Home', path: '/', icon: <HomeIcon sx={{ mr: 0.5 }} fontSize="small" /> },
];

interface HeaderProps {
  connectionStatus?: {
    connected: boolean;
    email?: string;
  };
}

const Header = ({ connectionStatus }: HeaderProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const navigateWithParams = useCallback((path: string) => {
    const params = searchParams.toString();
    const url = params ? `${path}?${params}` : path;
    router.push(url);
  }, [router, searchParams]);

  return (
    <AppBar position="static" color="default" elevation={1}>
      <Toolbar>
        <Typography variant="h6" component="h1" sx={{ mr: 4 }}>
          DevDays
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexGrow: 1 }}>
          {navItems.map((item) => (
            <Button
              key={item.path}
              color="inherit"
              onClick={() => navigateWithParams(item.path)}
              sx={{
                fontWeight: pathname === item.path ? 600 : 400,
                borderBottom: pathname === item.path ? '2px solid' : 'none',
                borderRadius: 0,
                paddingBottom: '6px',
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </Box>
        <Box>
          {connectionStatus?.connected ? (
            <Chip
              icon={<CheckCircleIcon />}
              label={`Connected: ${connectionStatus.email}`}
              color="success"
              variant="outlined"
              size="small"
            />
          ) : (
            <Chip
              icon={<ErrorIcon />}
              label="Not Connected"
              color="error"
              variant="outlined"
              size="small"
            />
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;
