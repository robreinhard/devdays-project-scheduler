# Scheduling Algorithm

This document describes the step-by-step logic of the ticket scheduling algorithm.

## Overview

The algorithm schedules tickets from multiple epics into sprints while respecting:
- Sprint capacity (dev days per day)
- Sprint boundaries (tickets cannot cross sprints)
- Dependencies between tickets (blockers must complete first)
- Priority tiers (Commit > Stretch > None)
- Active/closed sprint locking (tickets in active sprints stay there)

## Inputs

| Input | Description |
|-------|-------------|
| `epics` | List of epics with their `commitType` ('commit', 'stretch', 'none') and optional `priorityOverride` |
| `tickets` | All tickets with `devDays`, `blockedBy`, `sprintIds`, and `status` |
| `sprints` | Selected sprints with start/end dates and state ('active', 'closed', 'future') |
| `sprintCapacities` | Capacity configuration per sprint (dev days per day) |
| `maxDevelopers` | Default capacity (points per day) |
| `doneStatuses` | Status names that indicate "done" (from board configuration) |
| `activeSprints` | All active sprints from the board (even if not selected) |

## Pre-Processing

### 1. Validation
- Reject any ticket with `devDays > 10` (max for a single sprint)

### 2. Build Sprint Capacity Map
- Create a daily capacity array where each day has:
  - `date`: The calendar date
  - `sprintId`: Which sprint this day belongs to
  - `totalCapacity`: Points available (from sprint config or maxDevelopers)
  - `remainingCapacity`: Points remaining (starts equal to totalCapacity)
- Exclude weekends (Saturday/Sunday)
- Apply any daily capacity overrides (PTO, holidays)

### 3. Calculate Epic Worst-Case Durations
For each epic, calculate the worst-case completion time:
- Sum of all ticket devDays on the critical path (longest dependency chain)
- Used for tiebreaking when priority overrides are equal

### 4. Sort Epics by Priority
Within each tier (commit, stretch, none), sort epics by:
1. Priority override (lower number = higher priority, e.g., Commit-1 before Commit-2)
2. Worst-case duration (longer epics first, as tiebreaker)

---

## PHASE 1: Partition Tickets

For each epic, categorize every ticket into one of three buckets:

### Previous (Already Handled)
A ticket goes to **Previous** if ANY of these conditions are true:
- Status is "done" (matches `doneStatuses`) AND not in a selected sprint
- In an active sprint that is NOT selected
- In a closed sprint that is NOT selected

### Locked (Fixed to Sprint)
A ticket is **Locked** if:
- It's in an active or closed sprint that IS selected
- These tickets must be scheduled in their assigned sprint (cannot be moved)

### Free (Available to Schedule)
A ticket is **Free** if:
- Not done, not in an active sprint, not locked to a closed sprint
- These tickets will be scheduled in future sprints based on capacity

---

## PHASE 2: Schedule Locked Tickets

Process locked tickets sprint-by-sprint, in chronological order.

### For Each Locked Sprint:

1. **Get all tickets locked to this sprint**

2. **Topologically sort tickets by dependencies**
   - Use Kahn's algorithm
   - Tickets with no blockers come first
   - Tickets blocked by others come after their blockers

3. **Schedule each ticket in dependency order:**

   a. **Calculate earliest start day:**
      - Start of sprint, OR
      - End day of the latest blocker (whichever is later)

   b. **Find available slot within the sprint:**
      - Search from earliest start day
      - Find a contiguous block of days where:
        - All days have `remainingCapacity >= 1`
        - All days are within the same sprint
        - Block is exactly `devDays` long

   c. **If no valid slot exists (capacity overflow):**
      - Mark ticket with `hasConstraintViolation = true`
      - Place at end of sprint anyway (will show as overflowing)

   d. **Consume capacity:**
      - For each day in the slot, decrement `remainingCapacity` by 1

   e. **Record the ticket's end day** for dependency resolution

---

## PHASE 3: Schedule Free Tickets

This is the main scheduling phase for unassigned work.

### Step 1: Prioritize All Free Tickets

Create a priority-ordered list of ALL free tickets (across all epics):

| Priority | Criteria |
|----------|----------|
| 1st | Tier: Commit (0) > Stretch (1) > None (2) |
| 2nd | Priority Override: Lower number wins (Commit-1 before Commit-2) |
| 3rd | Epic Worst-Case: Longer duration first (tiebreaker) |

