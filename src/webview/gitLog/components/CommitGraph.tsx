import React from 'react';
import type { LaidOutCommit, Segment } from '../utils/graphLayout';
import { LANE_WIDTH, ROW_HEIGHT, DOT_RADIUS, laneX } from '../utils/graphLayout';
import { anonymousLaneColor } from '../utils/refs';

export { laneX };

const STROKE = 1.5;
const D = ROW_HEIGHT * 0.8;

// ─── Overlay SVG ─────────────────────────────────────────────────────────────

interface GraphOverlayProps {
  segments: Segment[];
  visibleRows: Array<{ index: number; start: number }>;
  graphWidth: number;
  laneWidth?: number;
  offsetX?: number;
}

export const GraphOverlay = React.memo(function GraphOverlay({
  segments, visibleRows, graphWidth, laneWidth = LANE_WIDTH, offsetX = 0,
}: GraphOverlayProps) {
  if (visibleRows.length === 0) return null;

  const firstVisible = visibleRows[0].index;
  const lastVisible = visibleRows[visibleRows.length - 1].index;
  const renderTop = visibleRows[0].start;
  const renderBottom = visibleRows[visibleRows.length - 1].start + ROW_HEIGHT;

  const rowYMap = new Map<number, number>();
  for (const r of visibleRows) rowYMap.set(r.index, r.start + ROW_HEIGHT / 2);
  function getY(row: number): number {
    return rowYMap.get(row) ?? row * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  const branchPaths = new Map<number, { color: string; path: string; lastY: number; lastX: number }>();

  for (const s of segments) {
    if (s.p2y < firstVisible || s.p1y > lastVisible) continue;
    const x1 = laneX(s.p1x, laneWidth);
    const x2 = laneX(s.p2x, laneWidth);
    let entry = branchPaths.get(s.branchId);

    if (x1 === x2) {
      const y1 = Math.max(renderTop, getY(s.p1y));
      const y2 = Math.min(renderBottom, getY(s.p2y));
      if (!entry) {
        entry = { color: s.color, path: `M${x1.toFixed(1)},${y1.toFixed(1)}`, lastY: y1, lastX: x1 };
        branchPaths.set(s.branchId, entry);
      } else if (entry.lastX !== x1 || entry.lastY !== y1) {
        entry.path += `M${x1.toFixed(1)},${y1.toFixed(1)}`;
      }
      entry.path += `L${x2.toFixed(1)},${y2.toFixed(1)}`;
      entry.lastX = x2; entry.lastY = y2;
    } else {
      for (let row = Math.max(s.p1y, firstVisible - 1); row < Math.min(s.p2y, lastVisible + 1); row++) {
        const y1 = getY(row);
        const y2 = getY(row + 1);
        if (!entry) {
          entry = { color: s.color, path: `M${x1.toFixed(1)},${y1.toFixed(1)}`, lastY: y1, lastX: x1 };
          branchPaths.set(s.branchId, entry);
        } else if (entry.lastX !== x1 || entry.lastY !== y1) {
          entry.path += `M${x1.toFixed(1)},${y1.toFixed(1)}`;
        }
        entry.path += `C${x1.toFixed(1)},${(y1 + D).toFixed(1)} ${x2.toFixed(1)},${(y2 - D).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
        entry.lastX = x2; entry.lastY = y2;
      }
    }
  }

  const pathElements: React.ReactNode[] = [];
  let i = 0;
  for (const [, { color, path }] of branchPaths) {
    pathElements.push(<path key={i++} d={path} stroke={color} strokeWidth={STROKE} fill="none" />);
  }

  return (
    <svg width={graphWidth} height={renderBottom - renderTop} style={{
      position: 'absolute', top: renderTop, left: offsetX,
      pointerEvents: 'none', overflow: 'hidden', zIndex: 2,
    }}>
      <g transform={`translate(0, ${-renderTop})`}>{pathElements}</g>
    </svg>
  );
});

// ─── Per-row dot + text mask ──────────────────────────────────────────────────

interface CommitDotProps {
  commit: LaidOutCommit;
  isSelected: boolean;
  laneWidth?: number;
  offsetX?: number;
}

export const CommitDot = React.memo(function CommitDot({ commit, isSelected, laneWidth = LANE_WIDTH, offsetX = 0 }: CommitDotProps) {
  const dotCol = commit.lane ?? 0;
  const dotColor = commit.dotColor ?? anonymousLaneColor(dotCol);
  const dotX = laneX(dotCol, laneWidth);
  const cy = ROW_HEIGHT / 2;
  const r = isSelected ? DOT_RADIUS + 1 : DOT_RADIUS;
  const isMerge = commit.parents.length > 1;
  const haloR = isMerge ? r + 4.5 : r + 2.5;
  const extent = haloR + 1;
  return (
    <svg
      width={extent * 2}
      height={ROW_HEIGHT}
      style={{ position: 'absolute', left: offsetX + dotX - extent, top: 0, overflow: 'hidden', zIndex: 3, pointerEvents: 'none' }}
    >
      <circle cx={extent} cy={cy} r={haloR} fill="var(--vscode-editor-background)" />
      {isMerge && (
        <circle cx={extent} cy={cy} r={r + 3}
          fill="none"
          stroke={isSelected ? '#ffffff' : dotColor}
          strokeWidth={1.5} strokeOpacity={0.6}
        />
      )}
      <circle cx={extent} cy={cy} r={r}
        fill={isSelected ? '#ffffff' : dotColor}
        stroke={isSelected ? dotColor : 'var(--vscode-editor-background)'}
        strokeWidth={isSelected ? 2 : 1}
      />
    </svg>
  );
});
