import { globalDataPorts } from "#lib/platform/data/registry.ts";
import { recoverInterruptedRestore, RESTORE_PENDING_KEY } from "#lib/platform/data/restore.ts";
import { installRestorePeerResponder } from "#lib/platform/data/peer-tabs.ts";

/**
 * Run before hydration so a previously interrupted multi-module restore is
 * recovered before any module controller can write into its database.
 */
export async function init(): Promise<void> {
  const restorePending = localStorage.getItem(RESTORE_PENDING_KEY) === "1";
  if (restorePending) {
    if (typeof indexedDB === "undefined") {
      throw new Error("A previous data restore requires IndexedDB recovery before continuing.");
    }
    await recoverInterruptedRestore(globalDataPorts);
  }
  installRestorePeerResponder();
}
