# Monorepo Layout Proposal (MVP)

```text
.
├─ orchestrator/                 # TypeScript MCP server (upstream-facing)
│  ├─ src/
│  │  ├─ mcp/                    # MCP tool definitions + handlers
│  │  ├─ workflows/              # Workflow engine + step policies
│  │  ├─ runner-client/          # Internal HTTP client for runner API
│  │  ├─ db/                     # SQLite models, migrations, repositories
│  │  ├─ security/               # redaction, validation, policy guards
│  │  └─ index.ts                # stdio MCP server bootstrap
│  ├─ package.json
│  └─ tsconfig.json
├─ runner/                       # Go runner service (internal-only)
│  ├─ cmd/runner/main.go
│  ├─ internal/
│  │  ├─ api/                    # HTTP handlers
│  │  ├─ k8s/                    # Pod/service/networkpolicy orchestration
│  │  ├─ policy/                 # registry allowlist + cosign checks
│  │  ├─ runs/                   # lifecycle/state
│  │  └─ audit/                  # policy evidence + run metadata
│  ├─ go.mod
│  └─ go.sum
├─ contracts/
│  ├─ runner-api/openapi.yaml
│  ├─ schemas/                   # JSON schemas for tool I/O and traces
│  └─ policy/                    # policy configuration schema
├─ infra/
│  ├─ k8s/
│  │  ├─ namespaces/
│  │  ├─ runtimeclass/
│  │  ├─ networkpolicies/
│  │  ├─ runner/
│  │  ├─ orchestrator/
│  │  └─ samples/
│  └─ kind/
│     ├─ kind-config.yaml
│     └─ gvisor-setup.md
├─ tests/
│  ├─ e2e/
│  ├─ integration/
│  └─ fixtures/
│     └─ sample-downstream-mcp/
├─ docs/
│  ├─ threat-model.md
│  ├─ security-goals.md
│  ├─ architecture.md
│  ├─ runner-api.md
│  └─ repo-layout.md
└─ README.md
```

## Design Rationale
- Security-sensitive policy code is isolated under `runner/internal/policy`.
- Contracts are centralized to prevent orchestrator/runner drift.
- `infra` is first-class so security controls (RuntimeClass, NetworkPolicy) are versioned with code.
- `tests/fixtures` keeps intentionally untrusted sample servers explicit and reviewable.
