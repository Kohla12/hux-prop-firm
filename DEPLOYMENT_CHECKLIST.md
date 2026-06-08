# Backend Deployment Checklist

Use this checklist to ensure your backend is properly deployed and configured.

## Pre-Deployment Setup

- [ ] **Neon Database Created**
  - [ ] Log in to [Neon Console](https://console.neon.tech)
  - [ ] Create a new project or select existing
  - [ ] Copy DATABASE_URL from connection details
  - [ ] Schema is already created (8 tables, 10 indexes)

- [ ] **Generate Secrets**
  - [ ] Generate JWT_SECRET: `openssl rand -base64 32`
  - [ ] Copy Stripe API keys from [Stripe Dashboard](https://dashboard.stripe.com)
  - [ ] Store all secrets securely (never commit to git)

- [ ] **Environment Variables Ready**
  - [ ] DATABASE_URL (from Neon)
  - [ ] JWT_SECRET (generated)
  - [ ] STRIPE_SECRET_KEY (from Stripe)
  - [ ] STRIPE_WEBHOOK_SECRET (from Stripe)

## Deployment to Vercel

- [ ] **Connect Repository**
  - [ ] Push code to GitHub
  - [ ] Log in to [Vercel](https://vercel.com)
  - [ ] Import GitHub repository

- [ ] **Configure Environment Variables**
  - [ ] Go to Project Settings → Environment Variables
  - [ ] Add DATABASE_URL
  - [ ] Add JWT_SECRET
  - [ ] Add STRIPE_SECRET_KEY
  - [ ] Add STRIPE_WEBHOOK_SECRET
  - [ ] Set NODE_ENV = production

- [ ] **Deploy**
  - [ ] Click "Deploy"
  - [ ] Wait for build to complete
  - [ ] Verify deployment succeeded

- [ ] **Test Deployment**
  - [ ] Note your deployment URL
  - [ ] Test health endpoint: `curl https://your-url/health`
  - [ ] Should return: `{"status":"healthy","database":"connected"}`

## Alternative Deployments

### Railway

- [ ] **Create Railway Account** - https://railway.app
- [ ] **Connect GitHub Repository**
  - [ ] Click "New Project"
  - [ ] Select "Deploy from GitHub repo"
  - [ ] Select your repository

- [ ] **Add Environment Variables**
  - [ ] PROJECT_ID_* variables auto-filled
  - [ ] Add DATABASE_URL (from Neon)
  - [ ] Add JWT_SECRET
  - [ ] Add STRIPE_SECRET_KEY
  - [ ] Add STRIPE_WEBHOOK_SECRET
  - [ ] Set PORT = 8080

- [ ] **Deploy & Test**
  - [ ] Railway auto-deploys on git push
  - [ ] Check deployment logs for errors
  - [ ] Test `/health` endpoint

### Heroku (Legacy)

- [ ] **Create Heroku Account** - https://heroku.com
- [ ] **Create New App**
  - [ ] Name: `hux-prop-firm-backend`
  - [ ] Region: US or EU

- [ ] **Configure Environment Variables**
  - [ ] Settings → Config Vars
  - [ ] Add all required environment variables

- [ ] **Connect & Deploy**
  - [ ] Connect to GitHub repository
  - [ ] Enable automatic deploys
  - [ ] Deploy main branch

## Post-Deployment Verification

- [ ] **Health Check**
  ```bash
  curl https://your-backend-url/health
  ```
  - [ ] Response includes "healthy" status
  - [ ] Database connection confirmed

- [ ] **Test Signup Endpoint**
  ```bash
  curl -X POST https://your-backend-url/api/auth/signup \
    -H "Content-Type: application/json" \
    -d '{
      "email":"test@example.com",
      "password":"TestPassword123!",
      "firstName":"John",
      "lastName":"Doe"
    }'
  ```
  - [ ] Response includes JWT token
  - [ ] User created in Neon database

- [ ] **Verify Database Connection**
  - [ ] Log in to Neon console
  - [ ] Check users table has the test user
  - [ ] Verify all 8 tables exist
  - [ ] Check indexes are present

- [ ] **Test Signin Endpoint**
  ```bash
  curl -X POST https://your-backend-url/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{
      "email":"test@example.com",
      "password":"TestPassword123!"
    }'
  ```
  - [ ] Returns valid JWT token
  - [ ] Token can be decoded successfully

- [ ] **Test Stripe Integration** (requires Stripe account)
  - [ ] Call `/api/checkout/create-session`
  - [ ] Verify Stripe session created
  - [ ] Confirm success/cancel URLs work

## Security Verification

- [ ] **No Hardcoded Secrets**
  - [ ] No DATABASE_URL in code
  - [ ] No JWT_SECRET in code
  - [ ] No Stripe keys in code

- [ ] **Environment Variables in Place**
  - [ ] DATABASE_URL set in deployment platform
  - [ ] JWT_SECRET set and non-empty (32+ chars)
  - [ ] All STRIPE_* keys set
  - [ ] NODE_ENV = production

- [ ] **SSL/TLS Enabled**
  - [ ] Backend URL is HTTPS (not HTTP)
  - [ ] Certificate is valid
  - [ ] Database connection uses SSL

- [ ] **CORS Configured**
  - [ ] Check CORS settings if connecting from frontend
  - [ ] Test requests from frontend origin
  - [ ] Verify credentials are handled correctly

## Frontend Integration

- [ ] **Update API URLs**
  - [ ] Change localhost:8080 → your-backend-url
  - [ ] Update signup endpoint URL
  - [ ] Update signin endpoint URL
  - [ ] Update payment endpoint URL

- [ ] **Test Full Flow**
  - [ ] User can sign up
  - [ ] User receives JWT token
  - [ ] User can sign in with created account
  - [ ] Payment flow initiates correctly

## Monitoring & Maintenance

- [ ] **Set Up Logging**
  - [ ] Monitor platform logs (Vercel/Railway/Heroku)
  - [ ] Check for database connection errors
  - [ ] Review error rates daily

- [ ] **Database Monitoring**
  - [ ] Visit Neon console daily
  - [ ] Check active connections
  - [ ] Review database size
  - [ ] Set up backup notifications

- [ ] **Performance Baseline**
  - [ ] Record initial response times
  - [ ] Monitor for performance degradation
  - [ ] Adjust connection pool if needed

- [ ] **Stripe Setup**
  - [ ] Configure webhook endpoint in Stripe
  - [ ] Set webhook URL to `/api/checkout/webhook`
  - [ ] Test webhook delivery
  - [ ] Verify webhook signing secret

## Deployment Summary

**Status**: Ready for Production
**Environment**: Cloud-hosted (Neon + Vercel/Railway)
**Security**: Production-ready with SSL/TLS
**Scalability**: Auto-scaling with managed services
**Monitoring**: Available via platform dashboards

## Troubleshooting Quick Links

| Issue | Solution |
|-------|----------|
| "DATABASE_URL not set" | Add to environment variables in deployment platform |
| "Connection timeout" | Verify Neon DATABASE_URL and IP allowlist |
| "JWT_SECRET required" | Run `openssl rand -base64 32` and add to env vars |
| "Stripe error" | Check API keys match dashboard, webhook secret correct |
| "Health check fails" | Check database connection, verify credentials |

## Support Contacts

- **Neon Support**: https://neon.tech/support
- **Vercel Support**: https://vercel.com/support
- **Stripe Support**: https://support.stripe.com
- **Railway Support**: https://railway.app/support

---

**Deployment Date**: ________________
**Backend URL**: ________________
**Status**: ✅ Production Ready

Once all items are checked, your backend is fully operational!
