package k8s

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type Client struct {
	clientset *kubernetes.Clientset
}

type PodSpecInput struct {
	Namespace        string
	RunID            string
	ImageRef         string
	Command          []string
	Args             []string
	EnvAllowlist     map[string]string
	CPU              string
	Memory           string
	TimeoutSeconds   int64
	RuntimeClassName string
	ImagePullPolicy  corev1.PullPolicy
}

func NewClient() (*Client, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		home, _ := os.UserHomeDir()
		kubeconfig := filepath.Join(home, ".kube", "config")
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
		if err != nil {
			return nil, fmt.Errorf("build k8s config: %w", err)
		}
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("new clientset: %w", err)
	}
	return &Client{clientset: cs}, nil
}

func (c *Client) CreateRunPod(ctx context.Context, in PodSpecInput) (string, error) {
	podName := "run-" + in.RunID
	env := make([]corev1.EnvVar, 0, len(in.EnvAllowlist))
	for k, v := range in.EnvAllowlist {
		env = append(env, corev1.EnvVar{Name: k, Value: v})
	}

	readOnly := true
	allowPrivEsc := false
	runAsNonRoot := true
	automountSAToken := false
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      podName,
			Namespace: in.Namespace,
			Labels: map[string]string{
				"app":    "mcp-run",
				"run_id": in.RunID,
			},
		},
		Spec: corev1.PodSpec{
			RuntimeClassName:             &in.RuntimeClassName,
			RestartPolicy:                corev1.RestartPolicyNever,
			ActiveDeadlineSeconds:        &in.TimeoutSeconds,
			AutomountServiceAccountToken: &automountSAToken,
			SecurityContext: &corev1.PodSecurityContext{
				SeccompProfile: &corev1.SeccompProfile{Type: corev1.SeccompProfileTypeRuntimeDefault},
			},
			Containers: []corev1.Container{{
				Name:            "untrusted-mcp",
				Image:           in.ImageRef,
				ImagePullPolicy: in.ImagePullPolicy,
				Command:         in.Command,
				Args:            in.Args,
				Env:             env,
				SecurityContext: &corev1.SecurityContext{
					ReadOnlyRootFilesystem:   &readOnly,
					AllowPrivilegeEscalation: &allowPrivEsc,
					RunAsNonRoot:             &runAsNonRoot,
					Capabilities:             &corev1.Capabilities{Drop: []corev1.Capability{"ALL"}},
				},
				Resources: corev1.ResourceRequirements{Requests: mustRes(in.CPU, in.Memory), Limits: mustRes(in.CPU, in.Memory)},
			}},
		},
	}

	_, err := c.clientset.CoreV1().Pods(in.Namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}
	return podName, nil
}

func (c *Client) GetPodStatus(ctx context.Context, namespace, podName string) (string, string, error) {
	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return "not_found", "pod_missing", nil
		}
		return "", "", err
	}
	return string(pod.Status.Phase), pod.Status.Reason, nil
}

func (c *Client) GetPodLogs(ctx context.Context, namespace, podName string) (string, error) {
	req := c.clientset.CoreV1().Pods(namespace).GetLogs(podName, &corev1.PodLogOptions{})
	stream, err := req.Stream(ctx)
	if err != nil {
		return "", err
	}
	defer stream.Close()
	raw, err := io.ReadAll(stream)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func (c *Client) DeletePod(ctx context.Context, namespace, podName string) error {
	grace := int64(0)
	err := c.clientset.CoreV1().Pods(namespace).Delete(ctx, podName, metav1.DeleteOptions{GracePeriodSeconds: &grace})
	if apierrors.IsNotFound(err) {
		return nil
	}
	return err
}

func mustRes(cpu, mem string) corev1.ResourceList {
	return corev1.ResourceList{
		corev1.ResourceCPU:    resource.MustParse(cpu),
		corev1.ResourceMemory: resource.MustParse(mem),
	}
}

func (c *Client) WaitAndDelete(namespace, podName string, waitSeconds int64) {
	go func() {
		time.Sleep(time.Duration(waitSeconds) * time.Second)
		_ = c.DeletePod(context.Background(), namespace, podName)
	}()
}

func (c *Client) GetPodIP(ctx context.Context, namespace, podName string) (string, error) {
	pod, err := c.clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return "", err
	}
	return pod.Status.PodIP, nil
}

func (c *Client) InvokeTool(ctx context.Context, podIP string, port int, toolName string, payload []byte) ([]byte, int, error) {
	url := fmt.Sprintf("http://%s:%d/tools/%s", podIP, port, toolName)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return body, resp.StatusCode, nil
}
