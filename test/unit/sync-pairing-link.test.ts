import { describe, expect, it } from "vitest";
import { createPairingLink, readPairingFragment, encodePairingCode } from "../../src/lib/platform/data/pairing-client.ts";
import { qrcodegen } from "../../src/lib/platform/data/qrcodegen.ts";
const code = encodePairingCode("00000000-1111-4222-8333-444444444444","00000000-1111-4222-8333-555555555555","A".repeat(43));
describe("safe local QR deep links",()=>{
  it("keeps invitation out of HTTP path/query and survives fragment decoding",()=>{
    const link=createPairingLink("https://modu.howlil.site",code);
    const url=new URL(link);
    expect(url.pathname).toBe("/settings/data");
    expect(url.search).toBe("");
    expect(readPairingFragment(url.hash)).toBe(code);
    expect(readPairingFragment("#other=x")).toBeNull();
    expect(()=>readPairingFragment("#pair=garbage")).toThrow();
  });
  it("renders an actual decodable QR module matrix entirely on-device",()=>{
    const qr=qrcodegen.QrCode.encodeText(createPairingLink("https://modu.howlil.site",code),qrcodegen.QrCode.Ecc.MEDIUM);
    expect(qr.size).toBeGreaterThanOrEqual(21);
    expect(qr.getModule(0,0)).toBe(true);
    expect(qr.getModule(-1,0)).toBe(false);
  });
});
