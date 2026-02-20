# kind + gVisor Setup

> kind gVisor setup requires host-level access to install and configure `runsc` in kind nodes.

## Prereqs
- Docker
- kind
- kubectl
- gVisor (`runsc`) installed on host
- cosign installed and runner trust config set (`RUNNER_COSIGN_*`)

## Create cluster
```bash
kind create cluster --config infra/kind/kind-config.yaml
```

## Install `runsc` in kind nodes
```bash
for node in $(kind get nodes --name mcp-orc); do
  docker cp /usr/local/bin/runsc "$node":/usr/local/bin/runsc
  docker exec "$node" chmod +x /usr/local/bin/runsc
  docker exec "$node" bash -lc 'cat >/etc/containerd/runsc.toml <<EOF
[runsc_config]
EOF'
  docker exec "$node" bash -lc 'cat >/etc/containerd/config.toml <<EOF
version = 2
[plugins."io.containerd.grpc.v1.cri".containerd]
  default_runtime_name = "runc"
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
  runtime_type = "io.containerd.runc.v2"
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.gvisor]
  runtime_type = "io.containerd.runsc.v1"
  [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.gvisor.options]
    TypeUrl = "io.containerd.runsc.v1.options"
    ConfigPath = "/etc/containerd/runsc.toml"
EOF'
  docker exec "$node" systemctl restart containerd
done
```

## Apply infra
```bash
kubectl apply -f infra/k8s/namespaces
kubectl apply -f infra/k8s/runtimeclass
kubectl apply -f infra/k8s/networkpolicies
kubectl apply -f infra/k8s/runner
kubectl apply -f infra/k8s/samples/hello-gvisor-pod.yaml
kubectl apply -f infra/k8s/samples/egress-deny-test.yaml
```

## Verify gVisor runtime class
```bash
kubectl -n mcp-runs get pod hello-gvisor -o jsonpath='{.spec.runtimeClassName}{"\n"}'
kubectl -n mcp-runs describe pod hello-gvisor | rg 'Runtime Class|runtimeClassName'
```

## Verify deny-by-default egress
```bash
kubectl -n mcp-runs logs egress-deny-test
```

## Verify runner launch path
```bash
kubectl -n mcp-system port-forward svc/mcp-runner 8080:8080
curl -i -sS -X POST http://127.0.0.1:8080/runs -H 'Content-Type: application/json' \
  -d '{"image_ref":"docker.io/library/alpine:latest","network_policy_profile":"deny-all"}'
```
Expected: `403` policy deny for non-allowlisted registry.
