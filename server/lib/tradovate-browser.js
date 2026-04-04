// ═══════════════════════════════════════════════════════════
// TRADOVATE BROWSER — Playwright automation for Tradovate
// ═══════════════════════════════════════════════════════════
// Replaces both PickMyTrade (execution) and TradingView (price feed).
// One browser context per prop firm login (one Tradovate session =
// all sub-accounts accessible via the account selector dropdown).
//
// Phases:
//   1. Login — authenticate with Tradovate credentials
//   2. Account Discovery — list all sub-accounts from dropdown
//   3. Balance Scraping — read account balances
//   4. Price Feed — poll current price from the chart/DOM
//   5. Order Placement — fill order ticket with SL/TP
//   6. Position Monitoring — watch open positions for fills
//   7. Engine Integration — emit ticks, accept trade commands
// ═══════════════════════════════════════════════════════════

import { chromium } from "playwright";
import { EventEmitter } from "events";
import { log } from "./logger.js";
import crypto from "crypto";

const TAG = "BROWSER";

// ─────────────────────────────────────────────────────────
// Credential encryption helpers (AES-256-GCM)
// ─────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext string for storage in Supabase.
 * Returns a hex string: iv:authTag:ciphertext
 */
export function encryptCredential(plaintext, encryptionKey) {
  const key = crypto.scryptSync(encryptionKey, "tradovate-salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a credential string from Supabase.
 */
export function decryptCredential(encryptedStr, encryptionKey) {
  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(":");
  const key = crypto.scryptSync(encryptionKey, "tradovate-salt", 32);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ─────────────────────────────────────────────────────────
// TradovateSession — One browser context per prop firm
// ─────────────────────────────────────────────────────────

export class TradovateSession extends EventEmitter {
  /**
   * @param {object} opts
   *   username     {string}  Tradovate username
   *   password     {string}  Tradovate password (decrypted)
   *   sessionLabel {string}  Human label (e.g. "Topstep #1")
   *   headless     {boolean} Run headless (default: true)
   */
  constructor(opts) {
    super();
    this.username = opts.username;
    this.password = opts.password;
    this.sessionLabel = opts.sessionLabel || "Tradovate";
    this.headless = opts.headless !== false;

    this.browser = null;
    this.context = null;
    this.page = null;
    this.loggedIn = false;
    this.accounts = [];       // discovered sub-accounts
    this.currentAccount = null;
    this.pricePollingInterval = null;
    this.positionPollingInterval = null;
  }

  // ─────────────────────────────────────────────────────────
  // Phase 1: Login
  // ─────────────────────────────────────────────────────────

  async launch() {
    log.info(TAG, `Launching browser for "${this.sessionLabel}" (headless=${this.headless})`);

    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    this.page = await this.context.newPage();
    log.info(TAG, `Browser launched for "${this.sessionLabel}"`);
  }

  async login() {
    if (!this.page) await this.launch();

    log.info(TAG, `Logging into Tradovate as "${this.username}"...`);

    try {
      // Navigate to Tradovate web trader
      await this.page.goto("https://trader.tradovate.com/welcome", {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for login form
      await this.page.waitForSelector('input[name="name"], input[placeholder*="Username"], input[placeholder*="Email"]', {
        timeout: 15000,
      });

      // Fill username
      const usernameInput = await this.page.$('input[name="name"]')
        || await this.page.$('input[placeholder*="Username"]')
        || await this.page.$('input[placeholder*="Email"]');

      if (!usernameInput) throw new Error("Username input not found on login page");

      await usernameInput.fill(this.username);

      // Fill password
      const passwordInput = await this.page.$('input[name="password"]')
        || await this.page.$('input[type="password"]');

      if (!passwordInput) throw new Error("Password input not found on login page");

      await passwordInput.fill(this.password);

      // Click login button
      const loginButton = await this.page.$('button[type="submit"]')
        || await this.page.$('button:has-text("Log In")')
        || await this.page.$('button:has-text("Sign In")');

      if (!loginButton) throw new Error("Login button not found");

      await loginButton.click();

      // Wait for the platform to load (chart or account info visible)
      await this.page.waitForSelector(
        '[class*="account"], [class*="Account"], [data-testid*="account"]',
        { timeout: 30000 }
      ).catch(() => {
        // Fallback: wait for the page to settle
        return this.page.waitForTimeout(10000);
      });

      // Check for login errors
      const errorEl = await this.page.$('[class*="error"], [class*="Error"], .alert-danger');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        throw new Error(`Login failed: ${errorText}`);
      }

      this.loggedIn = true;
      log.info(TAG, `Successfully logged into Tradovate as "${this.username}"`);

      // Handle any post-login dialogs (risk disclaimers, etc.)
      await this._dismissDialogs();

    } catch (err) {
      log.error(TAG, `Login failed for "${this.sessionLabel}":`, err.message);
      this.emit("login_error", { session: this.sessionLabel, error: err.message });
      throw err;
    }
  }

  async _dismissDialogs() {
    try {
      // Tradovate sometimes shows risk disclaimers or update notices
      const dismissSelectors = [
        'button:has-text("I Agree")',
        'button:has-text("Accept")',
        'button:has-text("OK")',
        'button:has-text("Continue")',
        'button:has-text("Got it")',
        '[class*="dismiss"]',
        '[class*="close-modal"]',
      ];

      for (const selector of dismissSelectors) {
        const btn = await this.page.$(selector);
        if (btn && await btn.isVisible()) {
          await btn.click();
          await this.page.waitForTimeout(500);
          log.info(TAG, `Dismissed dialog: ${selector}`);
        }
      }
    } catch {
      // Non-critical — dialogs may not appear
    }
  }

  // ─────────────────────────────────────────────────────────
  // Phase 2: Account Discovery
  // ─────────────────────────────────────────────────────────

  /**
   * Discover all sub-accounts available in this Tradovate session.
   * Opens the account selector dropdown and reads all options.
   *
   * @returns {Array<{ id: string, name: string, label: string }>}
   */
  async discoverAccounts() {
    if (!this.loggedIn) throw new Error("Not logged in");

    log.info(TAG, `Discovering accounts for "${this.sessionLabel}"...`);

    try {
      // Click on the account selector to open the dropdown
      const accountSelector = await this.page.$(
        '[class*="account-selector"], [class*="AccountSelector"], [data-testid*="account-select"]'
      ) || await this.page.$('[class*="account"] select')
        || await this.page.$('select[class*="account"]');

      if (!accountSelector) {
        // Try finding account info in the header area
        log.warn(TAG, "Account selector not found — attempting alternative discovery");
        return await this._discoverAccountsFromDOM();
      }

      await accountSelector.click();
      await this.page.waitForTimeout(1000);

      // Read all account options from the dropdown
      const accountElements = await this.page.$$('[class*="account-item"], [class*="AccountItem"], option, [role="option"], li[class*="account"]');

      this.accounts = [];
      for (const el of accountElements) {
        const text = (await el.textContent()).trim();
        if (!text) continue;

        // Parse account ID and label from the dropdown text
        // Typical format: "TDFYG25927935874 - Account Name" or just the ID
        const match = text.match(/(TDF\w+|SIM\w+|\d{10,})/);
        const id = match ? match[1] : text;

        this.accounts.push({
          id,
          name: text,
          label: text,
        });
      }

      // Close the dropdown by clicking elsewhere
      await this.page.click("body", { position: { x: 10, y: 10 } });
      await this.page.waitForTimeout(300);

      log.info(TAG, `Discovered ${this.accounts.length} accounts for "${this.sessionLabel}":`,
        this.accounts.map(a => a.id).join(", "));

      return this.accounts;

    } catch (err) {
      log.error(TAG, `Account discovery failed for "${this.sessionLabel}":`, err.message);
      return [];
    }
  }

  async _discoverAccountsFromDOM() {
    // Fallback: scan the page for account IDs in the DOM
    const pageContent = await this.page.content();
    const accountPattern = /(TDF\w{10,}|SIM\w{10,})/g;
    const matches = [...new Set(pageContent.match(accountPattern) || [])];

    this.accounts = matches.map(id => ({ id, name: id, label: id }));
    log.info(TAG, `DOM fallback found ${this.accounts.length} accounts`);
    return this.accounts;
  }

  // ─────────────────────────────────────────────────────────
  // Phase 3: Balance Scraping
  // ─────────────────────────────────────────────────────────

  /**
   * Read the current balance for a specific account.
   * Switches to the account if needed, then scrapes the balance.
   *
   * @param {string} accountId - Tradovate account ID (e.g. "TDFYG25927935874")
   * @returns {{ balance: number, equity: number, pnl: number, marginUsed: number }}
   */
  async getAccountBalance(accountId) {
    if (!this.loggedIn) throw new Error("Not logged in");

    await this._switchToAccount(accountId);

    try {
      // Scrape balance from the account info panel
      // Tradovate displays: Cash Balance, Net Liq, Open P&L, Margin Used
      const balanceData = await this.page.evaluate(() => {
        const getText = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent.trim().replace(/[$,]/g, "");
              const num = parseFloat(text);
              if (!isNaN(num)) return num;
            }
          }
          return null;
        };

        // These selectors will need tuning based on Tradovate's actual DOM
        // The class names are approximations — real selectors should be
        // captured from inspecting the live Tradovate web trader
        return {
          balance: getText([
            '[class*="cash-balance"] [class*="value"]',
            '[class*="CashBalance"] [class*="value"]',
            '[data-field="cashBalance"]',
          ]),
          equity: getText([
            '[class*="net-liq"] [class*="value"]',
            '[class*="NetLiq"] [class*="value"]',
            '[data-field="netLiq"]',
          ]),
          pnl: getText([
            '[class*="open-pnl"] [class*="value"]',
            '[class*="OpenPnL"] [class*="value"]',
            '[data-field="openPnl"]',
          ]),
          marginUsed: getText([
            '[class*="margin-used"] [class*="value"]',
            '[class*="MarginUsed"] [class*="value"]',
            '[data-field="marginUsed"]',
          ]),
        };
      });

      log.info(TAG, `Balance for ${accountId}: bal=$${balanceData.balance} eq=$${balanceData.equity} pnl=$${balanceData.pnl}`);
      return balanceData;

    } catch (err) {
      log.error(TAG, `Failed to read balance for ${accountId}:`, err.message);
      return { balance: null, equity: null, pnl: null, marginUsed: null };
    }
  }

  /**
   * Switch the active account in Tradovate's account selector.
   */
  async _switchToAccount(accountId) {
    if (this.currentAccount === accountId) return;

    log.info(TAG, `Switching to account ${accountId}...`);

    try {
      // Open account selector
      const selector = await this.page.$(
        '[class*="account-selector"], [class*="AccountSelector"], [data-testid*="account-select"]'
      );

      if (selector) {
        await selector.click();
        await this.page.waitForTimeout(500);

        // Click the specific account
        const accountOption = await this.page.$(`text=${accountId}`)
          || await this.page.$(`[data-account-id="${accountId}"]`);

        if (accountOption) {
          await accountOption.click();
          await this.page.waitForTimeout(1000); // Wait for account switch to complete
          this.currentAccount = accountId;
          log.info(TAG, `Switched to account ${accountId}`);
        } else {
          log.warn(TAG, `Account ${accountId} not found in dropdown`);
        }
      }
    } catch (err) {
      log.error(TAG, `Failed to switch to account ${accountId}:`, err.message);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Phase 4: Price Feed
  // ─────────────────────────────────────────────────────────

  /**
   * Start polling the current price from Tradovate's chart.
   * Emits "tick" events with { price, timestamp, symbol }.
   *
   * @param {string} symbol - Instrument symbol (e.g. "NQM6")
   * @param {number} intervalMs - Poll interval (default: 1000ms)
   */
  startPriceFeed(symbol, intervalMs = 1000) {
    if (this.pricePollingInterval) {
      clearInterval(this.pricePollingInterval);
    }

    log.info(TAG, `Starting price feed for ${symbol} (poll every ${intervalMs}ms)`);

    let lastPrice = null;

    this.pricePollingInterval = setInterval(async () => {
      try {
        const priceData = await this.page.evaluate(() => {
          // Read the last price from Tradovate's chart or price display
          // Strategy: look for the current price in the order ticket,
          // chart header, or DOM data attributes

          const selectors = [
            // Order ticket last price
            '[class*="last-price"], [class*="LastPrice"]',
            '[class*="current-price"], [class*="CurrentPrice"]',
            // Chart header price
            '[class*="chart-header"] [class*="price"]',
            '[class*="ChartHeader"] [class*="price"]',
            // Market data display
            '[class*="market-data"] [class*="last"]',
            '[data-field="lastPrice"]',
            // DOM watch widget
            '[class*="quote-board"] [class*="last"]',
          ];

          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
              const text = el.textContent.trim().replace(/[,$]/g, "");
              const price = parseFloat(text);
              if (!isNaN(price) && price > 1000) return price; // NQ is always >1000
            }
          }

          return null;
        });

        if (priceData && priceData !== lastPrice) {
          lastPrice = priceData;
          const tick = {
            symbol,
            price: priceData,
            open: priceData,
            high: priceData,
            low: priceData,
            close: priceData,
            timestamp: new Date(),
          };
          this.emit("tick", tick);
        }
      } catch (err) {
        // Silently skip — DOM may be temporarily unavailable during transitions
        if (err.message.includes("Target closed") || err.message.includes("Execution context")) {
          log.warn(TAG, "Page context lost — browser may have navigated");
        }
      }
    }, intervalMs);
  }

  stopPriceFeed() {
    if (this.pricePollingInterval) {
      clearInterval(this.pricePollingInterval);
      this.pricePollingInterval = null;
      log.info(TAG, "Price feed stopped");
    }
  }

  // ─────────────────────────────────────────────────────────
  // Phase 5: Order Placement
  // ─────────────────────────────────────────────────────────

  /**
   * Place a market order with bracket (SL + TP) on the current account.
   *
   * @param {object} order
   *   accountId  {string}  Tradovate account ID to trade on
   *   symbol     {string}  Instrument symbol (e.g. "NQM6")
   *   direction  {string}  "buy" or "sell"
   *   contracts  {number}  Number of contracts
   *   stop       {number}  Stop loss price
   *   target     {number}  Take profit price
   * @returns {{ success: boolean, error?: string }}
   */
  async placeOrder(order) {
    const { accountId, symbol, direction, contracts, stop, target } = order;

    log.trade(TAG, `Placing order: ${direction.toUpperCase()} ${contracts}x ${symbol} on ${accountId}`);
    log.trade(TAG, `  SL=${stop} TP=${target}`);

    try {
      // Switch to the target account
      await this._switchToAccount(accountId);
      await this.page.waitForTimeout(500);

      // Step 1: Open the order ticket / ensure it's visible
      await this._ensureOrderTicketOpen();

      // Step 2: Set the instrument/symbol
      await this._setOrderSymbol(symbol);

      // Step 3: Set quantity
      await this._setOrderQuantity(contracts);

      // Step 4: Set order type to Market
      await this._setOrderType("MKT");

      // Step 5: Set bracket orders (SL and TP)
      await this._setBracketOrders(stop, target);

      // Step 6: Click Buy or Sell
      await this._clickTradeButton(direction);

      // Step 7: Confirm the order if a confirmation dialog appears
      await this._confirmOrder();

      log.trade(TAG, `Order placed successfully: ${direction.toUpperCase()} ${contracts}x ${symbol} on ${accountId}`);

      return { success: true };

    } catch (err) {
      log.error(TAG, `Order placement failed for ${accountId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async _ensureOrderTicketOpen() {
    // Check if order ticket is already visible
    const orderTicket = await this.page.$(
      '[class*="order-ticket"], [class*="OrderTicket"], [class*="order-entry"], [class*="OrderEntry"]'
    );

    if (!orderTicket || !(await orderTicket.isVisible())) {
      // Try to open it via keyboard shortcut or UI button
      const tradeBtn = await this.page.$('button:has-text("Trade")')
        || await this.page.$('[class*="trade-button"]')
        || await this.page.$('[title="Order Ticket"]');

      if (tradeBtn) {
        await tradeBtn.click();
        await this.page.waitForTimeout(500);
      }
    }
  }

  async _setOrderSymbol(symbol) {
    const symbolInput = await this.page.$(
      '[class*="order-ticket"] input[class*="symbol"]'
    ) || await this.page.$('input[placeholder*="Symbol"]')
      || await this.page.$('[class*="symbol-search"] input');

    if (symbolInput) {
      await symbolInput.fill("");
      await symbolInput.fill(symbol);
      await this.page.waitForTimeout(300);

      // Select from autocomplete if it appears
      const autocompleteItem = await this.page.$(`text=${symbol}`);
      if (autocompleteItem) {
        await autocompleteItem.click();
        await this.page.waitForTimeout(300);
      }
    }
  }

  async _setOrderQuantity(contracts) {
    const qtyInput = await this.page.$(
      '[class*="order-ticket"] input[class*="qty"], [class*="order-ticket"] input[class*="quantity"]'
    ) || await this.page.$('input[class*="qty"]')
      || await this.page.$('input[aria-label*="Quantity"]')
      || await this.page.$('input[aria-label*="Qty"]');

    if (qtyInput) {
      await qtyInput.click({ clickCount: 3 });
      await qtyInput.fill(String(contracts));
    }
  }

  async _setOrderType(type) {
    // Look for order type selector (MKT, LMT, STP, etc.)
    const typeSelector = await this.page.$(
      '[class*="order-type"], select[class*="order-type"]'
    ) || await this.page.$('select[aria-label*="Order Type"]');

    if (typeSelector) {
      const tagName = await typeSelector.evaluate(el => el.tagName);
      if (tagName === "SELECT") {
        await typeSelector.selectOption({ label: type });
      } else {
        await typeSelector.click();
        await this.page.waitForTimeout(200);
        const option = await this.page.$(`text=${type}`);
        if (option) await option.click();
      }
      await this.page.waitForTimeout(200);
    }
  }

  async _setBracketOrders(stop, target) {
    // Enable bracket orders if not already enabled
    const bracketToggle = await this.page.$(
      '[class*="bracket"] input[type="checkbox"], [class*="Bracket"] input[type="checkbox"]'
    ) || await this.page.$('label:has-text("Bracket") input[type="checkbox"]');

    if (bracketToggle) {
      const isChecked = await bracketToggle.isChecked();
      if (!isChecked) {
        await bracketToggle.click();
        await this.page.waitForTimeout(300);
      }
    }

    // Set stop loss price
    const slInput = await this.page.$(
      'input[class*="stop-loss"], input[aria-label*="Stop Loss"], input[placeholder*="Stop"]'
    ) || await this.page.$('[class*="bracket"] input[class*="sl"]');

    if (slInput) {
      await slInput.click({ clickCount: 3 });
      await slInput.fill(String(stop));
    }

    // Set take profit price
    const tpInput = await this.page.$(
      'input[class*="take-profit"], input[aria-label*="Take Profit"], input[placeholder*="Profit"]'
    ) || await this.page.$('[class*="bracket"] input[class*="tp"]');

    if (tpInput) {
      await tpInput.click({ clickCount: 3 });
      await tpInput.fill(String(target));
    }
  }

  async _clickTradeButton(direction) {
    const isBuy = direction === "buy";

    const buttonSelectors = isBuy
      ? [
          'button:has-text("Buy")',
          'button[class*="buy"]',
          '[class*="order-ticket"] button[class*="buy"]',
          'button[class*="Buy"]',
        ]
      : [
          'button:has-text("Sell")',
          'button[class*="sell"]',
          '[class*="order-ticket"] button[class*="sell"]',
          'button[class*="Sell"]',
        ];

    for (const sel of buttonSelectors) {
      const btn = await this.page.$(sel);
      if (btn && await btn.isVisible()) {
        await btn.click();
        await this.page.waitForTimeout(500);
        return;
      }
    }

    throw new Error(`${direction.toUpperCase()} button not found in order ticket`);
  }

  async _confirmOrder() {
    // Tradovate may show a confirmation dialog
    try {
      const confirmBtn = await this.page.waitForSelector(
        'button:has-text("Confirm"), button:has-text("Place Order"), button:has-text("Submit")',
        { timeout: 3000 }
      );
      if (confirmBtn) {
        await confirmBtn.click();
        await this.page.waitForTimeout(500);
        log.info(TAG, "Order confirmed via dialog");
      }
    } catch {
      // No confirmation dialog — order was placed directly
    }
  }

  // ─────────────────────────────────────────────────────────
  // Phase 6: Position Monitoring
  // ─────────────────────────────────────────────────────────

  /**
   * Start polling for open positions and their P&L.
   * Emits "position_update" events with current position state.
   *
   * @param {number} intervalMs - Poll interval (default: 2000ms)
   */
  startPositionMonitoring(intervalMs = 2000) {
    if (this.positionPollingInterval) {
      clearInterval(this.positionPollingInterval);
    }

    log.info(TAG, `Starting position monitoring (poll every ${intervalMs}ms)`);

    this.positionPollingInterval = setInterval(async () => {
      try {
        const positions = await this.page.evaluate(() => {
          const result = [];
          // Look for position rows in the positions panel
          const rows = document.querySelectorAll(
            '[class*="position-row"], [class*="PositionRow"], tr[class*="position"]'
          );

          for (const row of rows) {
            const cells = row.querySelectorAll('td, [class*="cell"], [class*="Cell"]');
            if (cells.length < 3) continue;

            const textContent = row.textContent;

            // Extract position data — these selectors are approximate
            // and need tuning against the live Tradovate DOM
            const accountMatch = textContent.match(/(TDF\w+|SIM\w+)/);
            const pnlMatch = textContent.match(/([+-]?\$?[\d,.]+)/g);

            result.push({
              text: textContent.trim().substring(0, 200),
              accountId: accountMatch ? accountMatch[1] : null,
              rawPnl: pnlMatch ? pnlMatch : [],
            });
          }

          return result;
        });

        if (positions.length > 0) {
          this.emit("position_update", { positions, timestamp: new Date() });
        }
      } catch {
        // Silently skip on DOM errors
      }
    }, intervalMs);
  }

  stopPositionMonitoring() {
    if (this.positionPollingInterval) {
      clearInterval(this.positionPollingInterval);
      this.positionPollingInterval = null;
      log.info(TAG, "Position monitoring stopped");
    }
  }

  /**
   * Check if a specific account has an open position.
   * @param {string} accountId
   * @returns {{ hasPosition: boolean, direction?: string, contracts?: number, pnl?: number }}
   */
  async getPosition(accountId) {
    await this._switchToAccount(accountId);

    try {
      const position = await this.page.evaluate(() => {
        // Look for position indicators
        const posPanel = document.querySelector(
          '[class*="position"], [class*="Position"]'
        );
        if (!posPanel) return { hasPosition: false };

        const text = posPanel.textContent;
        const qtyMatch = text.match(/(\d+)\s*(Long|Short|Buy|Sell)/i);
        const pnlMatch = text.match(/P&?L[:\s]*([+-]?\$?[\d,.]+)/i);

        if (!qtyMatch) return { hasPosition: false };

        return {
          hasPosition: true,
          direction: qtyMatch[2].toLowerCase().includes("long") || qtyMatch[2].toLowerCase().includes("buy") ? "buy" : "sell",
          contracts: parseInt(qtyMatch[1]),
          pnl: pnlMatch ? parseFloat(pnlMatch[1].replace(/[$,]/g, "")) : null,
        };
      });

      return position;
    } catch {
      return { hasPosition: false };
    }
  }

  // ─────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────

  async close() {
    this.stopPriceFeed();
    this.stopPositionMonitoring();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.context = null;
      this.loggedIn = false;
      log.info(TAG, `Browser closed for "${this.sessionLabel}"`);
    }
  }

  /**
   * Check if the session is still alive (page not crashed).
   */
  async isAlive() {
    try {
      if (!this.page || this.page.isClosed()) return false;
      await this.page.evaluate(() => true);
      return true;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────
// TradovateSessionManager — Manages multiple browser sessions
// ─────────────────────────────────────────────────────────
// One session per unique Tradovate login (per prop firm).
// Multiple accounts within a session are handled via the
// account selector dropdown.
// ─────────────────────────────────────────────────────────

export class TradovateSessionManager extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.sessions = new Map();  // key: username, value: TradovateSession
    this.headless = opts.headless !== false;
    this.encryptionKey = opts.encryptionKey || "default-dev-key";
  }

  /**
   * Get or create a session for a given set of credentials.
   * Sessions are reused across accounts that share the same login.
   *
   * @param {string} username
   * @param {string} password - Already decrypted
   * @param {string} label
   * @returns {TradovateSession}
   */
  async getSession(username, password, label) {
    if (this.sessions.has(username)) {
      const session = this.sessions.get(username);
      if (await session.isAlive()) {
        return session;
      }
      // Session died — clean up and recreate
      log.warn(TAG, `Session for "${username}" is dead — recreating`);
      await session.close().catch(() => {});
      this.sessions.delete(username);
    }

    // Create new session
    const session = new TradovateSession({
      username,
      password,
      sessionLabel: label,
      headless: this.headless,
    });

    await session.launch();
    await session.login();
    await session.discoverAccounts();

    this.sessions.set(username, session);

    // Forward events
    session.on("tick", (tick) => this.emit("tick", tick));
    session.on("position_update", (data) => this.emit("position_update", data));
    session.on("login_error", (data) => this.emit("login_error", data));

    return session;
  }

  /**
   * Place an order via the correct session.
   * Looks up which session owns the given accountId.
   *
   * @param {object} order - { accountId, symbol, direction, contracts, stop, target }
   * @param {string} username - Tradovate username for this account
   * @param {string} password - Decrypted password
   * @param {string} label - Session label
   * @returns {{ success: boolean, error?: string }}
   */
  async placeOrder(order, username, password, label) {
    try {
      const session = await this.getSession(username, password, label);
      return await session.placeOrder(order);
    } catch (err) {
      log.error(TAG, `Order failed: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get balance for an account via its session.
   */
  async getAccountBalance(accountId, username, password, label) {
    try {
      const session = await this.getSession(username, password, label);
      return await session.getAccountBalance(accountId);
    } catch (err) {
      log.error(TAG, `Balance fetch failed: ${err.message}`);
      return { balance: null, equity: null, pnl: null, marginUsed: null };
    }
  }

  /**
   * Start the price feed from the first active session.
   * Only one session needs to feed prices — all sessions see the same market.
   */
  startPriceFeed(symbol, intervalMs) {
    const firstSession = this.sessions.values().next().value;
    if (firstSession) {
      firstSession.startPriceFeed(symbol, intervalMs);
    } else {
      log.warn(TAG, "No active sessions — cannot start price feed");
    }
  }

  /**
   * Gracefully close all sessions.
   */
  async closeAll() {
    for (const [username, session] of this.sessions) {
      await session.close().catch(err => {
        log.warn(TAG, `Error closing session for ${username}: ${err.message}`);
      });
    }
    this.sessions.clear();
    log.info(TAG, "All browser sessions closed");
  }

  /**
   * Get status summary for all sessions.
   */
  getStatus() {
    const status = {};
    for (const [username, session] of this.sessions) {
      status[username] = {
        loggedIn: session.loggedIn,
        accounts: session.accounts.length,
        currentAccount: session.currentAccount,
        hasPriceFeed: !!session.pricePollingInterval,
        hasPositionMonitoring: !!session.positionPollingInterval,
      };
    }
    return status;
  }
}
