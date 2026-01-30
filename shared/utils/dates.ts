import { DateTime } from 'luxon';

// Timezone from env, default to Chicago (CST)
export const TIMEZONE = process.env.NEXT_PUBLIC_TIMEZONE || 'America/Chicago';

/** Parse ISO date string in configured timezone */
export const parseDate = (dateStr: string): DateTime => {
  const parsed = DateTime.fromISO(dateStr, { zone: TIMEZONE });

  if (dateStr.includes('T')) {
    // Parse in UTC first to get the intended calendar date
    const utcParsed = DateTime.fromISO(dateStr, { zone: 'UTC' });
    return DateTime.fromObject(
      { year: utcParsed.year, month: utcParsed.month, day: utcParsed.day },
      { zone: TIMEZONE }
    );
  }

  return parsed;
};

/** Check if a DateTime is a weekend (Sat=6, Sun=7 in Luxon) */
export const isWeekend = (dt: DateTime): boolean => dt.weekday >= 6;

/** Add work days to a date (skipping weekends) */
export const addWorkDays = (start: DateTime, workDays: number): DateTime => {
  let result = start;
  let remaining = workDays;
  while (remaining > 0) {
    result = result.plus({ days: 1 });
    if (!isWeekend(result)) remaining--;
  }
  return result;
};

/** Count work days between two dates (exclusive of end) */
export const workDaysBetween = (start: DateTime, end: DateTime): number => {
  let count = 0;
  let current = start;
  while (current < end) {
    if (!isWeekend(current)) count++;
    current = current.plus({ days: 1 });
  }
  return count;
};

/** Get all work days in a range as DateTimes */
export const getWorkDaysInRange = (start: DateTime, end: DateTime): DateTime[] => {
  const days: DateTime[] = [];
  let current = start;
  while (current <= end) {
    if (!isWeekend(current)) days.push(current);
    current = current.plus({ days: 1 });
  }
  return days;
};
