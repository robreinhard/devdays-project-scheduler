'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { Header, Sidebar, MainContent, SidebarContent, GanttChart } from '@/frontend/components';
import { useAppState, useGanttData } from '@/frontend/hooks';
import type { SprintCapacity, DailyCapacity } from '@/shared/types';

interface ConnectionStatus {
  connected: boolean;
  email?: string;
}

const HomeContent = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
  });

  const { epicKeys, sprintCapacities, setSprintCapacities, maxDevelopers } = useAppState();
  const { ganttData, isLoading, error, generate } = useGanttData();

  // Track local daily capacity overrides (accumulates changes before regeneration)
  const dailyCapacityOverridesRef = useRef<Map<string, { sprintId: number; capacity: number }>>(new Map());

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

  const handleGenerate = useCallback(() => {
    // Build sprint capacities with daily overrides
    const capacitiesWithOverrides = sprintCapacities.map((sc) => {
      const dailyOverrides: DailyCapacity[] = [];

      // Find all overrides for this sprint
      dailyCapacityOverridesRef.current.forEach((override, date) => {
        if (override.sprintId === sc.sprintId) {
          dailyOverrides.push({ date, capacity: override.capacity });
        }
      });

      return {
        ...sc,
        dailyCapacities: dailyOverrides.length > 0 ? dailyOverrides : sc.dailyCapacities,
      };
    });

    generate(epicKeys, capacitiesWithOverrides, maxDevelopers);
  }, [epicKeys, sprintCapacities, maxDevelopers, generate]);

  // Handle daily capacity changes from the gantt chart
  const handleDailyCapacityChange = useCallback((dayIndex: number, date: string, capacity: number) => {
    console.log({
      event: "Handle Daily Capacity Change",
      dayIndex,
      date,
      capacity,
    })
    if (!ganttData) return;

    // Find which sprint this day belongs to
    const dayInfo = ganttData.dailyCapacities[dayIndex];
    if (!dayInfo) return;

    // Store the override
    dailyCapacityOverridesRef.current.set(date, {
      sprintId: dayInfo.sprintId,
      capacity,
    });

    // Trigger regeneration with updated capacities
    const capacitiesWithOverrides = sprintCapacities.map((sc) => {
      const dailyOverrides: DailyCapacity[] = [];

      dailyCapacityOverridesRef.current.forEach((override, overrideDate) => {
        if (override.sprintId === sc.sprintId) {
          dailyOverrides.push({ date: overrideDate, capacity: override.capacity });
        }
      });

      return {
        ...sc,
        dailyCapacities: dailyOverrides.length > 0 ? dailyOverrides : sc.dailyCapacities,
      };
    });

    generate(epicKeys, capacitiesWithOverrides, maxDevelopers);
  }, [ganttData, sprintCapacities, epicKeys, maxDevelopers, generate]);

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
            <GanttChart
              data={ganttData}
              maxDevelopers={maxDevelopers}
              onDailyCapacityChange={handleDailyCapacityChange}
            />
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
