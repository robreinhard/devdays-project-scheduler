import type {
  JiraEpic,
  JiraTicket,
  JiraSprint,
  SprintCapacity,
  SprintWithCapacity,
  ScheduledTicket,
  ScheduledEpic,
  DayCapacityInfo,
  GanttData,
  SchedulingInput,
} from '@/shared/types';

/**
 * Check if a date is a weekend (Saturday = 6, Sunday = 0)
 */
const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Add work days to a date (skips weekends)
 */
const addWorkDays = (startDate: Date, workDays: number): Date => {
  const result = new Date(startDate);
  let remaining = workDays;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    if (!isWeekend(result)) {
      remaining--;
    }
  }
  return result;
};

/**
 * Get all work days in a sprint as an array of date strings
 */
const getSprintWorkDays = (sprint: JiraSprint): string[] => {
  const workDays: string[] = [];
  const current = new Date(sprint.startDate);
  const end = new Date(sprint.endDate);

  while (current <= end) {
    if (!isWeekend(current)) {
      workDays.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  return workDays;
};

/**
 * Interface for daily capacity tracking
 */
interface DayCapacity {
  date: string;
  sprintId: number;
  originalCapacity: number;
  remainingCapacity: number;
  sprintDayIndex: number;
}

/**
 * Build a map of daily capacities across all sprints
 */
const buildDailyCapacityMap = (
  sprints: SprintWithCapacity[],
  maxDevelopers: number,
  sprintCapacities: SprintCapacity[]
): DayCapacity[] => {
  const days: DayCapacity[] = [];

  for (const sprint of sprints) {
    const workDays = getSprintWorkDays(sprint);
    const sprintCapacity = sprintCapacities.find(sc => sc.sprintId === sprint.id);

    workDays.forEach((date, index) => {
      const dailyOverride = sprintCapacity?.dailyCapacities?.find(dc => dc.date === date);
      const capacity = dailyOverride?.capacity ?? maxDevelopers;

      days.push({
        date,
        sprintId: sprint.id,
        originalCapacity: capacity,
        remainingCapacity: capacity,
        sprintDayIndex: index,
      });
    });
  }

  return days;
};

/**
 * Calculate worst-case duration for an epic (sum of all ticket devDays)
 */
const calculateWorstCase = (epic: JiraEpic, tickets: JiraTicket[]): number => {
  return tickets
    .filter(t => t.epicKey === epic.key)
    .reduce((sum, t) => sum + t.devDays, 0);
};

/**
 * Sort epics by priority override (if set) then by worst-case duration (longest first)
 */
const sortEpics = (epics: JiraEpic[], worstCaseMap: Map<string, number>): JiraEpic[] => {
  return [...epics].sort((a, b) => {
    if (a.priorityOverride !== undefined && b.priorityOverride !== undefined) {
      return a.priorityOverride - b.priorityOverride;
    }
    if (a.priorityOverride !== undefined) return -1;
    if (b.priorityOverride !== undefined) return 1;

    const aWorst = worstCaseMap.get(a.key) ?? 0;
    const bWorst = worstCaseMap.get(b.key) ?? 0;
    return bWorst - aWorst;
  });
};

/**
 * Get tickets for an epic sorted by timeline order
 */
const getEpicTicketsSorted = (epicKey: string, tickets: JiraTicket[]): JiraTicket[] => {
  return tickets
    .filter(t => t.epicKey === epicKey)
    .sort((a, b) => a.timelineOrder - b.timelineOrder);
};

/**
 * Find the first day of the next sprint after the given day index
 */
const findNextSprintStart = (
  currentDayIndex: number,
  dailyCapacity: DayCapacity[]
): number => {
  const currentSprint = dailyCapacity[currentDayIndex]?.sprintId;
  if (currentSprint === undefined) return dailyCapacity.length;

  for (let i = currentDayIndex + 1; i < dailyCapacity.length; i++) {
    if (dailyCapacity[i].sprintId !== currentSprint) {
      return i;
    }
  }

  return dailyCapacity.length;
};

/**
 * Get the last day index of a sprint
 */
const getSprintEndDayIndex = (
  startDayIndex: number,
  dailyCapacity: DayCapacity[]
): number => {
  const sprintId = dailyCapacity[startDayIndex]?.sprintId;
  if (sprintId === undefined) return startDayIndex;

  for (let i = startDayIndex; i < dailyCapacity.length; i++) {
    if (dailyCapacity[i].sprintId !== sprintId) {
      return i - 1;
    }
  }

  return dailyCapacity.length - 1;
};

/**
 * Slot an epic's tickets linearly, respecting sprint boundaries
 */
const slotEpicLinear = (
  epic: JiraEpic,
  tickets: JiraTicket[],
  dailyCapacity: DayCapacity[],
  startDayIndex: number
): ScheduledTicket[] => {
  const scheduledTickets: ScheduledTicket[] = [];
  const epicTickets = getEpicTicketsSorted(epic.key, tickets);

  let currentDayIndex = startDayIndex;
  let hasSeenMissingEstimate = false;

  for (const ticket of epicTickets) {
    // Find a position where the ticket fits within a single sprint
    while (currentDayIndex < dailyCapacity.length) {
      const sprintEndIndex = getSprintEndDayIndex(currentDayIndex, dailyCapacity);
      const remainingDaysInSprint = sprintEndIndex - currentDayIndex + 1;

      if (ticket.devDays <= remainingDaysInSprint) {
        break;
      }

      currentDayIndex = findNextSprintStart(currentDayIndex, dailyCapacity);
    }

    if (currentDayIndex >= dailyCapacity.length) {
      break;
    }

    const isUncertain = hasSeenMissingEstimate;
    if (ticket.isMissingEstimate) {
      hasSeenMissingEstimate = true;
    }

    const startDay = currentDayIndex;
    const endDay = startDay + ticket.devDays;
    const sprintId = dailyCapacity[currentDayIndex].sprintId;

    for (let d = startDay; d < endDay && d < dailyCapacity.length; d++) {
      dailyCapacity[d].remainingCapacity -= 1;
    }

    scheduledTickets.push({
      ...ticket,
      startDay,
      endDay,
      sprintId,
      parallelGroup: 0,
      isUncertain,
    });

    currentDayIndex = endDay;
  }

  return scheduledTickets;
};

/**
 * Find the next available slot with capacity for a ticket
 */
const findNextAvailableSlot = (
  startFrom: number,
  ticketDevDays: number,
  dailyCapacity: DayCapacity[]
): number => {
  let dayIndex = startFrom;

  while (dayIndex < dailyCapacity.length) {
    if (dailyCapacity[dayIndex].remainingCapacity > 0) {
      const sprintEndIndex = getSprintEndDayIndex(dayIndex, dailyCapacity);
      const remainingDaysInSprint = sprintEndIndex - dayIndex + 1;

      if (ticketDevDays <= remainingDaysInSprint) {
        let allHaveCapacity = true;
        for (let d = dayIndex; d < dayIndex + ticketDevDays && d < dailyCapacity.length; d++) {
          if (dailyCapacity[d].remainingCapacity <= 0) {
            allHaveCapacity = false;
            break;
          }
        }

        if (allHaveCapacity) {
          return dayIndex;
        }
      }
    }

    dayIndex++;
  }

  return dailyCapacity.length;
};

/**
 * Main scheduling algorithm
 * Slots tickets into sprints while respecting capacity and sprint boundaries
 */
export const scheduleTickets = (input: SchedulingInput): GanttData => {
  const { epics, tickets, sprints, sprintCapacities, maxDevelopers } = input;

  // Validate: Check for tickets > 10 points
  const oversizedTickets = tickets.filter(t => t.devDays > 10);
  if (oversizedTickets.length > 0) {
    throw new Error(
      `Stories exceed 10 points (max for a sprint): ${oversizedTickets.map(t => `${t.key} (${t.devDays}pts)`).join(', ')}`
    );
  }

  // Create sprints with capacity
  const sprintsWithCapacity: SprintWithCapacity[] = sprints
    .filter(s => sprintCapacities.some(sc => sc.sprintId === s.id))
    .map(sprint => {
      const capacity = sprintCapacities.find(sc => sc.sprintId === sprint.id);
      return {
        ...sprint,
        devDaysCapacity: capacity?.devDaysCapacity ?? maxDevelopers,
        remainingCapacity: capacity?.devDaysCapacity ?? maxDevelopers,
      };
    })
    .filter(s => s.startDate && s.endDate)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (sprintsWithCapacity.length === 0) {
    throw new Error('No valid sprints with capacity found');
  }

  const projectStartDate = new Date(sprintsWithCapacity[0].startDate);
  const dailyCapacity = buildDailyCapacityMap(sprintsWithCapacity, maxDevelopers, sprintCapacities);

  // Calculate worst-case duration for each epic
  const worstCaseMap = new Map<string, number>();
  for (const epic of epics) {
    worstCaseMap.set(epic.key, calculateWorstCase(epic, tickets));
  }

  // Separate and sort epics by commit type
  const commitEpics = epics.filter(e => e.commitType === 'commit');
  const stretchEpics = epics.filter(e => e.commitType === 'stretch');

  const sortedCommits = sortEpics(commitEpics, worstCaseMap);
  const sortedStretch = sortEpics(stretchEpics, worstCaseMap);

  const allScheduledTickets: ScheduledTicket[] = [];
  let nextLinearStartDay = 0;

  // Slot commit epics first (linear scheduling)
  for (const epic of sortedCommits) {
    const scheduled = slotEpicLinear(epic, tickets, dailyCapacity, nextLinearStartDay);
    allScheduledTickets.push(...scheduled);

    if (scheduled.length > 0) {
      const maxEndDay = Math.max(...scheduled.map(t => t.endDay));
      nextLinearStartDay = maxEndDay;
    }
  }

  // Slot stretch epics (fill gaps with available capacity)
  for (const epic of sortedStretch) {
    const epicTickets = getEpicTicketsSorted(epic.key, tickets);
    let currentSearchStart = 0;
    let hasSeenMissingEstimate = false;

    for (const ticket of epicTickets) {
      const startDayIndex = findNextAvailableSlot(currentSearchStart, ticket.devDays, dailyCapacity);

      if (startDayIndex >= dailyCapacity.length) {
        break;
      }

      const isUncertain = hasSeenMissingEstimate;
      if (ticket.isMissingEstimate) {
        hasSeenMissingEstimate = true;
      }

      const endDay = startDayIndex + ticket.devDays;
      const sprintId = dailyCapacity[startDayIndex].sprintId;

      for (let d = startDayIndex; d < endDay && d < dailyCapacity.length; d++) {
        dailyCapacity[d].remainingCapacity -= 1;
      }

      allScheduledTickets.push({
        ...ticket,
        startDay: startDayIndex,
        endDay,
        sprintId,
        parallelGroup: 0,
        isUncertain,
      });

      currentSearchStart = endDay;
    }
  }

  const totalDevDays = allScheduledTickets.reduce((sum, t) => sum + t.devDays, 0);

  // Build scheduled epics
  const scheduledEpics: ScheduledEpic[] = epics.map(epic => {
    const epicTickets = allScheduledTickets.filter(t => t.epicKey === epic.key);
    const epicTotalDevDays = epicTickets.reduce((sum, t) => sum + t.devDays, 0);

    return {
      ...epic,
      tickets: epicTickets,
      totalDevDays: epicTotalDevDays,
      startDay: epicTickets.length > 0 ? Math.min(...epicTickets.map(t => t.startDay)) : 0,
      endDay: epicTickets.length > 0 ? Math.max(...epicTickets.map(t => t.endDay)) : 0,
    };
  });

  // Sort epics by worst case duration (longest first)
  scheduledEpics.sort((a, b) => b.totalDevDays - a.totalDevDays);

  // Build daily capacity info for UI display
  const dailyCapacityInfo: DayCapacityInfo[] = dailyCapacity.map((day, index) => ({
    date: day.date,
    dayIndex: index,
    sprintId: day.sprintId,
    totalCapacity: day.originalCapacity,
    remainingCapacity: day.remainingCapacity,
    usedCapacity: day.originalCapacity - day.remainingCapacity,
  }));

  const maxEndDay = Math.max(...allScheduledTickets.map(t => t.endDay), 0);
  const projectEndDate = addWorkDays(projectStartDate, maxEndDay);

  return {
    epics: scheduledEpics,
    sprints: sprintsWithCapacity,
    dailyCapacities: dailyCapacityInfo,
    projectStartDate: projectStartDate.toISOString().split('T')[0],
    projectEndDate: projectEndDate.toISOString().split('T')[0],
    totalDevDays,
    totalDays: maxEndDay,
  };
};
