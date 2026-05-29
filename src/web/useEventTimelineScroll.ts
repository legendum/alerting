import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const STICK_THRESHOLD_PX = 80;
const TOP_ROOT_MARGIN = "200px 0px 0px 0px";

type Options = {
  /** Changes when list content changes (ids), not only length. */
  settleKey: string;
  canLoadOlder: boolean;
  loading: boolean;
  loadingMore: boolean;
};

/**
 * Scroll container for a chronological event list (oldest at top, newest at
 * bottom). Loads older pages when the user scrolls up (top sentinel).
 */
export function useEventTimelineScroll({
  settleKey,
  canLoadOlder,
  loading,
  loadingMore,
}: Options) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const prependHeightRef = useRef<number | null>(null);
  const stickBottomRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const loadOlderRef = useRef<() => void>(() => {});
  const [settleVersion, setSettleVersion] = useState(0);

  const capturePrependHeight = () => {
    const el = scrollRef.current;
    if (el) prependHeightRef.current = el.scrollHeight;
  };

  const stickToBottom = useCallback(() => {
    stickBottomRef.current = true;
    setSettleVersion((v) => v + 1);
  }, []);

  const shouldStickOnAppend = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return (
      el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX
    );
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (prependHeightRef.current != null) {
      el.scrollTop += el.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    } else if (stickBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      stickBottomRef.current = false;
    }
  }, [settleKey, loading, settleVersion]);

  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadOlderRef.current();
      },
      { root, rootMargin: TOP_ROOT_MARGIN },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!canLoadOlder || loading || loadingMore) return;
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;
    const rootTop = root.getBoundingClientRect().top;
    const distance = sentinel.getBoundingClientRect().top - rootTop;
    if (distance >= -200 && distance <= 200) loadOlderRef.current();
  }, [canLoadOlder, loading, loadingMore, settleKey]);

  const bindLoadOlder = useCallback(
    (fn: () => void) => {
      loadOlderRef.current = () => {
        if (!canLoadOlder || loadingOlderRef.current || loading || loadingMore)
          return;
        loadingOlderRef.current = true;
        fn();
      };
    },
    [canLoadOlder, loading, loadingMore],
  );

  const finishLoadOlder = useCallback(() => {
    loadingOlderRef.current = false;
  }, []);

  return {
    scrollRef,
    topSentinelRef,
    capturePrependHeight,
    stickToBottom,
    shouldStickOnAppend,
    bindLoadOlder,
    finishLoadOlder,
  };
}

/** Stable key for scroll settle when event ids change. */
export function eventListSettleKey(
  events: ReadonlyArray<{ id: number }>,
): string {
  if (events.length === 0) return "empty";
  return `${events[0]!.id}-${events[events.length - 1]!.id}-${events.length}`;
}
