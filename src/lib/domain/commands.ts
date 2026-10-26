import { z } from "zod";
import { settingsPatchSchema } from "./settings";

const id = z.string().min(1).max(64);

/** A song reference sent by a client. The server always re-resolves metadata. */
export const songRefSchema = z.string().trim().min(1).max(300);

export const guestCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_song"), ref: songRefSchema }),
  z.object({ type: z.literal("remove_own"), queueItemId: id }),
  z.object({ type: z.literal("vote"), queueItemId: id }),
  z.object({ type: z.literal("unvote"), queueItemId: id }),
  z.object({
    type: z.literal("update_profile"),
    displayName: z.string().max(60).optional(),
    avatar: z.string().max(16).optional(),
  }),
]);

const playerStateSchema = z.enum([
  "playing",
  "paused",
  "buffering",
  "ended",
  "error",
  "blocked",
  "ready",
  "heartbeat",
]);

export const hostCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("update_settings"), patch: settingsPatchSchema }),
  z.object({ type: z.literal("rename"), name: z.string().max(120) }),
  z.object({ type: z.literal("approve"), queueItemId: id }),
  z.object({ type: z.literal("reject"), queueItemId: id }),
  z.object({ type: z.literal("remove_item"), queueItemId: id }),
  z.object({ type: z.literal("move_to_top"), queueItemId: id }),
  z.object({ type: z.literal("unpin"), queueItemId: id }),
  z.object({ type: z.literal("reorder"), orderedIds: z.array(id).max(500), movedId: id.optional() }),
  z.object({ type: z.literal("clear_queue") }),
  z.object({ type: z.literal("start"), queueItemId: id.optional() }),
  z.object({ type: z.literal("play") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("seek"), positionSeconds: z.number().min(0).max(60 * 60 * 6) }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("finish") }),
  z.object({ type: z.literal("report_unavailable"), reason: z.string().max(200).optional() }),
  z.object({ type: z.literal("replace_video"), queueItemId: id, ref: songRefSchema }),
  z.object({ type: z.literal("replay"), historyId: id, toTop: z.boolean().optional() }),
  z.object({ type: z.literal("remove_participant"), participantId: id }),
  z.object({ type: z.literal("pause_party") }),
  z.object({ type: z.literal("resume_party") }),
  z.object({ type: z.literal("end_party") }),
  // fresh: this screen just (re)loaded, so whatever it played before has stopped.
  z.object({ type: z.literal("claim_output"), clientId: z.string().min(8).max(64), fresh: z.boolean().optional() }),
  z.object({
    type: z.literal("player_report"),
    clientId: z.string().min(8).max(64),
    queueItemId: id,
    state: playerStateSchema,
    positionSeconds: z.number().min(0).max(60 * 60 * 6),
    durationSeconds: z.number().min(0).max(60 * 60 * 6).nullable().optional(),
    errorCode: z.string().max(40).optional(),
  }),
]);

export type GuestCommand = z.infer<typeof guestCommandSchema>;
export type HostCommand = z.infer<typeof hostCommandSchema>;
export type PlayerReportState = z.infer<typeof playerStateSchema>;
export type WireCommand = GuestCommand | HostCommand;

export const GUEST_COMMAND_TYPES = new Set(guestCommandSchema.options.map((o) => o.shape.type.value));
export const HOST_COMMAND_TYPES = new Set(hostCommandSchema.options.map((o) => o.shape.type.value));
