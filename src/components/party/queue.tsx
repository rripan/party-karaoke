"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { ArrowUpToLine, Check, ChevronUp, GripVertical, Heart, Pin, Play, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { QueueItemView } from "@/lib/domain/snapshot";
import type { VotingMode } from "@/lib/domain/types";
import { cn } from "@/lib/client/cn";
import { formatClock, formatWait } from "@/lib/client/format";
import { Chip } from "@/components/ui/controls";
import { SongIndicators } from "./indicators";
import { SongArt } from "./song-art";

const STATUS_LABEL: Record<QueueItemView["status"], string> = {
  pending_approval: "Pending approval",
  queued: "Queued",
  playing: "Playing",
  completed: "Sung",
  skipped: "Skipped",
  removed: "Removed",
  rejected: "Not approved",
};

const STATUS_TONE: Record<QueueItemView["status"], "neutral" | "brand" | "success" | "warning" | "danger" | "spark"> = {
  pending_approval: "warning",
  queued: "neutral",
  playing: "brand",
  completed: "success",
  skipped: "neutral",
  removed: "danger",
  rejected: "danger",
};

export function StatusChip({ status }: { status: QueueItemView["status"] }) {
  return <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>;
}

export function QueueCard({
  item,
  index,
  votingMode,
  onVote,
  showWait = true,
  showStatus,
  actions,
  handle,
  highlight,
  compact,
  hideArt,
}: {
  item: QueueItemView;
  index?: number;
  votingMode?: VotingMode;
  onVote?: (item: QueueItemView) => void;
  showWait?: boolean;
  showStatus?: boolean;
  actions?: React.ReactNode;
  handle?: React.ReactNode;
  highlight?: boolean;
  compact?: boolean;
  hideArt?: boolean;
}) {
  const wait = showWait && item.status === "queued" ? formatWait(item.estimatedStartInSeconds) : null;
  const canVote = votingMode && votingMode !== "off" && !!onVote && !item.isMine && (item.status === "queued" || item.status === "pending_approval");
  return (
    <div
      className={cn(
        "card flex items-center gap-3 p-2.5",
        highlight && "border-magenta/45 bg-magenta/10 shadow-[var(--shadow-glow)]",
        item.status === "playing" && "border-magenta/50",
      )}
      data-testid="queue-item"
      data-status={item.status}
    >
      {handle}
      {index !== undefined ? <span className="w-6 shrink-0 text-center font-display text-lg font-extrabold text-faint tabular-nums">{index}</span> : null}
      {hideArt ? null : <SongArt song={item.song} className={compact ? "hidden w-16 min-[380px]:block" : "w-20 sm:w-24"} />}
      <div className="min-w-0 flex-1">
        <p className={cn("leading-snug font-semibold", compact ? "line-clamp-2 text-[0.95rem]" : "truncate")} title={item.song.title}>
          {item.song.title}
        </p>
        <p className="truncate text-sm text-muted">
          <span aria-hidden>{item.requestedBy.avatar}</span> {item.isMine ? "You" : item.requestedBy.displayName}
          <span className="text-faint"> · {item.song.channelName}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {showStatus ? <StatusChip status={item.status} /> : null}
          {item.pinned ? (
            <Chip tone="spark" title="Pinned by the host — votes won't move it">
              <Pin className="h-3 w-3" aria-hidden /> Pinned
            </Chip>
          ) : null}
          {wait ? <span className="text-xs font-semibold text-faint">{wait}</span> : null}
          {item.song.durationSeconds ? <span className="text-xs text-faint tabular-nums">{formatClock(item.song.durationSeconds)}</span> : null}
          {!compact ? <SongIndicators song={item.song} lyrics={item.lyrics} compact /> : null}
        </div>
      </div>
      {votingMode && votingMode !== "off" && (item.status === "queued" || item.status === "pending_approval") ? (
        canVote ? (
          <button
            type="button"
            onClick={() => onVote?.(item)}
            aria-pressed={item.myVote}
            aria-label={item.myVote ? `Remove your vote for ${item.song.title}` : `Vote for ${item.song.title}`}
            className={cn(
              "flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border text-sm font-bold transition-colors",
              item.myVote ? "border-pink/50 bg-pink/20 text-pink" : "border-line bg-white/5 text-muted hover:text-text",
            )}
            data-testid="vote-button"
          >
            {item.myVote ? <Heart className="h-5 w-5 fill-current" aria-hidden /> : <ChevronUp className="h-5 w-5" aria-hidden />}
            <span className="tabular-nums" data-testid="vote-count">
              {item.votes}
            </span>
          </button>
        ) : (
          <span className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl text-sm font-bold text-faint" aria-label={`${item.votes} votes`}>
            <Heart className="h-4 w-4" aria-hidden />
            <span className="tabular-nums" data-testid="vote-count">
              {item.votes}
            </span>
          </span>
        )
      ) : null}
      {actions}
    </div>
  );
}

