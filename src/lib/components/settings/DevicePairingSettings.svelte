<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Cloud, RefreshCw, Smartphone, Laptop, Copy,
    AlertTriangle, Plus, ChevronRight } from "lucide-svelte";
  import PairingInvitePanel from "./PairingInvitePanel.svelte";
  import { createPairingLink, readPairingFragment, resolvePairingInput, encodePairingCode,
    createPairingInvite, inspectPairingInvite, approvePairingInvite,
    listPairedDevices, revokePairedDevice, recoverSpace, decodeRecoveryCode } from "#lib/platform/data/pairing-client.ts";
  import { enableSyncOnce, resumeOwnerSetup, type SetupStage } from "#lib/platform/data/setup-flow.ts";
  import { requestDeviceJoin, resumeDeviceJoin } from "#lib/platform/data/pairing-flow.ts";
  import { syncNow } from "#lib/platform/data/sync-coordinator.ts";
  import { explainSyncFailure } from "#lib/platform/data/sync-errors.ts";
  import { subscribeSyncStatus, readSyncStatus, type SyncStatus } from "#lib/platform/data/sync-runtime.ts";
  import {
    readDeviceIdentity, readPendingPairing, clearPendingPairing, clearDeviceIdentity,
    generateDeviceIdentity, storeDeviceIdentity, notifyDeviceIdentityChanged,
    readOwnerInvitation, storeOwnerInvitation, clearOwnerInvitation,
    type StoredDeviceIdentity
  } from "#lib/platform/data/device-identity.ts";

  let identity = $state<StoredDeviceIdentity | null>(null);
  let available = $state(false);
  let loaded = $state(false);
  let siteOrigin = $state("");
  let busy = $state(false);
  let consent = $state(false);
  let mode = $state<"overview" | "join" | "recover">("overview");
  let deviceName = $state("My device");
  let inviteCode = $state("");
  let invitationId = $state("");
  let invitationExpiry = $state(0);
  let pendingName = $state("");
  let pendingConfirmation = $state("");
  let phoneConfirmation = $state("");
  let joinCode = $state("");
  let recoveryInput = $state("");
  let recoveryCode = $state("");
  let setupStage = $state<SetupStage | null>(null);
  let notice = $state("");
  let error = $state("");
  let status = $state<SyncStatus>(readSyncStatus());
  let devices = $state<Array<{deviceId:string;name:string;addedAt:number;revoked:boolean}>>([]);
  let advanced = $state(false);

  const pairingLink = $derived(inviteCode && siteOrigin ? createPairingLink(siteOrigin, inviteCode) : "");

  async function action(task: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ""; notice = "";
    try { await task(); }
    catch (cause) { error = explainSyncFailure(cause); }
    finally { busy = false; }
  }
  function defaultDeviceLabel() {
    if (typeof navigator === "undefined") return "My device";
    if (/iPhone|Android|Mobile/i.test(navigator.userAgent)) return "My Phone";
    return "My Laptop";
  }
  async function loadIdentity() {
    identity = await readDeviceIdentity();
    if (identity) deviceName = identity.name;
    if (identity?.status === "paired") {
      const ownerInvite = await readOwnerInvitation();
      if (ownerInvite && ownerInvite.expiresAt > Date.now()) {
        inviteCode = ownerInvite.code;
        invitationId = ownerInvite.invitationId;
        invitationExpiry = ownerInvite.expiresAt;
      } else if (ownerInvite) await clearOwnerInvitation();
    }
    const pending = await readPendingPairing();
    if (pending && identity?.enrollmentKind === "join" && identity.status === "pending") {
      joinCode = pending.invitationCode;
      phoneConfirmation = pending.confirmation ?? "";
      mode = "join";
    }
  }
  async function startOwner() {
    await action(async () => {
      const result = await enableSyncOnce(deviceName, stage => { setupStage = stage; },
        code => { recoveryCode = code; });
      await loadIdentity();
      recoveryCode = result.recoveryCode;
      consent = false;
      notice = "Your first sync completed. Save your recovery code before leaving.";
    });
    setupStage = null;
  }
  async function resumeOwner() {
    await action(async () => {
      if (!identity || identity.enrollmentKind !== "owner") throw new Error("Only the original device can resume setup.");
      await resumeOwnerSetup(identity, stage => { setupStage = stage; });
      await loadIdentity();
      notice = "Sync completed. Changes are now synced automatically while Modu is open.";
    });
    setupStage = null;
  }
  async function retrySync() {
    await action(async () => {
      if (!identity || identity.status !== "paired") throw new Error("Device is not approved.");
      await syncNow(identity);
      notifyDeviceIdentityChanged();
      notice = "Changes have been synced.";
    });
  }
  async function makeInvite() {
    await action(async () => {
      if (!identity || identity.status !== "paired") throw new Error("Connect this browser first.");
      // Do not invite a new browser before its owner baseline is safely remote.
      await syncNow(identity);
      const response = await createPairingInvite(identity);
      invitationId = response.invitationId;
      invitationExpiry = response.expiresAt;
      inviteCode = encodePairingCode(identity.spaceId,response.invitationId,response.secret);
      await storeOwnerInvitation({
        id: "owner-invitation", code: inviteCode, invitationId: response.invitationId,
        expiresAt: response.expiresAt
      });
      pendingName = ""; pendingConfirmation = "";
    });
  }
  async function inspectInvite() {
    if (!identity || !invitationId || busy) return;
    try {
      if (Date.now() >= invitationExpiry) {
        inviteCode = ""; invitationId = "";
        await clearOwnerInvitation();
        return;
      }
      const result = await inspectPairingInvite(identity,invitationId);
      if (result.status === "pending-approval") {
        pendingName = result.candidateName ?? "New device";
        pendingConfirmation = result.confirmation ?? "";
      }
    } catch (cause) {
      // Polling errors may be transient; do not discard the one-time invitation.
      error = explainSyncFailure(cause);
    }
  }
  async function approve() {
    await action(async () => {
      if (!identity || !invitationId || !pendingConfirmation) throw new Error("No verified request is waiting.");
      await approvePairingInvite(identity,invitationId,pendingConfirmation);
      inviteCode = ""; invitationId = ""; pendingName = ""; pendingConfirmation = "";
      await clearOwnerInvitation();
      devices = (await listPairedDevices(identity)).devices;
      notice = "Device approved. Its initial data sync starts automatically.";
    });
  }
  async function beginJoin() {
    await action(async () => {
      const code = resolvePairingInput(joinCode, location.origin);
      try {
        phoneConfirmation = await requestDeviceJoin(code,deviceName);
      } finally {
        // The device key is intentionally persisted before the HTTP request.
        // Even a lost response must leave the UI on the resumable join path.
        await loadIdentity();
      }
      mode = "join";
    });
  }
  async function pollJoin() {
    if (busy || identity?.enrollmentKind !== "join" || identity.status !== "pending") return;
    try {
      const result = await resumeDeviceJoin();
      phoneConfirmation = result.confirmation ?? "";
      if (result.phase === "connected") {
        await loadIdentity();
        mode = "overview";
        notice = "Your data is now available on this device.";
      }
    } catch (cause) {
      // The server may already have approved the device while its first
      // inbound snapshot failed. Reflect durable identity, not stale UI.
      await loadIdentity();
      const persisted = await readDeviceIdentity();
      if (persisted?.status === "paired") mode = "overview";
      error = explainSyncFailure(cause);
    }
  }
  async function cancelPendingJoin() {
    await action(async () => {
      if (!identity || identity.enrollmentKind !== "join" || identity.status !== "pending") return;
      const persisted = await readDeviceIdentity();
      if (!persisted || persisted.status !== "pending" || persisted.deviceId !== identity.deviceId) {
        throw new Error("Device authorization changed. Reload before cancelling.");
      }
      // Only remove an unapproved local device. No remote data is touched.
      await clearPendingPairing();
      await clearDeviceIdentity();
      identity = null; phoneConfirmation = ""; joinCode = ""; mode = "overview";
    });
  }
  async function restoreAccess() {
    await action(async () => {
      if (identity) throw new Error("This browser is already authorized.");
      const code = decodeRecoveryCode(recoveryInput);
      const newDevice = await generateDeviceIdentity(deviceName);
      const result = await recoverSpace(code.spaceId,code.recoveryKey,newDevice);
      await storeDeviceIdentity({...newDevice,id:"current",spaceId:code.spaceId,
        status:"paired",enrollmentKind:"recovery"});
      recoveryCode = code.spaceId + "." + result.recoveryKey;
      recoveryInput = "";
      await loadIdentity();
      notifyDeviceIdentityChanged();
      await syncNow(identity!);
      notice = "Recovery complete. Older devices were revoked. Save your new recovery code.";
    });
  }
  async function disconnectLocalSync() {
    const previous = identity;
    if (!previous || previous.status !== "paired") return;
    if (!window.confirm(
      "Disconnect this browser from its sync space? Local data stays here, but the old cloud space and other devices are NOT deleted. Export a global backup first. You can create a NEW sync space afterward."
    )) return;
    await action(async () => {
      if (!navigator.locks?.request) throw new Error("Web Locks are required for safe disconnection.");
      await navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
        const persisted = await readDeviceIdentity();
        if (!persisted || persisted.deviceId !== previous.deviceId ||
            persisted.spaceId !== previous.spaceId) {
          throw new Error("Sync identity changed; reload settings before disconnecting.");
        }
        await clearDeviceIdentity();
        await clearPendingPairing();
        await clearOwnerInvitation();
      });
      identity = null;
      inviteCode = "";
      invitationId = "";
      devices = [];
      mode = "overview";
      consent = false;
      notifyDeviceIdentityChanged();
      notice = "Local sync disconnected. Your data is still in this browser. Create a new space to re-enable synchronization.";
    });
  }

  async function refreshDevices() {
    await action(async () => {
      if (!identity || identity.status !== "paired") return;
      devices = (await listPairedDevices(identity)).devices;
    });
  }
  async function revoke(deviceId:string) {
    if (!window.confirm("Remove this device's future sync access? Its local data will remain stored.")) return;
    await action(async () => {
      if (!identity || identity.status !== "paired") return;
      await revokePairedDevice(identity,deviceId);
      devices = (await listPairedDevices(identity)).devices;
      notice = "Device access revoked. Previously downloaded local data is not erased.";
    });
  }
  async function copy(value:string) {
    await action(async () => {
      await navigator.clipboard.writeText(value);
      notice = "Copied.";
    });
  }
  onMount(() => {
    let active = true;
    deviceName = defaultDeviceLabel();
    siteOrigin = location.origin;
    const raw = location.hash;
    if (raw.includes("pair=")) {
      // Clear the secret from the visible URL/history before any network call.
      history.replaceState(history.state,"",location.pathname + location.search);
      try { const parsed = readPairingFragment(raw); if (parsed) {joinCode = parsed;mode = "join";} }
      catch (cause) {error = explainSyncFailure(cause);}
    }
    void action(async () => {
      try {
        const [response] = await Promise.all([
          fetch("/api/sync/status",{credentials:"omit",cache:"no-store"}),
          loadIdentity()
        ]);
        if (active && response.ok) {
          const body: unknown = await response.json();
          available = !!body && typeof body==="object" && (body as {enabled?:unknown}).enabled===true;
        }
      } finally {
        loaded = true; // service outage must never trap Settings on loading
      }
    });
    const off = subscribeSyncStatus(next => {status = next;});
    let polling = false;
    const pollPairing = async () => {
      // Poll only while the pairing UI is visible. Never overlap slow requests
      // across interval ticks; a pending invitation needs at most one check.
      if (!active || busy || polling || !available ||
          document.visibilityState === "hidden") return;
      const needsJoin = identity?.status === "pending" && identity.enrollmentKind === "join";
      if (!inviteCode && !needsJoin) return;
      polling = true;
      try {
        if (inviteCode) await inspectInvite();
        else if (needsJoin) await pollJoin();
      } finally { polling = false; }
    };
    const timer = window.setInterval(() => { void pollPairing(); }, 5000);
    return () => {active=false;window.clearInterval(timer);off();};
  });
