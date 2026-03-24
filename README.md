<!-- # 🎬 Video Streaming Platform

An adaptive bitrate video streaming platform built with **Next.js**, **FFmpeg**, **RabbitMQ**, and **Kubernetes** — deployed on **Oracle Cloud Free Tier**.

---

## Architecture

```
User (Browser)
     ↓
OCI Load Balancer
     ↓
┌──────────────────────────────────────┐
│            OKE Cluster               │
│                                      │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  Next.js    │  │  Transcoder   │  │
│  │  Pod        │  │  Pod          │  │
│  │  (UI + API) │  │  (FFmpeg)     │  │
│  └─────────────┘  └───────────────┘  │
│         │               │            │
│  ┌─────────────┐        │            │
│  │  RabbitMQ   │←───────┘            │
│  │  Pod        │                     │
│  └─────────────┘                     │
└──────────────────────────────────────┘
          ↓
  OCI Object Storage
  (HLS segments + master.m3u8)
```

---

## How It Works

1. User uploads a video via the Next.js UI
2. `/api/upload` saves the file and publishes a job to **RabbitMQ**
3. The **Transcoder** worker consumes the job and runs **FFmpeg** to produce HLS segments at multiple resolutions (360p, 480p, 720p, 1080p)
4. Segments are uploaded to **OCI Object Storage**
5. User visits the watch page — **HLS.js** fetches `master.m3u8` and streams the video, adapting quality based on network speed

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14 (App Router), Tailwind CSS |
| Video Player | HLS.js |
| Transcoding | FFmpeg via fluent-ffmpeg |
| Message Queue | RabbitMQ (amqplib) |
| Storage (dev) | Kubernetes PersistentVolume |
| Storage (prod) | OCI Object Storage (S3-compatible) |
| Containerization | Docker |
| Orchestration | Kubernetes (OKE — Oracle Cloud) |
| Language | TypeScript |

---

## Project Structure

```
video-streaming/
├── nextjs-app/                        # Next.js app (UI + API)
│   ├── app/
│   │   ├── page.tsx                   # Upload page
│   │   ├── watch/[id]/page.tsx        # Video player page
│   │   └── api/
│   │       ├── upload/route.ts        # Handle upload + publish to RabbitMQ
│   │       ├── stream/[...slug]/      # Serve HLS segments
│   │       └── status/[id]/route.ts   # Poll transcoding status
│   ├── lib/
│   │   ├── rabbitmq.ts                # RabbitMQ connection helper
│   │   └── storage.ts                 # OCI Object Storage client
│   └── Dockerfile
├── transcoder/                        # Standalone FFmpeg worker
│   ├── src/
│   │   ├── index.ts                   # RabbitMQ consumer
│   │   ├── transcoder.ts              # FFmpeg HLS processing
│   │   └── storage.ts                 # Upload segments to OCI
│   └── Dockerfile
└── k8s/                               # Kubernetes manifests
    ├── namespace.yaml
    ├── configmap.yaml
    ├── secret.yaml
    ├── rabbitmq.yaml
    ├── nextjs.yaml
    ├── transcoder.yaml
    └── pvc.yaml
```

---

## HLS Output Structure

After transcoding, each video produces:

```
videos/
└── {videoId}/
    ├── master.m3u8          ← Client fetches this first
    ├── 360p/
    │   ├── playlist.m3u8
    │   ├── segment000.ts
    │   ├── segment001.ts
    │   └── ...
    ├── 480p/
    │   └── ...
    ├── 720p/
    │   └── ...
    └── 1080p/
        └── ...
```

The `master.m3u8` file lists all resolutions. HLS.js automatically picks the best one based on the viewer's network speed.

---

## Local Development Setup

### Prerequisites

- WSL2 (Ubuntu) on Windows 11
- Docker Desktop (WSL2 backend enabled)
- Node.js 20+ (via nvm)
- FFmpeg

```bash
# Install FFmpeg in WSL2
sudo apt update && sudo apt install ffmpeg -y

# Verify
ffmpeg -version
node --version
docker --version
```

### Run Locally

```bash
# Clone the repo
git clone <your-repo-url>
cd video-streaming

# Start RabbitMQ via Docker
docker run -d --name rabbitmq \
  -p 5672:5672 -p 15672:15672 \
  rabbitmq:3-management

# Start Next.js app
cd nextjs-app
npm install
npm run dev

# Start Transcoder worker (in a new terminal)
cd transcoder
npm install
npm run dev
```

