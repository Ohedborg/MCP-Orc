# Kubernetes Manifests (Chunk 1)

- `namespaces/`: `mcp-system` and `mcp-runs`
- `runtimeclass/`: `gvisor` RuntimeClass
- `networkpolicies/`: default deny egress + optional DNS-only allow
- `samples/`: verification pods

## CNI provider assumptions
NetworkPolicy enforcement requires a CNI that supports egress policies.
- kind default networking may not enforce policies unless an enforcing CNI is installed.
- Recommended for local testing: kind + Calico or Cilium.
