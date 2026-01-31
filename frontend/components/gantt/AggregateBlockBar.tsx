'use client';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import type { AggregateBlock } from '@/shared/types';

interface AggregateBlockBarProps {
  block: AggregateBlock;
  dayWidth: number;
  rowHeight: number;
  epicColor: string;
  totalDays: number;
  chartLeftOffset?: number; // Offset for Previous blocks positioning
}

// Block width in days
const BLOCK_WIDTH_DAYS = 3;

const AggregateBlockBar = ({
  block,
  dayWidth,
  rowHeight,
  epicColor,
  totalDays,
  chartLeftOffset = 0,
}: AggregateBlockBarProps) => {
  const width = BLOCK_WIDTH_DAYS * dayWidth;

  // Position based on block type
  // Previous: At start of chart (position 0, before the timeline which starts at chartLeftOffset)
  // Future: End of timeline (after all sprints, accounting for offset)
  const left = block.type === 'previous'
    ? 0
    : chartLeftOffset + totalDays * dayWidth;

  const tooltipContent = (
    <Box sx={{ p: 1, maxWidth: 300 }}>
      <Typography variant="subtitle2" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
        {block.type === 'previous' ? 'Previous Work' : 'Future Work'}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {block.tickets.length} ticket{block.tickets.length !== 1 ? 's' : ''} | {block.totalDevDays} dev days
      </Typography>
      <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
        {block.tickets.map((ticket) => (
          <Box key={ticket.key} sx={{ mb: 0.5, fontSize: 11 }}>
            <Typography variant="caption" fontWeight="medium">
              {ticket.key}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({ticket.devDays}d) {ticket.summary}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Tooltip
      title={tooltipContent}
      arrow
      placement="top"
      slotProps={{
        tooltip: {
          sx: { bgcolor: 'background.paper', color: 'text.primary', boxShadow: 2, maxWidth: 320 },
        },
        arrow: { sx: { color: 'background.paper' } },
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left,
          width,
          height: rowHeight - 8,
          top: 4,
          bgcolor: '#000',
          border: `3px solid ${epicColor}`,
          borderRadius: 1,
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          transition: 'transform 0.1s, box-shadow 0.1s',
          '&:hover': {
            transform: 'scale(1.02)',
            boxShadow: 2,
            zIndex: 1,
          },
        }}
      >
        <Typography
          sx={{
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {block.type === 'previous' ? 'PREVIOUS' : 'FUTURE'}
        </Typography>
      </Box>
    </Tooltip>
  );
};

export default AggregateBlockBar;
