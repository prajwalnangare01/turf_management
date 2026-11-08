// OpenWA WhatsApp Automation Service for TurfFlow
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import qrcodeTerminal from 'qrcode-terminal';
import { create, ev, setCliOutputSink } from '@open-wa/wa-automate';
import { AiAgentService } from './aiAgentService.js';
import { store } from '../data/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OpenWaService {
  static client = null;
  static status = 'stopped'; // 'stopped' | 'starting' | 'qr_ready' | 'authenticating' | 'connected' | 'error'
  static qrCode = null;
  static qrAscii = null;
  static hostPhone = null;
  static hostName = null;
  static connectedAt = null;
  static lastError = null;
  static isInitializing = false;

  /**
   * Determine Chrome or Edge executable path on Windows / Linux / macOS
   */
  static getExecutablePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    if (process.platform === 'win32') {
      const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ];
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
      }
    }
    return undefined; // Let OpenWA auto-detect or use puppeteer
  }

  /**
   * Get current connection status and details
   */
  static getStatus() {
    return {
      status: this.status,
      hostPhone: this.hostPhone,
      hostName: this.hostName,
      connectedAt: this.connectedAt,
      hasQr: Boolean(this.qrCode),
      lastError: this.lastError
    };
  }

  /**
   * Get latest QR code payload for Web UI display
   */
  static getQr() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      qrAscii: this.qrAscii,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Initialize OpenWA client instance
   */
  static async init({ autoStart = true } = {}) {
    if (this.client || this.isInitializing) {
      console.log('ℹ️ OpenWA is already running or initializing.');
      return;
    }

    if (!autoStart && process.env.ENABLE_OPENWA === 'false') {
      console.log('ℹ️ OpenWA disabled via ENABLE_OPENWA=false. Use /api/whatsapp/connect to start manually.');
      return;
    }

    this.isInitializing = true;
    this.status = 'starting';
    this.lastError = null;

    const sessionsDir = path.resolve(__dirname, '../../sessions');
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }

    const chromePath = this.getExecutablePath();
    console.log(`\n======================================================`);
    console.log(`🤖 Initializing OpenWA WhatsApp Automation Agent...`);
    if (chromePath) {
      console.log(`🌐 Using Browser Executable: ${chromePath}`);
    }
    console.log(`📁 Session Store Path:       ${sessionsDir}`);
    console.log(`======================================================\n`);

    // Setup output sink to capture QR codes cleanly
    setCliOutputSink({
      write: (entry) => {
        if (entry.level === 'error') {
          console.error(`[OpenWA Error]`, entry.message);
        } else if (process.env.OPENWA_VERBOSE === 'true') {
          console.log(`[OpenWA ${entry.level}]`, entry.message);
        }
      },
      status: (update) => {
        console.log(`📡 [OpenWA Phase] ${update.phase}${update.detail ? ` - ${update.detail}` : ''}`);
        if (update.phase === 'auth.qr') {
          this.status = 'qr_ready';
        } else if (update.phase === 'client.ready') {
          this.status = 'connected';
        }
      },
      qr: (payload) => {
        this.handleQrCode(payload.qr);
      }
    });

    // Also listen to global ev emitter for QR fallback
    try {
      ev.on('qr.**', (data) => {
        const qrString = typeof data === 'string' ? data : (data?.qr || data?.code || null);
        if (qrString) {
          this.handleQrCode(qrString);
        }
      });
    } catch {
      // Ignore emitter subscription error
    }

    try {
      const config = {
        sessionId: 'turfflow-agent',
        multiDevice: true,
        useChrome: Boolean(chromePath),
        executablePath: chromePath,
        headless: true,
        sessionDataPath: sessionsDir,
        qrTimeout: 0,
        authTimeout: 0,
        disableSpins: true,
        qrLogSkip: false,
        cacheEnabled: true,
        killProcessOnBrowserClose: false,
        restartOnCrash: true,
        chromiumArgs: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      };

      const client = await create(config);
      this.client = client;
      this.status = 'connected';
      this.isInitializing = false;
      this.connectedAt = new Date().toISOString();

      try {
        const me = await client.getMe();
        this.hostPhone = me?.id ? me.id.replace('@c.us', '') : 'Connected';
        this.hostName = me?.pushname || 'TurfFlow Arena';
      } catch {
        this.hostPhone = 'Connected';
      }

      console.log(`\n🎉 [OpenWA Connected!] WhatsApp Agent online for ${this.hostPhone} (${this.hostName})\n`);

      // Register Incoming Message Handler
      this.registerMessageHandler(client);

      // Register Connection State Monitor
      client.onStateChanged((state) => {
        console.log(`📡 [OpenWA Connection State]: ${state}`);
        if (state === 'CONFLICT' || state === 'UNPAIRED' || state === 'UNLAUNCHED') {
          this.status = 'error';
          this.lastError = `Connection state: ${state}`;
        } else if (state === 'CONNECTED') {
          this.status = 'connected';
        }
      });

      return client;
    } catch (err) {
      console.error('❌ Failed to launch OpenWA:', err.message);
      this.status = 'error';
      this.lastError = err.message;
      this.isInitializing = false;
      return null;
    }
  }

  /**
   * Process and format incoming QR code for terminal and web
   */
  static handleQrCode(qrString) {
    this.status = 'qr_ready';
    this.qrCode = qrString;

    qrcodeTerminal.generate(qrString, { small: true }, (ascii) => {
      this.qrAscii = ascii;
      console.log(`\n======================================================`);
      console.log(`📲 SCAN THIS WHATSAPP QR CODE TO CONNECT TURFFLOW AGENT`);
      console.log(`======================================================\n`);
      console.log(ascii);
      console.log(`\n👉 Or view it in browser: http://localhost:5000/simulator\n`);
    });
  }

  /**
   * Wire OpenWA inbound chat events into AiAgentService
   */
  static registerMessageHandler(client) {
    client.onMessage(async (message) => {
      try {
        // Ignore outbound messages from bot itself
        if (message.fromMe) return;

        // Ignore status broadcasts and empty messages
        if (message.from === 'status@broadcast') return;
        const body = (message.body || message.caption || '').trim();
        if (!body) return;

        // Group filtering: ignore general group noise unless mentioned
        if (message.isGroupMsg) {
          const hostNum = this.hostPhone?.replace(/\D/g, '');
          const isMentioned = hostNum && message.mentionedJidList?.some(jid => jid.includes(hostNum));
          if (!isMentioned) return;
        }

        const rawPhone = message.sender?.id || message.from || '';
        const cleanPhone = rawPhone.replace('@c.us', '').replace('@g.us', '');
        const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
        const senderName = message.sender?.pushname || message.sender?.formattedName || message.notifyName || 'Sports Player';

        console.log(`\n📩 [OpenWA Inbound WhatsApp Message]`);
        console.log(`From:    ${senderName} (${formattedPhone})`);
        console.log(`Message: "${body}"`);

        // Process through TurfFlow AI Agent Engine
        const agentResponse = await AiAgentService.handleIncomingMessage({
          fromPhone: formattedPhone,
          senderName,
          messageText: body
        });

        if (agentResponse?.reply) {
          console.log(`🤖 [OpenWA Dispatching Reply] to ${message.from}`);
          await client.sendText(message.from, agentResponse.reply);
        }
      } catch (err) {
        console.error('❌ Error handling OpenWA inbound message:', err);
      }
    });
  }

  /**
   * Outbound WhatsApp Message Dispatcher
   */
  static async sendMessage(recipientPhone, messageText) {
    if (!this.client || this.status !== 'connected') {
      return { success: false, reason: 'OpenWA not connected' };
    }

    try {
      const cleanDigits = recipientPhone.replace(/\D/g, '');
      const waId = `${cleanDigits}@c.us`;
      await this.client.sendText(waId, messageText);
      return { success: true };
    } catch (err) {
      console.error(`❌ Failed to send WhatsApp message to ${recipientPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Check if WhatsApp is currently active and connected
   */
  static isConnected() {
    return this.status === 'connected' && Boolean(this.client);
  }

  /**
   * Disconnect and clear session
   */
  static async disconnect() {
    if (this.client) {
      try {
        await this.client.logout();
      } catch {
        // Ignore logout errors
      }
      try {
        await this.client.close();
      } catch {
        // Ignore close errors
      }
      this.client = null;
    }
    this.status = 'stopped';
    this.qrCode = null;
    this.qrAscii = null;
    this.hostPhone = null;
    this.hostName = null;
    console.log('🛑 OpenWA WhatsApp agent disconnected.');
    return { success: true };
  }
}
