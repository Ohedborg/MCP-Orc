package policy

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

type Config struct {
	AllowlistedRegistries []string
	RequireCosignVerify   bool
	CosignKeyPath         string
	CosignIdentity        string
	CosignIssuer          string
}

type Evidence struct {
	RegistryAllowed   bool   `json:"registry_allowed"`
	SignatureVerified bool   `json:"signature_verified"`
	Verifier          string `json:"verifier"`
	Identity          string `json:"identity,omitempty"`
	ResolvedDigest    string `json:"resolved_digest"`
	DenialReason      string `json:"denial_reason,omitempty"`
}

func ConfigFromEnv() Config {
	allow := strings.TrimSpace(os.Getenv("RUNNER_ALLOWLISTED_REGISTRIES"))
	parts := []string{}
	if allow != "" {
		for _, p := range strings.Split(allow, ",") {
			v := strings.TrimSpace(p)
			if v != "" {
				parts = append(parts, v)
			}
		}
	}
	if len(parts) == 0 {
		parts = []string{"cgr.dev", "ghcr.io"}
	}
	return Config{
		AllowlistedRegistries: parts,
		RequireCosignVerify:   strings.ToLower(os.Getenv("RUNNER_REQUIRE_COSIGN")) != "false",
		CosignKeyPath:         strings.TrimSpace(os.Getenv("RUNNER_COSIGN_KEY_PATH")),
		CosignIdentity:        strings.TrimSpace(os.Getenv("RUNNER_COSIGN_IDENTITY")),
		CosignIssuer:          strings.TrimSpace(os.Getenv("RUNNER_COSIGN_ISSUER")),
	}
}

func Enforce(cfg Config, imageRef string) (string, Evidence, error) {
	ev := Evidence{Verifier: "cosign"}
	registry, err := registryOf(imageRef)
	if err != nil {
		ev.DenialReason = "invalid_image_ref"
		return "", ev, err
	}
	if !isAllowlisted(registry, cfg.AllowlistedRegistries) {
		ev.DenialReason = "registry_not_allowlisted"
		return "", ev, errors.New("registry not allowlisted")
	}
	ev.RegistryAllowed = true

	digest := digestFromRef(imageRef)
	if digest == "" || cfg.RequireCosignVerify {
		dg, verifyIdentity, verr := verifyAndResolveDigest(cfg, imageRef)
		if verr != nil {
			ev.DenialReason = "cosign_verify_failed"
			return "", ev, verr
		}
		ev.SignatureVerified = true
		ev.Identity = verifyIdentity
		digest = dg
	} else {
		ev.SignatureVerified = false
	}

	if digest == "" {
		ev.DenialReason = "digest_resolution_failed"
		return "", ev, errors.New("could not resolve digest")
	}
	if !strings.HasPrefix(digest, "sha256:") {
		ev.DenialReason = "invalid_digest"
		return "", ev, errors.New("digest must be sha256")
	}
	ev.ResolvedDigest = digest
	pinned := toPinnedImage(imageRef, digest)
	return pinned, ev, nil
}

func registryOf(imageRef string) (string, error) {
	if strings.TrimSpace(imageRef) == "" {
		return "", errors.New("empty image_ref")
	}
	ref := imageRef
	if at := strings.Index(ref, "@"); at >= 0 {
		ref = ref[:at]
	}
	firstSlash := strings.Index(ref, "/")
	if firstSlash <= 0 {
		return "", errors.New("image_ref must include registry")
	}
	return ref[:firstSlash], nil
}

func isAllowlisted(reg string, allow []string) bool {
	for _, a := range allow {
		if reg == a {
			return true
		}
	}
	return false
}

func digestFromRef(imageRef string) string {
	if at := strings.Index(imageRef, "@sha256:"); at >= 0 {
		return imageRef[at+1:]
	}
	return ""
}

func toPinnedImage(imageRef, digest string) string {
	base := imageRef
	if at := strings.Index(base, "@"); at >= 0 {
		base = base[:at]
	}
	lastSlash := strings.LastIndex(base, "/")
	lastColon := strings.LastIndex(base, ":")
	if lastColon > lastSlash {
		base = base[:lastColon]
	}
	return base + "@" + digest
}

type cosignVerifyResult struct {
	Critical struct {
		Image struct {
			DockerManifestDigest string `json:"docker-manifest-digest"`
		} `json:"image"`
		Identity struct {
			DockerReference string `json:"docker-reference"`
		} `json:"identity"`
	} `json:"critical"`
	Optional map[string]any `json:"optional"`
}

func verifyAndResolveDigest(cfg Config, imageRef string) (string, string, error) {
	args := []string{"verify", imageRef, "--output", "json"}
	identity := cfg.CosignIdentity
	if cfg.CosignKeyPath != "" {
		args = append(args, "--key", cfg.CosignKeyPath)
	} else if cfg.CosignIdentity != "" && cfg.CosignIssuer != "" {
		args = append(args, "--certificate-identity", cfg.CosignIdentity, "--certificate-oidc-issuer", cfg.CosignIssuer)
	} else {
		return "", "", errors.New("cosign trust config missing: set key or identity+issuer")
	}

	out, err := exec.Command("cosign", args...).CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("cosign verify failed: %v: %s", err, string(out))
	}
	var parsed []cosignVerifyResult
	if err := json.Unmarshal(out, &parsed); err != nil {
		return "", "", fmt.Errorf("parse cosign output: %w", err)
	}
	if len(parsed) == 0 {
		return "", "", errors.New("no signatures returned by cosign")
	}
	dg := strings.TrimSpace(parsed[0].Critical.Image.DockerManifestDigest)
	if dg == "" {
		return "", "", errors.New("cosign output missing docker-manifest-digest")
	}
	if identity == "" {
		identity = parsed[0].Critical.Identity.DockerReference
	}
	return dg, identity, nil
}
