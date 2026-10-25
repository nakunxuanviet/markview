import { useEffect, useMemo, useRef } from "react";

import { IconSwap, IconX } from "../icons";
import { useStore } from "../store";

interface DiffRow {
  text: string;
  kind: "same" | "added" | "removed" | "empty";
}

export function DiffDialog() {
  const open = useStore((state) => state.diffOpen);
  const left = useStore((state) => state.diffLeft);
  const right = useStore((state) => state.diffRight);
  const leftLabel = useStore((state) => state.diffLeftLabel);
  const rightLabel = useStore((state) => state.diffRightLabel);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => diffLines(left, right), [left, right]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const row of rows.right) if (row.kind === "added") added += 1;
    for (const row of rows.left) if (row.kind === "removed") removed += 1;
    for (const row of rows.left) if (row.kind === "same") unchanged += 1;
    return `${added} added, ${removed} removed, ${unchanged} unchanged`;
  }, [rows]);
  const leftRows = useMemo(() => withNumbers(rows.left), [rows]);
  const rightRows = useMemo(() => withNumbers(rows.right), [rows]);

  // Jump to the first changed line so large files open on the interesting hunk.
  useEffect(() => {
    if (!open) return;
    const index = rows.left.findIndex(
      (row, i) => row.kind !== "same" || rows.right[i]?.kind !== "same",
    );
    if (index < 0) return;
    for (const pane of [leftRef.current, rightRef.current]) {
      const el = pane?.children[index] as HTMLElement | undefined;
      if (!pane || !el) continue;
      const offset =
        el.getBoundingClientRect().top - pane.getBoundingClientRect().top;
      pane.scrollTop += offset - 28;
    }
    // Intentionally only when the dialog opens or the compared text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, left, right]);

  if (!open) return null;

  const close = () => useStore.setState({ diffOpen: false });

  const swap = () => {
    useStore.setState({
      diffLeft: right,
      diffRight: left,
      diffLeftLabel: rightLabel,
      diffRightLabel: leftLabel,
    });
  };

  // Keep both panes aligned while scrolling.
  const syncScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ) => {
    if (!source || !target) return;
    target.scrollTop = source.scrollTop;
  };

  return (
    <div id="diff-view">
      <div className="diff-overlay" onClick={close} />
      <div className="diff-modal">
        <div className="diff-header">
          <h2>Compare Files</h2>
          <div className="diff-header-actions">
            <button id="diff-swap" title="Swap sides" onClick={swap}>
              <IconSwap />
            </button>
            <button id="diff-close" title="Close" onClick={close}>
              <IconX />
            </button>
          </div>
        </div>
        <div className="diff-toolbar">
          <div className="diff-file-label" id="diff-label-left">
            {leftLabel}
          </div>
          <div className="diff-file-label" id="diff-label-right">
            {rightLabel}
          </div>
        </div>

        <div className="diff-container">
          <div
            className="diff-pane"
            id="diff-left"
            ref={leftRef}
            onScroll={() => syncScroll(leftRef.current, rightRef.current)}
          >
            {leftRows.map(({ row, num }, index) => (
              <div className={`diff-line diff-${row.kind}`} key={`l-${index}`}>
                <span className="diff-num">{num ?? ""}</span>
                <span>{row.text}</span>
              </div>
            ))}
          </div>
          <div
            className="diff-pane"
            id="diff-right"
            ref={rightRef}
            onScroll={() => syncScroll(rightRef.current, leftRef.current)}
          >
            {rightRows.map(({ row, num }, index) => (
              <div className={`diff-line diff-${row.kind}`} key={`r-${index}`}>
                <span className="diff-num">{num ?? ""}</span>
                <span>{row.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="diff-footer">
          <span id="diff-stats">{stats}</span>
        </div>
      </div>
    </div>
  );
}

function withNumbers(rows: DiffRow[]): { row: DiffRow; num: number | null }[] {
  let line = 0;
  return rows.map((row) => {
    if (row.kind === "empty") return { row, num: null };
    line += 1;
    return { row, num: line };
  });
}

function diffLines(
  a: string,
  b: string,
): { left: DiffRow[]; right: DiffRow[] } {
  const leftLines = a.split("\n");
  const rightLines = b.split("\n");
  const n = leftLines.length;
  const m = rightLines.length;

  // Guard against pathological O(n*m) when files are huge.
  if (n * m > 4_000_000) {
    const left: DiffRow[] = [];
    const right: DiffRow[] = [];
    const max = Math.max(n, m);
    for (let i = 0; i < max; i += 1) {
      const l = leftLines[i];
      const r = rightLines[i];
      if (l === r) {
        left.push({ text: l ?? "", kind: "same" });
        right.push({ text: r ?? "", kind: "same" });
      } else {
        left.push({
          text: l ?? "",
          kind: l === undefined ? "empty" : "removed",
        });
        right.push({
          text: r ?? "",
          kind: r === undefined ? "empty" : "added",
        });
      }
    }
    return { left, right };
  }

  const dp: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        leftLines[i] === rightLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const left: DiffRow[] = [];
  const right: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (leftLines[i] === rightLines[j]) {
      left.push({ text: leftLines[i], kind: "same" });
      right.push({ text: rightLines[j], kind: "same" });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      left.push({ text: leftLines[i], kind: "removed" });
      right.push({ text: "", kind: "empty" });
      i += 1;
    } else {
      left.push({ text: "", kind: "empty" });
      right.push({ text: rightLines[j], kind: "added" });
      j += 1;
    }
  }
  while (i < n) {
    left.push({ text: leftLines[i], kind: "removed" });
    right.push({ text: "", kind: "empty" });
    i += 1;
  }
  while (j < m) {
    left.push({ text: "", kind: "empty" });
    right.push({ text: rightLines[j], kind: "added" });
    j += 1;
  }
  return { left, right };
}
