# DevDays JIRA GANTT - Progress Tracker

This file tracks implementation progress across Claude Code sessions.

---

## Current Status: **Phases 1-5 Complete (MVP Ready)**

### Blockers (User Action Required)

| Task | Owner | Status |
|------|-------|--------|
| Set up lower JIRA environment for development/testing | Rob | Pending |
| Create JIRA API token | Rob | Pending |
| Identify custom field IDs (Dev Days, Timeline Order) | Rob | Pending |
| Get JIRA Board ID for sprint fetching | Rob | Pending |

**Note:** Sprint capacity is entered in-app (JIRA doesn't support custom fields on sprints).

### Once Unblocked

Provide these values in `.env.local`:
```bash
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=your.email@company.com
JIRA_API_TOKEN=<your-token>
JIRA_FIELD_DEV_DAYS=customfield_XXXXX
JIRA_FIELD_TIMELINE_ORDER=customfield_XXXXX
JIRA_BOARD_ID=XXX
```

---

## Implementation Phases

### Phase 1: Foundation (Core Setup) - COMPLETE
- [x] Install MUI + Emotion dependencies
- [x] Set up MUI theme (ThemeRegistry with Emotion SSR)
- [x] Create TypeScript interfaces (shared/types/)
- [x] Create JIRA API client (backend/jira/)
- [x] Set up basic page layout (Header, Sidebar, MainContent)

### Phase 2: JIRA Integration - COMPLETE
- [x] `/api/auth/validate` endpoint
- [x] `/api/epics/search` endpoint (updated to new POST /search/jql API)
- [x] `/api/epics/[key]` endpoint (returns epic + tickets with devDays/timelineOrder)
- [x] `/api/sprints` endpoint
- [x] Custom field mapping via env vars
- [x] Error handling with descriptive messages

### Phase 3: Scheduling Algorithm - COMPLETE
- [x] Ticket grouping by timeline order (grouped by epicKey + order)
- [x] Best-case duration calculator (parallel tickets overlap)
- [x] Worst-case duration calculator (sequential within groups)
- [x] Sprint capacity slotting (assigns tickets to sprints)
- [x] `/api/gantt/generate` endpoint (POST with epicKeys, sprintCapacities, viewMode)
- [ ] Unit tests (deferred)

### Phase 4: UI Components - COMPLETE
- [x] Epic Search component (autocomplete with debounced search)
- [x] Epic Key Paste input (comma/newline separated)
- [x] Selected Epics list (with remove buttons)
- [x] View Mode toggle (best/worst case)
- [x] Sprint Capacity Editor (checkbox + dev days per sprint)
- [x] Date Range picker (MUI date pickers)
- [x] useAppState hook (URL query param sync)
- [x] SidebarContent component (wired up)

### Phase 5: GANTT Chart - COMPLETE
- [x] GanttChart container with summary bar
- [x] TimelineHeader (sprints + day markers)
- [x] EpicRow (collapsible with labels)
- [x] TicketBar (colored by order, clickable)
- [x] Horizontal scrolling
- [x] Ticket hover tooltips (with all details)
- [x] JIRA link on click
- [x] useGanttData hook for API calls

### Phase 6: State & Polish
- [ ] Query param serialization
- [ ] URL sharing
- [ ] Loading skeletons
- [ ] Error boundaries
- [ ] Empty states
- [ ] Performance optimization

---

## Session Log

### Session 1 - 2025-12-29
- Created PROJECT-DESIGN.md (user)
- Created IMPLEMENTATION-PLAN.md with architecture, wireframes, 6 phases
- Clarified: No settings modal (auth via ENV), sprint capacity in-app
- **Phases 1-5 Completed in single session:**
  - Phase 1: MUI + Emotion, folder structure, TypeScript types
  - Phase 2: All API endpoints (`/api/auth/validate`, `/api/epics/*`, `/api/sprints`, `/api/gantt/generate`)
  - Phase 3: Scheduling algorithm (best/worst case, sprint capacity slotting)
  - Phase 4: Sidebar components (EpicSearch, SprintCapacityEditor, ViewModeToggle, etc.)
  - Phase 5: GANTT chart (TimelineHeader, EpicRow, TicketBar with tooltips)
- **MVP Complete** - paused for user testing

---

## Notes for Next Session

To resume, tell Claude:
```
Read CLAUDE-PROGRESS.md and IMPLEMENTATION-PLAN.md, then continue implementation
```

---

## Session 2 - 2025-12-30: Scheduler Bug Fix

### Issue Identified
With 2 max developers, tickets from different epics with the same timeline order were not being scheduled optimally. Example:
- TS-9 (Entertainment) finishes, freeing a developer
- TS-1 (Dinner) still running on other developer
- TS-10 (Entertainment) should start immediately using the freed developer
- **BUG**: TS-10 waited for TS-1 to complete instead

### Root Cause
The algorithm greedily grabbed the globally earliest developer slot for each ticket, ignoring which "developer lane" each epic was using. This caused:
- Dinner Tasks to "steal" Entertainment's developer slot
- Entertainment's next ticket had to wait for Dinner to finish

### Fix Applied (backend/scheduler/algorithm.ts)
Added `epicDeveloperSlot` tracking so each epic remembers which developer it's been using:

```typescript
// Track which developer slot each epic is currently using (for continuity)
const epicDeveloperSlot: Record<string, number> = {};
```

The scheduling logic now:
1. Checks if the epic has a preferred developer from previous work
2. Uses the preferred slot if it's available when the epic's dependency completes
3. Only switches to a different developer if it would actually help

### Other Bugs Identified (Not Yet Fixed)
1. **Sprint Capacity Not Enforced** - Tickets overflow sprint capacity without being pushed to next sprint
2. **Cross-Sprint Capacity Accounting** - Tickets spanning sprints deduct full duration from starting sprint only
3. **Calendar Days vs Work Days Mismatch** - devDays treated as calendar days, should skip weekends
4. **Unused `getGroupDuration` function** - Never called in algorithm

### Status
- [x] Epic developer continuity fix applied
- [ ] User testing needed to verify fix
- [ ] Other bugs pending prioritization

---

## Session 3 - 2025-12-30: Developer Underutilization Fix

### Issue Identified
With 5 developers, tickets were being underutilized. The algorithm wasn't aggressively scheduling all available developers.

### Root Cause
The `epicDeveloperSlot` tracking from Session 2 was actually *causing* underutilization. The logic tried to keep an epic on its "preferred" developer, but this prevented idle developers from picking up work.

Example with 5 developers:
- Epic A tickets using developers 0-2
- Epic B order 1 tickets ready to start (no dependencies)
- Bug: Algorithm checked Epic B's "preferred" developer instead of using idle developers 3-4
- Result: Developers 3-4 sat idle while work was waiting

### Fix Applied (backend/scheduler/algorithm.ts)
Removed all `epicDeveloperSlot` tracking and simplified to a greedy approach:

```typescript
// For each ticket, find the developer slot that allows the EARLIEST start
// (considering both developer availability AND epic dependency constraint)
for (let i = 0; i < developerSlots.length; i++) {
  const possibleStartDay = Math.max(developerSlots[i], groupStartDay);
  if (possibleStartDay < bestStartDay) {
    bestStartDay = possibleStartDay;
    bestSlotIndex = i;
  }
}
```

**Key principle:** Always use the earliest available developer. No preference tracking. Maximum parallelization while respecting epic order constraints.

### Status
- [x] Greedy developer assignment implemented
- [ ] User testing needed to verify fix

---

## Session 3 (continued) - 2025-12-30: Weekend Exclusion

### Feature Added
Added ability to exclude weekends from scheduling calculations.

### Implementation

**Backend (algorithm.ts):**
- Added `includeWeekends` parameter to `SchedulingInput`
- Added helper functions:
  - `isWeekend(date)` - checks if a date is Saturday/Sunday
  - `addWorkDays(startDate, workDays, includeWeekends)` - adds work days, skipping weekends
  - `workDayToCalendarDay(workDay, projectStartDate, includeWeekends)` - converts work day offset to calendar day offset
- Scheduling logic works in "work days" internally
- Output `startDay`/`endDay` are calendar day offsets (for correct UI positioning)

**Types (shared/types):**
- Added `includeWeekends: boolean` to `AppState`, `SchedulingInput`, and `GanttData`
- Added `INCLUDE_WEEKENDS` query param key

**Frontend:**
- Added "Include Weekends" checkbox in sidebar (default: unchecked)
- State persisted in URL query params (`?weekends=true`)
- Passed through to API via `useGanttData` hook

### How It Works
- When `includeWeekends=false` (default):
  - A 5-day ticket starting Monday ends Friday (skips Sat/Sun)
  - The Gantt chart still shows all calendar days
  - Ticket bars span the correct calendar range
- When `includeWeekends=true`:
  - A 5-day ticket starting Monday ends Friday (consecutive days)
  - Same as before (backward compatible)

### Status
- [x] Backend algorithm updated
- [x] Types updated
- [x] API endpoint updated
- [x] Frontend checkbox added
- [x] Build passes
- [ ] User testing needed
