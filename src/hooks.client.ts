import type { ClientInit } from "@sveltejs/kit";
import { globalDataPorts } from "#lib/platform/data/registry.ts";
import { recoverInterruptedRestore } from "#lib/platform/data/restore.ts";
import { installRestorePeerResponder } from "#lib/platform/data/peer-tabs.ts";

/**
 * Run before hydration so a previously interrupted multi-module restore is
 * recovered before any module controller can write into its database.
 */
export const init: ClientInit = async () => {
  if (typeof indexedDB !== "undefined") {
    await recoverInterruptedRestore(globalDataPorts);
  }
  installRestorePeerResponder();
};
