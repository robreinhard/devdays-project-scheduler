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
  AggregateBlock,
  AggregateTicket,
} from '@/shared/types';
import { parseDate, isWeekend } from '@/shared/utils/dates';

/**
 * Helper to get actual date from dailyCapacity array
 * endDay is exclusive, so endDate is the day before endDay (the last actual work day)
 */
const getDateFromDayIndex = (dayIndex: number, dailyCapacity: DayCapacity[]): string => {
  if (dayIndex < 0) return dailyCapacity[0]?.date ?? '';
  if (dayIndex >= dailyCapacity.length) return dailyCapacity[dailyCapacity.length - 1]?.date ?? '';
  return dailyCapacity[dayIndex]?.date ?? '';
};

/**
 * Get the end date (last actual work day) for a ticket
 * Since endDay is exclusive (index of first day NOT worked), the actual last work day is endDay - 1
 */
const getEndDateFromDayIndex = (endDay: number, dailyCapacity: DayCapacity[]): string => {
  const lastWorkDayIndex = endDay - 1;
  return getDateFromDayIndex(lastWorkDayIndex, dailyCapacity);
};

/**
 * Get all work days in a sprint as an array of date strings.
 * Jira's endDate is inclusive - iterate through all days from start to end.
 */
const getSprintWorkDays = (sprint: JiraSprint): string[] => {
  const workDays: string[] = [];
  let current = parseDate(sprint.startDate);
  const end = parseDate(sprint.endDate);

  // Jira's endDate is inclusive - iterate through all days from start to end
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
 * Check if a ticket status indicates it's "done"
 * Matches: done, resolved, closed (case-insensitive)
 */
const isDoneStatus = (status: string): boolean => {
  const lowerStatus = status.toLowerCase();
  return lowerStatus.includes('done') ||
         lowerStatus.includes('resolved') ||
         lowerStatus.includes('closed');
};

/**
 * Check if a ticket is in any of the selected sprints
 */
const isInSelectedSprints = (ticket: JiraTicket, selectedSprintIds: number[]): boolean => {
  if (!ticket.sprintIds || ticket.sprintIds.length === 0) return false;
  return ticket.sprintIds.some(id => selectedSprintIds.includes(id));
};

/**
 * Convert a JiraTicket to an AggregateTicket for Previous/Future blocks
 */
const toAggregateTicket = (ticket: JiraTicket): AggregateTicket => ({
  key: ticket.key,
  summary: ticket.summary,
  status: ticket.status,
  devDays: ticket.devDays,
});

/**
 * Create an AggregateBlock from a list of tickets
 */
const createAggregateBlock = (
  type: 'previous' | 'future',
  tickets: JiraTicket[]
): AggregateBlock | undefined => {
  if (tickets.length === 0) return undefined;

  return {
    type,
    tickets: tickets.map(toAggregateTicket),
    totalDevDays: tickets.reduce((sum, t) => sum + t.devDays, 0),
  };
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
 * Ticket with topological level and critical path weight for scheduling
 */
interface TicketWithLevel extends JiraTicket {
  level: number;           // Topological level (0 = no dependencies)
  downstreamWeight: number; // Total dev days of all tickets blocked by this one (critical path)
}

/**
 * Calculate downstream weight for each ticket (total dev days of all dependent tickets)
 * Uses memoized DFS to compute the critical path weight
 */
const calculateDownstreamWeights = (
  epicTickets: JiraTicket[],
  dependents: Map<string, string[]>, // ticketKey -> tickets that depend on it
  ticketMap: Map<string, JiraTicket>
): Map<string, number> => {
  const weights = new Map<string, number>();

  const calculateWeight = (ticketKey: string): number => {
    if (weights.has(ticketKey)) {
      return weights.get(ticketKey)!;
    }

    const ticket = ticketMap.get(ticketKey);
    if (!ticket) return 0;

    // Sum of this ticket's dev days + all downstream tickets' weights
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
 * Uses Kahn's algorithm for topological sort
 */
const getEpicTicketsTopological = (epicKey: string, allTickets: JiraTicket[]): TicketWithLevel[] => {
  const epicTickets = allTickets.filter(t => t.epicKey === epicKey);
  const epicTicketKeys = new Set(epicTickets.map(t => t.key));

  // Build in-degree map and adjacency list (only for tickets within this epic)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // blockerKey -> [ticketsThatDependOnIt]

  for (const ticket of epicTickets) {
    inDegree.set(ticket.key, 0);
    dependents.set(ticket.key, []);
  }

  // Count in-degrees (only from blockers within the same epic)
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

  // Calculate downstream weights for critical path prioritization
  const downstreamWeights = calculateDownstreamWeights(epicTickets, dependents, ticketMap);

  // Kahn's algorithm with level tracking
  const result: TicketWithLevel[] = [];

  // Initialize queue with tickets that have no dependencies (in-degree 0)
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
    return weightB - weightA; // Descending order
  });

  let level = 0;
  while (currentLevel.length > 0) {
    const nextLevel: string[] = [];

    for (const ticketKey of currentLevel) {
      const ticket = ticketMap.get(ticketKey)!;
      const weight = downstreamWeights.get(ticketKey) ?? 0;
      result.push({ ...ticket, level, downstreamWeight: weight });

      // Process dependents
      for (const dependentKey of dependents.get(ticketKey) ?? []) {
        const newInDegree = (inDegree.get(dependentKey) ?? 1) - 1;
        inDegree.set(dependentKey, newInDegree);

        if (newInDegree === 0) {
          nextLevel.push(dependentKey);
        }
      }
    }

    // Sort next level by downstream weight (higher = more critical = first)
    nextLevel.sort((a, b) => {
      const weightA = downstreamWeights.get(a) ?? 0;
      const weightB = downstreamWeights.get(b) ?? 0;
      return weightB - weightA;
    });

    currentLevel = nextLevel;
    level++;
  }

  // Check for cycles (tickets not processed = cycle detected)
  if (result.length !== epicTickets.length) {
    const processedKeys = new Set(result.map(t => t.key));
    const unprocessed = epicTickets.filter(t => !processedKeys.has(t.key));
    console.warn(`Cycle detected in epic ${epicKey}. Unprocessed tickets: ${unprocessed.map(t => t.key).join(', ')}`);

    // Add unprocessed tickets at the end with high level (fallback)
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

  return dailyCapacity.length; // No more sprints
};

/**
 * Verify that all days from startDay to endDay-1 (inclusive) are in the same sprint
 */
const ticketCrossesSprintBoundary = (
  startDay: number,
  endDay: number,
  dailyCapacity: DayCapacity[]
): boolean => {
  if (startDay >= dailyCapacity.length) return true;

  const startSprintId = dailyCapacity[startDay].sprintId;
  // endDay is exclusive, so check up to endDay - 1
  for (let d = startDay; d < endDay && d < dailyCapacity.length; d++) {
    if (dailyCapacity[d].sprintId !== startSprintId) {
      return true;
    }
  }
  return false;
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
 * Find a valid slot for a ticket that fits entirely within one sprint
 * Returns the starting day index, or -1 if no valid slot found
 */
const findSlotWithinSprint = (
  earliestStart: number,
  ticketDevDays: number,
  dailyCapacity: DayCapacity[]
): number => {
  let currentDayIndex = earliestStart;

  while (currentDayIndex < dailyCapacity.length) {
    const sprintEndIndex = getSprintEndDayIndex(currentDayIndex, dailyCapacity);
    const remainingDaysInSprint = sprintEndIndex - currentDayIndex + 1;

    // Check if ticket fits in remaining sprint days
    if (ticketDevDays <= remainingDaysInSprint) {
      const proposedEndDay = currentDayIndex + ticketDevDays;
      const lastOccupiedDay = proposedEndDay - 1;

      // Verify the last occupied day is still in the same sprint as the start
      if (lastOccupiedDay < dailyCapacity.length &&
          dailyCapacity[lastOccupiedDay].sprintId === dailyCapacity[currentDayIndex].sprintId) {
        return currentDayIndex;
      }
    }

    // Move to the start of next sprint
    currentDayIndex = findNextSprintStart(currentDayIndex, dailyCapacity);
  }

  return -1; // No valid slot found
};

/**
 * Result of slotting an epic's tickets
 */
interface SlotEpicResult {
  scheduled: ScheduledTicket[];
  unslotted: JiraTicket[];
}

/**
 * Slot an epic's tickets using topological sort with parallel execution
 * Each ticket starts as soon as its specific blockers complete
 * Returns the scheduled tickets and any unslotted tickets (for Future block)
 */
const slotEpicLinear = (
  epic: JiraEpic,
  tickets: JiraTicket[],
  dailyCapacity: DayCapacity[],
  startDayIndex: number
): SlotEpicResult => {
  const scheduledTickets: ScheduledTicket[] = [];
  const unslottedTickets: JiraTicket[] = [];
  const epicTickets = getEpicTicketsTopological(epic.key, tickets);
  const epicTicketKeys = new Set(epicTickets.map(t => t.key));

  // Track end days for each scheduled ticket (for dependency resolution)
  const ticketEndDays = new Map<string, number>();
  // Track which tickets couldn't be scheduled (their dependents also can't be scheduled)
  const unslottedKeys = new Set<string>();

  // Process tickets in topological order (dependencies always come first)
  for (const ticket of epicTickets) {
    // Check if any blocker is unslotted - if so, this ticket is also unslotted
    const blockedBy = ticket.blockedBy ?? [];
    const hasUnslottedBlocker = blockedBy.some(key => unslottedKeys.has(key));

    if (hasUnslottedBlocker) {
      unslottedTickets.push(ticket);
      unslottedKeys.add(ticket.key);
      continue;
    }

    // Calculate earliest start based on blockers
    let earliestStart = startDayIndex;
    for (const blockerKey of blockedBy) {
      if (epicTicketKeys.has(blockerKey)) {
        const blockerEndDay = ticketEndDays.get(blockerKey);
        if (blockerEndDay !== undefined && blockerEndDay > earliestStart) {
          earliestStart = blockerEndDay;
        }
      }
    }

    // Find a valid slot within a single sprint
    const slotStartDay = findSlotWithinSprint(earliestStart, ticket.devDays, dailyCapacity);

    if (slotStartDay < 0) {
      // No valid slot found - add to unslotted
      unslottedTickets.push(ticket);
      unslottedKeys.add(ticket.key);
      continue;
    }

    const startDay = slotStartDay;
    const endDay = startDay + ticket.devDays;
    const lastOccupiedDay = endDay - 1;
    const sprintId = dailyCapacity[startDay].sprintId;
    const lastDaySprintId = dailyCapacity[lastOccupiedDay]?.sprintId;

    // Verify no sprint crossing
    if (sprintId !== lastDaySprintId) {
      console.error(`SPRINT CROSSING: ${ticket.key}`, {
        devDays: ticket.devDays,
        startDay,
        endDay,
        lastOccupiedDay,
        startDate: dailyCapacity[startDay]?.date,
        endDate: dailyCapacity[lastOccupiedDay]?.date,
        startSprintId: sprintId,
        endSprintId: lastDaySprintId,
      });
      throw new Error(`SPRINT CROSSING: ${ticket.key} (${ticket.devDays}d) starts in sprint ${sprintId} on ${dailyCapacity[startDay]?.date} but ends in sprint ${lastDaySprintId} on ${dailyCapacity[lastOccupiedDay]?.date}`);
    }

    // Consume capacity for this ticket
    for (let d = startDay; d < endDay && d < dailyCapacity.length; d++) {
      dailyCapacity[d].remainingCapacity -= 1;
    }

    // Track this ticket's end day for dependent tickets
    ticketEndDays.set(ticket.key, endDay);

    scheduledTickets.push({
      ...ticket,
      startDay,
      endDay,
      startDate: getDateFromDayIndex(startDay, dailyCapacity),
      endDate: getEndDateFromDayIndex(endDay, dailyCapacity),
      sprintId,
      parallelGroup: ticket.level,
      criticalPathWeight: ticket.downstreamWeight,
      isOnCriticalPath: false, // Will be calculated after all tickets are scheduled
    });
  }

  return { scheduled: scheduledTickets, unslotted: unslottedTickets };
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
      const proposedEndDay = dayIndex + ticketDevDays;
      const lastOccupiedDay = proposedEndDay - 1;

      // Verify ticket fits in sprint AND last occupied day is in same sprint
      if (ticketDevDays <= remainingDaysInSprint &&
          lastOccupiedDay < dailyCapacity.length &&
          dailyCapacity[lastOccupiedDay].sprintId === dailyCapacity[dayIndex].sprintId) {
        // Check if all days have capacity
        let allHaveCapacity = true;
        for (let d = dayIndex; d < proposedEndDay && d < dailyCapacity.length; d++) {
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
 * Partition epic tickets into previous (done outside selected sprints),
 * schedulable, and track unslotted for future block
 */
interface PartitionedTickets {
  previous: JiraTicket[];
  schedulable: JiraTicket[];
}

const partitionEpicTickets = (
  epicKey: string,
  allTickets: JiraTicket[],
  selectedSprintIds: number[]
): PartitionedTickets => {
  const epicTickets = allTickets.filter(t => t.epicKey === epicKey);
  const previous: JiraTicket[] = [];
  const schedulable: JiraTicket[] = [];

  for (const ticket of epicTickets) {
    const isDone = isDoneStatus(ticket.status);
    const inSelectedSprint = isInSelectedSprints(ticket, selectedSprintIds);

    // Previous block: Done tickets NOT in selected sprints (includes unassigned Done tickets)
    if (isDone && !inSelectedSprint) {
      previous.push(ticket);
    } else {
      // Everything else goes to schedulable (including Done tickets IN selected sprints)
      schedulable.push(ticket);
    }
  }

  return { previous, schedulable };
};

/**
 * Main scheduling algorithm
 * Slots tickets into sprints while respecting capacity and sprint boundaries
 */
export const scheduleTickets = (input: SchedulingInput): GanttData => {
  const { epics, tickets, sprints, sprintCapacities, maxDevelopers, selectedSprintIds } = input;

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

  // Compute selected sprint IDs (use provided or fall back to sprints with capacity)
  const effectiveSelectedSprintIds = selectedSprintIds ?? sprintsWithCapacity.map(s => s.id);

  // Project start date is first sprint start
  const projectStartDate = parseDate(sprintsWithCapacity[0].startDate);

  // Build daily capacity map
  const dailyCapacity = buildDailyCapacityMap(sprintsWithCapacity, maxDevelopers, sprintCapacities);

  // Debug: Log sprint boundaries
  console.log('=== SPRINT BOUNDARIES ===');
  for (const sprint of sprintsWithCapacity) {
    const sprintDays = dailyCapacity.filter(d => d.sprintId === sprint.id);
    console.log(`Sprint ${sprint.id} (${sprint.name}):`, {
      jiraStart: sprint.startDate,
      jiraEnd: sprint.endDate,
      computedFirst: sprintDays[0]?.date,
      computedLast: sprintDays[sprintDays.length - 1]?.date,
      totalDays: sprintDays.length,
    });
  }

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

  // Track all scheduled tickets and blocks per epic
  const allScheduledTickets: ScheduledTicket[] = [];
  const epicPreviousBlocks = new Map<string, AggregateBlock | undefined>();
  const epicFutureBlocks = new Map<string, AggregateBlock | undefined>();

  // Track the next available start day for linear slotting
  let nextLinearStartDay = 0;

  // Slot commit epics first (linear scheduling)
  for (const epic of sortedCommits) {
    // Partition tickets for this epic
    const { previous, schedulable } = partitionEpicTickets(epic.key, tickets, effectiveSelectedSprintIds);

    // Store previous block
    epicPreviousBlocks.set(epic.key, createAggregateBlock('previous', previous));

    const { scheduled, unslotted } = slotEpicLinear(
      epic,
      schedulable,
      dailyCapacity,
      nextLinearStartDay
    );

    allScheduledTickets.push(...scheduled);

    // Store future block from unslotted tickets
    epicFutureBlocks.set(epic.key, createAggregateBlock('future', unslotted));

    // Update next linear start day to after this epic's last ticket
    if (scheduled.length > 0) {
      const maxEndDay = Math.max(...scheduled.map(t => t.endDay));
      nextLinearStartDay = maxEndDay;
    }
  }

  // Slot stretch epics (fill gaps with available capacity, respecting dependencies)
  for (const epic of sortedStretch) {
    // Partition tickets for this epic
    const { previous, schedulable } = partitionEpicTickets(epic.key, tickets, effectiveSelectedSprintIds);

    // Store previous block
    epicPreviousBlocks.set(epic.key, createAggregateBlock('previous', previous));

    const epicTickets = getEpicTicketsTopological(epic.key, schedulable);
    const epicTicketKeys = new Set(epicTickets.map(t => t.key));

    // Track end days for each scheduled ticket (for dependency resolution)
    const ticketEndDays = new Map<string, number>();
    // Track unslotted tickets
    const unslottedTickets: JiraTicket[] = [];
    const unslottedKeys = new Set<string>();

    // Process tickets in topological order
    for (const ticket of epicTickets) {
      // Check if any blocker is unslotted
      const blockedBy = ticket.blockedBy ?? [];
      const hasUnslottedBlocker = blockedBy.some(key => unslottedKeys.has(key));

      if (hasUnslottedBlocker) {
        unslottedTickets.push(ticket);
        unslottedKeys.add(ticket.key);
        continue;
      }

      // Calculate earliest start based on blockers
      let earliestStart = 0;
      for (const blockerKey of blockedBy) {
        if (epicTicketKeys.has(blockerKey)) {
          const blockerEndDay = ticketEndDays.get(blockerKey);
          if (blockerEndDay !== undefined && blockerEndDay > earliestStart) {
            earliestStart = blockerEndDay;
          }
        }
      }

      // Find next available slot with capacity starting from earliest possible
      const startDayIndex = findNextAvailableSlot(
        earliestStart,
        ticket.devDays,
        dailyCapacity
      );

      if (startDayIndex >= dailyCapacity.length) {
        // No slot found - add to unslotted
        unslottedTickets.push(ticket);
        unslottedKeys.add(ticket.key);
        continue;
      }

      const endDay = startDayIndex + ticket.devDays;
      const sprintId = dailyCapacity[startDayIndex].sprintId;

      // Consume capacity
      for (let d = startDayIndex; d < endDay && d < dailyCapacity.length; d++) {
        dailyCapacity[d].remainingCapacity -= 1;
      }

      // Track this ticket's end day for dependent tickets
      ticketEndDays.set(ticket.key, endDay);

      allScheduledTickets.push({
        ...ticket,
        startDay: startDayIndex,
        endDay,
        startDate: getDateFromDayIndex(startDayIndex, dailyCapacity),
        endDate: getEndDateFromDayIndex(endDay, dailyCapacity),
        sprintId,
        parallelGroup: ticket.level,
        criticalPathWeight: ticket.downstreamWeight,
        isOnCriticalPath: false,
      });
    }

    // Store future block from unslotted tickets
    epicFutureBlocks.set(epic.key, createAggregateBlock('future', unslottedTickets));
  }

  // Calculate total dev days
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

      // Find ticket with highest weight at level 0 (first in sorted list)
      const level0Tickets = epicTickets.filter(t => t.parallelGroup === 0);
      if (level0Tickets.length > 0) {
        const criticalPathKeys = new Set<string>();
        let current = level0Tickets[0]; // Highest weight at level 0
        criticalPathKeys.add(current.key);

        // Trace through dependents, always following highest weight
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

        // Mark critical path tickets
        for (const ticket of epicTickets) {
          if (criticalPathKeys.has(ticket.key)) {
            ticket.isOnCriticalPath = true;
          }
        }
      }
    }

    const epicTotalDevDays = epicTickets.reduce((sum, t) => sum + t.devDays, 0);
    const epicStartDay = epicTickets.length > 0 ? Math.min(...epicTickets.map(t => t.startDay)) : 0;
    const epicEndDay = epicTickets.length > 0 ? Math.max(...epicTickets.map(t => t.endDay)) : 0;

    return {
      ...epic,
      tickets: epicTickets,
      totalDevDays: epicTotalDevDays,
      startDay: epicStartDay,
      endDay: epicEndDay,
      startDate: getDateFromDayIndex(epicStartDay, dailyCapacity),
      endDate: getEndDateFromDayIndex(epicEndDay, dailyCapacity),
      previousBlock: epicPreviousBlocks.get(epic.key),
      futureBlock: epicFutureBlocks.get(epic.key),
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

  // Calculate project end date from actual dates
  const maxEndDay = Math.max(...allScheduledTickets.map(t => t.endDay), 0);
  const projectEndDateStr = getEndDateFromDayIndex(maxEndDay, dailyCapacity);

  return {
    epics: scheduledEpics,
    sprints: sprintsWithCapacity,
    dailyCapacities: dailyCapacityInfo,
    projectStartDate: projectStartDate.toISODate()!,
    projectEndDate: projectEndDateStr || projectStartDate.toISODate()!,
    totalDevDays,
    totalDays: maxEndDay,
  };
};
