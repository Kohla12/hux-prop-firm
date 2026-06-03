/**
 * HUX PROP FIRM - LOW-LATENCY REAL-TIME WEBSOCKET BRIDGE
 * Broadcasts tick data feeds, handles real-time trade signals, 
 * and synchronizes frontend trader terminals with MT4/MT5/cTrader endpoints.
 */

const WebSocket = require('ws'); // ws module library import
const jwt = require('jsonwebtoken'); // JWT token authentication
const { auditAccountRules } = require('./rules_engine'); // Risk monitors module

const JWT_SECRET = process.env.JWT_SECRET || 'HUX_FUTURISTIC_SECURE_KEY';

/**
 * Initialize WebSockets Server bridge
 * @param {Object} server - HTTP/Express server instance
 * @param {Object} pgPool - PostgreSQL Pool database connection
 */
function initWebSocketBridge(server, pgPool) {
    const wss = new WebSocket.Server({ noServer: true });

    // Handle initial handshake upgrade with authentication authorization
    server.on('upgrade', (request, socket, head) => {
        const urlParams = new URL(request.url, 'http://localhost');
        const token = urlParams.searchParams.get('token');

        if (!token) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            wss.handleUpgrade(request, socket, head, (ws) => {
                ws.userId = decoded.userId;
                wss.emit('connection', ws, request);
            });
        } catch (error) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
        }
    });

    wss.on('connection', async (ws) => {
        console.log(`[HUX WebSocket] Client authenticated and connected. User ID: ${ws.userId}`);
        
        // Dynamic map of active subscribed broker accounts
        ws.subscribedAccounts = [];

        // 1. Send initial connection success response parameters
        ws.send(JSON.stringify({
            event: 'connection_established',
            timestamp: new Date().toISOString(),
            status: 'online',
            serverLatency: '14ms'
        }));

        // 2. Receive client commands
        ws.on('message', async (message) => {
            try {
                const payload = JSON.parse(message);
                
                switch (payload.event) {
                    case 'subscribe_account':
                        // Subscribe user dashboard to specific MT4/MT5 accounts ticks streams
                        const { accountId } = payload.data;
                        
                        // Validate account ownership
                        const dbClient = await pgPool.connect();
                        const checkQuery = `SELECT id, login_id FROM trading_accounts WHERE id = $1 AND user_id = $2`;
                        const checkRes = await dbClient.query(checkQuery, [accountId, ws.userId]);
                        dbClient.release();

                        if (checkRes.rows.length === 0) {
                            ws.send(JSON.stringify({ event: 'error', message: 'Forbidden account subscription.' }));
                            break;
                        }

                        ws.subscribedAccounts.push(accountId);
                        ws.send(JSON.stringify({ 
                            event: 'subscription_success', 
                            accountId,
                            message: `Low-latency data synchronization active on HUX broker servers.` 
                        }));
                        break;

                    case 'place_market_order':
                        // Handle real-time trade signals from dashboard ticket
                        await handleMarketOrderPlacement(ws, pgPool, payload.data);
                        break;

                    case 'close_market_position':
                        // Handle manual close execution triggers
                        await handlePositionClosure(ws, pgPool, payload.data);
                        break;

                    default:
                        ws.send(JSON.stringify({ event: 'error', message: 'Unsupported WS event routing.' }));
                }
            } catch (err) {
                console.error(`[HUX WS Message Error]:`, err);
                ws.send(JSON.stringify({ event: 'error', message: 'JSON processing payload error.' }));
            }
        });

        // 3. Keep Connection alive via heartbeat ping-pong
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('close', () => {
            console.log(`[HUX WebSocket] Trader session disconnected.`);
        });
    });

    // Broadcast market ticks and run rules audits periodically
    setInterval(async () => {
        // Mocking ticker tick generation
        const simulatedTick = {
            event: 'ticker_tick',
            symbol: 'EURUSD',
            bid: (1.0820 + Math.random() * 0.001).toFixed(4),
            ask: (1.0822 + Math.random() * 0.001).toFixed(4),
            timestamp: new Date().toISOString()
        };

        // Broadcast to matching subscribed clients
        wss.clients.forEach(async (client) => {
            if (client.readyState === WebSocket.OPEN) {
                // Send ticker ticks
                client.send(JSON.stringify(simulatedTick));

                // Perform real-time rules auditing across all user's active accounts
                if (client.subscribedAccounts && client.subscribedAccounts.length > 0) {
                    const dbClient = await pgPool.connect();
                    for (let accountId of client.subscribedAccounts) {
                        try {
                            const auditReport = await auditAccountRules(dbClient, accountId);
                            
                            // Push risk snapshots down to client
                            client.send(JSON.stringify({
                                event: 'account_audit_report',
                                accountId,
                                data: auditReport
                            }));
                        } catch (err) {
                            console.error(`WS Audit error on ${accountId}:`, err);
                        }
                    }
                    dbClient.release();
                }
            }
        });
    }, 1000);

    // Heartbeat check interval to purge dead sockets
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);
}

