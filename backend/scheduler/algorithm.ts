import type {
  JiraEpic,
  JiraTicket,
  JiraSprint,
  SprintCapacity,
  SprintWithCapacity,
  ScheduledTicket,
  ScheduledEpic,
  GanttData,
  ViewMode,
  SchedulingInput,
} from '@/shared/types';

/**
 * Group tickets by their timeline order within each epic
 * Returns a map of epicKey -> orderNumber -> tickets[]
 */
interface TicketGroup {
  epicKey: string;
  order: number;
  tickets: JiraTicket[];
  totalDevDays: number;  // Sum for worst case
  maxDevDays: number;    // Max for best case
}

const groupTicketsByOrder = (tickets: JiraTicket[]): Map<string, TicketGroup[]> => {
  const epicGroups = new Map<string, Map<number, JiraTicket[]>>();

  // Group tickets by epic, then by order
  for (const ticket of tickets) {
    if (!epicGroups.has(ticket.epicKey)) {
      epicGroups.set(ticket.epicKey, new Map());
    }
    const orderMap = epicGroups.get(ticket.epicKey)!;

    if (!orderMap.has(ticket.timelineOrder)) {
      orderMap.set(ticket.timelineOrder, []);
    }
    orderMap.get(ticket.timelineOrder)!.push(ticket);
  }

  // Convert to TicketGroup arrays sorted by order
  const result = new Map<string, TicketGroup[]>();

  for (const [epicKey, orderMap] of epicGroups) {
    const groups: TicketGroup[] = [];

    for (const [order, groupTickets] of orderMap) {
      groups.push({
        epicKey,
        order,
        tickets: groupTickets,
        totalDevDays: groupTickets.reduce((sum, t) => sum + t.devDays, 0),
        maxDevDays: Math.max(...groupTickets.map((t) => t.devDays)),
      });
    }

    // Sort groups by order
    groups.sort((a, b) => a.order - b.order);
    result.set(epicKey, groups);
  }

  return result;
};

/**
 * Calculate the effective duration for a group based on view mode
 */
const getGroupDuration = (group: TicketGroup, viewMode: ViewMode): number => {
  return viewMode === 'best' ? group.maxDevDays : group.totalDevDays;
};

/**
 * Check if a date is a weekend (Saturday = 6, Sunday = 0)
 */
const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Calculate work days between two dates (excludes weekends if includeWeekends=false)
 */
