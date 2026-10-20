import type { ModuleDataId } from "./contracts.ts";
import type { PendingSyncOperation } from "./outbox.ts";

export type ConflictDecision =
  | { kind: "duplicate" }
  | { kind: "apply" }
  | { kind: "conflict"; reason: "revision" | "immutable" | "concurrent-command" | "delete-vs-edit" };

/**
 * Conservative, pure conflict admission for M3. Never use wall-clock LWW.
 * The M4 receiving module remains responsible for validating actual domain
 * invariants and tracking accepted operation IDs in a durable journal.
 */
export function decideRemoteOperation(args: {
  moduleId: ModuleDataId;
  incoming: PendingSyncOperation;
  local?: { operationId: string; kind: PendingSyncOperation["kind"]; revision: string | null; payload: unknown };
}): ConflictDecision {
  const { moduleId, incoming, local } = args;
  if (incoming.moduleId !== moduleId) throw new Error("Remote operation crossed a module boundary.");
  if (!local) return { kind: "apply" };
  if (incoming.operationId === local.operationId) return { kind: "duplicate" };
  if (local.kind === "delete" || incoming.kind === "delete") {
    return { kind: "conflict", reason: "delete-vs-edit" };
  }
  // Completed focus sessions are immutable by session identity. Assignments
  // are separate commands and may need a domain-specific rebase.
  if (moduleId === "pomodoro" && incoming.kind === "upsert" && local.kind === "upsert") {
    return { kind: "conflict", reason: "immutable" };
  }
  if (incoming.kind === "baseline") {
    return { kind: "conflict", reason: "revision" };
  }
  // Without a known source revision, applying any write over an existing
  // entity would be an unsafe blind overwrite, even if both are increments.
  if (incoming.baseRevision === null || incoming.baseRevision !== local.revision) {
    return { kind: "conflict", reason: incoming.kind === "command" ? "concurrent-command" : "revision" };
  }
  return { kind: "apply" };
}
