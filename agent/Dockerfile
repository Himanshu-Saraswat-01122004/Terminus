# Stage 1: Build Go agent binary
FROM golang:1.20-bookworm AS builder
WORKDIR /app
COPY go.mod ./
COPY main.go ./
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o agent main.go

# Stage 2: Workspace base runtime (Node.js template)
FROM node:20-bookworm-slim

# Install system packages (git, bash, curl, procps)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    bash \
    curl \
    procps \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Establish user workspace directory
WORKDIR /workspace

# Copy pre-compiled agent binary from builder
COPY --from=builder /app/agent /usr/local/bin/terminas-agent

# Set permissions for execution
RUN chmod +x /usr/local/bin/terminas-agent

# Expose agent server port
EXPOSE 4000

# Execute agent on container startup
CMD ["/usr/local/bin/terminas-agent"]
