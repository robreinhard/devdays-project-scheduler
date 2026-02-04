'use client';

import { useMemo } from 'react';
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
import type { GanttData, JiraSprint, ScheduledTicket } from '@/shared/types';

// JIRA base URL from environment
const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL || '';

const getJiraUrl = (key: string): string | null => {
  return JIRA_BASE_URL ? `${JIRA_BASE_URL}/browse/${key}` : null;
};

interface SlotTicketsDialogProps {
  open: boolean;
  onClose: () => void;
  ganttData: GanttData | null;
  sprints: JiraSprint[];
}

interface TicketSlotChange {
  ticket: ScheduledTicket;
  epicKey: string;
  currentSprintId: number | null;
  currentSprintName: string | null;
  newSprintId: number;
  newSprintName: string;
  newStartDate: string;
  newEndDate: string;
  hasSprintChange: boolean;
}

const SlotTicketsDialog = ({ open, onClose, ganttData, sprints }: SlotTicketsDialogProps) => {
  // Build sprint lookup
  const sprintLookup = useMemo(() => {
    const lookup = new Map<number, JiraSprint>();
    for (const sprint of sprints) {
      lookup.set(sprint.id, sprint);
    }
    // Also add sprints from ganttData if available
    if (ganttData) {
      for (const sprint of ganttData.sprints) {
        if (!lookup.has(sprint.id)) {
          lookup.set(sprint.id, sprint);
        }
      }
    }
    return lookup;
  }, [sprints, ganttData]);

  // Get ticket changes grouped by future sprint
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

  // Format date for display
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
                        <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Ticket</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Summary</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 140 }}>Current Sprint</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 140 }}>New Sprint</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 110 }}>New Start</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 110 }}>New End</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tickets.map((change) => {
                        const ticketUrl = getJiraUrl(change.ticket.key);
                        const hasChange = change.hasSprintChange;

                        return (
                          <TableRow key={change.ticket.key} hover>
                            <TableCell>
                              {ticketUrl ? (
                                <Link
                                  href={ticketUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  sx={{ fontWeight: 500 }}
                                >
                                  {change.ticket.key}
                                </Link>
                              ) : (
                                <Typography variant="body2" fontWeight={500}>
                                  {change.ticket.key}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography
                                variant="body2"
                                sx={{
                                  maxWidth: 300,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {change.ticket.summary}
                              </Typography>
                            </TableCell>
                            <TableCell
                              sx={{
                                bgcolor: hasChange ? 'error.lighter' : undefined,
                                color: hasChange ? 'error.dark' : undefined,
                              }}
                            >
                              {change.currentSprintName ?? (
                                <Typography variant="body2" color="text.secondary" fontStyle="italic">
                                  Unassigned
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell
                              sx={{
                                bgcolor: hasChange ? 'success.lighter' : undefined,
                                color: hasChange ? 'success.dark' : undefined,
                                fontWeight: hasChange ? 500 : undefined,
                              }}
                            >
                              {change.newSprintName}
                            </TableCell>
                            <TableCell>
                              {formatDate(change.newStartDate)}
                            </TableCell>
                            <TableCell>
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
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
        <Button
          variant="contained"
          disabled
          title="JIRA integration coming soon"
        >
          Update JIRA (Coming Soon)
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SlotTicketsDialog;
