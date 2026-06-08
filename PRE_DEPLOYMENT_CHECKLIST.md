# HUX Prop Firm - Pre-Deployment Checklist

Use this checklist before deploying your backend to production.

## Environment Variables ✅

- [ ] **DATABASE_URL** obtained from Neon
  - Format: `postgresql://user:password@host/database`
  - Source: Neon Console → Connection
  
- [ ] **JWT_SECRET** generated
  - Command: `openssl rand -base64 32`
  - Length: 32+ characters
  - Stored securely (not in code)
  
- [ ] **STRIPE_SECRET_KEY** obtained
  - Format: `sk_test_*` or `sk_live_*`
  - Source: Stripe Dashboard → API Keys
  
- [ ] **STRIPE_WEBHOOK_SECRET** obtained
  - Format: `whsec_*`
  - Source: Stripe Dashboard → Webhooks

## Local Testing ✅

- [ ] Dependencies installed: `npm install`
- [ ] Code syntax valid: `node -c backend/server.js` ✅
- [ ] Development server starts: `npm run dev`
- [ ] Health endpoint responds: `curl http://localhost:8080/health`
- [ ] Signup endpoint works: `POST /api/auth/signup`
- [ ] Signin endpoint works: `POST /api/auth/signin`

## Database ✅

- [ ] Neon database provisioned
- [ ] Database schema created (11 tables)
- [ ] Connection string copied and saved
- [ ] Connection tested with node: `npm run init-db`

## Stripe ✅

- [ ] Stripe account created
- [ ] API keys obtained
- [ ] Test mode enabled (if using test keys)
- [ ] Webhook endpoint planned (after deployment)

## Code Review ✅

- [ ] JWT_SECRET properly configured (fallback for dev, required for prod)
- [ ] Environment variables validated
- [ ] Error messages clear and helpful
- [ ] No hardcoded secrets in code
- [ ] SSL/TLS enabled for production
- [ ] CORS configured correctly

## Deployment Platform ✅

- [ ] Platform chosen (Vercel/Railway/Heroku)
- [ ] Account created on platform
- [ ] GitHub repository connected (if needed)
- [ ] Project created on platform

## Deployment ✅

- [ ] All 4 environment variables added to platform
- [ ] NODE_ENV set to "production"
- [ ] Backend deployed successfully
- [ ] Deployment logs reviewed for errors

## Post-Deployment Testing ✅

- [ ] Health endpoint responds: `curl https://your-url/health`
- [ ] Status shows "healthy" and database "connected"
- [ ] Signup works with test data
- [ ] Signin works with test data
- [ ] JWT tokens are valid and signed correctly

## Stripe Webhook Setup ✅

- [ ] Deployed backend URL obtained
- [ ] Stripe webhook endpoint created
- [ ] Webhook URL: `https://your-deployed-url/api/checkout/webhook`
- [ ] Events selected: `checkout.session.completed`
- [ ] Webhook secret copied
- [ ] STRIPE_WEBHOOK_SECRET updated in deployment
- [ ] Backend redeployed with new webhook secret

## Monitoring ✅

- [ ] Deployment platform logs accessible
- [ ] Can view error logs
- [ ] Health endpoint monitored
- [ ] Stripe webhook logs monitored

## Security ✅

- [ ] No `.env` files committed to git
- [ ] All secrets stored in deployment environment
- [ ] PASSWORD never logged
- [ ] JWT tokens validated on each request
- [ ] CORS restricted to known origins
- [ ] Database user has minimal permissions

## Documentation ✅

- [ ] DEPLOYMENT_SETUP.md reviewed
- [ ] API endpoints documented
- [ ] Troubleshooting guide available
- [ ] Team members have access to credentials (securely)

## Go/No-Go Decision ✅

- [ ] All items checked
- [ ] No blocking issues
- [ ] Team reviewed deployment plan
- [ ] Ready to deploy

## Deployment Command

```bash
# Choose your platform:

# Vercel
vercel deploy --prod

# Railway
railway deploy

# Heroku
git push heroku main
```

## Post-Deployment Steps

1. Monitor logs for 5 minutes
2. Test health endpoint
3. Create test user account
4. Verify database is storing data
5. Test payment flow with Stripe test card
6. Monitor webhook logs
7. Check email notifications (if configured)

## Rollback Plan

If issues occur:

1. Check deployment platform logs
2. Verify environment variables
3. Test `/health` endpoint
4. Verify database connectivity
5. Check Stripe webhook logs
6. Revert to previous deployment if needed

---

**Last Updated**: 2026-06-08
**Status**: Ready for Production Deployment
