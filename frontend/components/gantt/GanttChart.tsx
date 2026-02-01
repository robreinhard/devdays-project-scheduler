'use client';

import { useMemo, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { DateTime } from 'luxon';
import Divider from '@mui/material/Divider';
import type { GanttData, SprintDateOverride, ScheduledEpic } from '@/shared/types';
import { parseDate, isWeekend, TIMEZONE } from '@/shared/utils/dates';
import TimelineHeader from './TimelineHeader';
import EpicRow from './EpicRow';
import DependencyLines from './DependencyLines';

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
  sprintDateOverrides?: SprintDateOverride[];
}

// Width per day in pixels
const DAY_WIDTH = 30;
// Height per ticket row
const ROW_HEIGHT = 40;
// Width of the left labels column
const LABEL_WIDTH = 280;
// Width of Previous/Future blocks in days
const BLOCK_WIDTH_DAYS = 3;

const GanttChart = ({ data, maxDevelopers, onDailyCapacityChange, sprintDateOverrides = [] }: GanttChartProps) => {
  const { epics, sprints, dailyCapacities, projectStartDate, totalDays } = data;

  // Calculate today's date in the configured timezone
  const today = useMemo(() => DateTime.now().setZone(TIMEZONE).toISODate() ?? '', []);

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
    while (current <= lastSprintEnd) {
      if (!isWeekend(current)) workDays++;
      current = current.plus({ days: 1 });
    }
    return Math.max(totalDays, workDays);
  }, [sprints, projectStartDate, totalDays]);

  // Group epics by commit type for section dividers
  const epicsByType = useMemo(() => {
    const commits = epics.filter(e => e.commitType === 'commit');
    const stretches = epics.filter(e => e.commitType === 'stretch');
    const others = epics.filter(e => e.commitType === 'none');
    return { commits, stretches, others };
  }, [epics]);

  // Check if any epic has a Previous block (to add left offset)
  const hasPreviousBlocks = useMemo(() => {
    return epics.some(epic => epic.previousBlock);
  }, [epics]);

  // Check if any epic has a Future block (to add right space)
  const hasFutureBlocks = useMemo(() => {
    return epics.some(epic => epic.futureBlock);
  }, [epics]);

  // Calculate left offset for Previous blocks
  const previousBlockOffset = hasPreviousBlocks ? BLOCK_WIDTH_DAYS * DAY_WIDTH : 0;

  // Calculate right space for Future blocks
  const futureBlockSpace = hasFutureBlocks ? BLOCK_WIDTH_DAYS * DAY_WIDTH : 0;

  // Calculate chart dimensions (include offset and future block space)
  const chartWidth = useMemo(() => {
    return Math.max(previousBlockOffset + totalDisplayDays * DAY_WIDTH + futureBlockSpace, 800);
  }, [totalDisplayDays, previousBlockOffset, futureBlockSpace]);

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
              zIndex: 3,
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            {/* Header spacer - 5 rows: months, sprint names, dates, capacity input, usage */}
            {/* This is the "no man's land" corner that covers both sticky header and sticky labels */}
            <Box sx={{
              height: 132,
              borderBottom: 1,
              borderColor: 'divider',
              position: 'sticky',
              top: 0,
              zIndex: 4,
              bgcolor: 'background.paper',
            }} />

            {/* Epic labels grouped by commit type */}
            {/* Commits section header */}
            {epicsByType.commits.length > 0 && (
              <Box sx={{ height: 20, display: 'flex', alignItems: 'center', bgcolor: 'grey.100', borderBottom: 2, borderColor: 'black' }}>
                <Typography variant="caption" sx={{ px: 1, fontWeight: 'bold', color: 'text.secondary', fontSize: 10 }}>
                  COMMITS
                </Typography>
              </Box>
            )}
            {epicsByType.commits.map((epic) => {
              const globalIndex = epics.findIndex(e => e.key === epic.key);
              return (
                <EpicRow
                  key={epic.key}
                  epic={epic}
                  labelOnly
                  dayWidth={DAY_WIDTH}
                  rowHeight={ROW_HEIGHT}
                  startDate={projectStartDate}
                  expanded={expandedEpics[epic.key] ?? true}
                  onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                  epicColor={getEpicColor(globalIndex)}
                  totalDays={totalDisplayDays}
                />
              );
            })}
            {/* Stretches section header */}
            {epicsByType.stretches.length > 0 && (
              <Box sx={{ height: 20, display: 'flex', alignItems: 'center', bgcolor: 'grey.100', borderBottom: 2, borderColor: 'black' }}>
                <Typography variant="caption" sx={{ px: 1, fontWeight: 'bold', color: 'text.secondary', fontSize: 10 }}>
                  STRETCHES
                </Typography>
              </Box>
            )}
            {epicsByType.stretches.map((epic) => {
              const globalIndex = epics.findIndex(e => e.key === epic.key);
              return (
                <EpicRow
                  key={epic.key}
                  epic={epic}
                  labelOnly
                  dayWidth={DAY_WIDTH}
                  rowHeight={ROW_HEIGHT}
                  startDate={projectStartDate}
                  expanded={expandedEpics[epic.key] ?? true}
                  onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                  epicColor={getEpicColor(globalIndex)}
                  totalDays={totalDisplayDays}
                />
              );
            })}
            {/* Others section header */}
            {epicsByType.others.length > 0 && (
              <Box sx={{ height: 20, display: 'flex', alignItems: 'center', bgcolor: 'grey.100', borderBottom: 2, borderColor: 'black' }}>
                <Typography variant="caption" sx={{ px: 1, fontWeight: 'bold', color: 'text.secondary', fontSize: 10 }}>
                  OTHER
                </Typography>
              </Box>
            )}
            {epicsByType.others.map((epic) => {
              const globalIndex = epics.findIndex(e => e.key === epic.key);
              return (
                <EpicRow
                  key={epic.key}
                  epic={epic}
                  labelOnly
                  dayWidth={DAY_WIDTH}
                  rowHeight={ROW_HEIGHT}
                  startDate={projectStartDate}
                  expanded={expandedEpics[epic.key] ?? true}
                  onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                  epicColor={getEpicColor(globalIndex)}
                  totalDays={totalDisplayDays}
                />
              );
            })}
          </Box>

          {/* Chart area */}
          <Box sx={{ flexGrow: 1 }}>
            {/* Timeline header */}
            <TimelineHeader
              sprints={sprints}
              dailyCapacities={dailyCapacities}
              startDate={projectStartDate}
              dayWidth={DAY_WIDTH}
              maxDevelopers={maxDevelopers}
              onDailyCapacityChange={onDailyCapacityChange}
              today={today}
              sprintDateOverrides={sprintDateOverrides}
              chartLeftOffset={previousBlockOffset}
            />

            {/* Epic rows with ticket bars */}
            <Box sx={{ position: 'relative' }}>
              {/* Dependency lines overlay */}
              <DependencyLines
                epics={epics}
                expandedEpics={expandedEpics}
                dayWidth={DAY_WIDTH}
                rowHeight={ROW_HEIGHT}
                totalDays={totalDisplayDays}
                chartLeftOffset={previousBlockOffset}
                sectionHeaderHeight={20}
                hasCommits={epicsByType.commits.length > 0}
                hasStretches={epicsByType.stretches.length > 0}
                hasOthers={epicsByType.others.length > 0}
              />

              {/* Epic rows grouped by commit type */}
              {/* Commits section header */}
              {epicsByType.commits.length > 0 && (
                <Box sx={{ height: 20, borderBottom: 2, borderColor: 'black', bgcolor: 'grey.100' }} />
              )}
              {epicsByType.commits.map((epic) => {
                const globalIndex = epics.findIndex(e => e.key === epic.key);
                return (
                  <EpicRow
                    key={epic.key}
                    epic={epic}
                    dayWidth={DAY_WIDTH}
                    rowHeight={ROW_HEIGHT}
                    startDate={projectStartDate}
                    expanded={expandedEpics[epic.key] ?? true}
                    onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                    epicColor={getEpicColor(globalIndex)}
                    today={today}
                    dailyCapacities={dailyCapacities}
                    totalDays={totalDisplayDays}
                    chartLeftOffset={previousBlockOffset}
                  />
                );
              })}
              {/* Stretches section header */}
              {epicsByType.stretches.length > 0 && (
                <Box sx={{ height: 20, borderBottom: 2, borderColor: 'black', bgcolor: 'grey.100' }} />
              )}
              {epicsByType.stretches.map((epic) => {
                const globalIndex = epics.findIndex(e => e.key === epic.key);
                return (
                  <EpicRow
                    key={epic.key}
                    epic={epic}
                    dayWidth={DAY_WIDTH}
                    rowHeight={ROW_HEIGHT}
                    startDate={projectStartDate}
                    expanded={expandedEpics[epic.key] ?? true}
                    onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                    epicColor={getEpicColor(globalIndex)}
                    today={today}
                    dailyCapacities={dailyCapacities}
                    totalDays={totalDisplayDays}
                    chartLeftOffset={previousBlockOffset}
                  />
                );
              })}
              {/* Others section header */}
              {epicsByType.others.length > 0 && (
                <Box sx={{ height: 20, borderBottom: 2, borderColor: 'black', bgcolor: 'grey.100' }} />
              )}
              {epicsByType.others.map((epic) => {
                const globalIndex = epics.findIndex(e => e.key === epic.key);
                return (
                  <EpicRow
                    key={epic.key}
                    epic={epic}
                    dayWidth={DAY_WIDTH}
                    rowHeight={ROW_HEIGHT}
                    startDate={projectStartDate}
                    expanded={expandedEpics[epic.key] ?? true}
                    onToggleExpanded={() => toggleEpicExpanded(epic.key)}
                    epicColor={getEpicColor(globalIndex)}
                    today={today}
                    dailyCapacities={dailyCapacities}
                    totalDays={totalDisplayDays}
                    chartLeftOffset={previousBlockOffset}
                  />
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default GanttChart;
export { DAY_WIDTH, ROW_HEIGHT, LABEL_WIDTH };
