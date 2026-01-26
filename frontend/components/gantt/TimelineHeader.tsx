'use client';

import { useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import type { SprintWithCapacity, DayCapacityInfo } from '@/shared/types';

interface TimelineHeaderProps {
  sprints: SprintWithCapacity[];
  dailyCapacities?: DayCapacityInfo[];
  startDate: Date;
  totalDays: number;
  dayWidth: number;
  maxDevelopers: number;
  onDailyCapacityChange?: (dayIndex: number, date: string, capacity: number) => void;
}

/**
 * Check if a date is a weekend
 */
const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Calculate work days between two dates (always excludes weekends)
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

const toISODateStringLocal = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return `${year}-${month}-${day}`;
}

const TimelineHeader = ({
  sprints,
  dailyCapacities,
  startDate,
  totalDays,
  dayWidth,
  maxDevelopers,
  onDailyCapacityChange
}: TimelineHeaderProps) => {
  // Calculate sprint positions (always excludes weekends)
  const sprintPositions = useMemo(() => {
    return sprints.map((sprint) => {
      const sprintStart = new Date(sprint.startDate);
      const sprintEnd = new Date(sprint.endDate);
      const startDay = workDaysBetween(startDate, sprintStart);
      const endDay = workDaysBetween(startDate, sprintEnd);
      const width = (endDay - startDay) * dayWidth;

      return {
        sprint,
        left: startDay * dayWidth,
        width,
        startDay,
        endDay,
      };
    });
  }, [sprints, startDate, dayWidth]);

  // Calculate total days across all sprints
  const totalSprintDays = useMemo(() => {
    if (sprints.length === 0) return totalDays;

    const lastSprint = sprints[sprints.length - 1];
    const lastSprintEnd = new Date(lastSprint.endDate);
    return workDaysBetween(startDate, lastSprintEnd);
  }, [sprints, startDate, totalDays]);

  // Generate day markers (always skip weekends)
  const dayMarkers = useMemo(() => {
    const markers = [];
    let dayIndex = 0;
    const current = new Date(startDate);

    // Generate markers for each work day
    while (dayIndex <= totalSprintDays) {
      if (!isWeekend(current)) {
        markers.push({ day: dayIndex, date: new Date(current) });
        dayIndex++;
      }
      current.setDate(current.getDate() + 1);
    }
    return markers;
  }, [totalSprintDays, startDate]);



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

      {/* Daily capacity input row */}
      <Box
        sx={{
          height: 28,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
          display: 'flex',
        }}
      >
        {dayMarkers.map(({ day, date }) => {
          const capacityInfo = dailyCapacities?.[day];
          const currentCapacity = capacityInfo?.totalCapacity ?? maxDevelopers;
          const dateStr = toISODateStringLocal(date);
          return (
            <Box
              key={`input-${day}`}
              sx={{
                width: dayWidth,
                minWidth: dayWidth,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: 1,
                borderColor: 'divider',
              }}
            >
              <TextField
                size="small"
                type="number"
                value={currentCapacity}
                onChange={(e) => {
                  const newValue = parseInt(e.target.value, 10);
                  if (!isNaN(newValue) && newValue >= 0 && onDailyCapacityChange) {
                    onDailyCapacityChange(day, dateStr, newValue);
                  }
                }}
                slotProps={{
                  input: {
                    sx: {
                      height: 22,
                      fontSize: 10,
                      p: 0,
                      '& input': {
                        textAlign: 'center',
                        p: '2px',
                      },
                    },
                  },
                  htmlInput: { min: 0, max: 99 },
                }}
                sx={{
                  width: dayWidth - 4,
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': { borderColor: 'divider' },
                  },
                }}
              />
            </Box>
          );
        })}
      </Box>

      {/* Usage row - shows used/total */}
      <Box
        sx={{
          height: 20,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'grey.50',
          display: 'flex',
        }}
      >
        {dayMarkers.map(({ day }) => {
          const capacityInfo = dailyCapacities?.[day];
          const total = capacityInfo?.totalCapacity ?? maxDevelopers;
          const used = capacityInfo?.usedCapacity ?? 0;
          const usagePercent = total > 0 ? (used / total) * 100 : 0;

          // Color based on utilization:
          // GREEN: 100% utilized (all developers used)
          // ORANGE: >40% utilized
          // RED: <=40% utilized (underutilized)
          let bgColor = 'error.light'; // Default red for low utilization
          if (usagePercent >= 100) {
            bgColor = 'success.light'; // Green for full utilization
          } else if (usagePercent > 40) {
            bgColor = 'warning.light'; // Orange for partial utilization
          }

          return (
            <Box
              key={`cap-${day}`}
              sx={{
                width: dayWidth,
                minWidth: dayWidth,
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: 1,
                borderColor: 'divider',
                bgcolor: bgColor,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: 9,
                  fontWeight: 'medium',
                  color: usagePercent >= 100 ? 'success.contrastText' : 'text.primary',
                }}
              >
                {used}/{total}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default TimelineHeader;
