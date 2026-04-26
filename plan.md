# Debugger finish plan

- [x] `ui-density-finish` — tighten request/response chrome grouping, add compact summary strips for Environment Center and Preferences, and mark the Bruno parity gap as reduced.
- [x] `graphql-schema-navigation` — add a real GraphQL type navigator so authors can jump from root fields, nested selections, and argument/input types into deeper schema members from the request editor.
- [x] `variables-workflow-depth` — add a cross-scope variable catalog in Environment Center so shadowed names, prompt defaults, and active-request gaps are easier to manage without changing precedence semantics.
- [x] `script-api-depth-2` — add in-memory `pm.globals` support across local request/collection flows, keep request interpolation aware of seeded globals, and narrow pre-send gap diagnostics to the remaining unsupported Bruno helpers.
- [x] `script-variable-scope-depth` — make `pm.variables` resolve across runtime/collection variables, iteration data, environment vars, and in-memory globals while keeping writes scoped to the runtime variable store.
- [x] `script-assertion-chain-depth` — expand the local `pm.expect` subset with common Bruno/Postman chains such as `to.not`, `include`, `above/below`, `oneOf`, and `empty`.
- [x] `script-deep-assertion-depth` — add common deep/type/member assertions including `to.deep.equal`, `to.deep.include`, `include.members`, `have.keys`, and `be.a/an`.
- [x] `preferences-shortcut-breadth` — broaden the Preferences-managed shortcut set with safe rail-navigation hotkeys for workbench, scratch, capture, collections, history, and sync while keeping the surface intentionally focused.