Visit `http://localhost:3000`

---

## Environment Variables

### nextjs-app/.env.local

```env
RABBITMQ_URL=amqp://localhost:5672
STORAGE_TYPE=local                        # "local" or "oci"
LOCAL_STORAGE_PATH=./public/videos

# OCI Object Storage (prod only)
OCI_NAMESPACE=your-namespace
OCI_BUCKET=video-streaming
OCI_REGION=ap-mumbai-1
OCI_ACCESS_KEY=your-access-key
OCI_SECRET_KEY=your-secret-key
```

### transcoder/.env

```env
RABBITMQ_URL=amqp://localhost:5672
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=../nextjs-app/public/videos

# OCI Object Storage (prod only)
OCI_NAMESPACE=your-namespace
OCI_BUCKET=video-streaming
OCI_REGION=ap-mumbai-1
OCI_ACCESS_KEY=your-access-key
OCI_SECRET_KEY=your-secret-key
```

---

## Kubernetes Deployment (Oracle Cloud)

### Prerequisites

```bash
# Install OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# Configure OCI CLI
oci setup config

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
```

### Connect to OKE Cluster

```bash
oci ce cluster create-kubeconfig \
  --cluster-id <your-cluster-ocid> \
  --file $HOME/.kube/config \
  --region ap-mumbai-1 \
  --token-version 2.0.0

# Verify
kubectl get nodes
```

### Build and Push Docker Images

```bash
# Login to Oracle Container Registry (OCIR)
docker login ap-mumbai-1.ocir.io

# Build and push Next.js image
cd nextjs-app
docker build -t ap-mumbai-1.ocir.io/<tenancy>/video-nextjs:latest .
docker push ap-mumbai-1.ocir.io/<tenancy>/video-nextjs:latest

# Build and push Transcoder image
cd ../transcoder
docker build -t ap-mumbai-1.ocir.io/<tenancy>/video-transcoder:latest .
docker push ap-mumbai-1.ocir.io/<tenancy>/video-transcoder:latest
```

### Deploy to Kubernetes

```bash
cd k8s

kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f rabbitmq.yaml
kubectl apply -f nextjs.yaml
kubectl apply -f transcoder.yaml

# Check status
kubectl get pods -n video-streaming
kubectl get svc -n video-streaming
```

### Get Public URL

```bash
# Wait for Load Balancer IP
kubectl get svc nextjs-service -n video-streaming
# Copy the EXTERNAL-IP and visit in browser
```

---

## Resolutions Supported

| Resolution | Bitrate | Use Case |
|---|---|---|
| 360p | 400 kbps | Very slow networks |
| 480p | 500 kbps | Slow/mobile networks |
| 720p | 1000 kbps | Standard broadband |
| 1080p | 2000 kbps | Fast broadband |

---

## Oracle Cloud Free Tier Resources Used

| Resource | Free Limit | Used |
|---|---|---|
| OKE Control Plane | Free | ✅ |
| VM.Standard.A1.Flex (2 nodes) | 4 OCPU, 24GB RAM | ✅ |
| Object Storage | 20 GB | ✅ |
| Load Balancer | 1 (10 Mbps) | ✅ |
| Block Storage (PVC) | 200 GB | ✅ |
| Container Registry (OCIR) | 1 GB | ✅ |

**Estimated monthly cost: $0**

---

## Key Concepts (Interview Reference)

- **Adaptive Bitrate Streaming (ABR)** — client switches quality based on bandwidth automatically
- **HLS (HTTP Live Streaming)** — Apple's protocol; uses `.m3u8` playlists + `.ts` segments
- **RabbitMQ** — decouples upload from transcoding; transcoder scales independently
- **PersistentVolume (PVC)** — shared storage between pods in k8s
- **OCI Object Storage** — S3-compatible; serves static `.ts` and `.m3u8` files efficiently

---

## Author

Annamalai Balakrishnan — Backend Engineer -->

# 🎬 Video Streaming Platform

An adaptive bitrate video streaming platform built with **Next.js**, **FFmpeg**, **RabbitMQ**, and **Kubernetes** — deployed on **Oracle Cloud Free Tier**.

---

## Architecture

