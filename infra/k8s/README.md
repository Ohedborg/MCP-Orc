# Kubernetes Manifests

- `namespaces/`: `mcp-system` and `mcp-runs`
- `runtimeclass/`: `gvisor` RuntimeClass
- `networkpolicies/`: default deny egress + optional DNS-only allow
- `runner/`: runner service account, RBAC, deployment, ClusterIP service
- `samples/`: verification pods and runner API demo requests

## CNI provider assumptions
NetworkPolicy enforcement requires a CNI that supports egress policies.
- kind default networking may not enforce policies unless an enforcing CNI is installed.
- Recommended for local testing: kind + Calico or Cilium.

## Apply order
```bash
kubectl apply -f infra/k8s/namespaces
kubectl apply -f infra/k8s/runtimeclass
kubectl apply -f infra/k8s/networkpolicies
kubectl apply -f infra/k8s/runner
```
