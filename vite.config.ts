import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import nodemailer from 'nodemailer';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'turfflow-email-middleware',
        configureServer(server) {
          // Nodemailer Email Dispatch Middleware (/api/email/send)
          server.middlewares.use('/api/email/send', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
              return;
            }

            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });

            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}');
                const user = env.SMTP_USER || env.VITE_SMTP_USER || process.env.SMTP_USER || 'rajupainter84688@gmail.com';
                const rawPass = env.SMTP_PASS || process.env.SMTP_PASS || 'gbnl yhwn aowz wtbt';
                const pass = rawPass ? rawPass.replace(/\s+/g, '') : '';
                const host = env.SMTP_HOST || process.env.SMTP_HOST || 'smtp.gmail.com';
                const port = parseInt(env.SMTP_PORT || process.env.SMTP_PORT || '465', 10);
                const secure = (env.SMTP_SECURE || process.env.SMTP_SECURE) !== 'false';

                const rawSender = data.from || env.SMTP_FROM_EMAIL || env.VITE_SMTP_FROM_EMAIL || user || 'rajupainter84688@gmail.com';
                const senderName = env.BREVO_FROM_NAME || env.SMTP_FROM_NAME || 'TurfFlow Arena';
                const fromEmail = rawSender.includes('<') ? rawSender : `"${senderName}" <${rawSender}>`;
                const replyTo = data.reply_to || env.SMTP_REPLY_TO || rawSender;
                const cleanTo = Array.isArray(data.to) ? data.to.join(', ') : (data.to || '').trim();

                // 1. Try Brevo HTTPS REST API if configured
                const brevoKey = env.BREVO_API_KEY || env.VITE_BREVO_API_KEY || process.env.BREVO_API_KEY;
                if (brevoKey && brevoKey.trim() !== '' && brevoKey !== 'your_brevo_api_key') {
                  try {
                    const cleanSender = rawSender.includes('<') ? (rawSender.match(/<([^>]+)>/)?.[1] || rawSender).trim() : rawSender.trim();
                    const brevoPayload: any = {
                      sender: { name: senderName, email: cleanSender },
                      to: [{ email: cleanTo }],
                      subject: data.subject,
                      htmlContent: data.html || `<p>${data.text || ''}</p>`,
                      textContent: data.text
                    };
                    if (replyTo) {
                      brevoPayload.replyTo = { email: replyTo.includes('<') ? (replyTo.match(/<([^>]+)>/)?.[1] || replyTo).trim() : replyTo.trim(), name: senderName };
                    }
                    if (data.attachments && Array.isArray(data.attachments)) {
                      brevoPayload.attachment = data.attachments.map((att: any) => ({
                        name: att.filename,
                        content: typeof att.content === 'string' ? att.content : Buffer.from(att.content).toString('base64')
                      }));
                    }
                    const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
                      method: 'POST',
                      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': brevoKey.trim() },
                      body: JSON.stringify(brevoPayload)
                    });
                    const bData: any = await bRes.json().catch(() => ({}));
                    if (bRes.ok) {
                      const msgId = bData.messageId || bData.id || `brevo_${Date.now()}`;
                      console.log(`✉️ [Brevo Dev Email Sent] To: ${cleanTo} | ID: ${msgId}`);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({ success: true, simulated: false, id: msgId, provider: 'brevo' }));
                      return;
                    }
                  } catch (bErr: any) {
                    console.warn('[Brevo Dev Warning - Falling back to Nodemailer]:', bErr.message);
                  }
                }

                // If no real password is configured or is placeholder, return graceful simulation
                if (!pass || pass === 'your_smtp_app_password') {
                  console.log(`[SMTP Simulated Email] From: ${fromEmail} | To: ${cleanTo} | Subject: "${data.subject}"`);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    simulated: true,
                    id: `sim_dev_${Date.now()}`,
                    message: 'Simulated email delivery (configure SMTP_PASS in .env for live Nodemailer dispatch)'
                  }));
                  return;
                }

                const transporter = nodemailer.createTransport({
                  host,
                  port,
                  secure,
                  auth: { user, pass }
                });

                const mailOptions: any = {
                  from: fromEmail,
                  to: cleanTo,
                  replyTo,
                  subject: data.subject,
                  html: data.html,
                  text: data.text
                };

                if (data.attachments && Array.isArray(data.attachments)) {
                  mailOptions.attachments = data.attachments.map((att: any) => ({
                    filename: att.filename,
                    content: typeof att.content === 'string' ? Buffer.from(att.content, 'base64') : att.content,
                    contentType: att.contentType
                  }));
                }

                const info = await transporter.sendMail(mailOptions);
                console.log(`✉️ [Nodemailer Dev Email Sent] To: ${cleanTo} | Subject: "${data.subject}" | ID: ${info.messageId}`);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  simulated: false,
                  id: info.messageId,
                  data: { id: info.messageId }
                }));
              } catch (err: any) {
                console.error('[Nodemailer Dev Error]:', err.message);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: err.message || 'SMTP Email Delivery Failed'
                }));
              }
            });
          });

          // SMS Dispatch Middleware (/api/sms/send)
          server.middlewares.use('/api/sms/send', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
              return;
            }

            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });

            req.on('end', async () => {
              try {
                const data = JSON.parse(body || '{}');
                const rawTo = data.to || '';
                const cleanDigits = data.phone10 || rawTo.replace(/\D/g, '').slice(-10);
                const cleanMessage = data.message || '';
                const activeSenderId = data.senderId || env.SMS_SENDER_ID || 'TRFFLW';

                // 1. Fast2SMS Gateway (India OTP & DLT)
                const fast2smsKey = env.FAST2SMS_API_KEY || (env.SMS_PROVIDER === 'fast2sms' ? env.SMS_API_KEY : null);
                const activeTemplateId = data.templateId || env.FAST2SMS_DLT_TEMPLATE_ID;

                if (fast2smsKey && !fast2smsKey.includes('your_')) {
                  if (data.route === 'otp' && data.otpCode) {
                    // Try dedicated Fast2SMS OTP Route
                    const payload = { route: 'otp', variables_values: data.otpCode, numbers: cleanDigits };
                    let f2sRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                      method: 'POST',
                      headers: { 'authorization': fast2smsKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    let f2sData = await f2sRes.json();

                    // If OTP route requires DLT/website verification (status 996), fallback to Quick SMS route ('q')
                    if (f2sData.status_code === 996) {
                      const qPayload = {
                        route: 'q',
                        message: `Your TurfFlow verification code is ${data.otpCode}. Valid for 10 minutes.`,
                        numbers: cleanDigits
                      };
                      f2sRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                        method: 'POST',
                        headers: { 'authorization': fast2smsKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify(qPayload)
                      });
                      f2sData = await f2sRes.json();
                    }

                    if (f2sData.return === true) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        success: true,
                        simulated: false,
                        id: f2sData.request_id || `sms_${Date.now()}`,
                        provider: 'fast2sms'
                      }));
                      return;
                    } else {
                      console.warn(`[Fast2SMS Error]`, f2sData);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        success: true,
                        simulated: true,
                        otpCode: data.otpCode,
                        id: `sim_dev_sms_${Date.now()}`,
                        provider: 'fast2sms',
                        error: f2sData.message
                      }));
                      return;
                    }
                  } else if (activeTemplateId) {
                    // Registered DLT Route
                    const payload = { route: 'dlt', sender_id: activeSenderId, message: activeTemplateId, variables_values: cleanMessage, numbers: cleanDigits };
                    const f2sRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                      method: 'POST',
                      headers: { 'authorization': fast2smsKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    const f2sData = await f2sRes.json();
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: f2sData.return === true,
                      simulated: false,
                      id: f2sData.request_id || `sms_${Date.now()}`,
                      provider: 'fast2sms',
                      error: f2sData.return !== true ? f2sData.message : undefined
                    }));
                    return;
                  } else {
                    // Quick SMS ('q') Route (does not require DLT Entity)
                    const payload = { route: 'q', message: cleanMessage, numbers: cleanDigits };
                    const f2sRes = await fetch('https://www.fast2sms.com/dev/bulkV2', {
                      method: 'POST',
                      headers: { 'authorization': fast2smsKey, 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    const f2sData = await f2sRes.json();
                    if (f2sData.return === true) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        success: true,
                        simulated: false,
                        id: f2sData.request_id || `sms_${Date.now()}`,
                        provider: 'fast2sms'
                      }));
                      return;
                    } else {
                      console.warn(`[Fast2SMS Quick SMS Error]`, f2sData);
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify({
                        success: true,
                        simulated: true,
                        id: `sim_dev_sms_${Date.now()}`,
                        provider: 'fast2sms',
                        error: f2sData.message
                      }));
                      return;
                    }
                  }
                }

                // 2. Twilio Gateway (Global)
                const twilioSid = env.TWILIO_ACCOUNT_SID;
                const twilioToken = env.TWILIO_AUTH_TOKEN;
                const twilioFrom = env.TWILIO_PHONE_NUMBER;
                if (twilioSid && twilioToken && twilioFrom && !twilioSid.includes('your_')) {
                  const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
                  const params = new URLSearchParams();
                  params.append('From', twilioFrom);
                  params.append('To', rawTo.startsWith('+') ? rawTo : `+91${cleanDigits}`);
                  params.append('Body', cleanMessage);

                  const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Basic ${auth}`,
                      'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: params.toString()
                  });
                  const twilioData = await twilioRes.json();
                  if (twilioRes.ok && twilioData.sid) {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: true,
                      simulated: false,
                      id: twilioData.sid,
                      provider: 'twilio'
                    }));
                    return;
                  }
                }

                // 3. MSG91 Gateway (India)
                const msg91Key = env.MSG91_AUTH_KEY || (env.SMS_PROVIDER === 'msg91' ? env.SMS_API_KEY : null);
                if (msg91Key && !msg91Key.includes('your_')) {
                  const templateId = data.templateId || env.MSG91_OTP_TEMPLATE_ID;
                  const url = templateId && data.otpCode
                    ? `https://control.msg91.com/api/v5/otp?template_id=${templateId}&mobile=91${cleanDigits}&authkey=${msg91Key}&otp=${data.otpCode}`
                    : `https://api.msg91.com/api/v2/sendsms`;

                  const msg91Res = await fetch(url, {
                    method: templateId && data.otpCode ? 'GET' : 'POST',
                    headers: { 'authkey': msg91Key, 'Content-Type': 'application/json' },
                    body: templateId && data.otpCode ? undefined : JSON.stringify({
                      sender: activeSenderId,
                      route: '4',
                      country: '91',
                      sms: [{ message: cleanMessage, to: [cleanDigits] }]
                    })
                  });
                  const msg91Data = await msg91Res.json();
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: msg91Res.ok,
                    simulated: false,
                    id: msg91Data.request_id || `msg91_${Date.now()}`,
                    provider: 'msg91'
                  }));
                  return;
                }

                // Default Simulation Mode (When no paid SMS gateway is active in .env)
                console.log(`[SMS Dev Simulation] To: +91${cleanDigits} | Sender: ${activeSenderId} | Code: ${data.otpCode || 'N/A'} | Msg: "${cleanMessage.slice(0, 80)}..."`);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  simulated: true,
                  otpCode: data.otpCode,
                  id: `sim_dev_sms_${Date.now()}`,
                  provider: 'simulation'
                }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: false, error: err.message || 'SMS error' }));
              }
            });
          });
        }
      }
    ],
    server: {
      port: 3000,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true
        },
        '/pay': {
          target: 'http://localhost:5000',
          changeOrigin: true
        },
        '/simulator': {
          target: 'http://localhost:5000',
          changeOrigin: true
        }
      }
    }
  };
});
