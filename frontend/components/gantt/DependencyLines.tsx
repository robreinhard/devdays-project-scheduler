'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import type { ScheduledEpic, ScheduledTicket } from '@/shared/types';

interface DependencyLinesProps {
  epics: ScheduledEpic[];
  expandedEpics: Record<string, boolean>;
  dayWidth: number;
  rowHeight: number;
  totalDays: number;
  chartLeftOffset?: number;
  sectionHeaderHeight?: number;
  hasCommits?: boolean;
  hasStretches?: boolean;
  hasOthers?: boolean;
}

interface TicketPosition {
  key: string;
  left: number;
  right: number;
  centerY: number;
  blockedBy: string[];
}

// Block width in days (must match AggregateBlockBar)
const BLOCK_WIDTH_DAYS = 3;

/**
 * Generate an SVG path for a stepped dependency line with curved corners
 * From right-center of source to left-center of target
 *
 * Two patterns:
 * 1. Subsequent day (small horizontal gap): double-step Z pattern
 * 2. Otherwise: simple step pattern
 *
 * Arrow always enters target horizontally
 */
const generateDependencyPath = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  dayWidth: number
): string => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const cornerRadius = 8;
  const minHorizontal = 4; // Minimum horizontal line when entering/exiting a ticket

  // If same row, just draw horizontal line
  if (Math.abs(dy) < 1) {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }

  const goingDown = dy > 0;
  const yDir = goingDown ? 1 : -1;
  const absY = Math.abs(dy);

  // Check if target is to the left of or too close to source (need to loop back)
  // Exit must go RIGHT, entry must come from LEFT
  const needsLoopBack = dx < minHorizontal + cornerRadius * 2 + minHorizontal;

  if (needsLoopBack) {
    // Loop-back pattern: exit right, go down/up, come back left, enter from left
    // Shape:  ---+
    //            |
    //    +-------+
    //    |
    //    +---> Target
    const exitX = fromX + minHorizontal + cornerRadius;
    const entryX = toX - minHorizontal - cornerRadius;
    const loopX = Math.max(exitX, entryX) + 15; // How far right to go before looping

    let path = `M ${fromX} ${fromY}`;

    // Exit horizontally to the right
    path += ` L ${loopX - cornerRadius} ${fromY}`;

    // Curve down/up
    path += ` Q ${loopX} ${fromY}, ${loopX} ${fromY + yDir * cornerRadius}`;

    // Vertical segment partway
    const midY = fromY + dy / 2;
    path += ` L ${loopX} ${midY - yDir * cornerRadius}`;

    // Curve to go left
    path += ` Q ${loopX} ${midY}, ${loopX - cornerRadius} ${midY}`;

    // Horizontal segment going left
    path += ` L ${entryX + cornerRadius} ${midY}`;

    // Curve down/up again
    path += ` Q ${entryX} ${midY}, ${entryX} ${midY + yDir * cornerRadius}`;

    // Vertical to target row
    path += ` L ${entryX} ${toY - yDir * cornerRadius}`;

    // Curve to enter horizontally from left
    path += ` Q ${entryX} ${toY}, ${entryX + cornerRadius} ${toY}`;

    // Final horizontal to target (left-to-right entry)
    path += ` L ${toX} ${toY}`;

    return path;
  }

  // Check if this is a "subsequent day" scenario (target starts right after source ends)
  const isSubsequentDay = dx < dayWidth * 1.2;

  // Calculate positions for Z pattern
  const stepOutX = fromX + Math.max(15, minHorizontal + cornerRadius);
  // Ensure entry is always left-to-right: stepInX + cornerRadius must be < toX
  const stepInX = toX - Math.max(15, minHorizontal + cornerRadius);

  // Check if Z pattern is viable: need enough space for middle horizontal to go left-to-right
  const canDoZPattern = isSubsequentDay &&
                        absY > cornerRadius * 6 &&
                        stepInX > stepOutX + 2 * cornerRadius;

  if (canDoZPattern) {
    // Double-step Z pattern for subsequent day
    // Shape: --- | -- | --->
    const midY = fromY + dy / 2;

    let path = `M ${fromX} ${fromY}`;

    // First horizontal segment (exit to the right)
    path += ` L ${stepOutX - cornerRadius} ${fromY}`;

    // First curve (turn down/up)
    path += ` Q ${stepOutX} ${fromY}, ${stepOutX} ${fromY + yDir * cornerRadius}`;

    // First vertical segment
    path += ` L ${stepOutX} ${midY - yDir * cornerRadius}`;

    // Second curve (turn horizontal)
    path += ` Q ${stepOutX} ${midY}, ${stepOutX + cornerRadius} ${midY}`;

    // Middle horizontal segment (always left-to-right)
    path += ` L ${stepInX - cornerRadius} ${midY}`;

    // Third curve (turn down/up again)
    path += ` Q ${stepInX} ${midY}, ${stepInX} ${midY + yDir * cornerRadius}`;

    // Second vertical segment
    path += ` L ${stepInX} ${toY - yDir * cornerRadius}`;

    // Fourth curve (turn horizontal for arrow entry)
    path += ` Q ${stepInX} ${toY}, ${stepInX + cornerRadius} ${toY}`;

    // Final horizontal to target (entry, always left-to-right)
    path += ` L ${toX} ${toY}`;

    return path;
  } else {
    // Simple step pattern: --- | ---->
    // midX must be: > fromX + minHorizontal + cornerRadius (exit goes right)
    //               < toX - minHorizontal - cornerRadius (entry comes from left)
    const minMidX = fromX + minHorizontal + cornerRadius;
    const maxMidX = toX - minHorizontal - cornerRadius;
    const midX = Math.max(minMidX, Math.min(maxMidX, fromX + dx / 2));

    let path = `M ${fromX} ${fromY}`;

    // Horizontal to just before the curve (exit to the right)
    path += ` L ${midX - cornerRadius} ${fromY}`;

    // Curve down (or up)
    path += ` Q ${midX} ${fromY}, ${midX} ${fromY + yDir * cornerRadius}`;

    // Vertical segment
    path += ` L ${midX} ${toY - yDir * cornerRadius}`;

    // Curve to horizontal (for arrow entry)
    path += ` Q ${midX} ${toY}, ${midX + cornerRadius} ${toY}`;

    // Final horizontal to target (entry, always left-to-right)
    path += ` L ${toX} ${toY}`;

    return path;
  }
};

