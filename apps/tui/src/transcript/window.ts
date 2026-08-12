export interface WindowItem {
  id: string;
  live: boolean;
  height: number;
}

export interface WindowResult {
  startIndex: number;
  endIndex: number;
  padTop: number;
  padBottom: number;
  totalHeight: number;
  maxScroll: number;
  effectiveScroll: number;
  anchor: "top" | "bottom";
}

export interface WindowInput {
  items: readonly WindowItem[];
  scrollTop: number;
  viewportHeight: number;
  followLatest: boolean;
  overscan?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function totalItemsHeight(items: readonly WindowItem[]): number {
  let total = 0;
  for (const item of items) total += item.height;
  return total;
}

export function computeWindow({
  items,
  scrollTop,
  viewportHeight,
  followLatest,
  overscan = 8,
}: WindowInput): WindowResult {
  const totalHeight = totalItemsHeight(items);
  const maxScroll = Math.max(0, totalHeight - viewportHeight);

  if (items.length === 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      padTop: 0,
      padBottom: 0,
      totalHeight: 0,
      maxScroll: 0,
      effectiveScroll: 0,
      anchor: "bottom",
    };
  }

  let anchor: "top" | "bottom";
  let effectiveScroll: number;
  if (followLatest) {
    anchor = "bottom";
    effectiveScroll = maxScroll;
  } else {
    anchor = "top";
    effectiveScroll = clamp(scrollTop, 0, maxScroll);
  }

  let startIndex = 0;
  let acc = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (acc + items[i].height > effectiveScroll) {
      startIndex = i;
      break;
    }
    acc += items[i].height;
  }

  let endIndex = startIndex;
  let within = 0;
  for (let i = startIndex; i < items.length; i += 1) {
    within += items[i].height;
    endIndex = i;
    if (within >= viewportHeight) break;
  }
  endIndex = Math.min(items.length - 1, endIndex + overscan);

  let padTop = 0;
  for (let i = 0; i < startIndex; i += 1) padTop += items[i].height;
  let rendered = 0;
  for (let i = startIndex; i <= endIndex; i += 1) rendered += items[i].height;
  const padBottom = Math.max(0, totalHeight - padTop - rendered);

  return { startIndex, endIndex, padTop, padBottom, totalHeight, maxScroll, effectiveScroll, anchor };
}

export function isAtBottom(window: WindowResult): boolean {
  return window.totalHeight === 0 || window.effectiveScroll >= window.maxScroll;
}
