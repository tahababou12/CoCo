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

Creativity is often constrained by technical skills, complex software, and letting powerful AI models take the creative freedom from us. CoCo makes the composition of art – both in 2D and 3D – accessible to anyone regardless of artistic or technical abilities. Using computer vision, CoCo acts as an interactive assistant that improves and gives you feedbacks on your drawing – all done without a trackpad or pen!

Our goal is to empower people to freely express their imagination and bring their ideas effortlessly into the real world.

## License

[AGPL](LICENSE)
