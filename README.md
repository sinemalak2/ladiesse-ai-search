# Ladiesse AI Search — Vercel Backend

Secure serverless proxy that connects your Shopify store to Claude AI for natural language product search.

## Deploy in 5 minutes

### 1. Create a free Vercel account
Go to https://vercel.com and sign up (free tier is enough).

### 2. Install Vercel CLI
```bash
npm install -g vercel
```

### 3. Deploy
```bash
cd ladiesse-ai-search
vercel deploy --prod
```
Vercel will give you a URL like: `https://ladiesse-ai-search.vercel.app`

### 4. Add your Anthropic API key
In your Vercel dashboard:
- Go to your project → Settings → Environment Variables
- Add: `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
- Redeploy once after adding the key

### 5. Update your Shopify liquid file
In `ladiesse-ai-search.liquid`, find this line:
```
var API_URL = 'YOUR_VERCEL_URL_HERE/api/search';
```
Replace with your actual Vercel URL, e.g.:
```
var API_URL = 'https://ladiesse-ai-search.vercel.app/api/search';
```

## Cost estimate
Uses claude-haiku-4-5 — approximately $0.001 per search query.
At 1,000 searches/month = ~$1/month in API costs.

## Security
- API key never exposed to the browser
- CORS locked to ladiesse.com and www.ladiesse.com only
- No user data stored or logged
# ladiesse-ai-search
