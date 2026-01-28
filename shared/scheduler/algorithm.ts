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
 * Get all work days in a sprint as an array of date strings.
 * End date is treated as exclusive (sprint ends at start of endDate, not end of endDate).
 * This handles adjacent sprints where Sprint A's endDate equals Sprint B's startDate.
 */
const getSprintWorkDays = (sprint: JiraSprint): string[] => {
  const workDays: string[] = [];
  let current = parseDate(sprint.startDate);
  const end = parseDate(sprint.endDate);

  while (current < end) {
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
  originalCapacity: number;
  remainingCapacity: number;
  sprintDayIndex: number;
}

/**
 * Build a map of daily capacities across all sprints
 * Skips duplicate dates when sprints overlap (e.g., Sprint 1 ends on same day Sprint 2 starts)
 */
const buildDailyCapacityMap = (
  sprints: SprintWithCapacity[],
  maxDevelopers: number,
  sprintCapacities: SprintCapacity[]
): DayCapacity[] => {
  const days: DayCapacity[] = [];
  const addedDates = new Set<string>();

  for (const sprint of sprints) {
    const workDays = getSprintWorkDays(sprint);
    const sprintCapacity = sprintCapacities.find(sc => sc.sprintId === sprint.id);
    let sprintDayIndex = 0;

    for (const date of workDays) {
      // Skip if this date was already added from a previous sprint
      if (addedDates.has(date)) continue;

      const dailyOverride = sprintCapacity?.dailyCapacities?.find(dc => dc.date === date);
      const capacity = dailyOverride?.capacity ?? maxDevelopers;

      days.push({
        date,
        sprintId: sprint.id,
        originalCapacity: capacity,
        remainingCapacity: capacity,
        sprintDayIndex,
      });

      addedDates.add(date);
      sprintDayIndex++;
    }
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
 * Ticket with topological level and critical path weight for scheduling
 */
interface TicketWithLevel extends JiraTicket {
  level: number;
  downstreamWeight: number;
}

/**
 * Calculate downstream weight for each ticket (total dev days of all dependent tickets)
 */
const calculateDownstreamWeights = (
  epicTickets: JiraTicket[],
  dependents: Map<string, string[]>,
  ticketMap: Map<string, JiraTicket>
): Map<string, number> => {
  const weights = new Map<string, number>();

  const calculateWeight = (ticketKey: string): number => {
    if (weights.has(ticketKey)) {
      return weights.get(ticketKey)!;
    }

    const ticket = ticketMap.get(ticketKey);
    if (!ticket) return 0;

    let weight = ticket.devDays;
    for (const dependentKey of dependents.get(ticketKey) ?? []) {
      weight += calculateWeight(dependentKey);
    }

    weights.set(ticketKey, weight);
    return weight;
  };

  for (const ticket of epicTickets) {
    calculateWeight(ticket.key);
  }

  return weights;
};

/**
 * Topologically sort tickets within an epic based on blocker relationships
 * Prioritizes tickets with higher downstream weight (critical path)
 */
const getEpicTicketsTopological = (epicKey: string, allTickets: JiraTicket[]): TicketWithLevel[] => {
  const epicTickets = allTickets.filter(t => t.epicKey === epicKey);
  const epicTicketKeys = new Set(epicTickets.map(t => t.key));

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const ticket of epicTickets) {
    inDegree.set(ticket.key, 0);
    dependents.set(ticket.key, []);
  }

  for (const ticket of epicTickets) {
    const blockedBy = ticket.blockedBy ?? [];
    for (const blockerKey of blockedBy) {
      if (epicTicketKeys.has(blockerKey)) {
        inDegree.set(ticket.key, (inDegree.get(ticket.key) ?? 0) + 1);
        const deps = dependents.get(blockerKey) ?? [];
        deps.push(ticket.key);
        dependents.set(blockerKey, deps);
      }
    }
  }

  const ticketMap = new Map(epicTickets.map(t => [t.key, t]));
  const downstreamWeights = calculateDownstreamWeights(epicTickets, dependents, ticketMap);

  const result: TicketWithLevel[] = [];

  let currentLevel: string[] = [];
  for (const ticket of epicTickets) {
    if (inDegree.get(ticket.key) === 0) {
      currentLevel.push(ticket.key);
    }
  }

  // Sort by downstream weight (higher = more critical = first)
  currentLevel.sort((a, b) => {
    const weightA = downstreamWeights.get(a) ?? 0;
    const weightB = downstreamWeights.get(b) ?? 0;
    return weightB - weightA;
  });

  let level = 0;
  while (currentLevel.length > 0) {
    const nextLevel: string[] = [];

    for (const ticketKey of currentLevel) {
      const ticket = ticketMap.get(ticketKey)!;
      const weight = downstreamWeights.get(ticketKey) ?? 0;
      result.push({ ...ticket, level, downstreamWeight: weight });

      for (const dependentKey of dependents.get(ticketKey) ?? []) {
        const newInDegree = (inDegree.get(dependentKey) ?? 1) - 1;
        inDegree.set(dependentKey, newInDegree);

        if (newInDegree === 0) {
          nextLevel.push(dependentKey);
        }
      }
    }

    nextLevel.sort((a, b) => {
      const weightA = downstreamWeights.get(a) ?? 0;
      const weightB = downstreamWeights.get(b) ?? 0;
      return weightB - weightA;
    });

    currentLevel = nextLevel;
    level++;
  }

  if (result.length !== epicTickets.length) {
    const processedKeys = new Set(result.map(t => t.key));
    const unprocessed = epicTickets.filter(t => !processedKeys.has(t.key));
    for (const ticket of unprocessed) {
      result.push({ ...ticket, level: 999, downstreamWeight: 0 });
    }
  }

  return result;
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
 * Slot an epic's tickets using topological sort with parallel execution
 * Each ticket starts as soon as its specific blockers complete
 */
const slotEpicLinear = (
  epic: JiraEpic,
  tickets: JiraTicket[],
  dailyCapacity: DayCapacity[],
  startDayIndex: number
): ScheduledTicket[] => {
  const scheduledTickets: ScheduledTicket[] = [];
  const epicTickets = getEpicTicketsTopological(epic.key, tickets);
  const epicTicketKeys = new Set(epicTickets.map(t => t.key));

  // Track end days for each scheduled ticket (for dependency resolution)
  const ticketEndDays = new Map<string, number>();
  let hasSeenMissingEstimate = false;

  // Process tickets in topological order (dependencies always come first)
  for (const ticket of epicTickets) {
    // Calculate earliest start based on blockers
    let earliestStart = startDayIndex;
    const blockedBy = ticket.blockedBy ?? [];
    for (const blockerKey of blockedBy) {
      if (epicTicketKeys.has(blockerKey)) {
        const blockerEndDay = ticketEndDays.get(blockerKey);
        if (blockerEndDay !== undefined && blockerEndDay > earliestStart) {
          earliestStart = blockerEndDay;
        }
      }
    }

    // Find a position where the ticket fits within a single sprint
    let currentDayIndex = earliestStart;
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

    ticketEndDays.set(ticket.key, endDay);

    scheduledTickets.push({
      ...ticket,
      startDay,
      endDay,
      sprintId,
      parallelGroup: ticket.level,
      isUncertain,
      criticalPathWeight: ticket.downstreamWeight,
      isOnCriticalPath: false,
    });
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
    .sort((a, b) => parseDate(a.startDate).toMillis() - parseDate(b.startDate).toMillis());

  if (sprintsWithCapacity.length === 0) {
    throw new Error('No valid sprints with capacity found');
  }

  const projectStartDate = parseDate(sprintsWithCapacity[0].startDate);
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

  // Slot stretch epics (fill gaps with available capacity, respecting dependencies)
  for (const epic of sortedStretch) {
    const epicTickets = getEpicTicketsTopological(epic.key, tickets);
    const epicTicketKeys = new Set(epicTickets.map(t => t.key));

    // Track end days for each scheduled ticket (for dependency resolution)
    const ticketEndDays = new Map<string, number>();
    let hasSeenMissingEstimate = false;

    // Process tickets in topological order
    for (const ticket of epicTickets) {
      // Calculate earliest start based on blockers
      let earliestStart = 0;
      const blockedBy = ticket.blockedBy ?? [];
      for (const blockerKey of blockedBy) {
        if (epicTicketKeys.has(blockerKey)) {
          const blockerEndDay = ticketEndDays.get(blockerKey);
          if (blockerEndDay !== undefined && blockerEndDay > earliestStart) {
            earliestStart = blockerEndDay;
          }
        }
      }

      const startDayIndex = findNextAvailableSlot(earliestStart, ticket.devDays, dailyCapacity);

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

      ticketEndDays.set(ticket.key, endDay);

      allScheduledTickets.push({
        ...ticket,
        startDay: startDayIndex,
        endDay,
        sprintId,
        parallelGroup: ticket.level,
        isUncertain,
        criticalPathWeight: ticket.downstreamWeight,
        isOnCriticalPath: false,
      });
    }
  }

  const totalDevDays = allScheduledTickets.reduce((sum, t) => sum + t.devDays, 0);

  // Build scheduled epics
  const scheduledEpics: ScheduledEpic[] = epics.map(epic => {
    const epicTickets = allScheduledTickets.filter(t => t.epicKey === epic.key);

    // Sort tickets by topological level, then by critical path weight (descending)
    epicTickets.sort((a, b) => {
      if (a.parallelGroup !== b.parallelGroup) {
        return a.parallelGroup - b.parallelGroup;
      }
      return b.criticalPathWeight - a.criticalPathWeight;
    });

    // Mark tickets on the critical path for this epic
    if (epicTickets.length > 0) {
      const ticketMap = new Map(epicTickets.map(t => [t.key, t]));

      // Build dependents map (ticket -> tickets it blocks)
      const dependents = new Map<string, string[]>();
      for (const ticket of epicTickets) {
        const blockedBy = ticket.blockedBy ?? [];
        for (const blockerKey of blockedBy) {
          if (ticketMap.has(blockerKey)) {
            if (!dependents.has(blockerKey)) {
              dependents.set(blockerKey, []);
            }
            dependents.get(blockerKey)!.push(ticket.key);
          }
        }
      }

      // Find ticket with highest weight at level 0
      const level0Tickets = epicTickets.filter(t => t.parallelGroup === 0);
      if (level0Tickets.length > 0) {
        const criticalPathKeys = new Set<string>();
        let current = level0Tickets[0];
        criticalPathKeys.add(current.key);

        while (true) {
          const deps = dependents.get(current.key) ?? [];
          if (deps.length === 0) break;

          let nextTicket: typeof current | null = null;
          let maxWeight = -1;
          for (const depKey of deps) {
            const dep = ticketMap.get(depKey);
            if (dep && dep.criticalPathWeight > maxWeight) {
              maxWeight = dep.criticalPathWeight;
              nextTicket = dep;
            }
          }

          if (!nextTicket) break;
          criticalPathKeys.add(nextTicket.key);
          current = nextTicket;
        }

        for (const ticket of epicTickets) {
          if (criticalPathKeys.has(ticket.key)) {
            ticket.isOnCriticalPath = true;
          }
        }
      }
    }

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