```
User (Browser)
     ↓
OCI Load Balancer (prod) / localhost:3000 (local)
     ↓
┌──────────────────────────────────────┐
│         OKE Cluster (prod)           │
│      or local processes (dev)        │
│                                      │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  Next.js    │  │  Transcoder   │  │
│  │  Pod/App    │  │  Pod/Worker   │  │
│  │  (UI + API) │  │  (FFmpeg)     │  │
│  └─────────────┘  └───────────────┘  │
│         │               │            │
│         └──→ CloudAMQP ←┘            │
│              (RabbitMQ)              │
└──────────────────────────────────────┘
          ↓
  Local filesystem (dev) / OCI Object Storage (prod)
  (HLS segments + master.m3u8)
```

---

## How It Works

1. User uploads a video via the Next.js UI
2. `/api/upload` saves the file locally and publishes a job to **RabbitMQ (CloudAMQP)**
3. The **Transcoder** worker consumes the job and runs **FFmpeg** to produce HLS segments at multiple resolutions (360p, 480p, 720p, 1080p)
4. Segments are saved to local disk (dev) or OCI Object Storage (prod)
5. User visits the watch page — **HLS.js** fetches `master.m3u8` and streams the video, adapting quality based on network speed
6. Manual quality switcher lets user pick resolution (Auto / 360p / 480p / 720p HD / 1080p FHD)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 16 (App Router), Tailwind CSS |
| Video Player | HLS.js |
| Transcoding | FFmpeg via fluent-ffmpeg |
| GPU Encoding | NVIDIA NVENC (h264_nvenc) — local dev |
| CPU Encoding | libx264 — production (OCI ARM nodes) |
| Message Queue | RabbitMQ via CloudAMQP (cloud-hosted) |
| Storage (dev) | Local filesystem (`public/videos`) |
| Storage (prod) | OCI Object Storage (S3-compatible) |
| Containerization | Docker |
| Orchestration | Kubernetes (OKE — Oracle Cloud Free Tier) |
| Language | TypeScript |

---

## Project Structure

```
video-streaming/
├── nextjs-app/                        # Next.js app (UI + API)
│   ├── app/
│   │   ├── page.tsx                   # Upload page
│   │   ├── watch/[id]/page.tsx        # Video player + quality switcher
│   │   └── api/
│   │       ├── upload/route.ts        # Handle upload + publish to RabbitMQ
│   │       ├── stream/route.ts        # Serve HLS segments (.m3u8 + .ts)
│   │       └── status/[id]/route.ts   # Poll transcoding status
│   ├── lib/
│   │   ├── rabbitmq.ts                # RabbitMQ connection + publish
│   │   └── storage.ts                 # Local file read/write helpers
│   ├── public/
│   │   ├── uploads/                   # Temporary raw video uploads
│   │   └── videos/                    # Transcoded HLS segments
│   ├── .env.local                     # Local environment variables
│   └── Dockerfile                     # (coming soon)
├── transcoder/                        # Standalone FFmpeg worker
│   ├── src/
│   │   ├── index.ts                   # RabbitMQ consumer + retry logic
│   │   ├── transcoder.ts              # FFmpeg HLS processing (NVENC/CPU)
│   │   └── storage.ts                 # Save segments to local/OCI
│   ├── .env                           # Transcoder environment variables
│   └── Dockerfile                     # (coming soon)
└── k8s/                               # Kubernetes manifests (coming soon)
    ├── namespace.yaml
    ├── configmap.yaml
    ├── secret.yaml
    ├── nextjs.yaml
    ├── transcoder.yaml
    └── pvc.yaml
```

---

## HLS Output Structure

After transcoding, each video produces:

```
public/videos/
└── {videoId}/
    ├── master.m3u8          ← Client fetches this first
    ├── 360p/
    │   ├── playlist.m3u8
    │   ├── segment000.ts
    │   └── ...
    ├── 480p/  ...
    ├── 720p/  ...
    └── 1080p/ ...
```

The `master.m3u8` lists all resolutions. HLS.js automatically picks the best one based on network speed, or the user can pick manually.

---

## Local Development Setup (Current)

### Prerequisites

- Windows 11 with **WSL2** (Ubuntu 22.04)
- **Node.js 20+** via nvm inside WSL2
- **FFmpeg** with NVENC support
- **NVIDIA GPU** with drivers (optional — falls back to CPU)
- **CloudAMQP** account (free tier) for RabbitMQ

```bash
# Install FFmpeg in WSL2
sudo apt update && sudo apt install ffmpeg -y

# Verify tools
ffmpeg -version
node --version

# Check NVENC support (optional)
ffmpeg -encoders | grep nvenc
```

### Environment Variables

