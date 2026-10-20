import type { ModuleDataId } from "./contracts.ts";
import type { PendingSyncOperation } from "./outbox.ts";

export type ConflictDecision =
  | { kind: "duplicate" }
  | { kind: "apply" }
  | { kind: "conflict"; reason: "revision" | "immutable" | "concurrent-command" | "delete-vs-edit" };

/**
 * Strict domain-aware admission policy. No remote writes occur here.
 * M4 transport may apply only an "apply" decision through the owning module
 * and must preserve a durable dedup journal for already accepted operation IDs.
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
  if (moduleId === "pomodoro" || (moduleId === "language-learning" &&
    incoming.kind === "command")) {
    // Completed focus sessions and practice evidence are immutable by identity.
    return { kind: "conflict", reason: "immutable" };
  }
  if (incoming.baseRevision !== local.revision) {
    // Concurrent Habit commands (including increments) cannot use timestamp LWW;
    // they require a domain rebase against the authoritative policy/target.
    return { kind: "conflict", reason: incoming.kind === "command" ? "concurrent-command" : "revision" };
  }
  return { kind: "apply" };
}
