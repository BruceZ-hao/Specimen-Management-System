# WeChat Mini Program Evaluation

## Conclusion

This mobile client can be adapted to WeChat Mini Program without rewriting the business flows from scratch.

The current `uni-app` structure is a good base, but the project is not yet "directly buildable" for WeChat Mini Program because it still assumes:

- dynamic server base URL switching
- App-only launch arguments
- App-only barcode scanning from local images
- App-only native WeChat image sharing
- direct remote image preview for protected attachments

The recommended path is to keep the current App client and add a WeChat Mini Program target in parallel.

## What can be reused directly

These areas are mostly cross-platform already:

- login flow in `apps/miniprogram/src/pages/login/index.vue`
- task list flow in `apps/miniprogram/src/pages/tasks/index.vue`
- sample detail flow in `apps/miniprogram/src/pages/sample/index.vue`
- step detail and report upload flow in `apps/miniprogram/src/pages/step/index.vue`
- mine/profile flow in `apps/miniprogram/src/pages/mine/index.vue`
- request and upload wrappers in `apps/miniprogram/src/utils/request.js`
- backend JWT login API and task/sample/step APIs

The core business model looks portable. The main work is at the platform boundary, not in the task logic itself.

## Must-change items

### 1. Server address configuration

Current code lets the mobile client change the backend URL at runtime:

- `apps/miniprogram/src/utils/config.js`
- `apps/miniprogram/src/pages/server-settings/index.vue`
- `apps/miniprogram/src/utils/scan.js`
- `apps/miniprogram/src/App.vue`

This is fine for App, but not a good fit for WeChat Mini Program.

Mini Program requests require:

- HTTPS
- domain whitelisting in WeChat admin
- stable request domains known before release

So the current "scan a QR code and write a temporary cpolar/ngrok address into the app" model should be replaced for Mini Program with:

- one fixed production API domain, or
- a small set of stable environment domains

Recommendation:

- keep dynamic base URL only for App
- use a fixed compile-time or environment-based API base URL for Mini Program
- hide or remove the server settings page in Mini Program builds

### 2. App launch arguments

`apps/miniprogram/src/App.vue` reads `plus.runtime.arguments` to auto-apply server config from deep links.

That behavior is App-only and should be excluded from Mini Program builds.

Recommendation:

- wrap this logic in platform-specific branches
- let Mini Program open normally without launch-argument based server injection

### 3. Scanning local images for QR codes

`apps/miniprogram/src/utils/scan.js` uses `plus.barcode.scan(path, ...)`, which is App-only.

For Mini Program:

- `uni.scanCode` camera scanning can stay
- scanning a QR code from a local image should be removed or reworked

Recommendation:

- keep camera scan if really needed
- drop "choose image then decode QR" on Mini Program v1

### 4. Sharing report images to WeChat

The current share implementation is App-native:

- `apps/miniprogram/src/utils/share.js`
- `plus.share.getServices(...)`
- `service.send(...)`

This does not map directly to Mini Program.

Mini Program sharing is normally:

- share the current page
- share a card/path
- not native "send this authenticated image file directly into a WeChat chat" in the same way as App

Recommendation:

- keep native image sharing only in App
- for Mini Program, use page sharing instead of direct image sending
- if needed, add a dedicated report preview/share page with `onShareAppMessage`

### 5. Protected attachment preview

This is the most important technical gap.

Current code previews report/project images by directly passing a protected URL into `uni.previewImage`:

- `apps/miniprogram/src/pages/sample/index.vue`
- `apps/miniprogram/src/pages/step/index.vue`

But the backend attachment route is guarded by JWT:

- `apps/server/src/sample/sample.controller.ts`
- `GET /samples/attachments/:attachmentId/file`
- JWT extracted only from `Authorization: Bearer ...` in `apps/server/src/auth/jwt.strategy.ts`

That means Mini Program cannot safely rely on direct remote image preview for protected files, because preview requests do not naturally carry the same auth model.

Recommendation:

- first `downloadFile` with auth headers
- then preview the returned temp file path

This probably should also become the shared approach for App to make file preview behavior consistent.

## Backend constraints

### 1. Stable public domain is required

The current backend still has deployment assumptions oriented around APK distribution and dynamic public URLs:

- `apps/server/src/system/system.controller.ts`
- `apps/server/src/system/system.service.ts`

This is fine for App delivery, but Mini Program needs:

- a long-lived HTTPS domain
- that domain registered in WeChat Mini Program request/download domain config

Temporary tunnel domains are a poor release target.

### 2. CORS is not the main blocker

`apps/server/src/main.ts` enables CORS broadly.

That is helpful for web/admin, but Mini Program compatibility is more about:

- legal request domains
- HTTPS
- attachment download strategy

### 3. Consider attachment access strategy

Today attachments are protected by Bearer token only. That is secure and clean, but awkward for share/preview flows across platforms.

Possible options:

1. Keep Bearer-only auth and always `downloadFile` first on mobile clients.
2. Add short-lived signed file URLs for preview/download.
3. Add a dedicated file proxy endpoint tailored for Mini Program preview flows.

For the smallest change, option 1 is enough.

## Recommended implementation plan

### Phase 1: Make the client dual-platform safe

1. Add `mp-weixin` config and build target.
2. Introduce a platform-aware config layer:
   - App: dynamic server address allowed
   - Mini Program: fixed API base URL
3. Hide or disable:
   - server settings page
   - image QR decode
   - native WeChat image share

### Phase 2: Fix file preview and file download behavior

1. Add a shared helper for authenticated image download.
2. Refactor sample and step image preview to:
   - download with headers
   - preview local temp file
3. Verify report upload still works on Mini Program.

### Phase 3: Add Mini Program-native sharing

1. Replace native share button behavior with page sharing.
2. Optionally add a report detail page whose route can be shared.

### Phase 4: Release prep

1. Move backend to stable HTTPS domain.
2. Configure WeChat Mini Program request/download domains.
3. Add `mp-weixin` app metadata and publish configuration.
4. Run full device verification on:
   - login
   - task list
   - sample detail
   - step completion
   - report upload
   - report preview
   - share page

## Estimated effort

If the backend already has a stable HTTPS domain, a first usable Mini Program version should be a moderate adaptation, not a rewrite.

Rough breakdown:

- platform splitting and config cleanup: low to medium
- file preview/authenticated download rework: medium
- Mini Program share redesign: low to medium
- release/domain setup: medium and operationally important

## Suggested v1 scope

For the fastest Mini Program launch, ship v1 with:

- login
- task list
- sample detail
- step detail
- report upload
- report preview via authenticated download

Delay these until v2 if needed:

- dynamic server configuration
- image-based QR recognition
- direct native image sharing to WeChat chat

