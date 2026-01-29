'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import type { ScheduledEpic, ScheduledTicket } from '@/shared/types';

interface DependencyLinesProps {
  epics: ScheduledEpic[];
  expandedEpics: Record<string, boolean>;
  dayWidth: number;
  rowHeight: number;
}

interface TicketPosition {
  key: string;
  left: number;
  right: number;
  centerY: number;
  blockedBy: string[];
}

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
}: DependencyLinesProps) => {
  // Calculate all ticket positions and dependency connections
  const { ticketPositions, connections, svgHeight } = useMemo(() => {
    const positions: Map<string, TicketPosition> = new Map();
    const conns: { from: TicketPosition; to: TicketPosition }[] = [];

    // Calculate Y offset for each ticket row
    let currentY = 0;

    for (const epic of epics) {
      // Epic summary row
      currentY += rowHeight;

      // If epic is expanded, add ticket rows
      if (expandedEpics[epic.key] ?? true) {
        // Sort tickets same way as EpicRow does
        const sortedTickets = [...epic.tickets].sort((a: ScheduledTicket, b: ScheduledTicket) => {
          if (a.parallelGroup !== b.parallelGroup) {
            return a.parallelGroup - b.parallelGroup;
          }
          return b.criticalPathWeight - a.criticalPathWeight;
        });

        for (const ticket of sortedTickets) {
          const left = ticket.startDay * dayWidth;
          const right = ticket.endDay * dayWidth;
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
      }
    }

    // Build connections based on blockedBy relationships
    for (const [, ticketPos] of positions) {
      for (const blockerKey of ticketPos.blockedBy) {
        const blockerPos = positions.get(blockerKey);
        if (blockerPos) {
          conns.push({
            from: blockerPos,
            to: ticketPos,
          });
        }
      }
    }

    return {
      ticketPositions: positions,
      connections: conns,
      svgHeight: currentY,
    };
  }, [epics, expandedEpics, dayWidth, rowHeight]);

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
        zIndex: 10,
      }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <defs>
          {/* Arrowhead marker */}
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
        </defs>

        {connections.map((conn, index) => {
          const path = generateDependencyPath(
            conn.from.right,
            conn.from.centerY,
            conn.to.left,
            conn.to.centerY,
            dayWidth
          );

          return (
            <path
              key={`dep-${conn.from.key}-${conn.to.key}-${index}`}
              d={path}
              fill="none"
              stroke="#888"
              strokeWidth={1.5}
              markerEnd="url(#arrowhead)"
              opacity={0.6}
            />
          );
        })}
      </svg>
    </Box>
  );
};

export default DependencyLines;
