'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { ScheduledEpic, ScheduledTicket, DayCapacityInfo } from '@/shared/types';
import { parseDate } from '@/shared/utils/dates';
import TicketBar from './TicketBar';
import AggregateBlockBar from './AggregateBlockBar';

// JIRA base URL from environment
const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL || '';

const getJiraUrl = (key: string): string | null => {
  return JIRA_BASE_URL ? `${JIRA_BASE_URL}/browse/${key}` : null;
};

// Get status chip color based on status text
const getStatusColor = (status: string): 'default' | 'primary' | 'success' | 'warning' => {
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes('done') || lowerStatus.includes('resolved') || lowerStatus.includes('closed')) {
    return 'success';
  }
  if (lowerStatus.includes('progress') || lowerStatus.includes('review')) {
    return 'primary';
  }
  if (lowerStatus.includes('blocked')) {
    return 'warning';
  }
  return 'default'; // To Do, Open, etc.
};

interface EpicRowProps {
  epic: ScheduledEpic;
  dayWidth: number;
  rowHeight: number;
  startDate: string;
  labelOnly?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  epicColor: string;
  today?: string;
  dailyCapacities?: DayCapacityInfo[];
  totalDays: number;
  chartLeftOffset?: number; // Offset for Previous blocks
}

const EpicRow = ({
  epic,
  dayWidth,
  rowHeight,
  startDate,
  labelOnly = false,
  expanded,
  onToggleExpanded,
  epicColor,
  today,
  dailyCapacities,
  totalDays,
  chartLeftOffset = 0,
}: EpicRowProps) => {
  // Sort tickets by topological level, then by critical path weight (descending)
  const sortedTickets = useMemo(() => {
    return [...epic.tickets].sort((a: ScheduledTicket, b: ScheduledTicket) => {
      // First by parallelGroup (topological level)
      if (a.parallelGroup !== b.parallelGroup) {
        return a.parallelGroup - b.parallelGroup;
      }
      // Then by critical path weight (higher weight = more important = first)
      return b.criticalPathWeight - a.criticalPathWeight;
    });
  }, [epic.tickets]);

  // Epic summary bar dimensions (offset by chartLeftOffset)
  const epicLeft = chartLeftOffset + epic.startDay * dayWidth;
  const epicWidth = (epic.endDay - epic.startDay) * dayWidth;

  const epicUrl = getJiraUrl(epic.key);

  // Helper to check if a date is in the past
  const isPastDay = (dateStr: string) => today ? parseDate(dateStr) < parseDate(today) : false;

  // Background grid component to show past day columns
  const DayBackgroundGrid = ({ height }: { height: number }) => (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: chartLeftOffset,
        right: 0,
        height,
        display: 'flex',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      {dailyCapacities?.map((cap, idx) => (
        <Box
          key={`bg-${idx}`}
          sx={{
            width: dayWidth,
            minWidth: dayWidth,
            height: '100%',
            bgcolor: isPastDay(cap.date) ? 'rgba(0,0,0,0.08)' : 'transparent',
          }}
        />
      ))}
    </Box>
  );

  if (labelOnly) {
    // Render just the label column
    return (
      <Box>
        {/* Epic label */}
        <Box
          sx={{
            minHeight: rowHeight,
            display: 'flex',
            alignItems: 'center',
            px: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: epicColor,
          }}
        >
          <IconButton size="small" onClick={onToggleExpanded} sx={{ mr: 0.5, color: 'white', flexShrink: 0 }}>
            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {epicUrl ? (
              <Link
                href={epicUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'white',
                  textDecoration: 'underline',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'block',
                  '&:hover': { color: 'rgba(255,255,255,0.9)' },
                }}
              >
                {epic.key} | {epic.summary}
              </Link>
            ) : (
              <Box sx={{ color: 'white', fontSize: 12, fontWeight: 500 }}>
                {epic.key} | {epic.summary}
              </Box>
            )}
          </Box>
        </Box>

        {/* Expanded content: Previous block, tickets, Future block */}
        <Collapse in={expanded}>
          {/* Previous block label */}
          {epic.previousBlock && (
            <Box
              sx={{
                minHeight: rowHeight,
                display: 'flex',
                alignItems: 'center',
                pl: 2,
                pr: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'rgba(0,0,0,0.04)',
              }}
            >
              <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Previous
                </Typography>
                {' '}| {epic.previousBlock.tickets.length} tickets | {epic.previousBlock.totalDevDays} dev days
              </Box>
            </Box>
          )}

          {/* Ticket labels */}
          {sortedTickets.map((ticket) => {
            const ticketUrl = getJiraUrl(ticket.key);
            // Check if ticket should be finished by now based on endDate
            const finishedOnDate = parseDate(ticket.endDate);
            const todayDt = today ? parseDate(today) : null;
            const isPastTicket = todayDt ? finishedOnDate < todayDt : false;

            return (
              <Box
                key={ticket.key}
                sx={{
                  minHeight: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  pl: 2,
                  pr: 1,
                  py: 0.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                  gap: 1,
                  opacity: isPastTicket ? 0.5 : 1,
                  bgcolor: isPastTicket ? 'rgba(0,0,0,0.04)' : 'transparent',
                }}
              >
                {/* Assignee avatar */}
                <Tooltip title={ticket.assignee || 'Unassigned'} arrow placement="top">
                  <Avatar
                    src={ticket.assigneeAvatarUrl}
                    alt={ticket.assignee}
                    sx={{ width: 24, height: 24, fontSize: 10, flexShrink: 0 }}
                  >
                    {ticket.assignee ? ticket.assignee.charAt(0).toUpperCase() : '?'}
                  </Avatar>
                </Tooltip>

                {/* Ticket key and summary */}
                {ticketUrl ? (
                  <Link
                    href={ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: 'text.primary',
                      textDecoration: 'underline',
                      fontSize: 11,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      '&:hover': { color: 'primary.main' },
                    }}
                  >
                    {ticket.key} | {ticket.summary}
                  </Link>
                ) : (
                  <Box sx={{ fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ticket.key} | {ticket.summary}
                  </Box>
                )}

                {/* Status chip */}
                <Chip
                  label={ticket.status}
                  size="small"
                  color={getStatusColor(ticket.status)}
                  sx={{
                    height: 20,
                    fontSize: 9,
                    flexShrink: 0,
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              </Box>
            );
          })}

          {/* Future block label */}
          {epic.futureBlock && (
            <Box
              sx={{
                minHeight: rowHeight,
                display: 'flex',
                alignItems: 'center',
                pl: 2,
                pr: 1,
                py: 0.5,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: 'rgba(0,0,0,0.04)',
              }}
            >
              <Box sx={{ fontSize: 11, color: 'text.secondary' }}>
                <Typography component="span" sx={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase' }}>
                  Future
                </Typography>
                {' '}| {epic.futureBlock.tickets.length} tickets | {epic.futureBlock.totalDevDays} dev days
              </Box>
            </Box>
          )}
        </Collapse>
      </Box>
    );
  }

  // Use actual dates from scheduled epic
  const projectedCompleteDate = parseDate(epic.endDate);

  const formatDate = (dt: { toFormat: (fmt: string) => string }) => dt.toFormat('MMM d, yyyy');

  const epicTooltipContent = (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" fontWeight="bold">
        {epic.key}: {epic.summary}
      </Typography>
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Dev Days:</Typography>
        <Typography variant="caption">{epic.totalDevDays}</Typography>

        <Typography variant="caption" color="text.secondary">Projected Complete:</Typography>
        <Typography variant="caption">{formatDate(projectedCompleteDate)}</Typography>
      </Box>
    </Box>
  );

  // Render the chart area with bars
  return (
    <Box>
      {/* Epic summary bar */}
      <Box
        sx={{
          minHeight: rowHeight,
          height: rowHeight,
          position: 'relative',
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: epicColor,
        }}
      >
        <Tooltip
          title={epicTooltipContent}
          arrow
          placement="top"
          slotProps={{
            tooltip: {
              sx: { bgcolor: 'background.paper', color: 'text.primary', boxShadow: 2 },
            },
            arrow: { sx: { color: 'background.paper' } },
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: epicLeft,
              width: Math.max(epicWidth, 4),
              height: rowHeight - 8,
              top: 4,
              bgcolor: 'rgba(255,255,255,0.3)',
              borderRadius: 1,
              cursor: 'default',
            }}
          />
        </Tooltip>
      </Box>

      {/* Expanded content: Previous block, tickets, Future block */}
      <Collapse in={expanded}>
        {/* Previous block bar */}
        {epic.previousBlock && (
          <Box
            sx={{
              minHeight: rowHeight,
              height: rowHeight,
              position: 'relative',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <DayBackgroundGrid height={rowHeight} />
            <AggregateBlockBar
              block={epic.previousBlock}
              dayWidth={dayWidth}
              rowHeight={rowHeight}
              epicColor={epicColor}
              totalDays={totalDays}
              chartLeftOffset={chartLeftOffset}
            />
          </Box>
        )}

        {/* Ticket bars */}
        {sortedTickets.map((ticket) => (
          <Box
            key={ticket.key}
            sx={{
              minHeight: rowHeight,
              height: rowHeight,
              position: 'relative',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <DayBackgroundGrid height={rowHeight} />
            <TicketBar
              ticket={ticket}
              dayWidth={dayWidth}
              rowHeight={rowHeight}
              epicColor={epicColor}
              chartLeftOffset={chartLeftOffset}
            />
          </Box>
        ))}

        {/* Future block bar */}
        {epic.futureBlock && (
          <Box
            sx={{
              minHeight: rowHeight,
              height: rowHeight,
              position: 'relative',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <DayBackgroundGrid height={rowHeight} />
            <AggregateBlockBar
              block={epic.futureBlock}
              dayWidth={dayWidth}
              rowHeight={rowHeight}
              epicColor={epicColor}
              totalDays={totalDays}
              chartLeftOffset={chartLeftOffset}
            />
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default EpicRow;
