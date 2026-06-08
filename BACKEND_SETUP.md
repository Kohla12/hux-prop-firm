# Backend Quick Start Guide

## ✅ Completed Setup

Your HUX Prop Firm backend is now fully configured with Neon PostgreSQL!

### What's Ready
- ✅ Database schema created in Neon (8 production-ready tables)
- ✅ Express backend configured for Neon connection
- ✅ Secure authentication with bcrypt password hashing
- ✅ JWT token management
- ✅ Stripe payment integration
- ✅ Production-ready error handling and connection pooling

## 🚀 Quick Start (3 Steps)

### Step 1: Get Your Neon Database URL
1. Go to [Neon Dashboard](https://console.neon.tech)
2. Select your project
3. Copy the connection string from the "Connection Details"
4. It looks like: `postgresql://username:password@hostname/database`

### Step 2: Generate JWT Secret
```bash
openssl rand -base64 32
```
This produces a secure random string (32+ chars).

### Step 3: Set Environment Variables in Vercel/Railway/Heroku

Add these to your deployment platform:
```
DATABASE_URL=postgresql://...  (from Neon)
JWT_SECRET=<result from openssl>
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

That's it! Your backend is ready to deploy.

## 🏗️ Project Structure

```
backend/
├── server.js              # Main Express app
├── db/
│   ├── schema.sql        # Database schema (already in Neon)
│   ├── init.js           # Database initialization
│   └── migrate.js        # Migration helper
└── routes/               # API endpoints (future)
```

## 📡 Available API Endpoints

### Auth
- **POST** `/api/auth/signup` - Register new user
- **POST** `/api/auth/signin` - Login user

### Payments
- **POST** `/api/checkout/create-session` - Create Stripe checkout
- **POST** `/api/checkout/webhook` - Payment webhook

### Health
- **GET** `/health` - Check database status

## 🧪 Testing Locally

### 1. Install dependencies
```bash
npm install
```

### 2. Create .env.local
```bash
cp .env.local.example .env.local
# Edit .env.local with your Neon DATABASE_URL
```

### 3. Start the server
```bash
npm run dev
```

### 4. Test the health endpoint
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-06-08T..."
}
```

## 🔒 Security Considerations

✅ **Passwords**: Hashed with bcrypt (12 rounds)
✅ **JWT Tokens**: Signed with secret, 24-hour expiration
✅ **Database**: SSL/TLS connection in production
✅ **Environment Variables**: All secrets in env vars, not code
✅ **Stripe**: PCI-compliant hosted checkout

## 📚 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ Yes | Secret for signing JWT tokens (32+ chars) |
| `STRIPE_SECRET_KEY` | ✅ Yes | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | ✅ Yes | Stripe webhook signing secret |
| `NODE_ENV` | ❌ No | "production" or "development" |
| `PORT` | ❌ No | Port number (default: 8080) |

## 🚨 Common Issues & Solutions

### Error: "DATABASE_URL is required"
**Fix**: Add DATABASE_URL to your environment variables

### Error: "Connection refused"
**Fix**: 
- Check DATABASE_URL is correct
- Ensure Neon IP allowlist includes your server's IP
- Verify NODE_ENV is 'production' for SSL

### Error: "JWT_SECRET is required"
**Fix**: Generate new secret with `openssl rand -base64 32`

### Stripe webhook not working
**Fix**: 
- Copy correct webhook secret from Stripe dashboard
- Ensure webhook endpoint is `/api/checkout/webhook`

## 📖 Full Documentation

For detailed information, see:
- [BACKEND_DEPLOYMENT.md](./BACKEND_DEPLOYMENT.md) - Production deployment guide
- [backend/db/schema.sql](./backend/db/schema.sql) - Database structure
- [backend/server.js](./backend/server.js) - API implementation

## 🔗 Useful Links

- **Neon Docs**: https://neon.tech/docs
- **Express Docs**: https://expressjs.com/
- **Stripe Docs**: https://stripe.com/docs
- **Node.js Docs**: https://nodejs.org/docs/

## ✨ Next Steps

1. Deploy backend to Vercel/Railway/Heroku with env variables
2. Test all endpoints with Postman or curl
3. Connect your frontend to the backend
4. Run the full signup → payment → account provisioning flow
5. Monitor logs and adjust connection pooling if needed

---

**Need help?** Check BACKEND_DEPLOYMENT.md for detailed troubleshooting.
