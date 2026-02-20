package api

import "github.com/mcp-orc/runner/internal/policy"

type CreateRunRequest struct {
	ImageRef             string            `json:"image_ref"`
	Command              []string          `json:"command,omitempty"`
	Args                 []string          `json:"args,omitempty"`
	EnvAllowlist         map[string]string `json:"env_allowlist,omitempty"`
	AllowedTools         []string          `json:"allowed_tools,omitempty"`
	DownstreamPort       int               `json:"downstream_port,omitempty"`
	CPU                  string            `json:"cpu,omitempty"`
	Memory               string            `json:"memory,omitempty"`
	TimeoutSeconds       int64             `json:"timeout_seconds,omitempty"`
	NetworkPolicyProfile string            `json:"network_policy_profile"`
}

type CreateRunResponse struct {
	RunID          string          `json:"run_id"`
	PodName        string          `json:"pod_name"`
	ImageDigest    string          `json:"image_digest"`
	PolicyEvidence policy.Evidence `json:"policy_evidence"`
}

type RunStatusResponse struct {
	RunID          string          `json:"run_id"`
	Status         string          `json:"status"`
	PodName        string          `json:"pod_name"`
	Namespace      string          `json:"namespace"`
	Reason         string          `json:"reason,omitempty"`
	PodIP          string          `json:"pod_ip,omitempty"`
	ImageDigest    string          `json:"image_digest,omitempty"`
	PolicyEvidence policy.Evidence `json:"policy_evidence"`
}

type LogsResponse struct {
	RunID  string `json:"run_id"`
	Stdout string `json:"stdout"`
	Stderr string `json:"stderr"`
}

type ToolInvokeRequest struct {
	Input map[string]any `json:"input"`
}

type ToolInvokeResponse struct {
	RunID     string         `json:"run_id"`
	ToolName  string         `json:"tool_name"`
	Output    map[string]any `json:"output"`
	RawStatus int            `json:"raw_status"`
}
