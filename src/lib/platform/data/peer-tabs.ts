const CHANNEL_NAME = "modu-global-restore-presence";
const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID() : "no-crypto";

/** Best-effort cooperative peer detection; older application tabs may not respond. */
export function installRestorePeerResponder(): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = event => {
    const msg = event.data;
    if (msg?.type === "probe" && msg.source !== TAB_ID) {
      channel.postMessage({ type: "present", probe: msg.probe, source: TAB_ID });
    }
  };
  return () => channel.close();
}

export async function requireNoOtherModuTabs(): Promise<void> {
  if (typeof BroadcastChannel === "undefined") {
    throw new Error("Safe restore requires BroadcastChannel support.");
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  let foundPeer = false;
  const probe = crypto.randomUUID();
  try {
    channel.onmessage = event => {
      if (event.data?.type === "present" && event.data.probe === probe &&
          event.data.source !== TAB_ID) foundPeer = true;
    };
    channel.postMessage({ type: "probe", probe, source: TAB_ID });
    await new Promise<void>(resolve => setTimeout(resolve, 350));
    if (foundPeer) throw new Error("Close other Modu tabs before restoring a backup.");
  } finally {
    channel.close();
  }
}
