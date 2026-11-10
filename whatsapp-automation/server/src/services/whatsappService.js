// Native WhatsApp Multi-Device Agent Service using Baileys
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  Browsers 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { AiAgentService } from './aiAgentService.js';
import { store } from '../data/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WhatsAppService {
  static sock = null;
  static status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'pairing_code_ready' | 'connected' | 'error'
  static qrString = null;
  static qrAscii = null;
  static qrDataUrl = null;
  static pairingCode = null;
  static targetPhone = process.env.WHATSAPP_PHONE_NUMBER || '9579158374';
  static linkedPhone = null;
  static lastError = null;
  static isInitializing = false;
  static reconnectAttempts = 0;

  /**
   * Return current status, pairing code, and link information
   */
  static getStatus() {
    return {
      status: this.status,
      linkedPhone: this.linkedPhone,
      targetPhone: this.targetPhone,
      hasQr: Boolean(this.qrString),
      qrDataUrl: this.qrDataUrl,
      pairingCode: this.pairingCode,
      lastError: this.lastError
    };
  }

  /**
   * Return QR code payload for web / terminal display
   */
  static getQr() {
    return {
      status: this.status,
      qr: this.qrString,
      qrDataUrl: this.qrDataUrl,
      ascii: this.qrAscii,
      pairingCode: this.pairingCode,
      targetPhone: this.targetPhone
    };
  }

  /**
   * Check if WhatsApp is connected and ready to send
   */
  static isConnected() {
    return this.status === 'connected' && Boolean(this.sock);
  }

  /**
   * Initialize WhatsApp connection
   */
  static async init({ usePairingCode = false, targetPhoneNumber = null } = {}) {
    if (this.sock && this.status === 'connected') {
      console.log('ℹ️ WhatsApp is already connected.');
      return this.sock;
    }

    if (this.isInitializing) {
      console.log('ℹ️ WhatsApp client is already initializing...');
      return null;
    }

    this.isInitializing = true;
    this.status = 'connecting';
    this.lastError = null;

    if (this.sock) {
      try {
        this.sock.ev?.removeAllListeners();
        this.sock.end(new Error('Re-initializing socket'));
      } catch {}
      this.sock = null;
    }

    if (targetPhoneNumber) {
      this.targetPhone = targetPhoneNumber.replace(/\D/g, '');
    }

    const sessionDir = path.resolve(__dirname, '../../whatsapp_session');
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'), // Use Ubuntu Chrome for seamless WhatsApp Web pairing code compatibility
        syncFullHistory: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true
      });

      this.sock = sock;

      // Handle credentials update
      sock.ev.on('creds.update', saveCreds);

      // Handle Pairing Code Option if requested and not yet registered
      const cleanPhone = (this.targetPhone || '9579158374').replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone.slice(-10)}`;

      if (usePairingCode && !state.creds?.registered) {
        setTimeout(async () => {
          try {
            if (!this.sock || this.status === 'connected' || this.sock.authState?.creds?.registered) {
              return;
            }
            console.log(`\n📲 Requesting WhatsApp Pairing Code for phone: +${formattedPhone}...`);
            const code = await sock.requestPairingCode(formattedPhone);
            this.pairingCode = code;
            this.status = 'pairing_code_ready';
            console.log(`\n======================================================`);
            console.log(`🔑 WHATSAPP PAIRING CODE:  ${code}`);
            console.log(`======================================================`);
            console.log(`1. Open WhatsApp on phone (+${formattedPhone})`);
            console.log(`2. Tap Settings > Linked Devices > Link a Device`);
            console.log(`3. Tap "Link with phone number instead" and enter: ${code}\n`);
          } catch (pairErr) {
            console.warn('⚠️ Notice: Pairing code prompt skipped (already connected or QR in use):', pairErr.message);
          }
        }, 4000);
      }

      // Handle connection updates
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrString = qr;
          this.status = 'qr_ready';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
          } catch (e) {
            this.qrDataUrl = null;
          }
          qrcodeTerminal.generate(qr, { small: true }, (ascii) => {
            this.qrAscii = ascii;
            console.log(`\n======================================================`);
            console.log(`📲 SCAN WHATSAPP QR CODE TO CONNECT AGENT (+${formattedPhone})`);
            console.log(`======================================================\n`);
            console.log(ascii);
            console.log(`👉 Or link in Admin tab: http://localhost:3000/?admin=true&tab=whatsapp\n`);
          });
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;
          this.status = 'disconnected';
          this.isInitializing = false;
          console.log(`⚠️ WhatsApp connection closed (Status: ${statusCode}, Reason: ${lastDisconnect?.error?.message}). Logged out: ${isLoggedOut}`);

          if (isLoggedOut) {
            const sessionDir = path.resolve(__dirname, '../../whatsapp_session');
            if (fs.existsSync(sessionDir)) {
              try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
            }
            this.lastError = 'Pairing timed out. Click Request Pairing Code to generate a fresh one.';
          } else {
            this.reconnectAttempts++;
            if (this.reconnectAttempts <= 10) {
              const delay = statusCode === 440 ? 15000 : Math.min(this.reconnectAttempts * 2000, 10000);
              setTimeout(() => this.init({ usePairingCode: false }), delay);
            }
          }
        } else if (connection === 'open') {
          this.reconnectAttempts = 0;
          this.status = 'connected';
          this.isInitializing = false;
          this.qrString = null;
          this.qrAscii = null;
          this.pairingCode = null;

          const rawId = sock.user?.id || '';
          this.linkedPhone = rawId.split(':')[0] || formattedPhone;

          console.log(`\n======================================================`);
          console.log(`🎉 PROPER WHATSAPP AGENT CONNECTED!`);
          console.log(`📱 Linked Phone: +${this.linkedPhone}`);
          console.log(`🤖 AI Concierge is now actively monitoring incoming WhatsApp messages!`);
          console.log(`======================================================\n`);
        }
      });

      // Handle Incoming Messages
      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          try {
            // Ignore outbound messages sent by bot itself
            if (msg.key.fromMe) continue;

            const remoteJid = msg.key.remoteJid;
            if (
              !remoteJid ||
              remoteJid.includes('@g.us') ||
              remoteJid === 'status@broadcast' ||
              remoteJid.includes('@newsletter') ||
              remoteJid.includes('@lid')
            ) {
              // Ignore group chats, broadcast channels, newsletters, and status updates
              continue;
            }

            // Extract text message content
            const text = (
              msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              ''
            ).trim();

            if (!text) continue;

            const senderPhoneRaw = remoteJid.replace('@s.whatsapp.net', '');
            const senderPhone = senderPhoneRaw.startsWith('+') ? senderPhoneRaw : `+${senderPhoneRaw}`;
            const senderName = msg.pushName || 'Player';

            console.log(`\n📩 [WHATSAPP INBOUND MESSAGE]`);
            console.log(`From:    ${senderName} (${senderPhone})`);
            console.log(`Message: "${text}"`);

            // Process message through TurfFlow AI Agent Engine
            const agentResponse = await AiAgentService.handleIncomingMessage({
              fromPhone: senderPhone,
              senderName,
              messageText: text
            });

            if (agentResponse?.reply) {
              console.log(`🤖 [WHATSAPP OUTBOUND REPLY] to ${senderPhone}:\n${agentResponse.reply}`);
              await sock.sendMessage(remoteJid, { text: agentResponse.reply });
            }
          } catch (msgErr) {
            console.error('❌ Error processing incoming WhatsApp message:', msgErr);
          }
        }
      });

      return sock;
    } catch (err) {
      this.status = 'error';
      this.lastError = err.message;
      this.isInitializing = false;
      console.error('❌ Failed to initialize Baileys WhatsApp client:', err.message);
      return null;
    }
  }

  /**
   * Send outbound WhatsApp message to any customer phone
   */
  static async sendMessage(recipientPhone, messageText) {
    if (!this.sock || this.status !== 'connected') {
      return { success: false, reason: 'WhatsApp client is not connected' };
    }

    try {
      const cleanDigits = recipientPhone.replace(/\D/g, '');
      const remoteJid = `${cleanDigits.startsWith('91') ? cleanDigits : `91${cleanDigits.slice(-10)}`}@s.whatsapp.net`;
      await this.sock.sendMessage(remoteJid, { text: messageText });
      return { success: true };
    } catch (err) {
      console.error(`❌ Failed to send WhatsApp message to ${recipientPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send outbound PDF or document to any customer phone
   */
  static async sendDocument(recipientPhone, documentBuffer, fileName, caption) {
    if (!this.sock || this.status !== 'connected') {
      return { success: false, reason: 'WhatsApp client is not connected' };
    }

    try {
      const cleanDigits = recipientPhone.replace(/\D/g, '');
      const remoteJid = `${cleanDigits.startsWith('91') ? cleanDigits : `91${cleanDigits.slice(-10)}`}@s.whatsapp.net`;
      await this.sock.sendMessage(remoteJid, {
        document: documentBuffer,
        mimetype: 'application/pdf',
        fileName: fileName || 'GatePass.pdf',
        caption: caption || ''
      });
      console.log(`📄 Dispatched PDF Ticket Pass to ${recipientPhone} (${fileName})`);
      return { success: true };
    } catch (err) {
      console.error(`❌ Failed to send WhatsApp document to ${recipientPhone}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate 8-digit Pairing Code for a given phone number
   */
  static async requestPairingCodeForPhone(phone) {
    const cleanPhone = phone ? phone.replace(/\D/g, '') : (this.targetPhone || '9579158374').replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone.slice(-10)}`;
    this.targetPhone = formattedPhone;

    // Reset previous socket if any to ensure fresh handshake
    if (this.sock) {
      try { this.sock.end(new Error('Reset for new pairing code')); } catch {}
      this.sock = null;
    }
    this.isInitializing = false;
    this.status = 'connecting';

    // Clear stale session state if not registered
    const sessionDir = path.resolve(__dirname, '../../whatsapp_session');
    const credsPath = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      try {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (!creds?.registered) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      } catch {}
    }

    // Initialize fresh socket
    await this.init({ usePairingCode: false, targetPhoneNumber: formattedPhone });

    // Wait 2.5s for WebSocket connection handshake before requesting pairing code
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      if (!this.sock) {
        throw new Error('WhatsApp socket failed to initialize');
      }
      const code = await this.sock.requestPairingCode(formattedPhone);
      this.pairingCode = code;
      this.status = 'pairing_code_ready';
      console.log(`\n======================================================`);
      console.log(`🔑 FRESH WHATSAPP PAIRING CODE:  ${code}`);
      console.log(`📱 TARGET PHONE NUMBER:          +${formattedPhone}`);
      console.log(`======================================================\n`);
      return { success: true, pairingCode: code, phone: formattedPhone };
    } catch (err) {
      console.error('❌ requestPairingCode failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Disconnect and clear session
   */
  static async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {}
      this.sock = null;
    }

    const sessionDir = path.resolve(__dirname, '../../whatsapp_session');
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } catch {}
    }

    this.status = 'disconnected';
    this.qrString = null;
    this.qrAscii = null;
    this.pairingCode = null;
    this.linkedPhone = null;
    console.log('🛑 WhatsApp agent session disconnected.');
    return { success: true };
  }
}