// Handler helper functions
async function handleMarketOrderPlacement(ws, pgPool, orderData) {
    const { accountId, symbol, type, lots, entryPrice } = orderData;
    const dbClient = await pgPool.connect();
    
    try {
        await dbClient.query('BEGIN');
        
        // 1. Verify account status is active
        const acctRes = await dbClient.query('SELECT status FROM trading_accounts WHERE id = $1 FOR UPDATE', [accountId]);
        if (acctRes.rows[0].status !== 'active') {
            throw new Error("Trading disabled. Account is in breached/inactive format.");
        }

        // 2. Insert trade into PostgreSQL ledger
        const insertTradeQuery = `
            INSERT INTO trades (account_id, symbol, type, lots, entry_price, open_time, status)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'open')
            RETURNING id, symbol, entry_price
        `;
        const tradeRes = await dbClient.query(insertTradeQuery, [accountId, symbol, type, lots, entryPrice]);

        await dbClient.query('COMMIT');
        
        // Push MT4/MT5 bridge confirmation back to frontend
        ws.send(JSON.stringify({
            event: 'order_confirmed',
            accountId,
            data: tradeRes.rows[0]
        }));

    } catch (err) {
        await dbClient.query('ROLLBACK');
        ws.send(JSON.stringify({ event: 'order_rejected', message: err.message }));
    } finally {
        dbClient.release();
    }
}

async function handlePositionClosure(ws, pgPool, closeData) {
    const { tradeId, closePrice } = closeData;
    const dbClient = await pgPool.connect();
    
    try {
        await dbClient.query('BEGIN');
        
        // Fetch trade parameters
        const tradeRes = await dbClient.query('SELECT * FROM trades WHERE id = $1 FOR UPDATE', [tradeId]);
        if (tradeRes.rows.length === 0 || tradeRes.rows[0].status !== 'open') {
            throw new Error("Trade position closed or invalid.");
        }

        const trade = tradeRes.rows[0];
        
        // Calculate PnL (Buy vs Sell calculations)
        const delta = trade.type === 'BUY' ? (closePrice - trade.entryPrice) : (trade.entryPrice - closePrice);
        const contractSize = trade.symbol === 'BTCUSD' ? 1 : 100000;
        const finalPnl = delta * parseFloat(trade.lots) * contractSize;

        // 1. Close trade
        await dbClient.query(
            `UPDATE trades SET status = 'closed', close_price = $1, close_time = CURRENT_TIMESTAMP, pnl = $2 WHERE id = $3`,
            [closePrice, finalPnl, tradeId]
        );

        // 2. Adjust account ledger balances
        await dbClient.query(
            `UPDATE trading_accounts SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [finalPnl, trade.account_id]
        );

        await dbClient.query('COMMIT');

        ws.send(JSON.stringify({
            event: 'position_closed_success',
            tradeId,
            pnl: finalPnl
        }));

    } catch (err) {
        await dbClient.query('ROLLBACK');
        ws.send(JSON.stringify({ event: 'closure_failed', message: err.message }));
    } finally {
        dbClient.release();
    }
}

module.exports = { initWebSocketBridge };