**Example ordering:**
1. Ticket from Commit-1 epic (tier=0, override=1)
2. Ticket from Commit-2 epic (tier=0, override=2)
3. Ticket from Commit epic with no override, 50-day worst-case
4. Ticket from Commit epic with no override, 30-day worst-case
5. Ticket from Stretch-1 epic (tier=1, override=1)
6. Ticket from Stretch epic with no override
7. Ticket from unlabeled epic (tier=2)

### Step 2: Iterative Scheduling Loop

Repeat until no more progress can be made:

```
for each ticket in priority order:
    if ticket already scheduled or unslotted:
        skip

    if dependencies not satisfied:
        skip (will retry next iteration)

    calculate earliest start day:
        - first day of future sprints, OR
        - end day of latest blocker (whichever is later)

    find earliest available slot:
        - search from earliest start day
        - find contiguous days with capacity
        - must fit within a single sprint
        - must be in a FUTURE sprint (state = 'future')

    if valid slot found:
        consume capacity (decrement remainingCapacity for each day)
        record ticket end day
        mark as scheduled
    else:
        mark as unslotted (goes to Future block)
```

### Key Behaviors:

- **Capacity-based slotting:** Each ticket finds the EARLIEST day with available capacity, not a fixed start position
- **Priority respected:** Higher-priority tickets get first choice of slots
- **Dependencies honored:** A ticket waits for its blockers to be scheduled first
- **Sprint boundaries:** Tickets cannot cross sprint boundaries
- **Future sprints only:** Free tickets only go into sprints with `state = 'future'`

### Step 3: Handle Remaining Tickets

Any tickets still pending after the loop (circular dependencies, etc.) are marked as unslotted and go to the Future block.

---

## PHASE 4: Build Output

### For Each Epic, Build:

1. **Previous Block:** Aggregate of all "previous" tickets
   - Shows total dev days of completed/locked-elsewhere work

2. **Scheduled Tickets:** List of tickets with:
   - `startDay`, `endDay` (day indices)
   - `startDate`, `endDate` (calendar dates)
   - `sprintId` (which sprint it's in)
   - `parallelGroup` (topological level for display)
   - `criticalPathWeight` (for critical path highlighting)
   - `hasConstraintViolation` (if it overflows its locked sprint)

3. **Future Block:** Aggregate of all unslotted tickets
   - Work that couldn't fit in selected sprints

### Calculate Summary Stats:
- `totalDevDays`: Sum of all scheduled ticket dev days
- `projectStartDate`: First sprint start
- `projectEndDate`: Last scheduled ticket end date

---

## Helper Functions

### `findNextAvailableSlot(startDay, devDays, dailyCapacity)`
Finds the earliest contiguous slot of `devDays` length where all days have `remainingCapacity >= 1` and are in the same sprint.

### `findSlotInSpecificSprint(sprintId, startDay, devDays, dailyCapacity)`
Same as above, but constrained to a specific sprint. Returns -1 if no valid slot exists.

### `getSprintDayRange(sprintId, dailyCapacity)`
Returns the start and end day indices for a sprint.

### `getFirstFutureSprintDayIndex(sprints, dailyCapacity)`
Returns the first day index that belongs to a future sprint.

### `isDoneStatus(status, doneStatuses)`
Returns true if the status matches any done status from the board configuration.

### `getLockedSprintId(ticket, sprints, activeSprintIds)`
Returns the sprint ID if the ticket is locked to an active or closed sprint, null otherwise.

---

## Visual Representation

```
Timeline:  |--Sprint 1 (closed)--|--Sprint 2 (active)--|--Sprint 3 (future)--|--Sprint 4 (future)--|

Previous Block:
  [Done tickets, tickets in unselected active sprints]

Locked Tickets (Sprint 2):
  [Tickets assigned to active sprint - scheduled within sprint bounds]

Free Tickets (Sprints 3-4):
  [Scheduled by priority, earliest available slot with capacity]

Future Block:
  [Tickets that couldn't fit in selected sprints]
```

---

## Constraints & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Ticket > 10 points | Error thrown (too large for sprint) |
| Ticket can't fit in locked sprint | Placed with `hasConstraintViolation` flag, may overflow |
| Circular dependencies | Tickets go to Future block |
| Blocker in Future block | Dependent ticket also goes to Future block |
| No capacity remaining | Tickets go to Future block |
| Ticket in active sprint not selected | Goes to Previous block |
| Cross-sprint dependency | Dependent waits for blocker's end day before starting |