const DependencyLines = ({
  epics,
  expandedEpics,
  dayWidth,
  rowHeight,
  totalDays,
  chartLeftOffset = 0,
  sectionHeaderHeight = 0,
  hasCommits = false,
  hasStretches = false,
  hasOthers = false,
}: DependencyLinesProps) => {
  // Calculate all ticket positions and dependency connections
  const { ticketPositions, connections, svgHeight } = useMemo(() => {
    const positions: Map<string, TicketPosition> = new Map();
    const conns: { from: TicketPosition; to: TicketPosition }[] = [];

    // Track which ticket keys are in Previous blocks (for dependency resolution)
    const previousBlockTicketKeys = new Map<string, string>(); // ticketKey -> epicKey

    // First pass: collect all Previous block ticket keys
    for (const epic of epics) {
      if (epic.previousBlock) {
        for (const ticket of epic.previousBlock.tickets) {
          previousBlockTicketKeys.set(ticket.key, epic.key);
        }
      }
    }

    // Sort epics to match render order in GanttChart: commits, then stretches, then others
    const commitEpics = epics.filter(e => e.commitType === 'commit');
    const stretchEpics = epics.filter(e => e.commitType === 'stretch');
    const otherEpics = epics.filter(e => e.commitType === 'none');
    const sortedEpics = [...commitEpics, ...stretchEpics, ...otherEpics];

    // Calculate Y offset for each ticket row
    let currentY = 0;

    for (let i = 0; i < sortedEpics.length; i++) {
      const epic = sortedEpics[i];

      // Add section header height at the start of each section
      if (i === 0 && hasCommits && commitEpics.length > 0) {
        currentY += sectionHeaderHeight;
      } else if (i === commitEpics.length && hasStretches && stretchEpics.length > 0) {
        currentY += sectionHeaderHeight;
      } else if (i === commitEpics.length + stretchEpics.length && hasOthers && otherEpics.length > 0) {
        currentY += sectionHeaderHeight;
      }

      // Epic summary row
      currentY += rowHeight;

      // If epic is expanded, add rows for Previous block, tickets, and Future block
      if (expandedEpics[epic.key] ?? true) {
        // Previous block row (if exists)
        if (epic.previousBlock) {
          const prevBlockWidth = BLOCK_WIDTH_DAYS * dayWidth;
          const prevBlockLeft = 0; // At start of chart area
          const centerY = currentY + rowHeight / 2;

          // Use synthetic key for Previous block: PREV:{epicKey}
          const prevBlockKey = `PREV:${epic.key}`;
          positions.set(prevBlockKey, {
            key: prevBlockKey,
            left: prevBlockLeft,
            right: prevBlockLeft + prevBlockWidth,
            centerY,
            blockedBy: [],
          });

          currentY += rowHeight;
        }

        // Sort tickets same way as EpicRow does
        const sortedTickets = [...epic.tickets].sort((a: ScheduledTicket, b: ScheduledTicket) => {
          if (a.parallelGroup !== b.parallelGroup) {
            return a.parallelGroup - b.parallelGroup;
          }
          return b.criticalPathWeight - a.criticalPathWeight;
        });

        for (const ticket of sortedTickets) {
          const left = chartLeftOffset + ticket.startDay * dayWidth;
          const right = chartLeftOffset + ticket.endDay * dayWidth;
          const centerY = currentY + rowHeight / 2;

          positions.set(ticket.key, {
            key: ticket.key,
            left,
            right,
            centerY,
            blockedBy: ticket.blockedBy || [],
          });

          currentY += rowHeight;
        }

        // Future block row (if exists)
        if (epic.futureBlock) {
          const futureBlockWidth = BLOCK_WIDTH_DAYS * dayWidth;
          const futureBlockLeft = chartLeftOffset + totalDays * dayWidth;
          const centerY = currentY + rowHeight / 2;

          // Use synthetic key for Future block: FUTURE:{epicKey}
          const futureBlockKey = `FUTURE:${epic.key}`;
          positions.set(futureBlockKey, {
            key: futureBlockKey,
            left: futureBlockLeft,
            right: futureBlockLeft + futureBlockWidth,
            centerY,
            blockedBy: [],
          });

          currentY += rowHeight;
        }
      }
    }

    // Build connections based on blockedBy relationships
    for (const [, ticketPos] of positions) {
      // Skip synthetic block entries (they don't have blockers themselves)
      if (ticketPos.key.startsWith('PREV:') || ticketPos.key.startsWith('FUTURE:')) continue;

      for (const blockerKey of ticketPos.blockedBy) {
        // Check if blocker is in positions (scheduled ticket)
        const blockerPos = positions.get(blockerKey);
        if (blockerPos) {
          conns.push({
            from: blockerPos,
            to: ticketPos,
          });
        } else {
          // Check if blocker is in a Previous block
          const blockerEpicKey = previousBlockTicketKeys.get(blockerKey);
          if (blockerEpicKey) {
            // Draw line from that epic's Previous block
            const prevBlockPos = positions.get(`PREV:${blockerEpicKey}`);
            if (prevBlockPos) {
              conns.push({
                from: prevBlockPos,
                to: ticketPos,
              });
            }
          }
          // Check if blocker is in a Future block (shouldn't happen - future can't block scheduled)
        }
      }
    }

    // Build connections FROM scheduled tickets TO Future blocks
    // A scheduled ticket connects to Future block if any Future ticket lists it as a blocker
    for (const epic of epics) {
      if (!epic.futureBlock || !(expandedEpics[epic.key] ?? true)) continue;

      const futureBlockPos = positions.get(`FUTURE:${epic.key}`);
      if (!futureBlockPos) continue;

      // Check each future ticket's blockedBy (from the aggregate data)
      // Since AggregateTicket doesn't have blockedBy, we need to check if any scheduled ticket
      // would naturally block future tickets based on the dependency chain
      // For now, we'll draw a line if the last scheduled ticket in the epic leads to future work
      const scheduledTickets = epic.tickets;
      if (scheduledTickets.length > 0) {
        // Find the ticket(s) with the highest endDay - these are the "last" tickets
        const maxEndDay = Math.max(...scheduledTickets.map(t => t.endDay));
        const lastTickets = scheduledTickets.filter(t => t.endDay === maxEndDay);

        // Draw lines from the last scheduled tickets to the Future block
        for (const lastTicket of lastTickets) {
          const lastTicketPos = positions.get(lastTicket.key);
          if (lastTicketPos) {
            conns.push({
              from: lastTicketPos,
              to: futureBlockPos,
            });
          }
        }
      }
    }

    return {
      ticketPositions: positions,
      connections: conns,
      svgHeight: currentY,
    };
  }, [epics, expandedEpics, dayWidth, rowHeight, totalDays, chartLeftOffset, sectionHeaderHeight, hasCommits, hasStretches, hasOthers]);

  // Calculate SVG width based on the rightmost ticket
  const svgWidth = useMemo(() => {
    let maxRight = 0;
    for (const [, pos] of ticketPositions) {
      if (pos.right > maxRight) {
        maxRight = pos.right;
      }
    }
    return maxRight + 50; // Add some padding
  }, [ticketPositions]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (connections.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: svgWidth,
        height: svgHeight,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <defs>
          {/* Drop shadow filter for hover state */}
          <filter id="dropShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
          </filter>
          {/* Arrowhead marker - default gray */}
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#888" />
          </marker>
          {/* Arrowhead marker - hover black */}
          <marker
            id="arrowhead-hover"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <polygon points="0 0, 8 3, 0 6" fill="#000" />
          </marker>
        </defs>

        {connections.map((conn, index) => {
          const path = generateDependencyPath(
            conn.from.right,
            conn.from.centerY,
            conn.to.left,
            conn.to.centerY,
            dayWidth
          );

          const isHovered = hoveredIndex === index;

          return (
            <g key={`dep-${conn.from.key}-${conn.to.key}-${index}`}>
              {/* Invisible wider hit area for easier hovering */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
              {/* Visible line */}
              <path
                d={path}
                fill="none"
                stroke={isHovered ? '#000' : '#888'}
                strokeWidth={isHovered ? 2 : 1.5}
                markerEnd={isHovered ? 'url(#arrowhead-hover)' : 'url(#arrowhead)'}
                opacity={isHovered ? 1 : 0.6}
                filter={isHovered ? 'url(#dropShadow)' : undefined}
                style={{
                  pointerEvents: 'none',
                  transition: 'stroke 0.1s, stroke-width 0.1s, opacity 0.1s, filter 0.1s',
                }}
              />
            </g>
          );
        })}
      </svg>
    </Box>
  );
};

export default DependencyLines;
