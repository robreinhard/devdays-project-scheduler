'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import type { SprintWithCapacity, DayCapacityInfo } from '@/shared/types';
import { parseDate, workDaysBetween } from '@/shared/utils/dates';

interface TimelineHeaderProps {
  sprints: SprintWithCapacity[];
  dailyCapacities?: DayCapacityInfo[];
  startDate: string;
  totalDays: number;
  dayWidth: number;
  maxDevelopers: number;
  onDailyCapacityChange?: (dayIndex: number, date: string, capacity: number) => void;
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
  const startDt = useMemo(() => parseDate(startDate), [startDate]);

  // Calculate sprint positions (always excludes weekends)
  const sprintPositions = useMemo(() => {
    return sprints.map((sprint) => {
      const sprintStart = parseDate(sprint.startDate);
      const sprintEnd = parseDate(sprint.endDate);
      const startDay = workDaysBetween(startDt, sprintStart);
      const endDay = workDaysBetween(startDt, sprintEnd);
      const width = (endDay - startDay) * dayWidth;

      return {
        sprint,
        left: startDay * dayWidth,
        width,
        startDay,
        endDay,
      };
    });
  }, [sprints, startDt, dayWidth]);

  // Generate day markers from dailyCapacities to ensure indices align
  const dayMarkers = useMemo(() => {
    if (!dailyCapacities || dailyCapacities.length === 0) return [];
    return dailyCapacities.map((cap, idx) => {
      const dt = parseDate(cap.date);
      return {
        day: idx,
        dateStr: cap.date,
        dayOfMonth: dt.day,
        weekdayAbbrev: dt.toFormat('ccc').slice(0, 2),
      };
    });
  }, [dailyCapacities]);



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
        {dayMarkers.map(({ day, dayOfMonth, weekdayAbbrev }) => (
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
              {dayOfMonth}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 8 }}>
              {weekdayAbbrev}
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
        {dayMarkers.map(({ day, dateStr }) => {
          const capacityInfo = dailyCapacities?.[day];
          const currentCapacity = capacityInfo?.totalCapacity ?? maxDevelopers;
          const isModified = currentCapacity !== maxDevelopers;
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
                      bgcolor: isModified ? 'warning.light' : 'transparent',
                      '& input': {
                        textAlign: 'center',
                        p: '2px',
                        fontWeight: isModified ? 'bold' : 'normal',
                      },
                    },
                  },
                  htmlInput: { min: 0, max: 99 },
                }}
                sx={{
                  width: dayWidth - 4,
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: isModified ? 'warning.main' : 'divider',
                      borderWidth: isModified ? 2 : 1,
                    },
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
