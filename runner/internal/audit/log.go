package audit

import (
	"encoding/json"
	"log"
	"time"
)

func Event(kind string, fields map[string]any) {
	payload := map[string]any{
		"ts":   time.Now().UTC().Format(time.RFC3339Nano),
		"kind": kind,
	}
	for k, v := range fields {
		payload[k] = v
	}
	b, _ := json.Marshal(payload)
	log.Printf("%s", b)
}
