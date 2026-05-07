# ✨ Nova AI — Production-Ready AI Platform

A full-stack, premium AI web platform inspired by ChatGPT, Midjourney & Runway — powered by the **Blackbox AI API**.

Built with **Next.js 14 (App Router)**, **TypeScript**, **MongoDB**, **Tailwind CSS**, and **Framer Motion**.

---

## 🌟 Features

### 💬 AI Chat (ChatGPT-style)
- Multi-turn conversation with memory
- **Image upload inside chat** — drop pictures, ask questions about them
- Markdown rendering (lists, tables, code blocks with syntax highlighting)
- Typing animation while the model thinks
- Copy response, delete conversations
- Sidebar history of all conversations

### 🎨 Image Generation
- Prompt-based high-quality image generation (Flux Schnell)
- Gallery of your past generations
- One-click download
- Responsive grid layout

### 🎬 Video Generation
- Prompt-based AI video creation
- Inline video preview player
- Download / export
- Gallery history

### 🔐 Auth & Security
- Email + password registration with bcrypt hashing
- JWT stored in **httpOnly cookies** (XSS-safe)
- Route protection via Next.js middleware
- **API key stays server-side — never shipped to the frontend**
- Rate limiting per user (configurable via env)
- Input validation on all endpoints

### 🎨 UI/UX
- Dark mode default with a premium aesthetic
- Animated gradient accents
- Smooth Framer Motion transitions
- Fully responsive (mobile sidebar, touch-friendly)
- Clean toast notifications
- Lazy loading for all media

---

## 🧱 Tech Stack

| Layer        | Tech                                                         |
| ------------ | ------------------------------------------------------------ |
| Framework    | Next.js 14 (App Router) + React 18                           |
| Language     | TypeScript                                                   |
| Styling      | Tailwind CSS + custom design system                          |
| Animations   | Framer Motion                                                |
| Icons        | lucide-react                                                 |
| Markdown     | react-markdown + react-syntax-highlighter + remark-gfm       |
| Database     | MongoDB (Mongoose)                                           |
| Auth         | JWT (jsonwebtoken) + bcryptjs, httpOnly cookies              |
| AI Backend   | Blackbox AI (OpenAI-compatible) — chat, image, video         |

---

## 📁 Project Structure

```
ai-platform/
├── .env.local                # your secrets (DO NOT commit)
├── .env.local.example        # template
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout (dark mode, toast provider)
│   │   ├── page.tsx          # Landing page
│   │   ├── globals.css
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── chat/page.tsx     # Chat interface
│   │   ├── image/page.tsx    # Image generation
│   │   ├── video/page.tsx    # Video generation
│   │   ├── dashboard/page.tsx
│   │   └── api/
│   │       ├── auth/{register,login,logout,me}/route.ts
│   │       ├── chat/route.ts
│   │       ├── conversations/{route.ts, [id]/route.ts}
│   │       ├── image/route.ts
│   │       ├── video/route.ts
│   │       └── upload/route.ts
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ChatInput.tsx
│   │   ├── TypingIndicator.tsx
│   │   └── Toast.tsx
│   ├── lib/
│   │   ├── mongodb.ts
│   │   ├── auth.ts
│   │   ├── blackbox.ts       # Blackbox AI API client
│   │   ├── rateLimit.ts
│   │   └── utils.ts
│   ├── models/
│   │   ├── User.ts
│   │   ├── Conversation.ts
│   │   └── Generation.ts
│   └── middleware.ts         # Route protection
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js 18+** (recommended 20 LTS)
- **MongoDB** — either:
  - Local install (`mongod` running on `mongodb://localhost:27017`), **or**
  - Free cloud cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
- A **Blackbox AI API key** — already configured for you.

### 2. Install dependencies

```bash
cd ai-platform
npm install
```

### 3. Configure environment variables

A `.env.local` file is already created for you. Verify it contains:

```env
MONGODB_URI=mongodb://localhost:27017/ai-platform
JWT_SECRET=please-change-this-to-a-super-secret-random-string-min-32-chars-0123456789
BLACKBOX_API_KEY=sk-P0gGry4ZHskwTEqzM7T6iA
BLACKBOX_API_URL=https://api.blackbox.ai
NEXT_PUBLIC_APP_URL=http://localhost:3000
RATE_LIMIT_PER_MINUTE=30

# Required for image upload tools in production (Supabase Storage)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SUPABASE_STORAGE_BUCKET=uploads
```

### Supabase Storage setup (required for uploads in production)

