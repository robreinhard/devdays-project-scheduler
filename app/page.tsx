'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { Header, Sidebar, MainContent, SidebarContent, GanttChart } from '@/frontend/components';
import { useAppState, useGanttData } from '@/frontend/hooks';
import type { DailyCapacity } from '@/shared/types';

interface ConnectionStatus {
  connected: boolean;
  email?: string;
}

const HomeContent = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
  });

  const {
    epicKeys,
    epics,
    sprintCapacities,
    maxDevelopers,
    dailyCapacityOverrides,
    setDailyCapacityOverride,
  } = useAppState();
  const { ganttData, isLoading, error, generate, clear } = useGanttData();

  // Track previous values to detect changes
  const prevValuesRef = useRef<{
    epicKeys: string;
    sprintCapacities: string;
    maxDevelopers: number;
    dailyCapacityOverrides: string;
  } | null>(null);

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

  // Build sprint capacities with daily overrides
  const buildCapacitiesWithOverrides = useCallback(() => {
    return sprintCapacities.map((sc) => {
      const dailyOverrides: DailyCapacity[] = dailyCapacityOverrides
        .filter((override) => override.sprintId === sc.sprintId)
        .map((override) => ({ date: override.date, capacity: override.capacity }));

      return {
        ...sc,
        dailyCapacities: dailyOverrides.length > 0 ? dailyOverrides : sc.dailyCapacities,
      };
    });
  }, [sprintCapacities, dailyCapacityOverrides]);

  // Auto-generate when prerequisites are met and values change
  useEffect(() => {
    // Check prerequisites
    const canGenerate = epicKeys.length > 0 && sprintCapacities.length > 0 && maxDevelopers > 0;

    if (!canGenerate) {
      // Clear gantt data if prerequisites are no longer met
      if (ganttData && (epicKeys.length === 0 || sprintCapacities.length === 0)) {
        clear();
      }
      return;
    }

    // Create current value signatures
    const currentValues = {
      epicKeys: epicKeys.join(','),
      sprintCapacities: JSON.stringify(sprintCapacities),
      maxDevelopers,
      dailyCapacityOverrides: JSON.stringify(dailyCapacityOverrides),
    };

    // Check if values have changed
    const prev = prevValuesRef.current;
    const hasChanged = !prev ||
      prev.epicKeys !== currentValues.epicKeys ||
      prev.sprintCapacities !== currentValues.sprintCapacities ||
      prev.maxDevelopers !== currentValues.maxDevelopers ||
      prev.dailyCapacityOverrides !== currentValues.dailyCapacityOverrides;

    if (hasChanged) {
      prevValuesRef.current = currentValues;
      const capacitiesWithOverrides = buildCapacitiesWithOverrides();
      generate(epicKeys, capacitiesWithOverrides, maxDevelopers);
    }
  }, [epicKeys, sprintCapacities, maxDevelopers, dailyCapacityOverrides, buildCapacitiesWithOverrides, generate, clear, ganttData]);

  // Handle daily capacity changes from the gantt chart
  const handleDailyCapacityChange = useCallback((dayIndex: number, date: string, capacity: number) => {
    if (!ganttData) return;

    // Find which sprint this day belongs to
    const dayInfo = ganttData.dailyCapacities[dayIndex];
    if (!dayInfo) return;

    // Store the override in URL state (will trigger auto-regeneration)
    setDailyCapacityOverride(date, dayInfo.sprintId, capacity);
  }, [ganttData, setDailyCapacityOverride]);

  // Determine what message to show when no chart
  const getEmptyStateMessage = () => {
    if (sprintCapacities.length === 0) {
      return {
        title: 'Step 1: Select Sprints',
        subtitle: 'Choose the sprints to include in the schedule',
      };
    }
    if (maxDevelopers <= 0) {
      return {
        title: 'Step 2: Set Points Per Day',
        subtitle: 'Configure how many story points can be completed per day',
      };
    }
    if (epics.length === 0) {
      return {
        title: 'Step 3: Select Epics',
        subtitle: 'Add epics to generate the GANTT chart',
      };
    }
    return {
      title: 'Generating...',
      subtitle: 'Please wait while the schedule is calculated',
    };
  };

  const emptyState = getEmptyStateMessage();

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
          <SidebarContent isGenerating={isLoading} />
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
              {isLoading ? (
                <>
                  <CircularProgress sx={{ mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Generating Schedule...
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="h6" gutterBottom>
                    {emptyState.title}
                  </Typography>
                  <Typography variant="body2">
                    {emptyState.subtitle}
                  </Typography>
                </>
              )}
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
