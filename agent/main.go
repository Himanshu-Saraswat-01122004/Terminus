package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow internal CORS since it's behind a proxy
	},
}

type FileNode struct {
	Name  string      `json:"name"`
	Path  string      `json:"path"`
	IsDir bool        `json:"is_dir"`
	Size  int64       `json:"size"`
	Child []FileNode  `json:"child,omitempty"`
}

// Activity tracking indicators
var (
	activityMutex sync.RWMutex
	lastActivity  = time.Now()
)

func updateActivity() {
	activityMutex.Lock()
	lastActivity = time.Now()
	activityMutex.Unlock()
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "4000"
	}

	// 1. File System HTTP routes
	http.HandleFunc("/files/tree", handleFileTree)
	http.HandleFunc("/file/read", handleFileRead)
	http.HandleFunc("/file/write", handleFileWrite)
	http.HandleFunc("/file/delete", handleFileDelete)
	http.HandleFunc("/idle-status", handleIdleStatus)

	// 2. Terminal PTY WebSocket bridge and Yjs Collaboration pub-sub
	http.HandleFunc("/term", handleTerminalWebSocket)
	http.HandleFunc("/collaboration", handleCollaboration)

	log.Printf("Workspace Agent listening on port %s...", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Agent server failed: %v", err)
	}
}

// safePath verifies that target paths are strictly contained within the /workspace mount
func safePath(target string) (string, error) {
	workspaceRoot := os.Getenv("WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = "/workspace"
	}

	// Join and clean path to resolve double-dot parent pointers
	joined := filepath.Join(workspaceRoot, target)
	clean := filepath.Clean(joined)

	if !strings.HasPrefix(clean, workspaceRoot) {
		return "", errors.New("access denied: path traversal attempt blocked")
	}
	return clean, nil
}

