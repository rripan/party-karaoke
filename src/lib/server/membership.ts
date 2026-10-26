import "server-only";
import type { NextRequest } from "next/server";
import { resolveActor } from "./auth";
import { ApiError, partyService } from "./party-service";

/** Loads a party and requires the caller to be its host or one of its guests. */
export async function requireMember(req: NextRequest, partyId: string) {
  const agg = await partyService().load(partyId);
  const resolution = resolveActor(req, agg);
  if (resolution.kind === "removed") throw new ApiError("participant_removed", "The host removed you from this party.", 403);
  if (resolution.kind === "anonymous") throw new ApiError("not_joined", "Join the party first.", 401);
  return { agg, resolution, actorKey: resolution.kind === "host" ? `host:${partyId}` : `guest:${resolution.actor.participantId}` };
}

export async function requireHost(req: NextRequest, partyId: string) {
  const member = await requireMember(req, partyId);
  if (member.resolution.kind !== "host") throw new ApiError("forbidden", "Only the host can do that.", 403);
  return member;
}