Image upload endpoints (including avatar and image editing flows) require Supabase Storage in production.

1. In Supabase Dashboard, create a Storage bucket named `uploads` (or set your own name in `SUPABASE_STORAGE_BUCKET`).
2. Add server env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
3. If you need direct public URLs, make the bucket public or configure proper storage policies.
4. Restart the app after updating env vars.

> ⚠️ **Production checklist**
> - Change `JWT_SECRET` to a long random string (`openssl rand -base64 48`).
> - Replace `MONGODB_URI` with your Atlas connection string.
> - Never commit `.env.local` to git (already in `.gitignore`).

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Build for production

```bash
npm run build
npm start
```

---

## 🔑 How Authentication Works

1. `POST /api/auth/register` — hashes password (bcrypt), creates user, signs JWT, sets `token` cookie (httpOnly, 7 days).
2. `POST /api/auth/login` — verifies password, issues new cookie.
3. Every protected API route calls `getUserFromRequest(req)` which reads & verifies the JWT from cookies or `Authorization: Bearer`.
4. `middleware.ts` redirects unauthenticated users from `/chat`, `/image`, `/video`, `/dashboard` → `/login`.
5. Already-logged-in users visiting `/login` or `/register` are redirected to `/chat`.

---

## 🔌 Blackbox AI Integration

All calls happen **server-side** in `src/lib/blackbox.ts`:

- `chatCompletion()` — POSTs to `https://api.blackbox.ai/chat/completions` (OpenAI-compatible).
- `generateImage()` — POSTs to `/images/generations`, with a fallback that parses image URLs from a chat completion if the direct endpoint is unavailable.
- `generateVideo()` — POSTs to `/video/generations`, with a similar fallback.

Model IDs used (change in `src/lib/blackbox.ts`):

```ts
export const MODELS = {
  chat:     'blackboxai/openai/gpt-4',
  chatFast: 'blackboxai/anthropic/claude-3.5-sonnet',
  image:    'blackboxai/black-forest-labs/flux-1-schnell',
  video:    'blackboxai/stability-ai/stable-video-diffusion',
};
```

### Vision (image-in-chat)
When the user uploads images, messages are sent using OpenAI's multimodal format:
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What's in this picture?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

---

## 🛡️ Security Features

| Measure | Implementation |
| ------- | -------------- |
| API key hidden | Only read from `process.env` server-side. Never in client bundles. |
| Password hashing | `bcryptjs` with 10 salt rounds |
| JWT | `httpOnly`, `sameSite=lax`, `secure` in production |
| Rate limiting | In-memory per-user sliding window (swap for Redis in prod) |
| Input validation | Every route validates body shape, file size, MIME type |
| File upload | 8 MB cap, whitelist of image types, base64 data-URL only |
| CSRF | Mitigated via `sameSite=lax` cookies |

---

## 📡 API Reference

| Route | Method | Description |
| ----- | ------ | ----------- |
| `/api/auth/register` | POST | `{name, email, password}` → sets cookie |
| `/api/auth/login`    | POST | `{email, password}` → sets cookie |
| `/api/auth/logout`   | POST | clears cookie |
| `/api/auth/me`       | GET  | returns current user |
| `/api/chat`          | POST | `{conversationId?, message, images?}` → assistant reply |
| `/api/conversations` | GET  | list conversations |
| `/api/conversations/[id]` | GET / DELETE | fetch / remove a conversation |
| `/api/image`         | GET / POST | list / generate images |
| `/api/video`         | GET / POST | list / generate videos |
| `/api/upload`        | POST | multipart image upload → data-URL |

---

## 🧪 Testing the flow

1. Go to `/register` → create an account
2. You'll be redirected to `/chat`
3. Type a message or drag an image in — see it in the conversation
4. Open the sidebar — your conversation is saved
5. Visit `/image` — try a prompt like *"a cinematic robot sipping coffee on Mars, 8k"*
6. Visit `/video` — try a short cinematic prompt
7. Visit `/dashboard` — see your activity counts

---

## 🗺️ Roadmap Ideas

- [ ] Streaming chat responses (SSE) for token-by-token typing
- [ ] Model picker in chat (GPT-4 / Claude / Llama)
- [ ] Image-to-image & inpainting
- [ ] Persistent uploads to S3 / Cloudflare R2 instead of data-URLs
- [ ] Redis-based rate limiter + session store
- [ ] Stripe billing & usage-based plans
- [ ] Share public links for conversations & generations

---

## 📝 License

MIT — built with ❤️ using Blackbox AI.
