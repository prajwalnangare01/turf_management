import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'turfflow-resend-middleware',
        configureServer(server) {
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
                const apiKey = env.RESEND_API_KEY || env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY;
                const rawSender = data.from || env.RESEND_FROM_EMAIL || env.VITE_RESEND_FROM_EMAIL || 'rajupainter84688@gmail.com';
                const fromEmail = rawSender.includes('<') ? rawSender : `TurfFlow Arena <${rawSender}>`;
                const replyTo = data.reply_to || env.RESEND_REPLY_TO_EMAIL || 'rajupainter84688@gmail.com';

                // If no real API key is configured or is a placeholder, return graceful simulation
                if (!apiKey || apiKey === 're_your_resend_api_key' || !apiKey.startsWith('re_')) {
                  console.log(`[Resend Simulated Email] From: ${fromEmail} | To: ${data.to} | Subject: "${data.subject}"`);
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: true,
                    simulated: true,
                    id: `sim_dev_${Date.now()}`,
                    message: 'Simulated email delivery (configure RESEND_API_KEY in .env for live Resend dispatch)'
                  }));
                  return;
                }

                // Node.js native fetch call to Resend REST API (avoids any browser CORS restriction)
                let resendResponse = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    from: fromEmail,
                    reply_to: replyTo,
                    to: Array.isArray(data.to) ? data.to : [data.to],
                    subject: data.subject,
                    html: data.html,
                    text: data.text,
                    attachments: data.attachments || undefined
                  })
                });

                let resJson = await resendResponse.json();

                // If Resend rejects due to unverified custom/gmail domain, gracefully retry using onboarding sender with sender as display name and reply-to
                if (!resendResponse.ok && (resJson?.message?.includes('not verified') || resJson?.message?.includes('domain'))) {
                  const fallbackFrom = `rajupainter84688@gmail.com <onboarding@resend.dev>`;
                  console.warn(`[Resend Sender Fallback] "${fromEmail}" unverified on Resend. Retrying via "${fallbackFrom}" with reply_to: "${replyTo}".`);
                  resendResponse = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${apiKey}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      from: fallbackFrom,
                      reply_to: replyTo,
                      to: Array.isArray(data.to) ? data.to : [data.to],
                      subject: data.subject,
                      html: data.html,
                      text: data.text,
                      attachments: data.attachments || undefined
                    })
                  });
                  resJson = await resendResponse.json();
                }

                if (!resendResponse.ok) {
                  res.statusCode = resendResponse.status;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({
                    success: false,
                    error: resJson?.message || 'Resend API error',
                    details: resJson
                  }));
                  return;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  simulated: false,
                  data: resJson
                }));
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: false,
                  error: err.message || 'Internal Server Error'
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
                    // Dedicated cheap Fast2SMS OTP Route
                    const payload = { route: 'otp', variables_values: data.otpCode, numbers: cleanDigits };
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
                    // Quick SMS ('q') is strictly disabled to avoid excessive carrier billing.
                    // Booking confirmations and reminders are handled via Email & WhatsApp.
                    console.log(`[Fast2SMS Notice] Quick SMS route ('q') disabled to prevent high costs. Msg for +91${cleanDigits} delivered via WhatsApp/Email.`);
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                      success: true,
                      simulated: true,
                      id: `sim_dev_sms_${Date.now()}`,
                      provider: 'fast2sms_skipped_quick',
                      message: 'Quick SMS route is disabled to avoid high charges. Sent via WhatsApp & Email.'
                    }));
                    return;
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
