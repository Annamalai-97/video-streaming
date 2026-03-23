# 🎬 Video Streaming Platform

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

Annamalai Balakrishnan — Backend Engineer
