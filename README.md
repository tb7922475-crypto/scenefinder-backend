# SceneFinder.AI

Anime scene search engine powered by Google Gemini embeddings. Upload anime fight clips, and search for specific actions by describing them in natural language.

## Features

- **Chat Interface** — Conversational AI agent that finds exact timestamps from natural-language descriptions
- **Semantic Search** — CLIP-style embedding search using Google Gemini (text + vision)
- **Video Indexing** — Automatic frame extraction and embedding generation via FFmpeg + Gemini Vision
- **Scene Grouping** — Groups matching frames into coherent scene segments with confidence scores
- **Google Drive Links** — Attach Drive download links to uploaded clips
- **Library Management** — Browse, track, and monitor all indexed videos

## Supported Anime

- Jujutsu Kaisen
- Chainsaw Man
- Demon Slayer (coming soon)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Express.js (Node 18+) |
| Database | PostgreSQL |
| Embeddings | Google Gemini (`embedding-001` + `gemini-pro-vision`) |
| Video Processing | FFmpeg via `fluent-ffmpeg` + `ffmpeg-static` |
| Frontend | Vanilla HTML/CSS/JS (served from `public/`) |

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Setup

```bash
# Clone
git clone https://github.com/tb7922475-crypto/scenefinder-backend.git
cd scenefinder-backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and GEMINI_API_KEY

# Start the server
npm start
# or for development with auto-reload:
npm run dev
```

The server starts on `http://localhost:3000` with the frontend served at the root.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `PORT` | No | Server port (default: `3000`) |
| `NODE_ENV` | No | `production` or `development` |
| `INDEXER_POLL_INTERVAL_MS` | No | Background indexer poll interval (default: `30000`) |
| `INDEXER_FRAME_INTERVAL` | No | Seconds between extracted frames (default: `1`) |

## API Endpoints

### Chat (Agent)
```
POST /api/chat
Body: { "message": "Toji slashes through the dragon" }
```
Returns a conversational response with matched scenes, timestamps, and Drive links.

### Search
```
POST /api/search
Body: { "query": "Gojo removes his blindfold" }
```
Returns structured scene results sorted by confidence.

### Upload
```
POST /api/upload
Form data: video (file), title, anime_title, clip_name, drive_link
```
Uploads a video, starts background indexing.

### Library
```
GET /api/library         — List all videos
GET /api/library/:id     — Get video details
```

### Index Status
```
GET /api/index-status            — Global indexing stats
GET /api/index-status/:videoId   — Per-video indexing progress
```

### Health
```
GET /  — Returns service status
```

## Architecture

```
scenefinder-backend/
├── server.js              # Express app entry point
├── db.js                  # PostgreSQL schema + query helper
├── routes/
│   ├── chat.js            # POST /api/chat (agent endpoint)
│   ├── search.js          # POST /api/search
│   ├── upload.js          # POST /api/upload
│   ├── library.js         # GET /api/library
│   └── index_status.js    # GET /api/index-status
├── indexer/
│   └── indexer.js         # Background video indexing worker
├── utils/
│   ├── embeddings.js      # Gemini text + image embedding
│   ├── ffmpeg.js          # Frame extraction
│   ├── sceneGrouping.js   # Cosine similarity + scene clustering
│   └── logger.js          # Structured logger
├── public/
│   ├── index.html         # Frontend SPA
│   ├── style.css          # Dark theme styles
│   └── app.js             # Frontend logic
├── .env.example           # Environment template
├── Procfile               # Railway / Heroku deploy
└── package.json
```

## How It Works

1. **Upload** a video clip (MP4, MKV, etc.) with metadata (anime title, clip name, Drive link)
2. **FFmpeg** extracts frames at a configurable interval (default: 1 frame/second)
3. **Gemini Vision** generates a text description of each frame
4. **Gemini Embeddings** converts each description into a vector embedding
5. **Search**: user query is embedded → cosine similarity against all frame embeddings → grouped into scenes → ranked by confidence

## Deployment

### Railway / Render / Heroku

1. Set `DATABASE_URL` and `GEMINI_API_KEY` environment variables
2. The `Procfile` handles startup: `web: node server.js`

## License

MIT
