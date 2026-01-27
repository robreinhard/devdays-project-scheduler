'use client';

import { useMemo, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { GanttData } from '@/shared/types';
import { parseDate, isWeekend } from '@/shared/utils/dates';
import TimelineHeader from './TimelineHeader';
import EpicRow from './EpicRow';

// MUI default theme color palette for epics
const EPIC_COLORS = [
  '#1976d2', // primary blue
  '#9c27b0', // purple
  '#2e7d32', // success green
  '#ed6c02', // warning orange
  '#0288d1', // info blue
  '#d32f2f', // error red
  '#00796b', // teal
  '#c2185b', // pink
  '#512da8', // deep purple
  '#1565c0', // blue 800
];

interface GanttChartProps {
  data: GanttData;
  maxDevelopers: number;
  onDailyCapacityChange?: (dayIndex: number, date: string, capacity: number) => void;
}

// Width per day in pixels
const DAY_WIDTH = 30;
// Height per ticket row
const ROW_HEIGHT = 40;
// Width of the left labels column
const LABEL_WIDTH = 280;

const GanttChart = ({ data, maxDevelopers, onDailyCapacityChange }: GanttChartProps) => {
  const { epics, sprints, dailyCapacities, projectStartDate, totalDays } = data;

  // Track expanded state for each epic
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    epics.forEach((epic) => {
      initial[epic.key] = true;
    });
    return initial;
  });

  const toggleEpicExpanded = useCallback((epicKey: string) => {
    setExpandedEpics((prev) => ({
      ...prev,
      [epicKey]: !prev[epicKey],
    }));
  }, []);

  // Get color for an epic based on its index
  const getEpicColor = useCallback((index: number) => {
    return EPIC_COLORS[index % EPIC_COLORS.length];
  }, []);

  // Calculate total days to display (always work days - weekends excluded)
  const totalDisplayDays = useMemo(() => {
    if (sprints.length === 0) return totalDays;
    const startDt = parseDate(projectStartDate);
    const lastSprint = sprints[sprints.length - 1];
    const lastSprintEnd = parseDate(lastSprint.endDate);
    // Count work days between start and last sprint end
    let workDays = 0;
    let current = startDt;
    while (current < lastSprintEnd) {
      if (!isWeekend(current)) workDays++;
      current = current.plus({ days: 1 });
    }
    return Math.max(totalDays, workDays);
  }, [sprints, projectStartDate, totalDays]);

  // Calculate chart dimensions
  const chartWidth = useMemo(() => {
    return Math.max(totalDisplayDays * DAY_WIDTH, 800);
  }, [totalDisplayDays]);

  return (
    <Paper elevation={0} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Summary bar */}
      <Box
        sx={{
          p: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          gap: 3,
          bgcolor: 'grey.50',
        }}
      >
        <Typography variant="body2">
          <strong>Total Dev Days:</strong> {data.totalDevDays}
        </Typography>
        <Typography variant="body2">
          <strong>Duration:</strong> {totalDays} work days
        </Typography>
        <Typography variant="body2">
          <strong>Start:</strong> {projectStartDate}
        </Typography>
        <Typography variant="body2">
          <strong>End:</strong> {data.projectEndDate}
        </Typography>
      </Box>

      {/* Scrollable chart area */}
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        <Box sx={{ display: 'flex', minWidth: LABEL_WIDTH + chartWidth }}>
          {/* Labels column */}
          <Box
            sx={{
              width: LABEL_WIDTH,
              minWidth: LABEL_WIDTH,
              flexShrink: 0,
              position: 'sticky',
              left: 0,
              zIndex: 2,
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            {/* Header spacer - 4 rows: sprint names, dates, capacity input, usage */}
            <Box sx={{ height: 108, borderBottom: 1, borderColor: 'divider' }} />

            {/* Epic labels */}
            {epics.map((epic, index) => (
              <EpicRow
                key={epic.key}
                epic={epic}
                labelOnly
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                startDate={projectStartDate}
                expanded={expandedEpics[epic.key] ?? true}
                onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                epicColor={getEpicColor(index)}
              />
            ))}
          </Box>

          {/* Chart area */}
          <Box sx={{ flexGrow: 1 }}>
            {/* Timeline header */}
            <TimelineHeader
              sprints={sprints}
              dailyCapacities={dailyCapacities}
              startDate={projectStartDate}
              totalDays={totalDisplayDays}
              dayWidth={DAY_WIDTH}
              maxDevelopers={maxDevelopers}
              onDailyCapacityChange={onDailyCapacityChange}
            />

            {/* Epic rows with ticket bars */}
            {epics.map((epic, index) => (
              <EpicRow
                key={epic.key}
                epic={epic}
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                startDate={projectStartDate}
                expanded={expandedEpics[epic.key] ?? true}
                onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                epicColor={getEpicColor(index)}
              />
            ))}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default GanttChart;
export { DAY_WIDTH, ROW_HEIGHT, LABEL_WIDTH };
