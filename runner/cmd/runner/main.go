package main

import (
	"context"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/mcp-orc/runner/internal/api"
	"github.com/mcp-orc/runner/internal/config"
	"github.com/mcp-orc/runner/internal/k8s"
	"github.com/mcp-orc/runner/internal/runs"
)

func main() {
	cfg := config.FromEnv()
	k, err := k8s.NewClient()
	if err != nil {
		log.Fatalf("init k8s client: %v", err)
	}

	h := api.NewHandler(cfg, k, runs.NewStore())
	srv := &http.Server{Addr: cfg.Addr, Handler: h.Router()}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Printf("runner listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
