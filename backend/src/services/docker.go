package services

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
)

var DockerCli *client.Client

// InitDockerClient connects to the host Docker daemon
func InitDockerClient() {
	var err error
	DockerCli, err = client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		fmt.Printf("Warning: Failed to connect to Docker daemon: %v\n", err)
		return
	}
	fmt.Println("Docker daemon client initialized successfully.")

	// Proactively create the private bridge network if it doesn't exist
	ctx := context.Background()
	networks, err := DockerCli.NetworkList(ctx, types.NetworkListOptions{})
	if err == nil {
		exists := false
		for _, nw := range networks {
			if nw.Name == "terminas-net" {
				exists = true
				break
			}
		}
		if !exists {
			_, err = DockerCli.NetworkCreate(ctx, "terminas-net", types.NetworkCreate{})
			if err != nil {
				fmt.Printf("Warning: Failed to create custom Docker network: %v\n", err)
			} else {
				fmt.Println("Created private Docker bridge network: terminas-net")
			}
		}
	}
}

// ProvisionContainer creates and starts a container with resource constraints and project storage mounting
func ProvisionContainer(image, containerName, userID, projectID string) (string, string, error) {
	ctx := context.Background()

	// 1. Resolve host and container mount paths
	hostVolumeRoot := os.Getenv("STORAGE_ROOT_PATH")
	if hostVolumeRoot == "" {
		hostVolumeRoot = "/var/terminas/projects"
	}
	hostVolumePath := filepath.Join(hostVolumeRoot, userID, projectID)

	// Ensure the host directory exists
	if err := os.MkdirAll(hostVolumePath, 0755); err != nil {
		return "", "", fmt.Errorf("failed to create host project path: %w", err)
	}

	// 2. Setup container configs
	config := &container.Config{
		Image: image,
		ExposedPorts: map[string]struct{}{
			"4000/tcp": {},
		},
		Env: []string{
			"PORT=4000",
			"WORKSPACE_ROOT=/workspace",
		},
	}

	// 3. Setup host resource limits and volume bindings
	hostConfig := &container.HostConfig{
		Mounts: []mount.Mount{
			{
				Type:   mount.TypeBind,
				Source: hostVolumePath,
				Target: "/workspace",
			},
		},
		Resources: container.Resources{
			CpuQuota:   100000,                      // 1.0 CPU Core
			CpuPeriod:  100000,
			Memory:     512 * 1024 * 1024,           // 512 MB physical RAM
			MemorySwap: 1024 * 1024 * 1024,          // 1 GB total (512MB RAM + 512MB Swap)
		},
		AutoRemove: false,
	}

	// 4. Setup network config
	networkConfig := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			"terminas-net": {},
		},
	}

	// 5. Create container
	resp, err := DockerCli.ContainerCreate(ctx, config, hostConfig, networkConfig, nil, containerName)
	if err != nil {
		return "", "", fmt.Errorf("failed to create container: %w", err)
	}

	// 6. Start container
	err = DockerCli.ContainerStart(ctx, resp.ID, types.ContainerStartOptions{})
	if err != nil {
		return "", "", fmt.Errorf("failed to start container: %w", err)
	}

	// 7. Inspect container to fetch private IP address
	inspect, err := DockerCli.ContainerInspect(ctx, resp.ID)
	if err != nil {
		return resp.ID, "", fmt.Errorf("container started, but failed to inspect IP: %w", err)
	}

	privateIP := ""
	if settings, ok := inspect.NetworkSettings.Networks["terminas-net"]; ok {
		privateIP = settings.IPAddress
	} else {
		privateIP = inspect.NetworkSettings.IPAddress
	}

	return resp.ID, privateIP, nil
}

// StopContainer stops a running container by ID
func StopContainer(containerID string) error {
	ctx := context.Background()
	// Stop container with 15 seconds grace period
	timeout := 15
	err := DockerCli.ContainerStop(ctx, containerID, container.StopOptions{Timeout: &timeout})
	if err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}
	return nil
}

// RemoveContainer deletes a container from Docker daemon
func RemoveContainer(containerID string) error {
	ctx := context.Background()
	err := DockerCli.ContainerRemove(ctx, containerID, types.ContainerRemoveOptions{Force: true})
	if err != nil {
		return fmt.Errorf("failed to remove container: %w", err)
	}
	return nil
}