**`nextjs-app/.env.local`**
```env
RABBITMQ_URL=amqps://your-user:your-password@your-host.cloudamqp.com/your-vhost
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=./public/videos
```

**`transcoder/.env`**
```env
RABBITMQ_URL=amqps://your-user:your-password@your-host.cloudamqp.com/your-vhost
STORAGE_TYPE=local
LOCAL_STORAGE_PATH=../nextjs-app/public/videos
```

### Run Locally

Open **two terminals** in WSL2:

**Terminal 1 — Next.js app:**
```bash
cd ~/video-streaming/nextjs-app
npm install
npm run dev
# Visit http://localhost:3000
```

**Terminal 2 — Transcoder worker:**
```bash
cd ~/video-streaming/transcoder
npm install
npm run dev
# Connects to CloudAMQP and waits for jobs
```

### Local Flow

```
1. Open http://localhost:3000
2. Upload a video file
3. Watch transcoder terminal — FFmpeg progress logs appear
4. Browser auto-redirects to /watch/{videoId}
5. Spinner shows while transcoding
6. Player loads automatically when done
7. Switch quality manually using buttons below the player
```

---

## GPU Encoding (Local Only)

On local dev with an NVIDIA GPU, transcoding uses **NVENC** for 5-10x faster encoding:

```typescript
// transcoder/src/transcoder.ts
"-codec:v h264_nvenc",   // GPU encoding
"-preset p4",            // balanced speed/quality
```

In production (OCI ARM nodes — no GPU), this switches to:
```typescript
"-codec:v libx264",      // CPU encoding
"-preset veryfast",      // fast CPU preset
```

Controlled via the `ENCODER` environment variable (configured in prod setup).

---

## Resolutions Supported

| Resolution | Bitrate | Use Case |
|---|---|---|
| 360p | 400 kbps | Very slow / mobile networks |
| 480p | 500 kbps | Slow networks |
| 720p HD | 1000 kbps | Standard broadband |
| 1080p FHD | 2000 kbps | Fast broadband |

---

## Known Limitations (Local Dev)

- No movie metadata (title, poster, year) — MongoDB integration coming next
- No movie library page — coming next
- Raw uploads stored in `public/uploads/` — not cleaned up automatically
- No authentication — anyone can upload
- RabbitMQ connection drops after long idle (CloudAMQP free tier) — heartbeat fix applied

---

## Production Deployment (Coming Soon)

### Oracle Cloud Free Tier Resources

| Resource | Free Limit | Purpose |
|---|---|---|
| OKE Control Plane | Always free | Kubernetes cluster |
| VM.Standard.A1.Flex (2 nodes) | 4 OCPU, 24GB RAM | Worker nodes |
| Object Storage | 20 GB | HLS segments |
| Load Balancer | 1 (10 Mbps) | Public URL |
| Block Storage | 200 GB | PersistentVolumes |
| Container Registry (OCIR) | 1 GB | Docker images |
| CloudAMQP | 1M msg/month | RabbitMQ (already using ✅) |
| MongoDB Atlas | 512MB | Movie metadata (coming) |

**Estimated monthly cost: $0**

### Deployment Steps
- [ ] Write Dockerfile for nextjs-app
- [ ] Write Dockerfile for transcoder (with libx264 for ARM)
- [ ] Test with docker-compose locally
- [ ] Create OKE cluster on Oracle Cloud (ap-mumbai-1)
- [ ] Push images to OCIR
- [ ] Write K8s manifests (namespace, configmap, secret, pvc, deployments)
- [ ] Deploy and get public Load Balancer IP

---

## Key Concepts (Interview Reference)

- **Adaptive Bitrate Streaming (ABR)** — HLS.js automatically switches quality based on available bandwidth
- **HLS (HTTP Live Streaming)** — uses `.m3u8` playlists + `.ts` segments; same protocol as Hotstar/Netflix
- **RabbitMQ decoupling** — upload API responds instantly; transcoder works independently and scales horizontally
- **NVENC vs libx264** — GPU encoding is 5-10x faster but limited to 3 concurrent sessions on consumer GPUs
- **PersistentVolume (PVC)** — shared storage between pods in Kubernetes
- **CloudAMQP heartbeat** — keeps RabbitMQ connection alive on free tier (idle timeout prevention)
- **m3u8 URL rewriting** — segment paths rewritten at serve time to route through Next.js API

---

## Author

Annamalai Balakrishnan — Backend Engineer.