// handleFileTree recursively builds a directory node representation of workspace files
func handleFileTree(w http.ResponseWriter, r *http.Request) {
	updateActivity()
	relPath := r.URL.Query().Get("path")
	fullPath, err := safePath(relPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	tree, err := buildFileTree(fullPath)
	if err != nil {
		http.Error(w, "Failed to build file tree: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree)
}

func buildFileTree(path string) (FileNode, error) {
	info, err := os.Stat(path)
	if err != nil {
		return FileNode{}, err
	}

	workspaceRoot := os.Getenv("WORKSPACE_ROOT")
	if workspaceRoot == "" {
		workspaceRoot = "/workspace"
	}
	relPath, _ := filepath.Rel(workspaceRoot, path)
	if relPath == "." {
		relPath = ""
	}

	node := FileNode{
		Name:  filepath.Base(path),
		Path:  relPath,
		IsDir: info.IsDir(),
		Size:  info.Size(),
	}

	if info.IsDir() {
		files, err := os.ReadDir(path)
		if err != nil {
			return node, nil // Return directory node even if we can't read children
		}

		node.Child = []FileNode{}
		for _, file := range files {
			// Skip hidden files (like git directories) for cleaner explorer layout
			if strings.HasPrefix(file.Name(), ".") && file.Name() != ".env" {
				continue
			}
			childNode, err := buildFileTree(filepath.Join(path, file.Name()))
			if err == nil {
				node.Child = append(node.Child, childNode)
			}
		}
	}

	return node, nil
}

// handleFileRead reads text contents of a target file
func handleFileRead(w http.ResponseWriter, r *http.Request) {
	updateActivity()
	target := r.URL.Query().Get("path")
	fullPath, err := safePath(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	data, err := os.ReadFile(fullPath)
	if err != nil {
		http.Error(w, "Failed to read file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	w.Write(data)
}

// handleFileWrite updates or creates file contents
func handleFileWrite(w http.ResponseWriter, r *http.Request) {
	updateActivity()
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	target := r.URL.Query().Get("path")
	fullPath, err := safePath(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	// Read raw body streams
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request payload", http.StatusBadRequest)
		return
	}

	// Create directories if they don't exist
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		http.Error(w, "Failed to create parent directories", http.StatusInternalServerError)
		return
	}

	if err := os.WriteFile(fullPath, body, 0644); err != nil {
		http.Error(w, "Failed writing file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("File saved successfully"))
}

// handleFileDelete removes a file or recursive folder
func handleFileDelete(w http.ResponseWriter, r *http.Request) {
	updateActivity()
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	target := r.URL.Query().Get("path")
	fullPath, err := safePath(target)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	if err := os.RemoveAll(fullPath); err != nil {
		http.Error(w, "Failed deleting resource: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Resource removed successfully"))
}

// Terminal message protocols
type wsMessage struct {
	Type string `json:"type"`
	Data string `json:"data"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// handleTerminalWebSocket sets up a bidirectional PTY terminal session over WebSockets
func handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("PTY upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	// 1. Initialize shell binary (spawn bash if available, else fall back to sh)
	shell := "/bin/bash"
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}

	cmd := exec.Command(shell)
	cmd.Dir = os.Getenv("WORKSPACE_ROOT")
	if cmd.Dir == "" {
		cmd.Dir = "/workspace"
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	// 2. Start command under a PTY
	ptyFile, err := pty.Start(cmd)
	if err != nil {
		log.Printf("Failed to spawn shell PTY: %v", err)
		return
	}
	defer ptyFile.Close()

	// Ensure cleanup of shell process
	defer func() {
		_ = cmd.Process.Signal(syscall.SIGKILL)
		_, _ = cmd.Process.Wait()
	}()

	var socketMutex sync.Mutex

	// 3. Goroutine: Copy shell PTY output -> WebSocket
	go func() {
		buffer := make([]byte, 1024)
		for {
			n, err := ptyFile.Read(buffer)
			if err != nil {
				// Send terminate signal
				socketMutex.Lock()
				_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\nSession closed.\r\n"))
				socketMutex.Unlock()
				return
			}

			socketMutex.Lock()
			err = conn.WriteMessage(websocket.TextMessage, buffer[:n])
			socketMutex.Unlock()
			if err != nil {
				return
			}
		}
	}()

	// 4. Main loop: WebSocket input -> Shell PTY input
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		updateActivity()

		if messageType == websocket.TextMessage {
			// Check if message is a JSON command (like resize)
			if len(payload) > 0 && payload[0] == '{' {
				var msg wsMessage
				if err := json.Unmarshal(payload, &msg); err == nil {
					switch msg.Type {
					case "resize":
						_ = pty.Setsize(ptyFile, &pty.Winsize{
							Cols: msg.Cols,
							Rows: msg.Rows,
						})
					case "input":
						_, _ = ptyFile.Write([]byte(msg.Data))
					}
					continue
				}
			}

			// Fallback: write raw text message directly to PTY stdin
			_, _ = ptyFile.Write(payload)
		}
	}
}

// thread-safe connection wrapper for Yjs Pub-Sub broadcast
type safeConn struct {
	sync.Mutex
	*websocket.Conn
}

func (s *safeConn) write(messageType int, data []byte) error {
	s.Lock()
	defer s.Unlock()
	return s.WriteMessage(messageType, data)
}

type CollaborationRoom struct {
	sync.RWMutex
	clients map[*safeConn]bool
}

var (
	roomsMutex sync.RWMutex
	rooms      = make(map[string]*CollaborationRoom)
)

// handleCollaboration routes Yjs CRDT binary updates and cursor awareness updates to room members
func handleCollaboration(w http.ResponseWriter, r *http.Request) {
	roomName := r.URL.Query().Get("room")
	if roomName == "" {
		roomName = "default"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Collaboration upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	sConn := &safeConn{Conn: conn}

	// Fetch or create room
	roomsMutex.Lock()
	room, exists := rooms[roomName]
	if !exists {
		room = &CollaborationRoom{
			clients: make(map[*safeConn]bool),
		}
		rooms[roomName] = room
	}
	roomsMutex.Unlock()

	// Register connection
	room.Lock()
	room.clients[sConn] = true
	room.Unlock()

	// Unregister connection on cleanup
	defer func() {
		room.Lock()
		delete(room.clients, sConn)
		if len(room.clients) == 0 {
			roomsMutex.Lock()
			delete(rooms, roomName)
			roomsMutex.Unlock()
		}
		room.Unlock()
	}()

	// Listen and broadcast binary / text updates
	for {
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			break
		}

		updateActivity()

		// Broadcast message to all other participants in the room
		room.RLock()
		for client := range room.clients {
			if client != sConn {
				// Safe concurrent write
				go func(sc *safeConn, mt int, data []byte) {
					_ = sc.write(mt, data)
				}(client, messageType, payload)
			}
		}
		room.RUnlock()
	}
}

// handleIdleStatus returns JSON details showing activity duration
func handleIdleStatus(w http.ResponseWriter, r *http.Request) {
	activityMutex.RLock()
	idleDuration := time.Since(lastActivity)
	activityMutex.RUnlock()

	// Idle warning: 10 mins (600s), Suspension: 15 mins (900s)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"idle_seconds":      int(idleDuration.Seconds()),
		"is_idle":           idleDuration > 15*time.Minute,
		"warn_suspension":   idleDuration > 10*time.Minute,
		"last_activity_utc": lastActivity.Format(time.RFC3339),
	})
}
