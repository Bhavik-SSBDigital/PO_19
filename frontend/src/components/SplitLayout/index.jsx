/*
  SplitLayout.jsx
  - SplitWrapper: parent container that manages one or more SplitBox children and shows draggable divider(s)
  - SplitBox: child pane that participates in split sizing
  - Divider: 2px draggable handle between boxes

  Features:
  - horizontal or vertical direction
  - initial sizes (percent) or controlled sizes
  - minSizes per pane
  - double-click to reset to initial sizes 
  - touch & mouse drag
  - optional persistence (localStorage key)
  - callbacks: onChange

  Usage example is included at bottom (SplitDemo)
*/

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

const SplitContext = createContext(null);

export function useSplit() {
  const ctx = useContext(SplitContext);
  if (!ctx)
    throw new Error("Split components must be used inside SplitWrapper");
  return ctx;
}

export const SplitWrapper = ({
  children,
  direction = "horizontal",
  initialSizes,
  minSizes,
  gutterSize = 2,
  persistKey,
  onChange,
  className,
  style,
}) => {
  const containerRef = useRef(null);
  const panes = React.Children.toArray(children).filter(
    (c) => c && c.type && c.type.displayName === "SplitBox"
  );
  const count = panes.length || 0;

  const normalize = (arr, n) => {
    if (!arr || arr.length !== n) return Array(n).fill(100 / n);
    const sum = arr.reduce((a, b) => a + b, 0);
    if (sum === 0) return Array(n).fill(100 / n);
    return arr.map((v) => (v / sum) * 100);
  };

  const [sizes, setSizesState] = useState(() => {
    if (persistKey) {
      try {
        const raw = localStorage.getItem(persistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === count)
            return normalize(parsed, count);
        }
      } catch (e) {}
    }
    return normalize(initialSizes || [], count);
  });

  useEffect(() => {
    setSizesState((prev) => normalize(prev, count));
  }, [count]);

  const setSizes = useCallback(
    (s) => {
      const normalized = normalize(s, count);
      setSizesState(normalized);
      onChange?.(normalized);
      if (persistKey)
        localStorage.setItem(persistKey, JSON.stringify(normalized));
    },
    [count, onChange, persistKey]
  );

  const ctx = {
    direction,
    sizes,
    setSizes,
    minSizes,
    gutterSize,
  };

  const baseStyle = {
    display: "flex",
    flexDirection: direction === "horizontal" ? "row" : "column",
    width: "100%",
    height: "100%",
    overflow: "hidden",
    userSelect: "none",
    ...style,
  };

  return (
    <SplitContext.Provider value={ctx}>
      <div ref={containerRef} className={className} style={baseStyle}>
        {children}
      </div>
    </SplitContext.Provider>
  );
};

export const SplitBox = ({ children, className, style }) => {
  const { sizes, direction, gutterSize } = useSplit();
  const ref = useRef(null);

  const computeIndex = () => {
    if (!ref.current) return 0;
    const parent = ref.current.parentElement;
    if (!parent) return 0;
    const boxes = Array.from(parent.children).filter(
      (el) => el.getAttribute("data-split-box") === "1"
    );
    return boxes.indexOf(ref.current);
  };

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(computeIndex());
  }, []);

  const size = useMemo(() => sizes[index], [sizes, index]);

  const styleForBox = {
    flexBasis: `${size}%`,
    flexGrow: 0,
    flexShrink: 0,
    overflow: "auto",
    minWidth: direction === "horizontal" ? `${gutterSize * 2}px` : undefined,
    minHeight: direction === "vertical" ? `${gutterSize * 2}px` : undefined,
    ...style,
  };

  return (
    <div ref={ref} data-split-box="1" className={className} style={styleForBox}>
      {children}
    </div>
  );
};
SplitBox.displayName = "SplitBox";

export const Divider = ({ index, className }) => {
  const ctx = useContext(SplitContext);
  if (!ctx) throw new Error("Divider must be used inside SplitWrapper");

  const { direction, sizes, setSizes, minSizes = [], gutterSize } = ctx;

  const dragging = useRef(false);
  const startPos = useRef(0);
  const startSizes = useRef([]);

  const onPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragging.current = true;
    startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
    startSizes.current = sizes.slice();

    document.body.style.cursor =
      direction === "horizontal" ? "ew-resize" : "ns-resize";

    // ✅ Attach listeners immediately here
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;

    const total =
      direction === "horizontal" ? window.innerWidth : window.innerHeight;

    const delta =
      (direction === "horizontal" ? e.clientX : e.clientY) - startPos.current;
    const deltaPercent = (delta / total) * 100;

    const left = Math.max(
      0,
      Math.min(100, startSizes.current[index] + deltaPercent)
    );
    const right = Math.max(
      0,
      Math.min(100, startSizes.current[index + 1] - deltaPercent)
    );

    const minLeft = minSizes[index] ?? 2;
    const minRight = minSizes[index + 1] ?? 2;
    let newLeft = left;
    let newRight = right;

    if (newLeft < minLeft) {
      newLeft = minLeft;
      newRight =
        startSizes.current[index] + startSizes.current[index + 1] - newLeft;
    }
    if (newRight < minRight) {
      newRight = minRight;
      newLeft =
        startSizes.current[index] + startSizes.current[index + 1] - newRight;
    }

    const next = sizes.slice();
    next[index] = newLeft;
    next[index + 1] = newRight;
    setSizes(next);
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.cursor = "default";

    // ✅ Clean up listeners
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  // ✅ No need to reattach in useEffect — we now attach directly in onPointerDown

  const dividerStyle = {
    flexBasis: `${gutterSize}px`,
    flexGrow: 0,
    flexShrink: 0,
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
  };

  const lineStyle = {
    width: direction === "horizontal" ? "2px" : "60%",
    height: direction === "horizontal" ? "60%" : "2px",
    background: "#444",
    borderRadius: 1,
    padding: "2px",
    cursor: direction === "horizontal" ? "col-resize" : "row-resize",
    margin: direction === "horizontal" ? "0px 5px" : "5px 0px",
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction === "horizontal" ? "vertical" : "horizontal"}
      className={className}
      style={dividerStyle}
      onPointerDown={onPointerDown}
      onDoubleClick={() => {
        const equal = (sizes[index] + sizes[index + 1]) / 2;
        const next = sizes.slice();
        next[index] = equal;
        next[index + 1] = equal;
        setSizes(next);
      }}
    >
      <div style={lineStyle} />
    </div>
  );
};

Divider.displayName = "Divider";

export const AutoSplit = (props) => {
  const childrenArray = React.Children.toArray(props.children);
  const wrappedChildren = [];

  childrenArray.forEach((child, i) => {
    wrappedChildren.push(child);
    if (i !== childrenArray.length - 1) {
      wrappedChildren.push(<Divider key={`divider-${i}`} index={i} />);
    }
  });

  return <SplitWrapper {...props}>{wrappedChildren}</SplitWrapper>;
};
