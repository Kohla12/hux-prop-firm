# HUX Prop Firm - Express Backend

Secure, production-ready Express.js backend for the HUX proprietary trading platform with Neon PostgreSQL integration.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment Variables
```bash
cp ../.env.local.example .env.local
# Edit .env.local with your Neon DATABASE_URL
```

### 3. Run Development Server
```bash
npm run dev
```

The server will start on `http://localhost:8080`

### 4. Test the Server
```bash
curl http://localhost:8080/health
```

## Features

✨ **Authentication**
- User registration with bcrypt password hashing
- Secure JWT token-based sessions (24-hour expiration)
- Email/password validation
- Account status management

✨ **Database**
- Neon PostgreSQL integration
- Production-ready connection pooling
- 8 optimized tables with 10 indexes
- Type-safe enums and constraints

✨ **Payments**
- Stripe Hosted Checkout integration
- Webhook support for payment confirmation
- Automatic account provisioning on payment

✨ **API**
- RESTful endpoints for auth and payments
- Health check endpoint for monitoring
- CORS support for frontend integration
- Comprehensive error handling

## Project Structure

```
backend/
├── server.js           # Main Express application
├── db/
│   ├── schema.sql     # Database schema (live in Neon)
│   ├── init.js        # Database initialization script
│   └── migrate.js     # Migration helper
├── routes/            # API route handlers (extensible)
└── README.md          # This file
```

## API Endpoints

### Authentication

**Register User**
```bash
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}

Response:
{
  "message": "User registered successfully.",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "trader"
  }
}
```

**Login User**
```bash
POST /api/auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}

Response:
{
  "message": "Authenticated successfully.",
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "trader"
  }
}
```

### Payments

**Create Checkout Session**
```bash
POST /api/checkout/create-session
Content-Type: application/json

{
  "challengeType": "1-step",
  "size": "50000",
  "price": "299",
  "email": "user@example.com",
  "successUrl": "https://example.com/success",
  "cancelUrl": "https://example.com/cancel"
}

Response:
{
  "url": "https://checkout.stripe.com/pay/cs_..."
}
```

### Health & Monitoring

**Check Health**
```bash
GET /health

Response:
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-06-08T12:00:00.000Z"
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens (32+ chars) |
| `STRIPE_SECRET_KEY` | ✅ | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signing secret |
| `NODE_ENV` | ❌ | Environment: "production" or "development" |
| `PORT` | ❌ | Server port (default: 8080) |

## Scripts

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Initialize database
npm run init-db
```

## Database Schema

### Tables
- **users** - User accounts with KYC status
- **kyc_documents** - Identity verification documents
- **challenges** - Trading challenge packages
- **trading_accounts** - Live trader accounts
- **trades** - Trade history and P&L
- **payouts** - Profit distributions
- **referrals** - Affiliate program data
- **system_audits** - Compliance violations

### Key Features
- UUID primary keys for distributed systems
- Timestamp tracking (created_at, updated_at)
- Type-safe enums for statuses and roles
- Optimized indexes on common queries
- Foreign key constraints for data integrity

## Security Features

🔒 **Password Management**
- Bcrypt hashing with 12 rounds
- No plaintext passwords stored
- Secure comparison on login

🔒 **JWT Tokens**
- Signed with secret key
- 24-hour expiration
- Payload includes userId and role

🔒 **Database**
- SSL/TLS in production
- Connection pooling
- Parameterized queries (no SQL injection)

🔒 **Stripe Integration**
- PCI-compliant Hosted Checkout
- Webhook signature verification
- Automatic account provisioning

## Production Deployment

For detailed deployment instructions, see:
- [BACKEND_SETUP.md](../BACKEND_SETUP.md) - Quick start
- [BACKEND_DEPLOYMENT.md](../BACKEND_DEPLOYMENT.md) - Full guide
- [DEPLOYMENT_CHECKLIST.md](../DEPLOYMENT_CHECKLIST.md) - Pre-flight checklist

### Quick Deploy

```bash
# Vercel
vercel deploy

# Or push to Railway/Heroku
git push origin main
```

## Monitoring

### Health Endpoint
```bash
curl https://your-backend.example.com/health
```

Expect response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "..."
}
```

### Logs
Monitor platform logs for:
- Connection errors
- Authentication failures
- Stripe webhook issues
- Database errors

### Performance
- Monitor response times
- Track connection pool usage
- Check for database slowness

## Testing

### Local Integration Test
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run tests
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"Test123!",
    "firstName":"Test",
    "lastName":"User"
  }'
```

## Troubleshooting

### Connection Issues
```
Error: connect ECONNREFUSED

Solution:
- Check DATABASE_URL environment variable
- Verify Neon database is running
- Ensure IP allowlist in Neon includes your server
```

### Authentication Issues
```
Error: JWT_SECRET is required

Solution:
- Generate: openssl rand -base64 32
- Set in environment variables
- Restart server
```

### Stripe Issues
```
Error: Stripe webhook signature verification failed

Solution:
- Copy correct STRIPE_WEBHOOK_SECRET from Stripe dashboard
- Verify webhook endpoint URL is /api/checkout/webhook
- Check Stripe test/live mode matches your keys
```

## Development Tips

### Using Nodemon
Automatically restart on file changes:
```bash
npm run dev
```

### Database Inspection
Log in to Neon to:
- View tables and data
- Check connection status
- Monitor query performance
- Set up backups

### Stripe Testing
Use Stripe test keys for development:
- Card number: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/25)
- CVC: Any 3 digits

## Contributing

When adding new features:
1. Update database schema via Neon MCP
2. Add new endpoints to `server.js`
3. Update this README with new endpoints
4. Test locally before committing
5. Update environment variable docs

## Architecture Notes

**Why Neon + Express?**
- Neon: Serverless PostgreSQL, perfect for scaling
- Express: Lightweight, fast, production-proven
- pg driver: Native Node.js PostgreSQL client

**Connection Pooling**
- Max 20 concurrent connections
- 30-second idle timeout
- 2-second connection timeout
- Suitable for most workloads

**Scalability**
- Stateless design (tokens, no sessions)
- Horizontal scaling ready
- Connection pooling handles traffic spikes

## License

ISC

## Support

- **Neon Docs**: https://neon.tech/docs
- **Express Docs**: https://expressjs.com/
- **Stripe Docs**: https://stripe.com/docs
- **Node.js Docs**: https://nodejs.org/docs/

---

**Built with ❤️ for HUX Prop Firm**
Production-ready. Scalable. Secure.
