# HUX Prop Firm Backend - Deployment Guide

## Overview

Your Express backend is now configured to connect to **Neon PostgreSQL** with the complete database schema already initialized.

## What's Been Set Up

✅ **Database Schema**: Complete prop firm database created in Neon with 8 tables:
- `users` - User accounts with KYC status
- `kyc_documents` - Document verification
- `challenges` - Trading challenges/packages
- `trading_accounts` - Live trading accounts
- `trades` - Trade history
- `payouts` - Profit distributions
- `referrals` - Affiliate tracking
- `system_audits` - Compliance logging

✅ **Backend Code**: Express server configured with:
- Secure password hashing (bcrypt)
- JWT authentication tokens
- Stripe payment integration
- Database connection pooling
- Production-ready error handling

## Required Environment Variables

Before deploying, ensure these variables are set:

### Required (Production)
```
DATABASE_URL=postgresql://user:password@hostname/database  # From Neon
JWT_SECRET=<min 32 chars>                                   # Generate: openssl rand -base64 32
STRIPE_SECRET_KEY=sk_test_xxxxx                            # From Stripe Dashboard
STRIPE_WEBHOOK_SECRET=whsec_xxxxx                          # From Stripe Webhook Settings
```

### Optional
```
NODE_ENV=production
PORT=8080
```

## Deployment Steps

### 1. Get Neon Connection String
1. Go to your Neon project dashboard
2. Copy the DATABASE_URL from the connection details
3. It should look like: `postgresql://user:password@host.neon.tech/database`

### 2. Generate JWT Secret
```bash
openssl rand -base64 32
```

### 3. Set Environment Variables
In your deployment platform (Vercel, Railway, Heroku, etc.):
- Add `DATABASE_URL` (from Neon)
- Add `JWT_SECRET` (generated above)
- Add `STRIPE_SECRET_KEY` (from Stripe dashboard)
- Add `STRIPE_WEBHOOK_SECRET` (from Stripe webhooks)

### 4. Deploy Backend

**Option A: Vercel**
```bash
vercel deploy
```

**Option B: Railway**
1. Connect your GitHub repo to Railway
2. Add the environment variables in Railway dashboard
3. Deploy automatically on push

**Option C: Docker/Traditional Server**
```bash
npm install
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/signin` - Login user

### Payments
- `POST /api/checkout/create-session` - Create Stripe checkout session
- `POST /api/checkout/webhook` - Webhook for payment confirmation

### Health Check
- `GET /health` - Database connection status

## Database Connection Pool

The backend uses optimized connection pooling:
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

This is suitable for most Neon deployments. For high-traffic deployments, adjust in `server.js`.

## Testing

### Local Testing
```bash
# Create .env file with Neon DATABASE_URL
echo "DATABASE_URL=postgresql://..." > .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "STRIPE_SECRET_KEY=sk_test_mock" >> .env
echo "STRIPE_WEBHOOK_SECRET=whsec_mock" >> .env

# Run backend
npm start
```

### Test Endpoints
```bash
# Health check
curl http://localhost:8080/health

# Signup
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"John","lastName":"Doe"}'

# Signin
curl -X POST http://localhost:8080/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Monitoring

### Production Logs
Check your deployment platform's logs for:
```
[HUX Backend Engine] running securely on port 8080
[HUX Backend Engine] Database: Neon PostgreSQL (Production Ready)
```

### Database Health
Use the `/health` endpoint to monitor database connection:
```bash
curl https://your-backend.vercel.app/health
```

## Troubleshooting

### "DATABASE_URL is required"
- Ensure DATABASE_URL is set in your environment variables
- Check the value is not empty or malformed

### "Connection timeout"
- Verify DATABASE_URL is correct from Neon
- Check Neon IP whitelist settings (should allow all for Vercel)
- Ensure NODE_ENV is set to 'production' for SSL

### "JWT_SECRET is required"
- Generate with: `openssl rand -base64 32`
- Set in your deployment platform's environment variables

### Stripe webhook failures
- Ensure STRIPE_WEBHOOK_SECRET matches your Stripe dashboard
- Check webhook endpoint in Stripe dashboard points to `/api/checkout/webhook`

## Next Steps

1. ✅ Database schema created in Neon
2. ✅ Backend configured for Neon
3. → Deploy backend to your platform
4. → Connect frontend to backend API endpoints
5. → Test the full authentication and payment flow

## Support

For Neon issues: https://neon.tech/docs
For Express/Node issues: https://expressjs.com/
For Stripe issues: https://stripe.com/docs
