package config

import (
	"os"
	"strconv"
)

type Config struct {
	Addr             string
	Namespace        string
	RuntimeClassName string
	ImagePullPolicy  string
	DefaultCPU       string
	DefaultMemory    string
	DefaultTimeout   int64
	CleanupSeconds   int64
}

func FromEnv() Config {
	return Config{
		Addr:             getEnv("RUNNER_ADDR", ":8080"),
		Namespace:        getEnv("RUNNER_NAMESPACE", "mcp-runs"),
		RuntimeClassName: getEnv("RUNNER_RUNTIMECLASS", "gvisor"),
		ImagePullPolicy:  getEnv("RUNNER_IMAGE_PULL_POLICY", "IfNotPresent"),
		DefaultCPU:       getEnv("RUNNER_DEFAULT_CPU", "100m"),
		DefaultMemory:    getEnv("RUNNER_DEFAULT_MEMORY", "128Mi"),
		DefaultTimeout:   getEnvInt64("RUNNER_DEFAULT_TIMEOUT_SECONDS", 300),
		CleanupSeconds:   getEnvInt64("RUNNER_CLEANUP_SECONDS", 120),
	}
}

func getEnv(key, fallback string) string {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	return v
}

func getEnvInt64(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return fallback
	}
	return n
}
