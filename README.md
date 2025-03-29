# CoCo

### Prerequisites

- Node.js 18+
- Python 3.10+
- API keys for Claude, Gemini, Groq, and PiAPI

### Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

### Backend Setup

```bash
cd backend

# remember to add api keys
cp .env.example .env

docker compose up
```

## Architecture

### Frontend

- **Next.js & React**: Responsive, user-friendly UI
- **Three.js**: Rendering interactive 3D models
- **TLDraw**: Powerful 2D drawing canvas
- **Zustand**: State management

### Backend

- **FastAPI**: High-performance API framework
- **Celery**: Asynchronous task queue for AI operations
- **Redis**: Pub/Sub for real-time updates and task result storage
- **SSE (Server-Sent Events)**: Real-time progress updates

## Inspiration

Creativity is often constrained by technical skills or complex software. CoCo makes 3D modeling accessible to anyone regardless of artistic or technical abilities.

Our goal is to empower people to freely express their imagination and bring their ideas effortlessly into 3D worlds.

## License

[AGPL](LICENSE)
