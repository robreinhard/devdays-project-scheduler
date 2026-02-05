'use client';

import { useMemo, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import type { GanttData, JiraSprint, ScheduledTicket, CommitType, TicketSlotUpdate } from '@/shared/types';
import { parseDate } from '@/shared/utils/dates';

// JIRA base URL from environment
const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL || '';

const getJiraUrl = (key: string): string | null => {
  return JIRA_BASE_URL ? `${JIRA_BASE_URL}/browse/${key}` : null;
};

interface SlotTicketsDialogProps {
  open: boolean;
  onClose: () => void;
  ganttData: GanttData | null;
}

interface TicketSlotChange {
  ticket: ScheduledTicket;
  epicKey: string;
  epicSummary: string;
  commitType: CommitType;
  priorityOverride?: number;
  currentSprintId: number | null;
  currentSprintName: string | null;
  newSprintId: number;
  newSprintName: string;
  newStartDate: string;
  newEndDate: string;
  hasSprintChange: boolean;
}

// Format priority label (e.g., "Commit-1", "Stretch", "None")
const formatPriorityLabel = (commitType: CommitType, priorityOverride?: number): string => {
  if (commitType === 'none') return '-';
  const base = commitType.charAt(0).toUpperCase() + commitType.slice(1);
  return priorityOverride !== undefined ? `${base}-${priorityOverride}` : base;
};

// Get sort key for priority (lower = higher priority)
const getPrioritySortKey = (commitType: CommitType, priorityOverride?: number): number => {
  const tierScore = commitType === 'commit' ? 0 : commitType === 'stretch' ? 1000 : 2000;
  const overrideScore = priorityOverride ?? 999;
  return tierScore + overrideScore;
};

const SlotTicketsDialog = ({ open, onClose, ganttData }: SlotTicketsDialogProps) => {
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isSlotting, setIsSlotting] = useState(false);
  const [slotResult, setSlotResult] = useState<{
    success: boolean;
    updatedCount: number;
    errors: Array<{ ticketKey: string; error: string }>;
  } | null>(null);

  // Build sprint lookup from ganttData.sprints (which has adjusted dates from sidebar)
  const sprintLookup = useMemo(() => {
    const lookup = new Map<number, JiraSprint>();
    if (ganttData) {
      for (const sprint of ganttData.sprints) {
        lookup.set(sprint.id, sprint);
      }
    }
    return lookup;
  }, [ganttData]);

  // Get ticket changes grouped by future sprint, sorted by epic priority
  const changesBySprintId = useMemo(() => {
    if (!ganttData) return new Map<number, TicketSlotChange[]>();

    const changes = new Map<number, TicketSlotChange[]>();

    // Get all scheduled tickets from future sprints only
    for (const epic of ganttData.epics) {
      for (const ticket of epic.tickets) {
        const sprint = sprintLookup.get(ticket.sprintId);

        // Only show tickets in future sprints
        if (!sprint || sprint.state !== 'future') continue;

        // Determine current sprint (first sprint ID from JIRA, if any)
        const currentSprintId = ticket.sprintIds?.[0] ?? null;
        const currentSprint = currentSprintId ? sprintLookup.get(currentSprintId) : null;

        const change: TicketSlotChange = {
          ticket,
          epicKey: epic.key,
          epicSummary: epic.summary,
          commitType: epic.commitType,
          priorityOverride: epic.priorityOverride,
          currentSprintId,
          currentSprintName: currentSprint?.name ?? null,
          newSprintId: ticket.sprintId,
          newSprintName: sprint.name,
          newStartDate: ticket.startDate,
          newEndDate: ticket.endDate,
          hasSprintChange: currentSprintId !== ticket.sprintId,
        };

        if (!changes.has(ticket.sprintId)) {
          changes.set(ticket.sprintId, []);
        }
        changes.get(ticket.sprintId)!.push(change);
      }
    }

    // Sort tickets within each sprint by epic priority
    for (const [sprintId, tickets] of changes) {
      tickets.sort((a, b) => {
        const aPriority = getPrioritySortKey(a.commitType, a.priorityOverride);
        const bPriority = getPrioritySortKey(b.commitType, b.priorityOverride);
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Secondary sort by epic key
        return a.epicKey.localeCompare(b.epicKey);
      });
    }

    return changes;
  }, [ganttData, sprintLookup]);

  // Get sorted sprint IDs (by start date)
  const sortedSprintIds = useMemo(() => {
    return Array.from(changesBySprintId.keys()).sort((a, b) => {
      const sprintA = sprintLookup.get(a);
      const sprintB = sprintLookup.get(b);
      if (!sprintA || !sprintB) return 0;
      return sprintA.startDate.localeCompare(sprintB.startDate);
    });
  }, [changesBySprintId, sprintLookup]);

  // Format date for display (using Luxon for consistent timezone handling)
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    return parseDate(dateStr).toFormat('MMM d, yyyy');
  };

  // Count total tickets and changes
  const totalTickets = useMemo(() => {
    let count = 0;
    for (const tickets of changesBySprintId.values()) {
      count += tickets.length;
    }
    return count;
  }, [changesBySprintId]);

  const ticketsWithChanges = useMemo(() => {
    let count = 0;
    for (const tickets of changesBySprintId.values()) {
      count += tickets.filter(t => t.hasSprintChange).length;
    }
    return count;
  }, [changesBySprintId]);

  const handleSlotTickets = async () => {
    if (confirmText.toLowerCase() !== 'slot tickets') return;

    setIsSlotting(true);
    setSlotResult(null);

    // Collect all ticket updates from future sprints
    const updates: TicketSlotUpdate[] = [];
    for (const tickets of changesBySprintId.values()) {
      for (const change of tickets) {
        updates.push({
          ticketKey: change.ticket.key,
          sprintId: change.newSprintId,
          plannedStartDate: change.newStartDate,
          plannedEndDate: change.newEndDate,
        });
      }
    }

    try {
      const response = await fetch('/api/tickets/slot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      const result = await response.json();
      setSlotResult(result);

      if (result.success) {
        setShowConfirmation(false);
        setConfirmText('');
      }
    } catch (error) {
      setSlotResult({
        success: false,
        updatedCount: 0,
        errors: [{ ticketKey: 'ALL', error: String(error) }],
      });
    } finally {
      setIsSlotting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '80vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Slot Tickets to Future Sprints</Typography>
          <Typography variant="body2" color="text.secondary">
            {totalTickets} tickets | {ticketsWithChanges} with sprint changes
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {sortedSprintIds.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No tickets scheduled in future sprints
            </Typography>
          </Box>
        ) : (
          sortedSprintIds.map((sprintId, index) => {
            const sprint = sprintLookup.get(sprintId);
            const tickets = changesBySprintId.get(sprintId) ?? [];

            return (
              <Box key={sprintId} sx={{ mb: index < sortedSprintIds.length - 1 ? 4 : 0 }}>
                {/* Sprint Header */}
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {sprint?.name ?? `Sprint ${sprintId}`}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(sprint?.startDate ?? '')} - {formatDate(sprint?.endDate ?? '')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    ({tickets.length} tickets)
                  </Typography>
                </Box>

                {/* Tickets Table */}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Epic</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 80 }}>Priority</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 110 }}>Ticket</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 130 }}>Current Sprint</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 130 }}>New Sprint</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>New Start</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>New End</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tickets.map((change) => {
                        const ticketUrl = getJiraUrl(change.ticket.key);
                        const epicUrl = getJiraUrl(change.epicKey);
                        const hasChange = change.hasSprintChange;
                        const priorityLabel = formatPriorityLabel(change.commitType, change.priorityOverride);

                        return (
                          <TableRow key={change.ticket.key} hover>
                            <TableCell>
                              <Tooltip title={change.epicSummary} arrow placement="top">
                                {epicUrl ? (
                                  <Link
                                    href={epicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    sx={{ fontWeight: 500, fontSize: 12 }}
                                  >
                                    {change.epicKey}
                                  </Link>
                                ) : (
                                  <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12 }}>
                                    {change.epicKey}
                                  </Typography>
                                )}
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: 11,
                                  fontWeight: change.commitType !== 'none' ? 500 : undefined,
                                  color: change.commitType === 'commit' ? 'primary.main' :
                                         change.commitType === 'stretch' ? 'secondary.main' : 'text.secondary',
                                }}
                              >
                                {priorityLabel}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {ticketUrl ? (
                                <Link
                                  href={ticketUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{ fontWeight: 500, fontSize: 12 }}
                                >
                                  {change.ticket.key}
                                </Link>
                              ) : (
                                <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12 }}>
                                  {change.ticket.key}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: 12 }}>
                                {change.ticket.summary}
                              </Typography>
                            </TableCell>
                            <TableCell
                              sx={{
                                bgcolor: hasChange ? 'error.lighter' : undefined,
                                color: hasChange ? 'error.dark' : undefined,
                                fontSize: 12,
                              }}
                            >
                              {change.currentSprintName ?? (
                                <Typography variant="body2" color="text.secondary" fontStyle="italic" sx={{ fontSize: 12 }}>
                                  Unassigned
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell
                              sx={{
                                bgcolor: hasChange ? 'success.lighter' : undefined,
                                color: hasChange ? 'success.dark' : undefined,
                                fontWeight: hasChange ? 500 : undefined,
                                fontSize: 12,
                              }}
                            >
                              {change.newSprintName}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12 }}>
                              {formatDate(change.newStartDate)}
                            </TableCell>
                            <TableCell sx={{ fontSize: 12 }}>
                              {formatDate(change.newEndDate)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {index < sortedSprintIds.length - 1 && (
                  <Divider sx={{ mt: 3 }} />
                )}
              </Box>
            );
          })
        )}

        {/* Other Tickets Section */}
        {ganttData?.otherTickets && ganttData.otherTickets.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Divider sx={{ mb: 3 }} />
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" color="text.secondary">
                Other Tickets in Future Sprints
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ({ganttData.otherTickets.length} tickets not in selected epics)
              </Typography>
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Epic</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', width: 110 }}>Ticket</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', width: 130 }}>Sprint</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', width: 70 }}>Points</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ganttData.otherTickets.map((ticket) => {
                    const ticketUrl = getJiraUrl(ticket.key);
                    const epicUrl = ticket.epicKey ? getJiraUrl(ticket.epicKey) : null;
                    return (
                      <TableRow key={ticket.key} hover>
                        <TableCell>
                          {ticket.epicKey ? (
                            <Tooltip title={ticket.epicSummary ?? ''} arrow>
                              {epicUrl ? (
                                <Link
                                  href={epicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{ fontSize: 12 }}
                                >
                                  {ticket.epicKey}
                                </Link>
                              ) : (
                                <Typography sx={{ fontSize: 12 }}>{ticket.epicKey}</Typography>
                              )}
                            </Tooltip>
                          ) : (
                            <Typography color="text.secondary" fontStyle="italic" sx={{ fontSize: 12 }}>
                              No Epic
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          {ticketUrl ? (
                            <Link
                              href={ticketUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ fontWeight: 500, fontSize: 12 }}
                            >
                              {ticket.key}
                            </Link>
                          ) : (
                            <Typography fontWeight={500} sx={{ fontSize: 12 }}>{ticket.key}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: 12 }}>{ticket.summary}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{ticket.status}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{ticket.sprintName}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>
                          {ticket.devDays}
                          {ticket.isMissingEstimate && <span style={{ fontSize: 10, color: '#888' }}> (est)</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      {slotResult && (
        <Alert
          severity={slotResult.success ? 'success' : 'error'}
          sx={{ mx: 3, mb: 2 }}
          onClose={() => setSlotResult(null)}
        >
          {slotResult.success
            ? `Successfully updated ${slotResult.updatedCount} tickets in JIRA`
            : `Updated ${slotResult.updatedCount} tickets. ${slotResult.errors.length} failed: ${slotResult.errors.map(e => e.ticketKey).join(', ')}`
          }
        </Alert>
      )}

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>

        {!showConfirmation ? (
          <Button
            variant="contained"
            onClick={() => setShowConfirmation(true)}
            disabled={totalTickets === 0}
          >
            Slot Tickets in JIRA
          </Button>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
              Slotting tickets updates all tickets in dialog in JIRA
            </Typography>
            <TextField
              size="small"
              placeholder='Type "slot tickets" to confirm'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              sx={{ width: 300 }}
              disabled={isSlotting}
            />
            <Button
              variant="contained"
              color="warning"
              onClick={handleSlotTickets}
              disabled={confirmText.toLowerCase() !== 'slot tickets' || isSlotting}
            >
              {isSlotting ? 'Slotting...' : 'Confirm Slot'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => { setShowConfirmation(false); setConfirmText(''); }}
              disabled={isSlotting}
            >
              Cancel
            </Button>
          </Box>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SlotTicketsDialog;
