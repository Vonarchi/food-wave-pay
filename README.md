# Food Wave Pay

QR-powered mobile ordering for food trucks. Scan, order, and pay – orders go straight to the kitchen.

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL, Realtime, Edge Functions)
- **AI**: Google Gemini API (menu extraction from images)

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Create a `.env` file with your Supabase credentials (see `.env.example` if available).

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/food-wave-pay.git
git push -u origin main
```

### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (or leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3. Environment Variables

Add these in Vercel Project Settings → Environment Variables:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |

### 4. Deploy

Click **Deploy**. Vercel will build and publish your app.

## Supabase Edge Functions (AI Menu Extraction)

The `extract-menu` function runs on Supabase, not Vercel. Deploy it separately:

```bash
# Install Supabase CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Set secret for Gemini API
supabase secrets set GOOGLE_GEMINI_API_KEY=your_google_ai_api_key

# Deploy the function
supabase functions deploy extract-menu
```

Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey).

## Icons & Branding

Replace these files with your own branding before deploy:

- `public/favicon.ico` – Browser tab icon (replace if using a template favicon)
- `public/icon-192.png` – PWA icon (192×192)
- `public/icon-512.png` – PWA icon (512×512)

Generate from a source image:

```bash
# Using ImageMagick (if installed)
convert favicon.ico -resize 192x192 public/icon-192.png
convert favicon.ico -resize 512x512 public/icon-512.png
```

Update `index.html` og:image and twitter:image to full URLs after deploy (e.g. `https://yourdomain.com/icon-512.png`).
