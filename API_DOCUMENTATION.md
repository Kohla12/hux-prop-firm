# HUX Prop Firm - API Documentation

## Authentication Endpoints

### 1. Email/Password Registration
**POST** `/api/auth/signup`

Register a new user with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "message": "User registered successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "trader",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2026-06-05T07:30:00Z"
  }
}
```

---

### 2. Email/Password Login
**POST** `/api/auth/signin`

Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "message": "Authenticated successfully.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "trader",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

### 3. Google OAuth Authentication
**POST** `/api/auth/google`

Authenticate or register using Google OAuth.

**Request:**
```json
{
  "googleToken": "google_id_token_from_frontend",
  "email": "user@gmail.com",
  "firstName": "John",
  "lastName": "Doe",
  "googleId": "google_user_id"
}
```

**Response:**
```json
{
  "message": "Google authentication successful.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@gmail.com",
    "role": "trader",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

### 4. Apple OAuth Authentication
**POST** `/api/auth/apple`

Authenticate or register using Apple OAuth.

**Request:**
```json
{
  "appleToken": "apple_id_token_from_frontend",
  "email": "user@icloud.com",
  "firstName": "John",
  "lastName": "Doe",
  "appleId": "apple_user_id"
}
```

**Response:**
```json
{
  "message": "Apple authentication successful.",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@icloud.com",
    "role": "trader",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

---

## Payment & Challenge Endpoints

### 5. Create Checkout Session
**POST** `/api/checkout/create-session`

Create a Stripe checkout session for a trading challenge. **Requires authentication.**

**Headers:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "challengeType": "1-step",
  "size": "5000",
  "price": 99.99,
  "successUrl": "https://yourapp.com/success",
  "cancelUrl": "https://yourapp.com/cancel"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/pay/cs_test_..."
}
```

---

### 6. Admin: Approve Payment & Provision Account
**POST** `/api/admin/approve-payment/:challengeId`

Admin endpoint to approve payment and provision trading account. **Requires admin role.**

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Response:**
```json
{
  "message": "Payment approved and account provisioned.",
  "tradingAccount": {
    "loginId": "1234567",
    "balance": 5000,
    "serverAddress": "Hux-Broker-Server-01"
  }
}
```

---

## Trading Platform Linking

### 7. Link Trading Platform
**POST** `/api/trading/link-platform`

Link a funded trading account to a trading platform (MT4, MT5, cTrader, etc.). **Requires authentication.**

**Headers:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "tradingAccountId": "uuid",
  "platformType": "mt5",
  "platformLogin": "12345678",
  "platformPassword": "encrypted_password",
  "platformServer": "HuxBroker-Server"
}
```

**Response:**
```json
{
  "message": "Trading platform linked successfully.",
  "platformLink": {
    "id": "uuid",
    "platformType": "mt5",
    "status": "active",
    "linkedAt": "2026-06-05T07:30:00Z"
  }
}
```

---

### 8. Get User Trading Accounts & Platforms
**GET** `/api/trading/accounts`

Retrieve all trading accounts and linked platforms for the authenticated user. **Requires authentication.**

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "accounts": [
    {
      "id": "uuid",
      "loginId": "1234567",
      "balance": 5000,
      "equity": 5150,
      "status": "active",
      "createdAt": "2026-06-05T07:30:00Z",
      "platforms": [
        {
          "id": "uuid",
          "type": "mt5",
          "status": "active"
        }
      ]
    }
  ]
}
```

---

## Health Check

### 9. Health Check
**GET** `/health`

Check if the backend is running and database is connected.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-06-05T07:30:00Z"
}
```

---

## Payment Flow

### Complete Payment & Account Provisioning Workflow

1. **User Creates Checkout Session**
   - User calls `/api/checkout/create-session` with challenge details
   - Backend creates Stripe session and stores payment record as "pending"

2. **User Completes Payment**
   - User is redirected to Stripe checkout
   - User completes payment on Stripe

3. **Stripe Webhook Notification**
   - Stripe sends webhook to `/api/checkout/webhook`
   - Backend updates payment status to "completed"
   - Backend creates challenge with status "pending_admin_approval"
   - Backend creates admin notification

4. **Admin Reviews & Approves**
   - Admin receives notification of pending payment
   - Admin calls `/api/admin/approve-payment/:challengeId`
   - Backend provisions trading account with funded balance
   - User can now access their funded trading account

5. **User Links Trading Platform**
   - User calls `/api/trading/link-platform` with platform credentials
   - Backend creates platform link
   - User can now trade on their chosen platform

---

## Database Schema

### Key Tables

- **users**: User accounts with OAuth support
- **challenges**: Trading challenges/evaluations
- **trading_accounts**: Funded trading accounts
- **payments**: Stripe payment records
- **platform_links**: Links between trading accounts and trading platforms
- **admin_notifications**: Notifications for admin approval workflow

---

## Environment Variables

```
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your_jwt_secret_key
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PORT=8080
NODE_ENV=production
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200**: Success
- **201**: Created
- **400**: Bad Request
- **401**: Unauthorized
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **409**: Conflict (e.g., email already registered)
- **500**: Internal Server Error

Error responses include a message:
```json
{
  "error": "Description of the error"
}
```

