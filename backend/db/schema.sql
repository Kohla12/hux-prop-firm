-- ============================================================================
-- HUX PROP FIRM DATABASE ARCHITECTURE
-- Production PostgreSQL Database Schema Spec
-- Target Database: PostgreSQL 14+
-- ============================================================================

-- Enable UUID extension for secure, non-sequential identifier generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Enums for status integrity
CREATE TYPE user_role AS ENUM ('admin', 'trader', 'affiliate');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deactivated');
CREATE TYPE kyc_status_type AS ENUM ('none', 'pending', 'approved', 'rejected');
CREATE TYPE doc_type AS ENUM ('passport', 'driver_license', 'national_id');
CREATE TYPE challenge_type AS ENUM ('one_step', 'two_step', 'instant');
CREATE TYPE account_status_type AS ENUM ('active', 'passed', 'breached');
CREATE TYPE trade_type AS ENUM ('BUY', 'SELL');
CREATE TYPE trade_status AS ENUM ('open', 'closed');
CREATE TYPE payout_status AS ENUM ('pending', 'approved', 'paid', 'declined');
CREATE TYPE broker_type AS ENUM ('mt4', 'mt5', 'ctrader', 'match_trader', 'dxtrade');

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role DEFAULT 'trader'::user_role,
    status user_status DEFAULT 'active'::user_status,
    kyc_status kyc_status_type DEFAULT 'none'::kyc_status_type,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. KYC DOCUMENTS TABLE
CREATE TABLE kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    document_type doc_type NOT NULL,
    document_number VARCHAR(100),
    file_url VARCHAR(512) NOT NULL,
    status kyc_status_type DEFAULT 'pending'::kyc_status_type,
    rejection_reason TEXT,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP WITH TIME ZONE
);

-- 3. CHALLENGE SCHEMES CONFIGURATION TABLE
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type challenge_type NOT NULL,
    size DECIMAL(12, 2) NOT NULL, -- e.g., 5000.00, 200000.00
    profit_target DECIMAL(12, 2) NOT NULL, -- e.g., 400.00 (8%)
    daily_drawdown_limit DECIMAL(12, 2) NOT NULL, -- e.g., 250.00 (5%)
    max_drawdown_limit DECIMAL(12, 2) NOT NULL, -- e.g., 500.00 (10%)
    fee DECIMAL(10, 2) NOT NULL, -- purchase cost
    purchase_status VARCHAR(50) DEFAULT 'paid', -- paid, pending, refunded
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. TRADING ACCOUNTS TABLE (MT4/5 Broker Bridges mappings)
CREATE TABLE trading_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
    broker_platform broker_type DEFAULT 'mt5'::broker_type,
    login_id VARCHAR(100) UNIQUE NOT NULL, -- MT4/5 login credentials
    server_address VARCHAR(255) NOT NULL,
    balance DECIMAL(12, 2) NOT NULL,
    equity DECIMAL(12, 2) NOT NULL,
    start_balance DECIMAL(12, 2) NOT NULL, -- account initial capital size
    daily_base_balance DECIMAL(12, 2) NOT NULL, -- midnight balance snap
    max_equity DECIMAL(12, 2) DEFAULT 0.00,
    status account_status_type DEFAULT 'active'::account_status_type,
    consistency_score DECIMAL(5, 2) DEFAULT 100.00,
    min_trading_days INTEGER DEFAULT 3,
    active_trading_days INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. TRADES HISTORY LOG
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    symbol VARCHAR(30) NOT NULL, -- e.g., "EURUSD"
    type trade_type NOT NULL,
    lots DECIMAL(5, 2) NOT NULL, -- volume sizes
    entry_price DECIMAL(15, 6) NOT NULL,
    close_price DECIMAL(15, 6),
    stop_loss DECIMAL(15, 6),
    take_profit DECIMAL(15, 6),
    open_time TIMESTAMP WITH TIME ZONE NOT NULL,
    close_time TIMESTAMP WITH TIME ZONE,
    pnl DECIMAL(12, 2) DEFAULT 0.00,
    swap DECIMAL(10, 2) DEFAULT 0.00,
    commission DECIMAL(10, 2) DEFAULT 0.00,
    status trade_status DEFAULT 'open'::trade_status
);

-- 6. WITHDRAWAL PAYOUTS TABLE
CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES trading_accounts(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    profit_share_percentage DECIMAL(5, 2) DEFAULT 80.00,
    payout_method VARCHAR(50) NOT NULL, -- USDT, WIRE, BTC, STRIPE
    destination_address TEXT NOT NULL,
    status payout_status DEFAULT 'pending'::payout_status,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- 7. REFERRALS & AFFILIATE COMMISSIONS
CREATE TABLE referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referrer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    referee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    referral_slug VARCHAR(50) NOT NULL,
    click_count INTEGER DEFAULT 0,
    commission_amount DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'pending', -- pending, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. SYSTEM AUDIT & RULE VIOLATION LOGS
CREATE TABLE system_audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES trading_accounts(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL, -- e.g., "DAILY_DRAWDOWN_BREACH"
    balance_snapshot DECIMAL(12, 2) NOT NULL,
    equity_snapshot DECIMAL(12, 2) NOT NULL,
    trigger_details TEXT NOT NULL,
    audited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PERFORMANCE & INTEGRITY INDEXES
-- ============================================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_kyc_user_status ON kyc_documents(user_id, status);
CREATE INDEX idx_accounts_login ON trading_accounts(login_id);
CREATE INDEX idx_accounts_status ON trading_accounts(status);
CREATE INDEX idx_trades_account ON trades(account_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_payouts_user ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_audits_account ON system_audits(account_id);
