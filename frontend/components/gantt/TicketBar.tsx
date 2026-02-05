'use client';

import {useState} from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';
import LockIcon from '@mui/icons-material/Lock';
import type {ScheduledTicket} from '@/shared/types';
import {parseDate} from '@/shared/utils/dates';

interface TicketBarProps {
    ticket: ScheduledTicket;
    dayWidth: number;
    rowHeight: number;
    epicColor: string;
    chartLeftOffset?: number;
}

/**
 * Darken a hex color by a percentage (0-100)
 */
const darkenColor = (hex: string, percent: number): string => {
    // Remove # if present
    const cleanHex = hex.replace('#', '');

    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    // Darken by percentage
    const factor = 1 - percent / 100;
    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    // Convert back to hex
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
};

// Gold color for missing estimates
const GOLD_COLOR = '#D3AF37';

/**
 * Get the appropriate color for a ticket based on its status
 */
const getTicketColor = (ticket: ScheduledTicket, epicColor: string): string => {
    if (ticket.isMissingEstimate) {
        return GOLD_COLOR;
    }
    // Normal tickets are 10% darker than their epic color
    return darkenColor(epicColor, 10);
};

const TicketBar = ({ticket, dayWidth, rowHeight, epicColor, chartLeftOffset = 0}: TicketBarProps) => {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const left = chartLeftOffset + ticket.startDay * dayWidth;
    const width = Math.max((ticket.endDay - ticket.startDay) * dayWidth, 20);
    // Get color based on ticket status (gold for missing estimate)
    const color = getTicketColor(ticket, epicColor);

    // Use actual dates from the scheduled ticket
    const ticketStartDt = parseDate(ticket.startDate);
    const ticketEndDt = parseDate(ticket.endDate);

    const formatDate = (dt: { toFormat: (fmt: string) => string }) => dt.toFormat('MMM d');

    // JIRA URL (assuming standard JIRA Cloud URL pattern)
    const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL || '';
    const jiraUrl = jiraBaseUrl ? `${jiraBaseUrl}/browse/${ticket.key}` : null;

    const tooltipContent = (
        <Box sx={{p: 1, maxWidth: 280}}>
            <Typography variant="subtitle2" fontWeight="bold">
                {ticket.key}: {ticket.summary}
            </Typography>
            {ticket.hasConstraintViolation && (
                <Typography
                    variant="caption"
                    sx={{color: '#d32f2f', fontWeight: 'bold', display: 'block', mt: 0.5}}
                >
                    ⚠ Timeline constraint violated - ticket does not fit in sprint capacity
                </Typography>
            )}
            {ticket.isMissingEstimate && (
                <Typography
                    variant="caption"
                    sx={{color: GOLD_COLOR, fontWeight: 'bold', display: 'block', mt: 0.5}}
                >
                    ⚠ Missing estimate - defaulted to {ticket.devDays} points
                </Typography>
            )}
            {ticket.isOnCriticalPath && (
                <Typography
                    variant="caption"
                    sx={{color: '#000', fontWeight: 'bold', display: 'block', mt: 0.5}}
                >
                    ★ Critical Path
                </Typography>
            )}
            {ticket.isLocked && (
                <Typography
                    variant="caption"
                    sx={{color: 'text.secondary', fontWeight: 'bold', display: 'block', mt: 0.5}}
                >
                    🔒 Locked (active/closed, or future pinned date)
                </Typography>
            )}
            <Box sx={{mt: 1, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 0.5}}>
                <Typography variant="caption" color="text.secondary">Status:</Typography>
                <Typography variant="caption">{ticket.status}</Typography>

                <Typography variant="caption" color="text.secondary">Dev Days:</Typography>
                <Typography variant="caption">{ticket.devDays}</Typography>

                <Typography variant="caption" color="text.secondary">Start On:</Typography>
                <Typography variant="caption">{formatDate(ticketStartDt)}</Typography>
                <Typography variant="caption" color="text.secondary">Finish On:</Typography>
                <Typography variant="caption">{formatDate(ticketEndDt)}</Typography>

                {ticket.assignee && (
                    <>
                        <Typography variant="caption" color="text.secondary">Assignee:</Typography>
                        <Typography variant="caption">{ticket.assignee}</Typography>
                    </>
                )}

                {ticket.blockedBy && ticket.blockedBy.length > 0 && (
                    <>
                        <Typography variant="caption" color="text.secondary">Blocked by:</Typography>
                        <Typography variant="caption">{ticket.blockedBy.join(', ')}</Typography>
                    </>
                )}
            </Box>
            {jiraUrl && (
                <Link
                    href={jiraUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{display: 'block', mt: 1, fontSize: 12}}
                >
                    Open in JIRA →
                </Link>
            )}
        </Box>
    );

    return (
        <Tooltip
            title={tooltipContent}
            arrow
            open={tooltipOpen}
            onOpen={() => setTooltipOpen(true)}
            onClose={() => setTooltipOpen(false)}
            placement="top"
            slotProps={{
                tooltip: {
                    sx: {bgcolor: 'background.paper', color: 'text.primary', boxShadow: 2},
                },
                arrow: {sx: {color: 'background.paper'}},
            }}
        >
            <Box
                onClick={() => jiraUrl && window.open(jiraUrl, '_blank')}
                sx={{
                    position: 'absolute',
                    left,
                    width,
                    height: rowHeight - 8,
                    top: 4,
                    bgcolor: color,
                    borderRadius: 1,
                    cursor: jiraUrl ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    px: 0.5,
                    overflow: 'hidden',
                    transition: 'transform 0.1s, box-shadow 0.1s',
                    // Border priority: constraint violation (red) > critical path (black) > none
                    border: ticket.hasConstraintViolation
                        ? '3px solid #d32f2f'
                        : ticket.isOnCriticalPath
                            ? '3px solid #000'
                            : 'none',
                    boxSizing: 'border-box',
                    '&:hover': {
                        transform: 'scale(1.02)',
                        boxShadow: 2,
                        zIndex: 1,
                    },
                }}
            >
                <Typography
                    variant="caption"
                    sx={{
                        color: 'white',
                        fontWeight: 'medium',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 10,
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        flexGrow: 1,
                    }}
                >
                    {ticket.key}
                </Typography>
                {ticket.isLocked && (
                    <LockIcon
                        sx={{
                            fontSize: 12,
                            color: 'rgba(255,255,255,0.85)',
                            flexShrink: 0,
                            ml: 0.25,
                        }}
                    />
                )}
            </Box>
        </Tooltip>
    );
};

export default TicketBar;
