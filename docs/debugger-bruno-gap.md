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
| Body modes | JSON, text, XML, GraphQL, SPARQL, file, form URL encoded, multipart | Partial | Schema/UI/runtime now accept XML, GraphQL, SPARQL, and file body for HTTP send. GraphQL schema explorer is pending. |
| Request kinds | HTTP, GraphQL, gRPC, WebSocket, JS | Partial | Schema has `kind: http/graphql/grpc/websocket/script`; runtime engines for gRPC/WebSocket/script items are pending. |
| Auth | Basic, bearer, API key, OAuth2, OAuth1, AWS v4, Digest, NTLM, WSSE | Partial | Schema/UI preserve all major Bruno auth families. Runtime signing is implemented for existing basic/bearer/API key/OAuth2 client credentials only. |
| Variables | Collection/folder/request/response/env/global/prompt vars | Partial | Schema has scoped variable rows. Runtime currently resolves project/env/runtime/data/step sources. Folder and prompt UX are pending. |
| Scripts/tests | Pre-request, post-response, tests, assertions | Partial | Existing case scripts and checks remain. Request/collection-level script fields are now in schema; full Bruno JS API parity is pending. |
| Runner | GUI runner, tags, env matrix, reports | Partial | Existing collection runner supports iteration, env matrix, retries, reports. Runner tags are now in schema; CLI productization is pending. |
| Import/export | Bruno, Postman, OpenAPI, Insomnia, WSDL, OpenCollection, env | Partial | Existing OpenAPI/Postman/HAR remain. Schema can label new formats; import/export implementations are pending for Bruno/Insomnia/WSDL/OpenCollection. |
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

1. Implement GraphQL request UX: query editor, variables editor, operation name, schema fetch, and JSON POST execution.
2. Implement WebSocket request runtime: connect, send message timeline, headers/auth, close/reconnect.
3. Implement advanced auth signing: OAuth1, AWS v4, Digest, NTLM, WSSE.
4. Add Bruno and Insomnia import/export fixtures and round-trip tests.
5. Add Preferences center for proxy/cert/theme/keybindings/cache.
