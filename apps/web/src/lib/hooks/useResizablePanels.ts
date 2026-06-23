'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'inbox-panel-widths';
const MIN_LIST = 220;
const MIN_CHAT = 320;
const MIN_INTEL = 240;

interface PanelWidths {
  list: number;   // px
  intel: number;  // px
  // chat = remaining flex space (no fixed width)
}

const DEFAULT: PanelWidths = { list: 280, intel: 320 };

function load(): PanelWidths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    // localStorage unavailable/corrupt — fall back to defaults.
  }
  return DEFAULT;
}

function save(w: PanelWidths) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
  } catch {
    // best-effort persistence only.
  }
}

export function useResizablePanels(intelVisible: boolean) {
  const [widths, setWidths] = useState<PanelWidths>(DEFAULT);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'list' | 'intel' | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Load from localStorage on mount (client-only)
  useEffect(() => { setWidths(load()); }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const which = draggingRef.current;
    if (!which || !containerRef.current) return;
    const dx = e.clientX - startXRef.current;
    setWidths((prev) => {
      const containerW = containerRef.current!.offsetWidth;
      if (which === 'list') {
        const next = Math.max(MIN_LIST, Math.min(startWidthRef.current + dx, containerW - MIN_CHAT - (intelVisible ? MIN_INTEL : 0) - 16));
        return { ...prev, list: next };
      } else {
        // intel handle: dragging LEFT increases intel width
        const next = Math.max(MIN_INTEL, Math.min(startWidthRef.current - dx, containerW - MIN_CHAT - MIN_LIST - 16));
        return { ...prev, intel: next };
      }
    });
  }, [intelVisible]);

  const onMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setWidths((w) => { save(w); return w; });
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = useCallback((which: 'list' | 'intel', e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = which;
    startXRef.current = e.clientX;
    startWidthRef.current = which === 'list' ? widths.list : widths.intel;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [widths]);

  return { containerRef, widths, startDrag };
}
