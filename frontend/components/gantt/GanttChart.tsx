'use client';

import { useMemo, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { GanttData } from '@/shared/types';
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
}

// Width per day in pixels
const DAY_WIDTH = 30;
// Height per ticket row
const ROW_HEIGHT = 40;
// Width of the left labels column
const LABEL_WIDTH = 280;

const GanttChart = ({ data }: GanttChartProps) => {
  const { epics, sprints, projectStartDate, totalDays, viewMode, includeWeekends } = data;

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

  // Parse project start date
  const startDate = useMemo(() => new Date(projectStartDate), [projectStartDate]);

  // Calculate total days to display
  // When weekends excluded, this is work days; otherwise calendar days
  const totalDisplayDays = useMemo(() => {
    if (includeWeekends) {
      // Calendar days - use sprint end date
      if (sprints.length === 0) return totalDays;
      const lastSprint = sprints[sprints.length - 1];
      const lastSprintEnd = new Date(lastSprint.endDate);
      const msPerDay = 24 * 60 * 60 * 1000;
      return Math.ceil((lastSprintEnd.getTime() - startDate.getTime()) / msPerDay);
    } else {
      // Work days - use the max from scheduled data or calculate from sprints
      if (sprints.length === 0) return totalDays;
      const lastSprint = sprints[sprints.length - 1];
      const lastSprintEnd = new Date(lastSprint.endDate);
      // Count work days between start and last sprint end
      let workDays = 0;
      const current = new Date(startDate);
      while (current < lastSprintEnd) {
        const day = current.getDay();
        if (day !== 0 && day !== 6) workDays++;
        current.setDate(current.getDate() + 1);
      }
      return Math.max(totalDays, workDays);
    }
  }, [sprints, startDate, totalDays, includeWeekends]);

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
          <strong>Duration:</strong> {totalDays} {includeWeekends ? 'calendar' : 'work'} days
        </Typography>
        <Typography variant="body2">
          <strong>Start:</strong> {projectStartDate}
        </Typography>
        <Typography variant="body2">
          <strong>End:</strong> {data.projectEndDate}
        </Typography>
        <Typography variant="body2">
          <strong>View:</strong> {viewMode === 'best' ? 'Best Case' : 'Worst Case'}
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
            {/* Header spacer */}
            <Box sx={{ height: 60, borderBottom: 1, borderColor: 'divider' }} />

            {/* Epic labels */}
            {epics.map((epic, index) => (
              <EpicRow
                key={epic.key}
                epic={epic}
                labelOnly
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                startDate={startDate}
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
              startDate={startDate}
              totalDays={totalDisplayDays}
              dayWidth={DAY_WIDTH}
              includeWeekends={includeWeekends}
            />

            {/* Epic rows with ticket bars */}
            {epics.map((epic, index) => (
              <EpicRow
                key={epic.key}
                epic={epic}
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                startDate={startDate}
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
