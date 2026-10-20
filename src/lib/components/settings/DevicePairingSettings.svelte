<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { globalDataPorts } from "#lib/platform/data/registry.ts";
  import { requireNoOtherModuTabs } from "#lib/platform/data/peer-tabs.ts";
  import {
    readDeviceIdentity, storeDeviceIdentity, markDevicePaired, generateDeviceIdentity,
    clearDeviceIdentity, type StoredDeviceIdentity
  } from "#lib/platform/data/device-identity.ts";
  import {
    initializeSpace, decodePairingCode, joinWithCode, pollPairing, recoverSpace,
    createPairingInvite, inspectPairingInvite, approvePairingInvite,
    listPairedDevices, revokePairedDevice, encodePairingCode
  } from "#lib/platform/data/pairing-client.ts";
  import { Copy, KeyRound, Link2, ShieldCheck, RefreshCw } from "lucide-svelte";

  let identity = $state<StoredDeviceIdentity | null>(null);
  let deviceName = $state("This browser");
  let pairingCodeInput = $state("");
  let recoverySpaceId = $state("");
  let recoveryInput = $state("");
  let recoveryKey = $state("");
  let pairingCode = $state("");
  let activeInvitation = $state("");
  let myConfirmation = $state("");
  let pendingName = $state("");
  let pendingConfirmation = $state("");
  let deviceList = $state<Array<{ deviceId: string; name: string; addedAt: number; revoked: boolean }>>([]);
  let busy = $state(false);
  let notice = $state("");
  let error = $state("");
  let mode = $state<"create" | "join" | "recover">("create");

  async function execute(task: () => Promise<void>) {
    if (busy) return;
    busy = true; error = ""; notice = "";
    try { await task(); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Device operation failed."; }
    finally { busy = false; }
  }
  async function loadIdentity() {
    identity = await readDeviceIdentity();
    if (identity) deviceName = identity.name;
  }
  async function startOwnerCapture() {
    if (!identity || identity.status !== "pending") throw new Error("No pending setup exists.");
    if (!navigator.locks?.request) throw new Error("Web Locks are required to enroll local data safely.");
    await requireNoOtherModuTabs();
    await navigator.locks.request("modu-global-restore", { mode: "exclusive" }, async () => {
      // Idempotent per-module baseline, but no cloud changes are uploaded.
      // Partial capture remains pending and can be resumed with this device ID.
      for (const module of globalDataPorts) {
        await module.beginSyncCapture(identity!.deviceId);
      }
      await markDevicePaired();
    });
    await loadIdentity();
    notice = "This browser is authorized. Cross-device data application remains disabled.";
  }
  function createSpace() {
    void execute(async () => {
      if (identity) throw new Error("This browser already has device credentials.");
      for (const module of globalDataPorts) await module.inspect();
      const device = await generateDeviceIdentity(deviceName);
      const result = await initializeSpace(device);
      await storeDeviceIdentity({ ...device, id: "current", spaceId: result.spaceId, status: "pending" });
      await loadIdentity();
      recoveryKey = result.recoveryKey; // intentionally never persisted
      notice = "Copy your recovery key before leaving this page. It is shown only once.";
    });
  }
  function finishOwnerSetup() { void execute(startOwnerCapture); }
  function joinSpace() {
    void execute(async () => {
      if (identity) throw new Error("This browser already has device credentials.");
      const decoded = decodePairingCode(pairingCodeInput);
      const device = await generateDeviceIdentity(deviceName);
      const result = await joinWithCode(pairingCodeInput, device);
      await storeDeviceIdentity({ ...device, id: "current", spaceId: decoded.spaceId, status: "pending" });
      await loadIdentity();
      myConfirmation = result.confirmation;
      notice = "Verify the same six-digit code on the existing device and approve there.";
    });
  }
  function checkJoin() {
    void execute(async () => {
      if (!identity || identity.status !== "pending") throw new Error("No pairing request is pending.");
      const result = await pollPairing(pairingCodeInput);
      if (result.status === "approved") {
        await markDevicePaired();
        await loadIdentity();
        notice = "Device approved. Local data has not been replaced or uploaded.";
      } else notice = "Still awaiting approval on the existing device.";
    });
  }
  function recoverDevice() {
    void execute(async () => {
      if (identity) throw new Error("This browser already contains device credentials.");
      if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(recoverySpaceId)) {
        throw new Error("Enter the sync space ID from your recovery backup.");
      }
      const device = await generateDeviceIdentity(deviceName);
      const result = await recoverSpace(recoverySpaceId, recoveryInput.trim(), device);
      await storeDeviceIdentity({ ...device, id: "current", spaceId: recoverySpaceId, status: "paired" });
      await loadIdentity();
      recoveryKey = result.recoveryKey;
      recoveryInput = "";
      notice = "Recovery authorized. Your previous recovery key is no longer valid.";
    });
  }
  function copy(text: string) {
    void execute(async () => {
      await navigator.clipboard.writeText(text);
      notice = "Copied.";
    });
  }
  function invite() {
    void execute(async () => {
      if (!identity) return;
      const result = await createPairingInvite(identity);
      activeInvitation = result.invitationId;
      pairingCode = encodePairingCode(identity.spaceId, result.invitationId, result.secret);
      notice = "Invitation expires in five minutes. Share the code privately.";
    });
  }
  function refreshInvitation() {
    void execute(async () => {
      if (!identity || !activeInvitation) return;
      const result = await inspectPairingInvite(identity, activeInvitation);
      pendingName = result.candidateName ?? "";
      pendingConfirmation = result.confirmation ?? "";
      notice = result.status === "awaiting-device"
        ? "No device has requested this invitation yet."
        : "Compare the six-digit code with the new device before approval.";
    });
  }
  function approve() {
    void execute(async () => {
      if (!identity || !activeInvitation || !pendingConfirmation) return;
      await approvePairingInvite(identity, activeInvitation, pendingConfirmation);
      pendingName = ""; pendingConfirmation = ""; pairingCode = ""; activeInvitation = "";
      notice = "New device approved. No data was transferred automatically.";
      const result = await listPairedDevices(identity);
      deviceList = result.devices;
    });
  }
  function refreshDevices() {
    void execute(async () => {
      if (!identity || identity.status !== "paired") return;
      const result = await listPairedDevices(identity);
      deviceList = result.devices;
    });
  }
  function revoke(deviceId: string) {
    if (!window.confirm("Revoke this device's future access to the sync space?")) return;
    void execute(async () => {
      if (!identity) return;
      await revokePairedDevice(identity, deviceId);
      deviceList = (await listPairedDevices(identity)).devices;
      notice = "Device revoked. Already-downloaded local data cannot be remotely erased.";
    });
  }
  function disconnect() {
    if (!window.confirm("Forget this browser's pairing credentials? Existing local module data will remain, including any pending sync operations.")) return;
    void execute(async () => {
      // Intentionally does NOT alter feature outbox: deleting it could lose data.
      // Re-enrollment is blocked by old capture IDs until migration/recovery.
      await clearDeviceIdentity(); identity = null;
      notice = "Credentials cleared. Local module data is unchanged.";
    });
  }
  onMount(() => { void execute(loadIdentity); });