function IconAction({ label, onClick, children, tone = "default" }: { label: string; onClick: () => void; children: React.ReactNode; tone?: "default" | "danger" | "success" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-xl transition-colors",
        tone === "danger" && "text-faint hover:bg-danger/15 hover:text-danger",
        tone === "success" && "bg-success/15 text-success hover:bg-success/25",
        tone === "default" && "text-faint hover:bg-white/10 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function SortableRow({ item, index, votingMode, onTop, onRemove, onPlayNow, canPlayNow, onUnpin }: { item: QueueItemView; index: number; votingMode: VotingMode; onTop: () => void; onRemove: () => void; onPlayNow: () => void; canPlayNow: boolean; onUnpin: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "relative z-10 opacity-90")}>
      <QueueCard
        item={item}
        index={index}
        votingMode={votingMode}
        compact
        hideArt
        handle={
          <button type="button" className="grid h-10 w-7 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-faint hover:text-text active:cursor-grabbing" aria-label={`Reorder ${item.song.title}. Press space, then arrow keys.`} {...attributes} {...listeners}>
            <GripVertical className="h-5 w-5" aria-hidden />
          </button>
        }
        actions={
          <div className="grid shrink-0 grid-cols-2 gap-0.5">
            {canPlayNow ? (
              <IconAction label="Play now" onClick={onPlayNow}>
                <Play className="h-4 w-4" />
              </IconAction>
            ) : null}
            {item.pinned ? (
              <IconAction label="Unpin (let votes move it)" onClick={onUnpin}>
                <Pin className="h-4 w-4" />
              </IconAction>
            ) : null}
            {index > 1 ? (
              <IconAction label="Move to top" onClick={onTop}>
                <ArrowUpToLine className="h-4 w-4" />
              </IconAction>
            ) : null}
            <IconAction label="Remove from queue" onClick={onRemove} tone="danger">
              <Trash2 className="h-4 w-4" />
            </IconAction>
          </div>
        }
      />
    </li>
  );
}

/** Host queue with drag-and-drop (mouse, touch and keyboard). */
export function HostQueue({
  items,
  votingMode,
  stageIdle,
  onReorder,
  onTop,
  onRemove,
  onPlayNow,
  onUnpin,
}: {
  items: QueueItemView[];
  votingMode: VotingMode;
  stageIdle: boolean;
  onReorder: (orderedIds: string[], movedId: string) => void;
  onTop: (item: QueueItemView) => void;
  onRemove: (item: QueueItemView) => void;
  onPlayNow: (item: QueueItemView) => void;
  onUnpin: (item: QueueItemView) => void;
}) {
  // Optimistic order after a drag; discarded as soon as a new snapshot arrives.
  const [optimistic, setOptimistic] = useState<{ basedOn: QueueItemView[]; order: QueueItemView[] } | null>(null);
  const order = optimistic && optimistic.basedOn === items ? optimistic.order : items;
  const setOrder = (next: QueueItemView[]) => setOptimistic({ basedOn: items, order: next });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.findIndex((q) => q.id === e.active.id);
    const to = order.findIndex((q) => q.id === e.over!.id);
    const next = arrayMove(order, from, to);
    setOrder(next); // optimistic
    onReorder(
      next.map((q) => q.id),
      String(e.active.id),
    );
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-2" data-testid="host-queue">
          {order.map((item, i) => (
            <SortableRow
              key={item.id}
              item={item}
              index={i + 1}
              votingMode={votingMode}
              canPlayNow={stageIdle}
              onTop={() => onTop(item)}
              onRemove={() => onRemove(item)}
              onPlayNow={() => onPlayNow(item)}
              onUnpin={() => onUnpin(item)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function ApprovalList({ items, votingMode, onApprove, onReject }: { items: QueueItemView[]; votingMode: VotingMode; onApprove: (i: QueueItemView) => void; onReject: (i: QueueItemView) => void }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="approval-list">
      {items.map((item) => (
        <motion.li key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <QueueCard
            item={item}
            compact
            hideArt
            votingMode={votingMode === "requests" ? votingMode : undefined}
            actions={
              <div className="flex shrink-0 gap-1">
                <IconAction label={`Approve ${item.song.title}`} onClick={() => onApprove(item)} tone="success">
                  <Check className="h-4 w-4" />
                </IconAction>
                <IconAction label={`Reject ${item.song.title}`} onClick={() => onReject(item)} tone="danger">
                  <X className="h-4 w-4" />
                </IconAction>
              </div>
            }
          />
        </motion.li>
      ))}
    </ul>
  );
}
