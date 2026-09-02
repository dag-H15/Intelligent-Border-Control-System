# Fingerprint + Iris device integration

Adds server-side drivers for a USB fingerprint scanner and iris camera,
talking to their local vendor agents, plus routes an officer's checkpoint
UI can call to trigger a capture and get back an image ready to hand to
your existing `/api/enrollment` and `/api/verification` endpoints.

## Files

```
server/src/services/deviceDrivers/
  types.ts              # BiometricDeviceDriver interface, DeviceError
  localAgentClient.ts    # shared HTTP client (timeouts, error mapping)
  fingerprintDriver.ts   # LocalAgentFingerprintDriver
  irisDriver.ts          # LocalAgentIrisDriver (+ captureBothEyes)
  index.ts               # singleton getters + verifyDevicesAtStartup()
server/src/controllers/deviceController.ts
server/src/routes/deviceRoutes.ts
```

## 1. Wire the routes

In `server/src/app.ts`, alongside the other route imports:

```ts
import deviceRoutes from "./routes/deviceRoutes";
// ...
app.use("/api/devices", deviceRoutes);
```

Optional but recommended — fail fast at boot if hardware isn't reachable,
instead of an officer discovering it mid-verification. In `server.ts`:

```ts
import { verifyDevicesAtStartup } from "./services/deviceDrivers";

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await verifyDevicesAtStartup(); // logs a warning per device, doesn't crash the server
});
```

## 2. Environment variables

```
FINGERPRINT_AGENT_URL=https://localhost:8443
FINGERPRINT_SDK_LICENSE=<vendor license string, if your SDK requires one>
FINGERPRINT_AGENT_ALLOW_SELF_SIGNED=true   # only if the vendor agent uses a self-signed local cert

IRIS_AGENT_URL=https://localhost:8444
IRIS_AGENT_ALLOW_SELF_SIGNED=true
```

## 3. Adjust the vendor-specific parts

The endpoint paths in `ENDPOINTS` at the top of `fingerprintDriver.ts` and
`irisDriver.ts`, and the JSON field names read in `capture()`/`connect()`,
are placeholders shaped like a typical vendor local-agent API. They will
not match your SDK exactly — open your SDK's local agent/WebAPI reference
and update:

- `ENDPOINTS.deviceInfo` / `status` / `capture` / `release` — actual paths
- The field names read off the JSON response (`imageBase64`, `format`,
  `quality`, `errorCode`, etc.) — map them to whatever your SDK actually
  returns
- The image format the SDK gives you (`bmp`/`png`/raw) — the AI service's
  `decode_base64_image` (OpenCV `imdecode`) handles PNG/JPEG/BMP fine, so
  as long as `format` is accurate you don't need to convert anything

If your SDK instead ships a native library with no local HTTP agent (some
older Windows-only SDKs only expose a C DLL / COM object), swap
`LocalAgentClient` for a native binding (`ffi-napi`/`koffi`) or a small
native Node addon behind the same `BiometricDeviceDriver` interface —
none of the calling code (controller/routes) needs to change.

## 4. Client-side capture flow

The officer's checkpoint UI calls the new endpoints to get an image, then
feeds it into your existing enrollment/verification calls exactly like a
manually uploaded image:

```ts
// 1. Trigger a capture from the physically attached hardware
const fpCapture = await fetch("/api/devices/fingerprint/capture", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ timeoutMs: 10000 }),
}).then((r) => r.json());
// -> { imageBase64, format, deviceQualityHint, capturedAt, biometricType: "fingerprint" }

const irisCapture = await fetch("/api/devices/iris/capture-both", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ timeoutMs: 12000 }),
}).then((r) => r.json());
// -> { left: {...}, right: {...} }

// 2. Feed straight into the existing verification call
await fetch("/api/verification", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    fan: travelerFan,
    captureMode: "SCANNER",
    fingerprintData: fpCapture.imageBase64,
    irisData: irisCapture.left.imageBase64, // or right, depending on which template was enrolled
  }),
});
```

## 5. Error handling an officer will actually see

`DeviceError` codes map to HTTP statuses in `deviceController.ts`:

| Code                     | HTTP | Meaning                                              |
|--------------------------|------|-------------------------------------------------------|
| `AGENT_UNREACHABLE`      | 503  | Vendor service not running / device unplugged         |
| `NOT_CONNECTED`          | 503  | Agent up, but no device attached                      |
| `TIMEOUT`                | 504  | Agent didn't respond in time                          |
| `NO_FINGER_OR_EYE_DETECTED` | 408 | Capture window elapsed with nothing presented       |
| `AGENT_ERROR`            | 502  | Agent returned a non-2xx / malformed response         |

Surface these distinctly in the UI (e.g. "no device detected — check the
scanner is plugged in" vs. "no finger detected — try again") rather than a
generic failure, since they need different actions from the officer.

## What this does *not* do

- Doesn't touch the token-simulation bypass or the fingerprint/iris
  matching logic flagged earlier — this is purely the hardware capture
  layer feeding into the existing pipeline.
- Doesn't fix the 50/50 fingerprint+iris score averaging in
  `verificationService.ts` — a checkpoint that only has one of the two
  devices attached will still need that fixed separately to avoid the
  request erroring out when the other modality is absent.
