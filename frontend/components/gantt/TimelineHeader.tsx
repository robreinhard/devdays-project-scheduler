'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SprintWithCapacity } from '@/shared/types';

interface TimelineHeaderProps {
  sprints: SprintWithCapacity[];
  startDate: Date;
  totalDays: number;
  dayWidth: number;
  includeWeekends: boolean;
}

/**
 * Check if a date is a weekend
 */
const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Calculate work days between two dates
 */
const workDaysBetween = (start: Date, end: Date): number => {
  let workDays = 0;
  const current = new Date(start);
  while (current < end) {
    if (!isWeekend(current)) workDays++;
    current.setDate(current.getDate() + 1);
  }
  return workDays;
};

/**
 * Calculate days between two dates (calendar or work days)
 */
const daysBetween = (start: Date, end: Date, includeWeekends: boolean): number => {
  if (includeWeekends) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.ceil((end.getTime() - start.getTime()) / msPerDay);
  }
  return workDaysBetween(start, end);
};

const TimelineHeader = ({ sprints, startDate, totalDays, dayWidth, includeWeekends }: TimelineHeaderProps) => {
  // Calculate sprint positions
  const sprintPositions = useMemo(() => {
    return sprints.map((sprint) => {
      const sprintStart = new Date(sprint.startDate);
      const sprintEnd = new Date(sprint.endDate);
      const startDay = daysBetween(startDate, sprintStart, includeWeekends);
      const endDay = daysBetween(startDate, sprintEnd, includeWeekends);
      const width = (endDay - startDay) * dayWidth;

      return {
        sprint,
        left: startDay * dayWidth,
        width,
        startDay,
        endDay,
      };
    });
  }, [sprints, startDate, dayWidth, includeWeekends]);

  // Calculate total days across all sprints
  const totalSprintDays = useMemo(() => {
    if (sprints.length === 0) return totalDays;

    const lastSprint = sprints[sprints.length - 1];
    const lastSprintEnd = new Date(lastSprint.endDate);
    return daysBetween(startDate, lastSprintEnd, includeWeekends);
  }, [sprints, startDate, totalDays, includeWeekends]);

  // Generate day markers (skip weekends if not included)
  const dayMarkers = useMemo(() => {
    const markers = [];
    let dayIndex = 0;
    const current = new Date(startDate);

    // Generate markers for each display day
    while (dayIndex <= totalSprintDays) {
      if (includeWeekends || !isWeekend(current)) {
        markers.push({ day: dayIndex, date: new Date(current) });
        dayIndex++;
      }
      current.setDate(current.getDate() + 1);
    }
    return markers;
  }, [totalSprintDays, startDate, includeWeekends]);

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper' }}>
      {/* Sprint row */}
      <Box
        sx={{
          height: 30,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'primary.main',
        }}
      >
        {sprintPositions.map(({ sprint, left, width }) => (
          <Box
            key={sprint.id}
            sx={{
              position: 'absolute',
              left,
              width,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: 1,
              borderColor: 'primary.dark',
              px: 1,
              overflow: 'hidden',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: 'primary.contrastText',
                fontWeight: 'medium',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sprint.name} ({sprint.devDaysCapacity} DD)
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Day markers row */}
      <Box
        sx={{
          height: 30,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.100',
          display: 'flex',
        }}
      >
        {dayMarkers.map(({ day, date }) => (
          <Box
            key={day}
            sx={{
              width: dayWidth,
              minWidth: dayWidth,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 'medium' }}>
              {date.getDate()}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8 }}>
              {date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default TimelineHeader;