const daysBetween = (start: Date, end: Date, includeWeekends: boolean = true): number => {
  if (includeWeekends) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.ceil((end.getTime() - start.getTime()) / msPerDay);
  }

  let workDays = 0;
  const current = new Date(start);
  while (current < end) {
    if (!isWeekend(current)) {
      workDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  return workDays;
};

/**
 * Add work days to a date (skips weekends if includeWeekends=false)
 */
const addWorkDays = (startDate: Date, workDays: number, includeWeekends: boolean): Date => {
  const result = new Date(startDate);

  if (includeWeekends) {
    result.setDate(result.getDate() + workDays);
    return result;
  }

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
 * Convert work day offset to calendar day offset from project start
 * When excluding weekends, expands the offset to account for weekend gaps
 */
const workDayToCalendarDay = (
  workDay: number,
  projectStartDate: Date,
  includeWeekends: boolean
): number => {
  if (includeWeekends) {
    return workDay;
  }

  // Find which calendar day corresponds to this work day
  const targetDate = addWorkDays(projectStartDate, workDay, false);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((targetDate.getTime() - projectStartDate.getTime()) / msPerDay);
};

/**
 * Convert day offset to actual date (for display purposes)
 */
const dayOffsetToDate = (startDate: Date, dayOffset: number): Date => {
  const result = new Date(startDate);
  result.setDate(result.getDate() + dayOffset);
  return result;
};

/**
 * Main scheduling algorithm
 * Slots tickets into sprints while respecting capacity, dependencies, and max developers
 */
export const scheduleTickets = (input: SchedulingInput): GanttData => {
  const { epics, tickets, sprints, sprintCapacities, viewMode, maxDevelopers, includeWeekends } = input;

  // Create sprints with capacity
  const sprintsWithCapacity: SprintWithCapacity[] = sprints
    .filter((s) => sprintCapacities.some((sc) => sc.sprintId === s.id))
    .map((sprint) => {
      const capacity = sprintCapacities.find((sc) => sc.sprintId === sprint.id);
      return {
        ...sprint,
        devDaysCapacity: capacity?.devDaysCapacity ?? 0,
        remainingCapacity: capacity?.devDaysCapacity ?? 0,
      };
    })
    .filter((s) => s.startDate && s.endDate)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  if (sprintsWithCapacity.length === 0) {
    throw new Error('No valid sprints with capacity found');
  }

  // Determine project start date (first sprint start)
  const projectStartDate = new Date(sprintsWithCapacity[0].startDate);

  // Group tickets by epic and order
  const ticketGroups = groupTicketsByOrder(tickets);

  // Track scheduled tickets
  const scheduledTickets: ScheduledTicket[] = [];
  let totalDevDays = 0;

  // Track when each developer slot becomes available (GLOBAL across all epics)
  const developerSlots: number[] = new Array(maxDevelopers).fill(0);

  // For worst case, track a single global end day
  let worstCaseCurrentDay = 0;

  // Collect all groups from all epics with their timeline order
  interface GroupWithEpic {
    epicKey: string;
    order: number;
    group: TicketGroup;
  }
  const allGroups: GroupWithEpic[] = [];

  for (const epic of epics) {
    const groups = ticketGroups.get(epic.key) ?? [];
    for (const group of groups) {
      allGroups.push({ epicKey: epic.key, order: group.order, group });
    }
  }

  // Sort by timeline order so all "order 1" groups are processed before "order 2", etc.
  // This allows tickets from different epics to compete fairly for developer slots
  allGroups.sort((a, b) => a.order - b.order);

  // Track when each epic's previous group finished (for sequencing within an epic)
  const epicCurrentDay: Record<string, number> = {};
  for (const epic of epics) {
    epicCurrentDay[epic.key] = 0;
  }

  // Process groups in timeline order across all epics
  for (const { epicKey, group } of allGroups) {
    const groupStartDay = epicCurrentDay[epicKey];
    let parallelGroup = 0;
    let groupEndDay = groupStartDay;

    for (const ticket of group.tickets) {
      let ticketStartDay: number;
      let usedSlotIndex: number;

      if (viewMode === 'worst') {
        // Worst case: ALL tickets are fully sequential (one at a time globally)
        ticketStartDay = worstCaseCurrentDay;
        worstCaseCurrentDay = ticketStartDay + ticket.devDays;
        usedSlotIndex = 0; // Not used in worst case, but needed for tracking
      } else {
        // Best case with max developers limit:
        // Find the developer slot that allows the earliest START for this ticket
        // (considering both developer availability AND epic dependency constraint)

        let bestSlotIndex = 0;
        let bestStartDay = Infinity;

        for (let i = 0; i < developerSlots.length; i++) {
          // Ticket can start when BOTH conditions are met:
          // 1. Developer is available (developerSlots[i])
          // 2. Epic dependency is satisfied (groupStartDay)
          const possibleStartDay = Math.max(developerSlots[i], groupStartDay);

          if (possibleStartDay < bestStartDay) {
            bestStartDay = possibleStartDay;
            bestSlotIndex = i;
          }
        }

        ticketStartDay = bestStartDay;
        usedSlotIndex = bestSlotIndex;

        // Update this slot's availability
        developerSlots[usedSlotIndex] = ticketStartDay + ticket.devDays;
      }

      const ticketDuration = ticket.devDays;
      const ticketEndDay = ticketStartDay + ticketDuration;

      // When includeWeekends=false, output work day offsets directly (UI will show only work days)
      // When includeWeekends=true, work days = calendar days, so no conversion needed
      const outputStartDay = ticketStartDay;
      const outputEndDay = ticketEndDay;

      // Find which sprint this falls into
      // Convert ticket start to calendar day for sprint matching
      const calendarStartDay = workDayToCalendarDay(ticketStartDay, projectStartDate, includeWeekends);
      let assignedSprintId = sprintsWithCapacity[0].id;
      for (const sprint of sprintsWithCapacity) {
        const sprintStartDay = daysBetween(projectStartDate, new Date(sprint.startDate), true);
        const sprintEndDay = daysBetween(projectStartDate, new Date(sprint.endDate), true);

        if (calendarStartDay >= sprintStartDay && calendarStartDay < sprintEndDay) {
          assignedSprintId = sprint.id;
          if (sprint.remainingCapacity !== undefined) {
            sprint.remainingCapacity -= ticketDuration;
          }
          break;
        }
      }

      scheduledTickets.push({
        ...ticket,
        startDay: outputStartDay,
        endDay: outputEndDay,
        sprintId: assignedSprintId,
        parallelGroup,
      });

      totalDevDays += ticket.devDays;
      parallelGroup++;

      // Track the furthest end day in this group
      groupEndDay = Math.max(groupEndDay, ticketEndDay);
    }

    // Next group in THIS EPIC must wait for current group to finish
    epicCurrentDay[epicKey] = groupEndDay;
  }

  // Build scheduled epics
  const scheduledEpics: ScheduledEpic[] = epics.map((epic) => {
    const epicTickets = scheduledTickets.filter((t) => t.epicKey === epic.key);
    const epicTotalDevDays = epicTickets.reduce((sum, t) => sum + t.devDays, 0);

    return {
      ...epic,
      tickets: epicTickets,
      totalDevDays: epicTotalDevDays,
      startDay: epicTickets.length > 0 ? Math.min(...epicTickets.map((t) => t.startDay)) : 0,
      endDay: epicTickets.length > 0 ? Math.max(...epicTickets.map((t) => t.endDay)) : 0,
    };
  });

  // Calculate project end date
  // maxEndDay is in work days when includeWeekends=false
  const maxEndDay = Math.max(...scheduledTickets.map((t) => t.endDay), 0);
  const projectEndDate = includeWeekends
    ? dayOffsetToDate(projectStartDate, maxEndDay)
    : addWorkDays(projectStartDate, maxEndDay, false);

  return {
    epics: scheduledEpics,
    sprints: sprintsWithCapacity,
    projectStartDate: projectStartDate.toISOString().split('T')[0],
    projectEndDate: projectEndDate.toISOString().split('T')[0],
    totalDevDays,
    totalDays: maxEndDay, // Work days when weekends excluded, calendar days when included
    viewMode,
    includeWeekends,
  };
};
