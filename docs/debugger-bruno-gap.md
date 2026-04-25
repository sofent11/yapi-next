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
| Body modes | JSON, text, XML, GraphQL, SPARQL, file, form URL encoded, multipart | Partial | Schema/UI/runtime now accept XML, GraphQL, SPARQL, and file body for HTTP send. GraphQL query variables are materialized as JSON payloads, and the UI can fetch introspection plus generate query/mutation/subscription drafts from root fields with default variables and one-level selections. A full nested query explorer is pending. |
| Request kinds | HTTP, GraphQL, gRPC, WebSocket, JS | Partial | Schema has `kind: http/graphql/grpc/websocket/script`; GraphQL sends over HTTP POST. WebSocket has a first-pass connect/send/receive session runner. gRPC and script item runtimes are pending. |
| Auth | Basic, bearer, API key, OAuth2, OAuth1, AWS v4, Digest, NTLM, WSSE | Partial | Schema/UI preserve all major Bruno auth families. Runtime signing is implemented for basic/bearer/API key, cached OAuth2 tokens, OAuth1 HMAC-SHA1/PLAINTEXT headers or query params, AWS Signature v4 headers, Digest challenge retry, and WSSE UsernameToken headers. NTLM runtime signing is pending. |
| Variables | Collection/folder/request/response/env/global/prompt vars | Partial | Schema has scoped variable rows. Runtime currently resolves project/env/runtime/data/step sources. Folder and prompt UX are pending. |
| Scripts/tests | Pre-request, post-response, tests, assertions | Partial | Existing case scripts and checks remain. Request/collection-level script fields are now in schema; full Bruno JS API parity is pending. |
| Runner | GUI runner, tags, env matrix, reports | Partial | Existing collection runner supports iteration, env matrix, retries, reports. GUI and CLI can filter runs by tags across step/request/case metadata, collection `runnerTags` act as default filters, reports expose active filters, and failed reruns inherit report filters. Broader CLI packaging/report presets are pending. |
| Import/export | Bruno, Postman, OpenAPI, Insomnia, WSDL, OpenCollection, env | Partial | Existing OpenAPI/Postman/HAR remain. Bruno single `.bru` HTTP request import/export maps method/url/query/path params/headers/body/auth/scripts/tests/docs across the local workspace model. Selected collections can export/import a Bruno folder (`bruno.json`, `collection.bru`, `folder.bru`, request `.bru` files, `environments/*.bru`) into requests, environments, and a runnable YAPI Collection. Bruno JSON collections now import folders, HTTP/GraphQL/WebSocket/gRPC/script items, and runnable collection steps, covering Bruno's WSDL JSON converter output; debugger collections can also serialize to Bruno JSON with folder nesting and steps for round-trip fixtures. Insomnia v4 JSON import maps workspaces/folders/requests/environments plus common body/auth shapes. OpenCollection YAML/JSON import maps HTTP, GraphQL, WebSocket, gRPC, script items, nested folders, environments, params, headers/metadata, body/message payloads, auth, request vars, scripts/tests/assertion notes, docs, and HTTP response examples. WSDL XML foundation imports SOAP operations from services/bindings/portTypes/messages/types into XML POST requests with `Content-Type` and `SOAPAction`. gRPC/script imports are preservation-first until native runtime support lands. |
| Response viewer | JSON/XML/HTML/text/binary/media/PDF, search, download | Partial | Existing body/json/headers/cookies/compare/raw remain. Response content typing is now in schema; richer previews are pending. |
| Git | Clone, status, visual diff, pull/push | Partial | Existing status/pull/push/open terminal remain. Visual diff and clone UI are pending. |
| Preferences | Theme, font, zoom, keybindings, proxy, certs, cache | Partial | Runtime settings now carry proxy/certificate paths. Dedicated preferences UI is pending. |
| UI density | Mature API IDE layout | In progress | Welcome/workbench styles are being tightened toward a calm industrial IDE. |

## Implementation Guardrails

- Do not vendor Bruno source into this repository.
- Keep YAPI Debugger's workspace format as the durable source of truth.
- Preserve existing YAPI-specific flows: import repair, browser capture, cases, collection reports, and Git helper.
- Any Bruno-parity item that is schema/UI-only must be documented as pending runtime support until it can send, import/export, and test successfully.

## Next Milestones

1. Expand GraphQL builder into a nested explorer: selectable child fields, argument defaults, fragments, and persisted schema cache.
2. Expand WebSocket runtime into a persistent timeline: manual send, reconnect, close controls, binary frames, and saved examples.
3. Implement remaining advanced auth signing: NTLM.
4. Deepen WSDL coverage for imported schemas and expose Bruno JSON export in the desktop UI.
5. Add Preferences center for proxy/cert/theme/keybindings/cache.
