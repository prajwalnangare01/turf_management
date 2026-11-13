// TurfFlow WhatsApp <-> n8n Live Bridge
// Single-Pointer Architecture (Zero Duplicate, Zero Feedback Loop)
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = 'C:\\Users\\samar\\AppData\\Local\\ms-playwright-mcp\\mcp-chrome-b68153b';
const USER_PHONE = '+917385507049';
const N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/turfflow-agent-001/webhook/turfflow-whatsapp';

const BOT_MARKERS = [
  'namaskar',
  'turfflow',
  'step 1',
  'step 2',
  'step 3',
  'slot held',
  'booking confirmed',
  'booking cancelled',
  'confirm cancellation',
  'turf rates',
  'plot 42',
  'maps.google.com'
];

const BOT_EMOJIS = ['👋', '📍', '🏆', '⏰', '🔒', '✅', '❌', '⚠️', '💰', '📅'];

function isBotText(raw) {
  if (!raw) return true;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  for (const emoji of BOT_EMOJIS) {
    if (trimmed.startsWith(emoji)) return true;
  }
  for (const marker of BOT_MARKERS) {
    if (lower.includes(marker)) return true;
  }
  return false;
}

async function startWhatsAppBridge() {
  console.log('\n======================================================');
  console.log('⚡ TurfFlow WhatsApp <-> n8n Single-Pointer Relay');
  console.log(`📡 Connected to n8n Webhook: ${N8N_WEBHOOK_URL}`);
  console.log('======================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA_DIR,
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1200,850'
    ]
  });

  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();

  console.log(`🌐 Opening chat https://web.whatsapp.com/send?phone=917385507049 ...`);
  await page.goto('https://web.whatsapp.com/send?phone=917385507049', { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.waitForSelector('#main footer div[contenteditable="true"]', { timeout: 60000 });
  console.log('✅ WhatsApp conversation loaded successfully!');

  await new Promise(r => setTimeout(r, 2000));

  // Initialize lastProcessedId to the current latest message in the chat
  let lastProcessedId = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#main [data-id]'));
    if (rows.length === 0) return null;
    return rows[rows.length - 1].getAttribute('data-id');
  });

  console.log(`🎯 Initialized pointer at latest chat message ID: ${lastProcessedId}`);
  console.log('⚡ Bot is now listening for NEW user messages only (1 message = 1 response)!\n');

  let isSending = false;

  setInterval(async () => {
    if (isSending) return;

    try {
      const latest = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('#main [data-id]'));
        if (rows.length === 0) return null;
        const last = rows[rows.length - 1];
        const span = last.querySelector('.selectable-text span, .copyable-text span, span.selectable-text');
        const text = (span ? span.innerText : last.innerText).trim();
        return {
          id: last.getAttribute('data-id'),
          text
        };
      });

      if (!latest || !latest.id) return;

      // Only act when a NEW message appears at the bottom of the chat
      if (latest.id === lastProcessedId) return;

      // Check if it is a bot message
      if (isBotText(latest.text)) {
        lastProcessedId = latest.id;
        return;
      }

      // Valid new user input
      console.log(`\n📩 [USER MESSAGE]: "${latest.text}" (ID: ${latest.id})`);
      isSending = true;
      lastProcessedId = latest.id;

      // 1. Call n8n workflow
      console.log(`🔄 Forwarding to n8n...`);
      let replyText = '';
      try {
        const n8nRes = await fetch(N8N_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromPhone: USER_PHONE,
            senderName: 'Samarth',
            messageText: latest.text
          })
        });
        const data = await n8nRes.json();
        replyText = (data.reply || '').trim();
      } catch (err) {
        console.error('⚠️ n8n error:', err.message);
      }

      // 2. Deliver reply to WhatsApp
      if (replyText) {
        console.log(`🤖 [n8n REPLY]:\n${replyText}\n`);
        console.log(`📤 Sending reply to WhatsApp...`);

        await page.evaluate(async (text) => {
          const box = document.querySelector('#main footer div[contenteditable="true"]');
          if (box) {
            box.focus();
            document.execCommand('insertText', false, text);
            await new Promise(r => setTimeout(r, 300));
            const sendBtn = document.querySelector('#main footer button[aria-label="Send"], #main footer span[data-icon="send"]')?.closest('button');
            if (sendBtn) {
              sendBtn.click();
            } else {
              box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
          }
        }, replyText);

        // Allow WhatsApp to render the sent message and advance pointer
        await new Promise(r => setTimeout(r, 2000));
        const newLastId = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('#main [data-id]'));
          return rows.length > 0 ? rows[rows.length - 1].getAttribute('data-id') : null;
        });
        if (newLastId) {
          lastProcessedId = newLastId;
        }
      }

      isSending = false;
    } catch (err) {
      isSending = false;
    }
  }, 1000);
}

startWhatsAppBridge().catch(console.error);
