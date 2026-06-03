/**
 * HUX PROP FIRM - AUTOMATED RISK & CHALLENGE RULES ENGINE
 * Monitors daily drawdowns, maximum drawdowns, profit targets,
 * minimum trading days, consistency scores, and anti-cheat policies.
 */

const { Client } = require('pg'); // Example PostgreSQL client import

/**
 * Audit and validate account metrics against active challenge rules
 * @param {Object} dbClient - PostgreSQL client connection instance
 * @param {String} accountId - Unique identifier of the trading account
 * @returns {Promise<Object>} Status report of the audited account
 */
async function auditAccountRules(dbClient, accountId) {
    try {
        // 1. Fetch account, parent challenge config, and active open trades from DB
        const accountQuery = `
            SELECT ta.*, c.type as c_type, c.size as c_size, c.profit_target, c.daily_drawdown_limit, c.max_drawdown_limit
            FROM trading_accounts ta
            LEFT JOIN challenges c ON ta.challenge_id = c.id
            WHERE ta.id = $1
        `;
        const accountRes = await dbClient.query(accountQuery, [accountId]);
        if (accountRes.rows.length === 0) {
            throw new Error(`Account ${accountId} not found in systems.`);
        }
        
        const account = accountRes.rows[0];

        // If already breached or passed, bypass execution to optimize resources
        if (account.status !== 'active') {
            return { accountId, status: account.status, breachTriggered: false };
        }

        const tradesQuery = `SELECT * FROM trades WHERE account_id = $1 AND status = 'open'`;
        const tradesRes = await dbClient.query(tradesQuery, [accountId]);
        const openTrades = tradesRes.rows;

        // 2. Real-Time Equity Calculations
        let floatingPnl = 0.00;
        openTrades.forEach(trade => {
            floatingPnl += parseFloat(trade.pnl || 0);
        });

        const balance = parseFloat(account.balance);
        const equity = balance + floatingPnl;
        const startBalance = parseFloat(account.start_balance);
        const dailyBaseBalance = parseFloat(account.daily_base_balance);

        const dailyDrawdownLimit = parseFloat(account.daily_drawdown_limit);
        const maxDrawdownLimit = parseFloat(account.max_drawdown_limit);
        const profitTarget = parseFloat(account.profit_target);

        // 3. Rule Checks
        let breachTriggered = false;
        let violationType = null;
        let violationDetails = "";

        // Check A: Daily Drawdown Breach
        // Daily Drawdown Limit is based on midnight Equity/Balance snapshot (dailyBaseBalance)
        const dailyLoss = dailyBaseBalance - equity;
        if (dailyLoss >= dailyDrawdownLimit) {
            breachTriggered = true;
            violationType = "DAILY_DRAWDOWN_BREACH";
            violationDetails = `Daily equity loss of $${dailyLoss.toFixed(2)} exceeded the daily maximum allowance limit of $${dailyDrawdownLimit.toFixed(2)}. Base balance snapshot: $${dailyBaseBalance.toFixed(2)}. Floating equity: $${equity.toFixed(2)}.`;
        }

        // Check B: Maximum Drawdown Breach
        // Max Drawdown Limit is static relative to the initial size (startBalance)
        const maxLoss = startBalance - equity;
        if (!breachTriggered && maxLoss >= maxDrawdownLimit) {
            breachTriggered = true;
            violationType = "MAX_DRAWDOWN_BREACH";
            violationDetails = `Total equity loss of $${maxLoss.toFixed(2)} exceeded the total maximum allowance limit of $${maxDrawdownLimit.toFixed(2)}. Starting balance: $${startBalance.toFixed(2)}. Floating equity: $${equity.toFixed(2)}.`;
        }

        // Check C: Anti-Cheat & Malicious Strategies (e.g. High-Frequency Arbitrage / Latency Exploits)
        // Rule: Trades closed in under 30 seconds check
        if (!breachTriggered) {
            const hftCheckQuery = `
                SELECT COUNT(*) as fast_trades_count 
                FROM trades 
                WHERE account_id = $1 
                  AND status = 'closed'
                  AND (close_time - open_time) < INTERVAL '30 seconds'
            `;
            const hftRes = await dbClient.query(hftCheckQuery, [accountId]);
            const fastTrades = parseInt(hftRes.rows[0].fast_trades_count);
            if (fastTrades > 5) { // trigger breach if they repeat ultra-short trades indicating latency arbitrage bots
                breachTriggered = true;
                violationType = "LATENCY_ARBITRAGE_EXPLOIT";
                violationDetails = `Automated risk scoring flagged 5+ positions closed within 30 seconds of execution, violating high-frequency systemic latency arbitrage policies.`;
            }
        }

        // 4. Breach execution
        if (breachTriggered) {
            // Update account status in PostgreSQL
            await dbClient.query(
                `UPDATE trading_accounts SET status = 'breached', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [accountId]
            );

            // Close all active trades immediately
            await dbClient.query(
                `UPDATE trades SET status = 'closed', close_time = CURRENT_TIMESTAMP, pnl = 0.00 WHERE account_id = $1 AND status = 'open'`,
                [accountId]
            );

            // Log systemic audit breach details
            await dbClient.query(
                `INSERT INTO system_audits (account_id, violation_type, balance_snapshot, equity_snapshot, trigger_details) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [accountId, violationType, balance, equity, violationDetails]
            );

            return {
                accountId,
                status: 'breached',
                breachTriggered: true,
                violationType,
                details: violationDetails
            };
        }

        // Check D: Profit Target Passed Requirement (Only when NO active positions exist)
        if (profitTarget > 0 && openTrades.length === 0) {
            const netProfit = balance - startBalance;
            if (netProfit >= profitTarget) {
                // Perform check on minimum trading days requirement
                const tradingDaysQuery = `
                    SELECT COUNT(DISTINCT DATE(close_time)) as unique_days
                    FROM trades
                    WHERE account_id = $1 AND status = 'closed'
                `;
                const daysRes = await dbClient.query(tradingDaysQuery, [accountId]);
                const tradingDays = parseInt(daysRes.rows[0].unique_days);

                if (tradingDays >= account.min_trading_days) {
                    await dbClient.query(
                        `UPDATE trading_accounts SET status = 'passed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                        [accountId]
                    );

                    return {
                        accountId,
                        status: 'passed',
                        breachTriggered: false,
                        details: "Trader successfully reached profit targets and satisfied minimum trading days rules."
                    };
                }
            }
        }

        // 5. Account is safe and active
        return {
            accountId,
            status: 'active',
            breachTriggered: false,
            currentEquity: equity,
            currentBalance: balance
        };

    } catch (error) {
        console.error(`[HUX Rules Engine Error] on account auditing:`, error);
        throw error;
    }
}

/**
 * Daily midnight snapshot update function
 * Resets the base daily balance baseline snap value for drawdown tracking
 */
async function performDailyBalanceSnap(dbClient) {
    const query = `
        UPDATE trading_accounts 
        SET daily_base_balance = GREATEST(balance, equity), 
            updated_at = CURRENT_TIMESTAMP 
        WHERE status = 'active'
    `;
    await dbClient.query(query);
    console.log(`[HUX Daily Cron] Midnight balance and equity base points snapped successfully.`);
}

module.exports = {
    auditAccountRules,
    performDailyBalanceSnap
};
