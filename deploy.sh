#!/bin/bash

# HUX Prop Firm - Deployment Helper Script
# This script helps you deploy the backend to Vercel

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         HUX Prop Firm - Backend Deployment Helper             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we have the required environment variables
check_env_vars() {
    echo "Checking environment variables..."
    
    required_vars=("DATABASE_URL" "JWT_SECRET" "STRIPE_SECRET_KEY" "STRIPE_WEBHOOK_SECRET")
    missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "❌ Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "   - $var"
        done
        echo ""
        echo "💡 How to get these variables:"
        echo ""
        echo "1. DATABASE_URL"
        echo "   Go to: https://console.neon.tech"
        echo "   Click Connection and copy the connection string"
        echo ""
        echo "2. JWT_SECRET"
        echo "   Run: openssl rand -base64 32"
        echo ""
        echo "3. STRIPE_SECRET_KEY"
        echo "   Go to: https://dashboard.stripe.com/apikeys"
        echo "   Copy your Secret Key (sk_test_... or sk_live_...)"
        echo ""
        echo "4. STRIPE_WEBHOOK_SECRET"
        echo "   Go to: https://dashboard.stripe.com/webhooks"
        echo "   Create endpoint for https://your-deployed-url/api/checkout/webhook"
        echo "   Copy the Signing secret"
        echo ""
        exit 1
    fi
    
    echo "✅ All environment variables are set"
    echo ""
}

# Verify dependencies
check_dependencies() {
    echo "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is not installed"
        echo "   Download from: https://nodejs.org"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is not installed"
        exit 1
    fi
    
    node_version=$(node -v)
    npm_version=$(npm -v)
    
    echo "✅ Node.js $node_version"
    echo "✅ npm $npm_version"
    echo ""
}

# Verify the project
verify_project() {
    echo "Verifying project structure..."
    
    if [ ! -f "package.json" ]; then
        echo "❌ package.json not found"
        exit 1
    fi
    
    if [ ! -f "backend/server.js" ]; then
        echo "❌ backend/server.js not found"
        exit 1
    fi
    
    echo "✅ Project structure verified"
    echo ""
}

# Install dependencies
install_dependencies() {
    echo "Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
    echo ""
}

# Verify code syntax
verify_syntax() {
    echo "Verifying code syntax..."
    node -c backend/server.js
    echo "✅ Code syntax is valid"
    echo ""
}

# Test locally
test_locally() {
    echo "Would you like to test locally before deploying? (y/n)"
    read -r test_response
    
    if [ "$test_response" = "y" ] || [ "$test_response" = "Y" ]; then
        echo ""
        echo "Starting development server..."
        echo "Press Ctrl+C to stop"
        echo ""
        
        npm run dev &
        local dev_pid=$!
        
        sleep 3
        
        echo "Testing health endpoint..."
        if curl -s http://localhost:8080/health | grep -q "healthy"; then
            echo "✅ Health endpoint working"
        else
            echo "❌ Health endpoint failed"
            kill $dev_pid
            exit 1
        fi
        
        kill $dev_pid 2>/dev/null || true
        echo ""
    fi
}

# Deploy options
choose_deployment() {
    echo "Choose deployment platform:"
    echo ""
    echo "1) Vercel (recommended)"
    echo "2) Railway"
    echo "3) Heroku"
    echo "4) Manual (I'll deploy elsewhere)"
    echo ""
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1)
            deploy_vercel
            ;;
        2)
            deploy_railway
            ;;
        3)
            deploy_heroku
            ;;
        4)
            echo "✅ Project is ready to deploy"
            echo "   Follow the instructions in DEPLOYMENT_SETUP.md"
            ;;
        *)
            echo "❌ Invalid choice"
            exit 1
            ;;
    esac
}

# Deploy to Vercel
deploy_vercel() {
    echo ""
    echo "Deploying to Vercel..."
    echo ""
    
    if ! command -v vercel &> /dev/null; then
        echo "Installing Vercel CLI..."
        npm install -g vercel
    fi
    
    echo "Running: vercel deploy --prod"
    vercel deploy --prod
    
    echo ""
    echo "✅ Backend deployed to Vercel!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Note your deployment URL"
    echo "   2. Update STRIPE_WEBHOOK_SECRET in Stripe dashboard"
    echo "   3. Set webhook URL to: https://your-url/api/checkout/webhook"
    echo "   4. Test with: curl https://your-url/health"
}

# Deploy to Railway
deploy_railway() {
    echo ""
    echo "Deploying to Railway..."
    echo ""
    
    if ! command -v railway &> /dev/null; then
        echo "Railway CLI not found."
        echo "Install from: https://railway.app/cli"
        exit 1
    fi
    
    echo "Running: railway deploy"
    railway deploy
    
    echo ""
    echo "✅ Backend deployed to Railway!"
}

# Deploy to Heroku
deploy_heroku() {
    echo ""
    echo "Deploying to Heroku..."
    echo ""
    
    if ! command -v heroku &> /dev/null; then
        echo "Heroku CLI not found."
        echo "Install from: https://devcenter.heroku.com/articles/heroku-cli"
        exit 1
    fi
    
    echo "Running: git push heroku main"
    git push heroku main
    
    echo ""
    echo "✅ Backend deployed to Heroku!"
}

# Main flow
main() {
    check_dependencies
    verify_project
    check_env_vars
    install_dependencies
    verify_syntax
    test_locally
    choose_deployment
}

main