</script>

<section class="border-t border-border px-5 py-5">
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2 class="text-ui font-medium">Device pairing</h2>
      <p class="mt-1 text-meta text-muted-foreground">Authorize browsers without an account. Cross-device data merge is not enabled yet.</p>
    </div>
    <ShieldCheck class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  </div>
  {#if identity}
    <div class="mt-4 space-y-3">
      <div class="flex items-center justify-between gap-3 text-meta">
        <span><strong>{identity.name}</strong> · {identity.status === "paired" ? "Authorized" : "Setup pending"}</span>
        <span class="text-muted-foreground">ECDSA key stored locally</span>
      </div>
      <div class="break-all text-meta text-muted-foreground">Space: <code>{identity.spaceId}</code></div>
      {#if identity.status === "pending"}
        {#if myConfirmation}
          <p class="text-meta">Verify on your existing browser: <strong class="tabular-nums">{myConfirmation}</strong></p>
          <Button variant="outline" size="sm" class="rounded-full shadow-none" disabled={busy || !pairingCodeInput} onclick={checkJoin}>
            <RefreshCw class="size-3.5"/> Check approval
          </Button>
        {:else}
          <p class="text-meta text-muted-foreground">If this browser created the space, resume its local capture. No data will be uploaded.</p>
          <Button size="sm" class="rounded-full shadow-none" disabled={busy} onclick={finishOwnerSetup}>Complete local setup</Button>
        {/if}
      {:else}
        <div class="flex flex-wrap gap-2">
          <Button size="sm" class="rounded-full shadow-none" disabled={busy} onclick={invite}><Link2 class="size-3.5"/> Pair another device</Button>
          <Button variant="outline" size="sm" class="rounded-full shadow-none" disabled={busy} onclick={refreshDevices}><RefreshCw class="size-3.5"/> Devices</Button>
        </div>
        {#if pairingCode}
          <div class="rounded-lg bg-muted px-3 py-3">
            <p class="text-meta font-medium">One-time invitation code</p>
            <p class="mt-1 break-all font-mono text-meta text-muted-foreground">{pairingCode}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" class="rounded-full" onclick={() => copy(pairingCode)}><Copy class="size-3.5"/> Copy</Button>
              <Button size="sm" variant="outline" class="rounded-full" onclick={refreshInvitation} disabled={busy}>Check request</Button>
            </div>
            {#if pendingName}
              <p class="mt-3 text-meta">Request: <strong>{pendingName}</strong> · Compare code <strong class="tabular-nums">{pendingConfirmation}</strong></p>
              <Button size="sm" class="mt-2 rounded-full" onclick={approve} disabled={busy}>Approve matched device</Button>
            {/if}
          </div>
        {/if}
        {#each deviceList as device (device.deviceId)}
          <div class="flex items-center justify-between gap-2 border-t border-border py-2 text-meta">
            <div><strong>{device.name}</strong><span class="ml-2 text-muted-foreground">{device.revoked ? "Revoked" : device.deviceId === identity.deviceId ? "This browser" : "Authorized"}</span></div>
            {#if !device.revoked && device.deviceId !== identity.deviceId}
              <Button variant="ghost" size="sm" class="rounded-full" disabled={busy} onclick={() => revoke(device.deviceId)}>Revoke</Button>
            {/if}
          </div>
        {/each}
      {/if}
      <Button variant="ghost" size="sm" class="rounded-full text-muted-foreground" disabled={busy} onclick={disconnect}>Forget device credentials</Button>
    </div>
  {:else}
    <div class="mt-4 flex flex-wrap gap-1.5">
      <Button variant={mode === "create" ? "default" : "outline"} size="sm" class="rounded-full shadow-none" onclick={() => mode = "create"}>New sync space</Button>
      <Button variant={mode === "join" ? "default" : "outline"} size="sm" class="rounded-full shadow-none" onclick={() => mode = "join"}>Join device</Button>
      <Button variant={mode === "recover" ? "default" : "outline"} size="sm" class="rounded-full shadow-none" onclick={() => mode = "recover"}>Recovery</Button>
    </div>
    <div class="mt-3 space-y-2">
      <label class="block text-meta">Device label
        <input class="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 outline-none" maxlength="60" bind:value={deviceName}/>
      </label>
      {#if mode === "join"}
        <label class="block text-meta">One-time pairing code
          <textarea class="mt-1 min-h-20 w-full rounded-lg border border-border bg-background p-3 font-mono text-meta" bind:value={pairingCodeInput} placeholder="Paste the invitation code from an authorized browser"></textarea>
        </label>
        <Button size="sm" class="rounded-full" disabled={busy || !pairingCodeInput.trim()} onclick={joinSpace}>Request approval</Button>
      {:else if mode === "recover"}
        <label class="block text-meta">Sync space ID
          <input class="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" bind:value={recoverySpaceId}/>
        </label>
        <label class="block text-meta">Recovery key
          <input type="password" class="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" bind:value={recoveryInput}/>
        </label>
        <Button size="sm" class="rounded-full" disabled={busy || !recoveryInput.trim()} onclick={recoverDevice}><KeyRound class="size-3.5"/> Recover access</Button>
      {:else}
        <p class="text-meta text-muted-foreground">Creates a private sync space. Local data stays offline until remote apply is explicitly enabled.</p>
        <Button size="sm" class="rounded-full" disabled={busy} onclick={createSpace}>Create sync space</Button>
      {/if}
    </div>
  {/if}
  {#if recoveryKey}
    <div class="mt-4 rounded-lg border border-border bg-muted p-3">
      <p class="text-meta font-medium">Recovery key — shown only once</p>
      <p class="mt-1 break-all font-mono text-meta">{recoveryKey}</p>
      <Button variant="outline" size="sm" class="mt-2 rounded-full" onclick={() => copy(recoveryKey)}><Copy class="size-3.5"/> Copy recovery key</Button>
    </div>
  {/if}
  {#if error}<p role="alert" class="mt-3 text-meta text-destructive">{error}</p>{/if}
  {#if notice}<p role="status" class="mt-3 text-meta text-muted-foreground">{notice}</p>{/if}
</section>
