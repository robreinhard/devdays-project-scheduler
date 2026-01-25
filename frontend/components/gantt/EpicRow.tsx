'use client';

import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { ScheduledEpic } from '@/shared/types';
import TicketBar from './TicketBar';

// JIRA base URL from environment
const JIRA_BASE_URL = process.env.NEXT_PUBLIC_JIRA_BASE_URL || '';

const getJiraUrl = (key: string): string | null => {
  return JIRA_BASE_URL ? `${JIRA_BASE_URL}/browse/${key}` : null;
};

interface EpicRowProps {
  epic: ScheduledEpic;
  dayWidth: number;
  rowHeight: number;
  startDate: Date;
  labelOnly?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  epicColor: string;
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
}: EpicRowProps) => {

  // Epic summary bar dimensions
  const epicLeft = epic.startDay * dayWidth;
  const epicWidth = (epic.endDay - epic.startDay) * dayWidth;

  const epicUrl = getJiraUrl(epic.key);

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

        {/* Ticket labels */}
        <Collapse in={expanded}>
          {epic.tickets.map((ticket) => {
            const ticketUrl = getJiraUrl(ticket.key);
            return (
              <Box
                key={ticket.key}
                sx={{
                  minHeight: rowHeight,
                  display: 'flex',
                  alignItems: 'center',
                  pl: 4,
                  pr: 1,
                  py: 0.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
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
                      '&:hover': { color: 'primary.main' },
                    }}
                  >
                    {ticket.key} | {ticket.summary}
                  </Link>
                ) : (
                  <Box sx={{ fontSize: 11, flex: 1 }}>
                    {ticket.key} | {ticket.summary}
                  </Box>
                )}
              </Box>
            );
          })}
        </Collapse>
      </Box>
    );
  }

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
        <Box
          sx={{
            position: 'absolute',
            left: epicLeft,
            width: Math.max(epicWidth, 4),
            height: rowHeight - 8,
            top: 4,
            bgcolor: 'rgba(255,255,255,0.3)',
            borderRadius: 1,
          }}
        />
      </Box>

      {/* Ticket bars */}
      <Collapse in={expanded}>
        {epic.tickets.map((ticket) => (
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
            <TicketBar
              ticket={ticket}
              dayWidth={dayWidth}
              rowHeight={rowHeight}
              projectStartDate={startDate}
              epicColor={epicColor}
            />
          </Box>
        ))}
      </Collapse>
    </Box>
  );
};

export default EpicRow;
