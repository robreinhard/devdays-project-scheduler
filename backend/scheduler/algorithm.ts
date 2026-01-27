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
import { parseDate, isWeekend, addWorkDays as addWorkDaysLuxon } from '@/shared/utils/dates';

/**
 * Get all work days in a sprint as an array of date strings
 */
const getSprintWorkDays = (sprint: JiraSprint): string[] => {
  const workDays: string[] = [];
  let current = parseDate(sprint.startDate);
  const end = parseDate(sprint.endDate);

  while (current <= end) {
    if (!isWeekend(current)) {
      workDays.push(current.toISODate()!);
    }
    current = current.plus({ days: 1 });
  }

  return workDays;
};

/**
 * Interface for daily capacity tracking
 */
interface DayCapacity {
  date: string;
  sprintId: number;
  originalCapacity: number; // Original capacity for this day
  remainingCapacity: number; // Remaining capacity (decremented during scheduling)
  sprintDayIndex: number; // 0-9 for a 10-day sprint
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
      // Check for daily override
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
    // Primary: priorityOverride (lower = higher priority)
    if (a.priorityOverride !== undefined && b.priorityOverride !== undefined) {
      return a.priorityOverride - b.priorityOverride;
    }
    if (a.priorityOverride !== undefined) return -1;
    if (b.priorityOverride !== undefined) return 1;

