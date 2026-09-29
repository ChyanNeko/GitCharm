import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { suppressHoverBriefly } from './keyboardNav';

const ROW_HEIGHT = 22;
const OVERSCAN = 12;
const VIRTUALIZE_AFTER = 200;

interface Props<T> {
  rows: T[];
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  getKey: (row: T) => string;
  renderRow: (row: T) => React.ReactNode;
}

/** Window a file list inside the commit panel's shared ScrollArea. */
export function VirtualRows<T>({ rows, scrollRef, getKey, renderRow }: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: Math.min(rows.length, 40) });
  const shouldVirtualize = !!scrollRef && rows.length > VIRTUALIZE_AFTER;

  const updateRange = useCallback(() => {
    const list = listRef.current;
    const scroll = scrollRef?.current;
    if (!list || !scroll) return;
    const listTop = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    const first = Math.max(0, Math.min(rows.length, Math.floor((scroll.scrollTop - listTop) / ROW_HEIGHT) - OVERSCAN));
    const last = Math.max(first, Math.min(rows.length, Math.ceil((scroll.scrollTop + scroll.clientHeight - listTop) / ROW_HEIGHT) + OVERSCAN));
    setRange(old => old.start === first && old.end === last ? old : { start: first, end: last });
  }, [rows.length, scrollRef]);

  // Run after every layout: expanding an earlier repo moves this list without
  // necessarily changing its own height or firing a scroll event.
  useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    updateRange();
  });

  useLayoutEffect(() => {
    if (!shouldVirtualize) return;
    const scroll = scrollRef?.current;
    if (!scroll) return;
    scroll.addEventListener('scroll', updateRange, { passive: true });
    const observer = new ResizeObserver(updateRange);
    observer.observe(scroll);
    return () => {
      scroll.removeEventListener('scroll', updateRange);
      observer.disconnect();
    };
  }, [scrollRef, shouldVirtualize, updateRange]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return;
    const scroll = scrollRef?.current;
    const list = listRef.current;
    const target = event.target;
    if (!scroll || !list || !(target instanceof HTMLElement)) return;
    const rowElement = target.closest<HTMLElement>('[data-virtual-index]');
    if (!rowElement || !list.contains(rowElement)) return;
    const current = Number(rowElement.dataset.virtualIndex);
    const page = Math.max(1, Math.floor(scroll.clientHeight / ROW_HEIGHT));
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
      : event.key === 'PageDown' ? Math.min(rows.length - 1, current + page)
      : event.key === 'PageUp' ? Math.max(0, current - page)
      : event.key === 'ArrowDown' ? Math.min(rows.length - 1, current + 1)
      : Math.max(0, current - 1);
    // Let the parent navigator cross into an adjacent repo/header.
    if (next === current && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) return;
    event.preventDefault();
    event.stopPropagation();
    const listTop = list.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    const top = listTop + next * ROW_HEIGHT;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    else if (top + ROW_HEIGHT > scroll.scrollTop + scroll.clientHeight) scroll.scrollTop = top + ROW_HEIGHT - scroll.clientHeight;
    updateRange();
    suppressHoverBriefly();
    requestAnimationFrame(() => {
      list.querySelector<HTMLElement>(`[data-virtual-index="${next}"] [data-nav-row]`)?.focus({ preventScroll: true });
    });
  };

  if (!shouldVirtualize) {
    return <div data-filetree-container>{rows.map(row => <React.Fragment key={getKey(row)}>{renderRow(row)}</React.Fragment>)}</div>;
  }

  return (
    <div ref={listRef} data-filetree-container onKeyDown={onKeyDown} style={{ position: 'relative', height: rows.length * ROW_HEIGHT }}>
      {rows.slice(range.start, range.end).map((row, offset) => {
        const index = range.start + offset;
        return (
          <div key={getKey(row)} data-virtual-index={index} style={{ position: 'absolute', top: index * ROW_HEIGHT, left: 0, right: 0, height: ROW_HEIGHT }}>
            {renderRow(row)}
          </div>
        );
      })}
    </div>
  );
}
