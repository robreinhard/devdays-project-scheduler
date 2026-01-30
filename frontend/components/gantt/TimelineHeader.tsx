'use client';

import {useMemo} from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import WarningIcon from '@mui/icons-material/Warning';
import type {SprintWithCapacity, DayCapacityInfo, SprintDateOverride} from '@/shared/types';
import {parseDate, workDaysBetween} from '@/shared/utils/dates';
import {getSprintDateOverride} from '@/shared/utils/sprints';

const EXPECTED_SPRINT_WORKDAYS = 10;

interface TimelineHeaderProps {
    sprints: SprintWithCapacity[];
    dailyCapacities?: DayCapacityInfo[];
    startDate: string;
    dayWidth: number;
    maxDevelopers: number;
    onDailyCapacityChange?: (dayIndex: number, date: string, capacity: number) => void;
    today: string;
    sprintDateOverrides?: SprintDateOverride[];
}

const TimelineHeader = ({
                            sprints,
                            dailyCapacities,
                            startDate,
                            dayWidth,
                            maxDevelopers,
                            onDailyCapacityChange,
                            today,
                            sprintDateOverrides = []
                        }: TimelineHeaderProps) => {
    const startDt = useMemo(() => parseDate(startDate), [startDate]);

    // Helper to check if a date is in the past
    const isPastDay = (dateStr: string) => parseDate(dateStr) < parseDate(today);

    // Calculate sprint positions from dailyCapacities to ensure alignment with day columns
    const sprintPositions = useMemo(() => {
        return sprints.map((sprint) => {
            const sprintDays = dailyCapacities?.filter(d => d.sprintId === sprint.id) ?? [];

            if (sprintDays.length === 0) {
                const sprintStart = parseDate(sprint.startDate);
                const startDay = workDaysBetween(startDt, sprintStart);
                return { sprint, left: startDay * dayWidth, width: 0, startDay, endDay: startDay };
            }

            const firstDayIndex = sprintDays[0].dayIndex;
            const lastDayIndex = sprintDays[sprintDays.length - 1].dayIndex;
            const width = (lastDayIndex - firstDayIndex + 1) * dayWidth;

            return {
                sprint,
                left: firstDayIndex * dayWidth,
                width,
                startDay: firstDayIndex,
                endDay: lastDayIndex + 1,
            };
        });
    }, [sprints, dailyCapacities, startDt, dayWidth]);

    // Generate day markers from dailyCapacities to ensure indices align
    const dayMarkers = useMemo(() => {
        if (!dailyCapacities || dailyCapacities.length === 0) return [];
        return dailyCapacities.map((cap, idx) => {
            const dt = parseDate(cap.date);
            return {
                day: idx,
                dateStr: cap.date,
                dayOfMonth: dt.day,
                month: dt.month,
                year: dt.year,
                monthName: dt.toFormat('MMM yyyy'),
                weekdayAbbrev: dt.toFormat('ccc').slice(0, 2),
            };
        });
    }, [dailyCapacities]);

    // Calculate month positions for the month bar
    const monthPositions = useMemo(() => {
        if (dayMarkers.length === 0) return [];

        const months: { key: string; name: string; startDay: number; dayCount: number }[] = [];
        let currentMonth = dayMarkers[0].monthName;
        let startDay = 0;
        let dayCount = 0;

        dayMarkers.forEach((marker, idx) => {
            if (marker.monthName === currentMonth) {
                dayCount++;
            } else {
                months.push({key: `${currentMonth}-${startDay}`, name: currentMonth, startDay, dayCount});
                currentMonth = marker.monthName;
                startDay = idx;
                dayCount = 1;
            }
        });

        // Push the last month
        months.push({key: `${currentMonth}-${startDay}`, name: currentMonth, startDay, dayCount});

        return months;
    }, [dayMarkers]);


    return (
        <Box sx={{position: 'sticky', top: 0, zIndex: 1, bgcolor: 'background.paper'}}>
            {/* Month row */}
            <Box
                sx={{
                    height: 24,
                    position: 'relative',
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'grey.200',
                }}
            >
                {monthPositions.map(({key, name, startDay, dayCount}) => (
                    <Box
                        key={key}
                        sx={{
                            position: 'absolute',
                            left: startDay * dayWidth,
                            width: dayCount * dayWidth,
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: 1,
                            borderColor: 'grey.400',
                            px: 1,
                            overflow: 'hidden',
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{
                                fontWeight: 'medium',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {name}
                        </Typography>
                    </Box>
                ))}
            </Box>

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
                {sprintPositions.map(({sprint, left, width}) => {
                    const sprintStartDt = parseDate(sprint.startDate);
                    const sprintEndDt = parseDate(sprint.endDate);
                    const isOverridden = !!getSprintDateOverride(sprint.id, sprintDateOverrides);
                    // Calculate workdays (inclusive of both start and end dates)
                    const sprintWorkDays = workDaysBetween(sprintStartDt, sprintEndDt.plus({ days: 1 }));
                    const isNonStandardLength = sprintWorkDays !== EXPECTED_SPRINT_WORKDAYS;

                    // Determine background color priority: non-standard length (warning) > overridden > default
                    let bgColor: string | undefined;
                    if (isNonStandardLength) {
                        bgColor = 'warning.main';
                    } else if (isOverridden) {
                        bgColor = 'warning.dark';
                    }

                    const tooltipContent = (
                        <Box sx={{p: 0.5}}>
                            <Typography variant="subtitle2" fontWeight="bold">{sprint.name}</Typography>
                            {isOverridden && (
                                <Typography variant="caption" display="block" sx={{ color: 'warning.light', fontStyle: 'italic' }}>
                                    (Dates manually overridden)
                                </Typography>
                            )}
                            <Typography variant="caption" display="block">
                                Start: {sprintStartDt.toFormat('MMM d, yyyy')}
                            </Typography>
                            <Typography variant="caption" display="block">
                                End: {sprintEndDt.toFormat('MMM d, yyyy')}
                            </Typography>
                            <Typography variant="caption" display="block" sx={{
                                mt: 0.5,
                                color: isNonStandardLength ? 'warning.light' : undefined,
                                fontWeight: isNonStandardLength ? 'bold' : undefined
                            }}>
                                Workdays: {sprintWorkDays} {isNonStandardLength && `(expected ${EXPECTED_SPRINT_WORKDAYS})`}
                            </Typography>
                        </Box>
                    );
                    return (
                        <Tooltip key={sprint.id} title={tooltipContent} arrow placement="top">
                            <Box
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
                                    cursor: 'default',
                                    bgcolor: bgColor,
                                    gap: 0.5,
                                }}
                            >
                                {isNonStandardLength && (
                                    <WarningIcon sx={{ fontSize: 14, color: 'warning.contrastText' }} />
                                )}
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: isNonStandardLength ? 'warning.contrastText' : 'primary.contrastText',
                                        fontWeight: 'medium',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                    }}
                                >
                                    {sprint.name}
                                </Typography>
                            </Box>
                        </Tooltip>
                    );
                })}
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
                {dayMarkers.map(({day, dateStr, dayOfMonth, weekdayAbbrev}) => {
                    const isPast = isPastDay(dateStr);
                    return (
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
                                opacity: isPast ? 0.5 : 1,
                                bgcolor: isPast ? 'grey.200' : 'grey.100',
                            }}
                        >
                            <Typography variant="caption" sx={{fontSize: 10, fontWeight: 'medium'}}>
                                {dayOfMonth}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{fontSize: 8}}>
                                {weekdayAbbrev}
                            </Typography>
                        </Box>
                    );
                })}
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
                {dayMarkers.map(({day, dateStr}) => {
                    const capacityInfo = dailyCapacities?.[day];
                    const currentCapacity = capacityInfo?.totalCapacity ?? maxDevelopers;
                    const isModified = currentCapacity !== maxDevelopers;
                    const isPast = isPastDay(dateStr);
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
                                opacity: isPast ? 0.5 : 1,
                                bgcolor: isPast ? 'grey.200' : 'grey.50',
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
                                    htmlInput: {min: 0, max: 99},
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
                {dayMarkers.map(({day, dateStr}) => {
                    const capacityInfo = dailyCapacities?.[day];
                    const total = capacityInfo?.totalCapacity ?? maxDevelopers;
                    const used = capacityInfo?.usedCapacity ?? 0;
                    const usagePercent = total > 0 ? (used / total) * 100 : 0;
                    const isPast = isPastDay(dateStr);

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
                                opacity: isPast ? 0.5 : 1,
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