    // Secondary: worst-case duration (longest first)
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
 * Find the sprint that contains a given day index
 */
const findSprintForDayIndex = (
  dayIndex: number,
  dailyCapacity: DayCapacity[]
): { sprint: DayCapacity; globalIndex: number } | null => {
  if (dayIndex >= dailyCapacity.length) return null;
  return { sprint: dailyCapacity[dayIndex], globalIndex: dayIndex };
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

  return dailyCapacity.length; // No more sprints
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
 * Returns the scheduled tickets
 */
const slotEpicLinear = (
  epic: JiraEpic,
  tickets: JiraTicket[],
  dailyCapacity: DayCapacity[],
  startDayIndex: number
): ScheduledTicket[] => {
  const scheduledTickets: ScheduledTicket[] = [];
  const epicTickets = getEpicTicketsSorted(epic.key, tickets);

  console.log(`\n=== SLOTTING EPIC: ${epic.key} ===`);
  console.log(`Tickets in order:`, epicTickets.map(t => `${t.key}(${t.devDays}d)`).join(', '));
  console.log(`Starting at day index: ${startDayIndex}`);
  console.log(`Total days in capacity map: ${dailyCapacity.length}`);

  // Log sprint boundaries
  const sprintBoundaries: { sprintId: number; startIdx: number; endIdx: number }[] = [];
  let currentSprintId = dailyCapacity[0]?.sprintId;
  let sprintStartIdx = 0;
  for (let i = 0; i < dailyCapacity.length; i++) {
    if (dailyCapacity[i].sprintId !== currentSprintId) {
      sprintBoundaries.push({ sprintId: currentSprintId, startIdx: sprintStartIdx, endIdx: i - 1 });
      currentSprintId = dailyCapacity[i].sprintId;
      sprintStartIdx = i;
    }
  }
  if (dailyCapacity.length > 0) {
    sprintBoundaries.push({ sprintId: currentSprintId, startIdx: sprintStartIdx, endIdx: dailyCapacity.length - 1 });
  }
  console.log(`Sprint boundaries:`, sprintBoundaries.map(s => `Sprint ${s.sprintId}: days ${s.startIdx}-${s.endIdx}`).join(', '));

  let currentDayIndex = startDayIndex;
  let hasSeenMissingEstimate = false;

  for (const ticket of epicTickets) {
    console.log(`\n--- Processing ticket: ${ticket.key} (${ticket.devDays} days) ---`);
    console.log(`  Current day index: ${currentDayIndex}`);

    // Find a position where the ticket fits within a single sprint
    while (currentDayIndex < dailyCapacity.length) {
      const sprintEndIndex = getSprintEndDayIndex(currentDayIndex, dailyCapacity);
      const remainingDaysInSprint = sprintEndIndex - currentDayIndex + 1;

      console.log(`  Checking: sprintEndIndex=${sprintEndIndex}, remainingDays=${remainingDaysInSprint}, ticketNeeds=${ticket.devDays}`);

      if (ticket.devDays <= remainingDaysInSprint) {
        // Ticket fits in this sprint
        console.log(`  ✓ Ticket fits! Will start at day ${currentDayIndex}`);
        break;
      }

      // Move to next sprint
      const nextSprintStart = findNextSprintStart(currentDayIndex, dailyCapacity);
      console.log(`  ✗ Doesn't fit. Moving to next sprint start: day ${nextSprintStart}`);
      currentDayIndex = nextSprintStart;
    }

    // Check if we ran out of sprints
    if (currentDayIndex >= dailyCapacity.length) {
      console.log(`  ✗ Ran out of sprints! Cannot slot ticket ${ticket.key}`);
      break;
    }

    // Track uncertainty: tickets after a missing-estimate ticket are uncertain
    const isUncertain = hasSeenMissingEstimate;
    if (ticket.isMissingEstimate) {
      hasSeenMissingEstimate = true;
    }

    // Schedule the ticket
    const startDay = currentDayIndex;
    const endDay = startDay + ticket.devDays;
    const sprintId = dailyCapacity[currentDayIndex].sprintId;

    console.log(`  → Scheduled: days ${startDay}-${endDay - 1} (sprint ${sprintId})`);

    // Consume capacity (decrement for each day the ticket occupies)
    for (let d = startDay; d < endDay && d < dailyCapacity.length; d++) {
      dailyCapacity[d].remainingCapacity -= 1;
    }

    scheduledTickets.push({
      ...ticket,
      startDay,
      endDay,
      sprintId,
      parallelGroup: 0, // Linear scheduling = all in same group
      isUncertain,
    });

    // Move to the end of this ticket for the next one
    currentDayIndex = endDay;
    console.log(`  Next ticket will start checking from day ${currentDayIndex}`);
  }

  console.log(`\n=== FINISHED EPIC: ${epic.key} ===\n`);
  return scheduledTickets;
};

/**
 * Find the next available slot with capacity for a ticket
 * Returns the day index where the ticket can start
 */
const findNextAvailableSlot = (
  startFrom: number,
  ticketDevDays: number,
  dailyCapacity: DayCapacity[]
): number => {
  let dayIndex = startFrom;

  while (dayIndex < dailyCapacity.length) {
    // Check if there's capacity and the ticket fits in the sprint
    if (dailyCapacity[dayIndex].remainingCapacity > 0) {
      const sprintEndIndex = getSprintEndDayIndex(dayIndex, dailyCapacity);
      const remainingDaysInSprint = sprintEndIndex - dayIndex + 1;

      if (ticketDevDays <= remainingDaysInSprint) {
        // Check if all days have capacity
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

  return dailyCapacity.length; // No slot found
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
    .sort((a, b) => parseDate(a.startDate).toMillis() - parseDate(b.startDate).toMillis());

  if (sprintsWithCapacity.length === 0) {
    throw new Error('No valid sprints with capacity found');
  }

  // Project start date is first sprint start
  const projectStartDate = parseDate(sprintsWithCapacity[0].startDate);

  // Build daily capacity map
  const dailyCapacity = buildDailyCapacityMap(sprintsWithCapacity, maxDevelopers, sprintCapacities);

  // Calculate worst-case duration for each epic
  const worstCaseMap = new Map<string, number>();
  for (const epic of epics) {
    worstCaseMap.set(epic.key, calculateWorstCase(epic, tickets));
  }

  // Separate epics by commit type
  const commitEpics = epics.filter(e => e.commitType === 'commit');
  const stretchEpics = epics.filter(e => e.commitType === 'stretch');

  // Sort each group
  const sortedCommits = sortEpics(commitEpics, worstCaseMap);
  const sortedStretch = sortEpics(stretchEpics, worstCaseMap);

  // Track all scheduled tickets
  const allScheduledTickets: ScheduledTicket[] = [];

  // Track the next available start day for linear slotting
  let nextLinearStartDay = 0;

  // Slot commit epics first (linear scheduling)
  for (const epic of sortedCommits) {
    const scheduled = slotEpicLinear(
      epic,
      tickets,
      dailyCapacity,
      nextLinearStartDay
    );

    allScheduledTickets.push(...scheduled);

    // Update next linear start day to after this epic's last ticket
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
      // Find next available slot with capacity
      const startDayIndex = findNextAvailableSlot(
        currentSearchStart,
        ticket.devDays,
        dailyCapacity
      );

      if (startDayIndex >= dailyCapacity.length) {
        // No slot found - skip remaining tickets in this epic
        break;
      }

      // Track uncertainty
      const isUncertain = hasSeenMissingEstimate;
      if (ticket.isMissingEstimate) {
        hasSeenMissingEstimate = true;
      }

      const endDay = startDayIndex + ticket.devDays;
      const sprintId = dailyCapacity[startDayIndex].sprintId;

      // Consume capacity
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

      // Next ticket must start after this one (linear within epic)
      currentSearchStart = endDay;
    }
  }

  // Calculate total dev days
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

  // Calculate project end date
  const maxEndDay = Math.max(...allScheduledTickets.map(t => t.endDay), 0);
  const projectEndDate = addWorkDaysLuxon(projectStartDate, maxEndDay);

  return {
    epics: scheduledEpics,
    sprints: sprintsWithCapacity,
    dailyCapacities: dailyCapacityInfo,
    projectStartDate: projectStartDate.toISODate()!,
    projectEndDate: projectEndDate.toISODate()!,
    totalDevDays,
    totalDays: maxEndDay,
  };
};
