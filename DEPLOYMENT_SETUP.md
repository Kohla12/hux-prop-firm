# HUX Prop Firm - Deployment Setup Guide

## Overview

Your backend is now ready to deploy. This guide walks you through the 3 required steps to get your HUX backend running in production.

## Required Environment Variables

You MUST set these 4 environment variables before deploying to production:

| Variable | Required | Where to Get |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ **REQUIRED** | Neon Dashboard → Connection |
| `JWT_SECRET` | ✅ **REQUIRED** | Generate: `openssl rand -base64 32` |
| `STRIPE_SECRET_KEY` | ✅ **REQUIRED** | Stripe Dashboard → API Keys |
| `STRIPE_WEBHOOK_SECRET` | ✅ **REQUIRED** | Stripe Dashboard → Webhooks |

### Why These Are Required

- **DATABASE_URL**: Connects your backend to the PostgreSQL database
- **JWT_SECRET**: Encrypts authentication tokens (24-hour sessions)
- **STRIPE_SECRET_KEY**: Processes payments securely
- **STRIPE_WEBHOOK_SECRET**: Verifies webhook authenticity from Stripe

## Step 1: Get Your Credentials (5 minutes)

### 1a. Get DATABASE_URL from Neon

1. Go to [Neon Console](https://console.neon.tech)
2. Select your project
3. Click "Connection" in the top right
4. Copy the full connection string (looks like `postgresql://username:password@host/database`)
5. Save this as your `DATABASE_URL`

**⚠️ Important**: The connection string includes your password. Keep it secret!

### 1b. Generate JWT_SECRET

Run this command in your terminal:

```bash
openssl rand -base64 32
```

This generates a secure random string. Copy the output and save it as your `JWT_SECRET`.

Example output: `eG9aB1vC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3zAB4cD5eF6gH7iJ8kL9mN0o`

### 1c. Get Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to Developers → API Keys
3. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)
4. Save this as your `STRIPE_SECRET_KEY`

### 1d. Get Webhook Secret

1. In Stripe Dashboard, go to Developers → Webhooks
2. Click "Add an endpoint"
3. Set the endpoint URL to: `https://your-deployed-url/api/checkout/webhook`
4. Select events: `checkout.session.completed`
5. Copy the Signing secret (starts with `whsec_`)
6. Save this as your `STRIPE_WEBHOOK_SECRET`

**📝 Note**: You'll come back to this after deployment to set the actual URL.

## Step 2: Deploy to Vercel (5-15 minutes)

### Option A: Deploy via Vercel Dashboard (Easiest)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Connect your GitHub repository (hux-prop-firm)
4. Select the repository and import it
5. Add environment variables:
   - Click "Environment Variables"
   - Add each of the 4 variables from Step 1
6. Click "Deploy"

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy from project directory
vercel deploy

# When prompted, add environment variables:
# - DATABASE_URL
# - JWT_SECRET
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
```

### Option C: Deploy to Railway or Heroku

**Railway**:
```bash
railway login
railway link
railway variables add DATABASE_URL "your_url"
railway variables add JWT_SECRET "your_secret"
railway variables add STRIPE_SECRET_KEY "your_key"
railway variables add STRIPE_WEBHOOK_SECRET "your_webhook"
railway deploy
```

**Heroku**:
```bash
heroku login
heroku create hux-prop-firm
heroku config:set DATABASE_URL="your_url"
heroku config:set JWT_SECRET="your_secret"
heroku config:set STRIPE_SECRET_KEY="your_key"
heroku config:set STRIPE_WEBHOOK_SECRET="your_webhook"
git push heroku main
```

## Step 3: Complete Stripe Webhook Setup (2 minutes)

After deployment:

1. Get your deployed backend URL (e.g., `https://hux-prop-firm.vercel.app`)
2. Go to [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
3. Click "Add an endpoint"
4. Endpoint URL: `https://your-deployed-url/api/checkout/webhook`
5. Events: `checkout.session.completed`
6. Click "Create endpoint"
7. Copy the Signing secret and update `STRIPE_WEBHOOK_SECRET` in your deployment

## Verify Deployment (2 minutes)

### Test Health Endpoint

```bash
curl https://your-deployed-url/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-06-08T12:58:54.290Z"
}
```

### Test Authentication

```bash
curl -X POST https://your-deployed-url/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

Expected response includes a JWT token:
```json
{
  "message": "User registered successfully.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "email": "test@example.com",
    "role": "trader"
  }
}
```

## Troubleshooting

### Issue: "JWT_SECRET is required" Error

**Solution**: You must set `JWT_SECRET` in your deployment environment variables.

```bash
# Generate if you haven't already
openssl rand -base64 32

# Add to your deployment platform
# Vercel: Project Settings → Environment Variables
# Railway: Variables tab
# Heroku: heroku config:set JWT_SECRET="your_value"
```

### Issue: "DATABASE_URL is required" Error

**Solution**: Get your Neon connection string:

1. Go to [Neon Console](https://console.neon.tech)
2. Select your project
3. Click "Connection"
4. Copy the connection string
5. Add as `DATABASE_URL` in your deployment

### Issue: Webhook Failures

**Solution**: Make sure `STRIPE_WEBHOOK_SECRET` is correct:

1. Check Stripe Dashboard → Webhooks
2. Copy the exact Signing secret
3. Update in your deployment environment
4. Redeploy

### Issue: Cannot Connect to Database

**Solution**: Verify your DATABASE_URL:

1. Check the URL format: `postgresql://user:password@host/database`
2. Ensure it's the full connection string (not just the host)
3. Check that your Neon project has the schema created
4. Verify the password doesn't contain special characters that need escaping

## Local Development

To test locally before deploying:

```bash
# 1. Copy the environment template
cp .env.local.example .env.local

# 2. Edit .env.local with your credentials
# NODE_ENV=development
# DATABASE_URL=your_neon_url
# JWT_SECRET=your_secret (or leave blank for dev fallback)
# STRIPE_SECRET_KEY=your_test_key
# STRIPE_WEBHOOK_SECRET=your_test_webhook

# 3. Install dependencies
npm install

# 4. Start development server
npm run dev

# 5. Test health endpoint
curl http://localhost:8080/health
```

## Environment Variable Notes

- **Development**: If `JWT_SECRET` is not set, a safe development fallback is used
- **Production**: `JWT_SECRET` must be set (deployment will fail without it)
- **Security**: Never commit `.env` files to git
- **Updates**: If you update env vars, redeploy your backend

## API Endpoints

After deployment, you can use:

- `GET /health` - Health check
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/signin` - Login user
- `POST /api/checkout/create-session` - Create Stripe checkout
- `POST /api/checkout/webhook` - Stripe webhook handler

## Support

If you encounter issues:

1. Check the deployment logs in your platform (Vercel/Railway/Heroku)
2. Verify all 4 environment variables are set correctly
3. Test the `/health` endpoint to confirm database connection
4. Check Stripe dashboard for webhook errors

## Summary

Your backend is production-ready! The process is:

1. ✅ Get 4 credentials (DATABASE_URL, JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
2. ✅ Deploy to your platform (Vercel/Railway/Heroku)
3. ✅ Add environment variables during deployment
4. ✅ Complete Stripe webhook setup
5. ✅ Test /health endpoint
6. ✅ Done! Backend is live

**Estimated time**: 20-30 minutes total
