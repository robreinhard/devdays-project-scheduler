'use client';

import { Suspense, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { Header, Sidebar, MainContent, SidebarContent, GanttChart } from '@/frontend/components';
import { useAppState, useGanttData } from '@/frontend/hooks';

interface ConnectionStatus {
  connected: boolean;
  email?: string;
}

const HomeContent = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
  });

  const { epicKeys, sprintCapacities, viewMode, maxDevelopers, includeWeekends } = useAppState();
  const { ganttData, isLoading, error, generate } = useGanttData();

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/auth/validate');
        const data = await response.json();
        setConnectionStatus({
          connected: data.valid,
          email: data.email,
        });
      } catch {
        setConnectionStatus({ connected: false });
      }
    };

    checkConnection();
  }, []);

  const handleGenerate = () => {
    generate(epicKeys, sprintCapacities, viewMode, maxDevelopers, includeWeekends);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Header connectionStatus={connectionStatus} />
      <Box
        sx={{
          display: 'flex',
          flexGrow: 1,
          overflow: 'hidden',
        }}
      >
        <Sidebar>
          <SidebarContent onGenerate={handleGenerate} isGenerating={isLoading} />
        </Sidebar>
        <MainContent>
          {error && (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          )}
          {ganttData ? (
            <GanttChart data={ganttData} />
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <Typography variant="h6" gutterBottom>
                No GANTT chart generated yet
              </Typography>
              <Typography variant="body2">
                Select epics and sprints, then click Generate GANTT
              </Typography>
            </Box>
          )}
        </MainContent>
      </Box>
    </Box>
  );
};

const Home = () => {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <CircularProgress />
        </Box>
      }
    >
      <HomeContent />
    </Suspense>
  );
};

export default Home;