</script>

<section class="border-t border-border px-5 py-5">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-ui font-medium">Data &amp; Sync</h2>
      <p class="mt-1 text-meta text-muted-foreground">Keep your Modu data on your devices.</p>
    </div>
    <Cloud class="mt-0.5 size-4 shrink-0 text-muted-foreground"/>
  </div>

  {#if !loaded}
    <p class="mt-4 text-meta text-muted-foreground" role="status">Checking device connection…</p>
  {:else if !available}
    <p class="mt-4 text-meta text-muted-foreground">Cloud sync isn't available on this deployment. Local backup and restore still work.</p>
  {:else if identity?.status === "pending" && identity.enrollmentKind === "owner"}
    <div class="mt-4 space-y-3">
      <p class="text-ui font-medium">Finish connecting this browser</p>
      <p class="text-meta text-muted-foreground">Your progress is safe. Continue the interrupted setup.</p>
      <Button class="rounded-full shadow-none" disabled={busy} onclick={resumeOwner}>
        <RefreshCw class="size-4"/> Resume and sync
      </Button>
    </div>
  {:else if identity?.status === "pending" && identity.enrollmentKind === "join"}
    <div class="mt-4 space-y-3">
      <div class="flex items-center gap-2"><Smartphone class="size-4 text-primary"/><h3 class="text-ui font-medium">Waiting for approval</h3></div>
      <p class="text-meta text-muted-foreground">Approve this phone on your existing device. This page checks automatically.</p>
      {#if phoneConfirmation}
        <p class="font-mono text-title font-semibold tracking-widest" aria-label="Verification code">{phoneConfirmation}</p>
        <p class="text-meta text-muted-foreground">Make sure this code matches on both devices.</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" class="rounded-full shadow-none" disabled={busy} onclick={() => void pollJoin()}>
          <RefreshCw class="size-3.5"/> Retry
        </Button>
        <Button variant="ghost" size="sm" class="rounded-full" disabled={busy} onclick={cancelPendingJoin}>Cancel</Button>
      </div>
    </div>
  {:else if identity?.status === "paired"}
    <div class="mt-4 space-y-3">
      <div class="flex items-start gap-3">
        <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
          {#if status.kind === "up-to-date"}<Cloud class="size-5 text-emerald-700"/>
          {:else if status.kind === "needs-review"}<AlertTriangle class="size-5 text-destructive"/>
          {:else}<Cloud class="size-5 text-primary"/>{/if}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-ui font-medium">
            {status.kind === "up-to-date" ? "Up to date" :
             status.kind === "syncing" ? "Syncing changes…" :
             status.kind === "offline" ? "Saved on this device" :
             status.kind === "needs-review" ? "Changes need review" :
             status.kind === "blocked" ? "Sync needs attention" :
             status.kind === "revoked" ? "Access removed" : "Connected"}
          </p>
          <p class="mt-1 text-meta text-muted-foreground">{status.description}</p>
        </div>
      </div>
      {#if status.kind === "needs-review" || status.kind === "blocked" || status.kind === "error" || status.kind === "offline"}
        <Button variant="outline" size="sm" class="rounded-full shadow-none" disabled={busy} onclick={retrySync}>
          <RefreshCw class="size-3.5"/> Retry sync
        </Button>
      {/if}
      {#if !inviteCode}
        <Button size="sm" class="rounded-full shadow-none" disabled={busy} onclick={makeInvite}>
          <Plus class="size-3.5"/> Connect another device
        </Button>
      {:else}
        <PairingInvitePanel
          link={pairingLink}
          deviceName={pendingName}
          confirmation={pendingConfirmation}
          {busy}
          onCopy={() => void copy(pairingLink)}
          onCancel={() => {inviteCode="";invitationId="";void clearOwnerInvitation();}}
          onApprove={() => void approve()}
        />
      {/if}
    </div>
  {:else if mode === "join"}
    <div class="mt-4 space-y-3">
      <h3 class="text-ui font-medium">Connect to an existing device</h3>
      <p class="text-meta text-muted-foreground">Open the invitation link or paste it here. Your existing device will approve the connection.</p>
      <label class="block text-meta">Invitation
        <textarea rows="3" class="mt-1 w-full rounded-lg border border-border bg-background p-3 font-mono text-meta"
          bind:value={joinCode} placeholder="Paste your one-time invitation code"></textarea>
      </label>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" class="rounded-full shadow-none" disabled={busy || !joinCode.trim()} onclick={beginJoin}>Request approval</Button>
        <Button size="sm" variant="ghost" class="rounded-full" onclick={() => mode="overview"}>Back</Button>
      </div>
    </div>
  {:else if mode === "recover"}
    <div class="mt-4 space-y-3">
      <p class="text-ui font-medium">Recover access</p>
      <p class="text-meta text-muted-foreground">Recovery revokes every previously connected device. All local data stays on those devices.</p>
      <label class="block text-meta">Recovery code
        <input type="password" autocomplete="off" bind:value={recoveryInput}
          class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"/>
      </label>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" class="rounded-full shadow-none" disabled={busy || !recoveryInput.trim()} onclick={restoreAccess}>Recover</Button>
        <Button size="sm" variant="ghost" class="rounded-full" onclick={() => mode="overview"}>Back</Button>
      </div>
    </div>
  {:else if consent}
    <div class="mt-4 space-y-3">
      <p class="text-ui font-medium">Enable cloud sync?</p>
      <p class="text-meta text-muted-foreground">Your module data will be uploaded to Cloudflare. Sync is not end-to-end encrypted, so the server can read it. Export a backup before your first sync.</p>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" class="rounded-full shadow-none" disabled={busy} onclick={startOwner}>Enable and sync</Button>
        <Button size="sm" variant="ghost" class="rounded-full" disabled={busy} onclick={() => consent=false}>Cancel</Button>
      </div>
    </div>
  {:else}
    <div class="mt-4 space-y-3">
      <p class="text-ui font-medium">Your work, on every device</p>
      <p class="text-meta text-muted-foreground">Keep your focus sessions, habits, and learning progress together.</p>
      <Button size="sm" class="rounded-full shadow-none" disabled={busy} onclick={() => consent=true}>
        <Cloud class="size-3.5"/> Turn on sync
      </Button>
      <div>
        <button class="text-meta text-muted-foreground underline underline-offset-4 hover:text-foreground" onclick={() => mode="join"}>
          Connect to an existing device
        </button>
      </div>
    </div>
  {/if}

  {#if setupStage}
    <p role="status" class="mt-3 text-meta text-primary">
      {setupStage === "checking" ? "Checking local data…" :
       setupStage === "creating" ? "Setting up private sync space…" :
       setupStage === "capturing" ? "Preparing local modules…" :
       setupStage === "uploading" ? "Uploading initial changes…" : "Connected"}
    </p>
  {/if}
  {#if recoveryCode}
    <div class="mt-4 space-y-2 rounded-lg border border-border bg-muted p-3">
      <p class="text-ui font-medium">Save your recovery code</p>
      <p class="text-meta text-muted-foreground">Shown only once. Use it if your device is lost.</p>
      <p class="break-all font-mono text-meta">{recoveryCode}</p>
      <Button variant="outline" size="sm" class="rounded-full shadow-none" onclick={() => copy(recoveryCode)}>
        <Copy class="size-3.5"/> Copy recovery code
      </Button>
    </div>
  {/if}
  {#if error}<p role="alert" class="mt-3 text-meta text-destructive">{error}</p>{/if}
  {#if notice}<p role="status" class="mt-3 text-meta text-muted-foreground">{notice}</p>{/if}

  <div class="mt-5 border-t border-border pt-3">
    <button class="flex w-full items-center justify-between py-2 text-ui text-muted-foreground hover:text-foreground"
      aria-expanded={advanced} onclick={() => advanced=!advanced}>
      <span>Advanced device settings</span><ChevronRight class={advanced ? "size-4 rotate-90 transition-transform" : "size-4 transition-transform"}/>
    </button>
    {#if advanced}
      <div class="space-y-3 pt-2">
        {#if identity?.status === "paired"}
          <div class="flex items-center justify-between gap-2">
            <span class="text-meta text-muted-foreground">Authorized devices</span>
            <Button variant="outline" size="sm" class="rounded-full shadow-none" onclick={refreshDevices} disabled={busy}>Refresh</Button>
          </div>
          {#each devices as device (device.deviceId)}
            <div class="flex items-center gap-2 border-b border-border py-2">
              {#if device.deviceId === identity.deviceId}<Laptop class="size-4 text-muted-foreground"/>{:else}<Smartphone class="size-4 text-muted-foreground"/>{/if}
              <span class="min-w-0 flex-1 truncate text-meta">{device.name} {device.deviceId === identity.deviceId ? "(this browser)" : ""}</span>
              {#if !device.revoked && device.deviceId !== identity.deviceId}
                <Button variant="ghost" size="sm" class="rounded-full" onclick={() => revoke(device.deviceId)}>Revoke</Button>
              {:else if device.revoked}<span class="text-meta text-muted-foreground">Revoked</span>{/if}
            </div>
          {/each}
          <div class="border-t border-border pt-3">
            <p class="mb-2 text-meta text-muted-foreground">
              Restored local data causing a sync conflict? Disconnect this browser before creating a new sync space.
              Local data is preserved; the previous cloud space is not deleted.
            </p>
            <Button variant="outline" size="sm" class="rounded-full shadow-none"
              disabled={busy} onclick={() => void disconnectLocalSync()}>
              Disconnect this browser
            </Button>
          </div>
        {:else if !identity}
          <button class="text-meta text-muted-foreground underline underline-offset-4" onclick={() => mode="recover"}>Recover a lost device</button>
        {/if}
      </div>
    {/if}
  </div>
</section>
