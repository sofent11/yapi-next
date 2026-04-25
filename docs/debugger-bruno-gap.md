# YAPI Debugger vs Bruno OSS Gap

Reference baseline:

- Bruno main clone: `/Users/sofent/work/_references/bruno-main`
- Bruno v3.3.0 clone: `/Users/sofent/work/_references/bruno-v3.3.0`
- Bruno OSS tag inspected: `v3.3.0` (`34460d5`)

This document tracks parity against Bruno OSS while keeping YAPI Debugger's local-first YAML workspace format.

## Current Parity Matrix

| Area | Bruno OSS capability | YAPI Debugger status | Notes |
|---|---|---|---|
| HTTP requests | Method, URL, params, headers, body, auth | Implemented | Existing workbench covers the primary REST flow. |
| Body modes | JSON, text, XML, GraphQL, SPARQL, file, form URL encoded, multipart | Partial | Schema/UI/runtime now accept XML, GraphQL, SPARQL, and file body for HTTP send. GraphQL query variables are materialized as JSON payloads, and the UI can fetch introspection, cache the schema summary on the request, clear stale cache entries, preserve that cache through Bruno JSON/OpenCollection JSON round-trips, and generate query/mutation/subscription drafts from root fields with scalar, enum, list, and input-object variable placeholders. The debugger now also exposes a selectable GraphQL explorer with child-field toggles and inline fragments before inserting a draft. Fragment composition, reusable saved operations, and broader schema navigation polish are still open. |
| Request kinds | HTTP, GraphQL, gRPC, WebSocket, JS | Partial | Schema has `kind: http/graphql/grpc/websocket/script`; GraphQL sends over HTTP POST. WebSocket now has batch connect/send/receive, live connect/send/close plus reconnect controls, persists the most recent timeline on the request, supports json/text/base64 binary outgoing frames, preserves named saved examples on the request, and exposes richer live-event previews for json/text/base64 payloads. gRPC/script item runtimes and broader session authoring polish are still pending. |
| Auth | Basic, bearer, API key, OAuth2, OAuth1, AWS v4, Digest, NTLM, WSSE | Partial | Schema/UI preserve all major Bruno auth families. Runtime signing is implemented for basic/bearer/API key, cached OAuth2 tokens, OAuth1 HMAC-SHA1/PLAINTEXT headers or query params, AWS Signature v4 headers, Digest challenge retry, WSSE UsernameToken headers, and NTLM Type 1 negotiate headers during request resolution. Full NTLM challenge/response session continuation still needs deeper runtime support. |
| Variables | Collection/folder/request/response/env/global/prompt vars | Partial | Schema has scoped variable rows. Runtime currently resolves project/env/runtime/data/step sources. Folder and prompt UX are pending. |
| Scripts/tests | Pre-request, post-response, tests, assertions | Partial | Existing case scripts and checks remain. Request/collection-level script fields are now in schema; full Bruno JS API parity is pending. |
| Runner | GUI runner, tags, env matrix, reports | Partial | Existing collection runner supports iteration, env matrix, retries, reports. GUI and CLI can filter runs by tags across step/request/case metadata, collection `runnerTags` act as default filters, reports expose active filters, and failed reruns inherit report filters. Broader CLI packaging/report presets are pending. |
| Import/export | Bruno, Postman, OpenAPI, Insomnia, WSDL, OpenCollection, env | Partial | Existing OpenAPI/Postman/HAR remain. Bruno single `.bru` HTTP request import/export maps method/url/query/path params/headers/body/auth/scripts/tests/docs across the local workspace model. Selected collections can export/import a Bruno folder (`bruno.json`, `collection.bru`, `folder.bru`, request `.bru` files, `environments/*.bru`) into requests, environments, and a runnable YAPI Collection. Bruno JSON collections now import folders, HTTP/GraphQL/WebSocket/gRPC/script items, and runnable collection steps, covering Bruno's WSDL JSON converter output; debugger collections can also serialize to Bruno JSON with folder nesting and steps for round-trip fixtures, and the desktop Collection designer exposes both Bruno folder and Bruno JSON export actions. Insomnia v4 JSON import maps workspaces/folders/requests/environments plus common body/auth shapes. OpenCollection YAML/JSON import maps HTTP, GraphQL, WebSocket, gRPC, script items, nested folders, environments, params, headers/metadata, body/message payloads, auth, request vars, scripts/tests/assertion notes, docs, and HTTP response examples. Debugger collections can now serialize to OpenCollection JSON with nested folders, environments, scripts, variables, and mixed request kinds, and the desktop Collection designer exposes the OpenCollection export action. WSDL XML import creates SOAP operations from services/bindings/portTypes/messages/types, including complex type references, base extensions, referenced elements, and typed RPC-style message parts, into XML POST requests with `Content-Type` and `SOAPAction`. gRPC/script imports are preservation-first until native runtime support lands. |
| Response viewer | JSON/XML/HTML/text/binary/media/PDF, search, download | Partial | Existing body/json/headers/cookies/compare/raw remain. Response content typing is now in schema; richer previews are pending. |
| Git | Clone, status, visual diff, pull/push | Partial | Existing status/pull/push/open terminal remain. Visual diff and clone UI are pending. |
| Preferences | Theme, font, zoom, keybindings, proxy, certs, cache | Partial | A dedicated Preferences center now manages theme, UI zoom, code font size, command-palette shortcut presets, runtime proxy/certificate defaults, and local cache clearing. Dark mode currently relies on debugger-side CSS variables while Mantine/CodeMirror-specific theming remains lighter-weight than Bruno. |
| UI density | Mature API IDE layout | In progress | Welcome/workbench styles are being tightened toward a calm industrial IDE. |

## Implementation Guardrails

- Do not vendor Bruno source into this repository.
- Keep YAPI Debugger's workspace format as the durable source of truth.
- Preserve existing YAPI-specific flows: import repair, browser capture, cases, collection reports, and Git helper.
- Any Bruno-parity item that is schema/UI-only must be documented as pending runtime support until it can send, import/export, and test successfully.

## Next Milestones

1. Reassess remaining partial parity items after the NTLM and Preferences milestones: vars UX, Bruno JS API parity, richer response previews, runner presets, Git clone/diff UI, and broader UI density polish.
2. Decide whether the next parity pass should prioritize scripting/variables depth or response-viewer/Git workflow depth.
