package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"

	"github.com/mcp-orc/runner/internal/audit"
	"github.com/mcp-orc/runner/internal/config"
	"github.com/mcp-orc/runner/internal/k8s"
	"github.com/mcp-orc/runner/internal/policy"
	"github.com/mcp-orc/runner/internal/runs"
)

type Handler struct {
	cfg       config.Config
	policyCfg policy.Config
	k8s       *k8s.Client
	store     *runs.Store
}

func NewHandler(cfg config.Config, policyCfg policy.Config, k *k8s.Client, s *runs.Store) *Handler {
	return &Handler{cfg: cfg, policyCfg: policyCfg, k8s: k, store: s}
}

func (h *Handler) Router() http.Handler {
	r := chi.NewRouter()
	r.Post("/runs", h.createRun)
	r.Get("/runs/{run_id}", h.getRun)
	r.Get("/runs/{run_id}/logs", h.getRunLogs)
	r.Post("/runs/{run_id}/stop", h.stopRun)
	return r
}

func (h *Handler) createRun(w http.ResponseWriter, r *http.Request) {
	var req CreateRunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if err := validateCreateRequest(req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	pinnedRef, evidence, err := policy.Enforce(h.policyCfg, req.ImageRef)
	if err != nil {
		audit.Event("run_create_denied", map[string]any{"reason": err.Error(), "image_ref": req.ImageRef, "policy_evidence": evidence})
		writeJSON(w, http.StatusForbidden, map[string]any{"error": "policy_denied", "policy_evidence": evidence})
		return
	}

	runID := uuid.NewString()
	cpu := req.CPU
	if cpu == "" {
		cpu = h.cfg.DefaultCPU
	}
	mem := req.Memory
	if mem == "" {
		mem = h.cfg.DefaultMemory
	}
	timeout := req.TimeoutSeconds
	if timeout <= 0 {
		timeout = h.cfg.DefaultTimeout
	}

	podName, err := h.k8s.CreateRunPod(r.Context(), k8s.PodSpecInput{
		Namespace:        h.cfg.Namespace,
		RunID:            runID,
		ImageRef:         pinnedRef,
		Command:          req.Command,
		Args:             req.Args,
		EnvAllowlist:     req.EnvAllowlist,
		CPU:              cpu,
		Memory:           mem,
		TimeoutSeconds:   timeout,
		RuntimeClassName: h.cfg.RuntimeClassName,
		ImagePullPolicy:  corev1.PullPolicy(h.cfg.ImagePullPolicy),
	})
	if err != nil {
		audit.Event("run_create_denied", map[string]any{"reason": err.Error(), "image_ref": req.ImageRef, "policy_evidence": evidence})
		http.Error(w, "pod creation failed", http.StatusInternalServerError)
		return
	}

	h.store.Put(runs.Run{
		RunID:          runID,
		PodName:        podName,
		Namespace:      h.cfg.Namespace,
		Status:         "starting",
		CreatedAt:      time.Now().UTC(),
		ImageDigest:    evidence.ResolvedDigest,
		PolicyEvidence: evidence,
	})
	h.k8s.WaitAndDelete(h.cfg.Namespace, podName, h.cfg.CleanupSeconds)
	audit.Event("run_created", map[string]any{"run_id": runID, "pod_name": podName, "runtime_class": h.cfg.RuntimeClassName, "image_digest": evidence.ResolvedDigest, "network_policy_profile": req.NetworkPolicyProfile, "policy_evidence": evidence})

	writeJSON(w, http.StatusCreated, CreateRunResponse{RunID: runID, PodName: podName, ImageDigest: evidence.ResolvedDigest, PolicyEvidence: evidence})
}

func (h *Handler) getRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "run_id")
	run, err := h.store.Get(runID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	status, reason, err := h.k8s.GetPodStatus(r.Context(), run.Namespace, run.PodName)
	if err == nil {
		_ = h.store.Update(runID, func(orig runs.Run) runs.Run {
			orig.Status = strings.ToLower(status)
			orig.Reason = reason
			return orig
		})
		run, _ = h.store.Get(runID)
	}

	writeJSON(w, http.StatusOK, RunStatusResponse{
		RunID:          run.RunID,
		Status:         run.Status,
		PodName:        run.PodName,
		Namespace:      run.Namespace,
		Reason:         run.Reason,
		ImageDigest:    run.ImageDigest,
		PolicyEvidence: run.PolicyEvidence,
	})
}

func (h *Handler) getRunLogs(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "run_id")
	run, err := h.store.Get(runID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	logs, err := h.k8s.GetPodLogs(r.Context(), run.Namespace, run.PodName)
	if err != nil {
		http.Error(w, "unable to fetch logs", http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, LogsResponse{RunID: runID, Stdout: logs, Stderr: ""})
}

func (h *Handler) stopRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "run_id")
	run, err := h.store.Get(runID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err := h.k8s.DeletePod(r.Context(), run.Namespace, run.PodName); err != nil {
		http.Error(w, "stop failed", http.StatusInternalServerError)
		return
	}
	_ = h.store.Update(runID, func(orig runs.Run) runs.Run {
		orig.Status = "stopped"
		orig.StoppedByAP = true
		n := time.Now().UTC()
		orig.FinishedAt = &n
		return orig
	})
	audit.Event("run_stopped", map[string]any{"run_id": runID})
	w.WriteHeader(http.StatusAccepted)
}

func validateCreateRequest(req CreateRunRequest) error {
	if strings.TrimSpace(req.ImageRef) == "" {
		return errors.New("image_ref is required")
	}
	switch req.NetworkPolicyProfile {
	case "deny-all", "dns-only":
	default:
		return errors.New("network_policy_profile must be deny-all or dns-only")
	}
	if req.TimeoutSeconds < 0 {
		return errors.New("timeout_seconds must be >= 0")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
