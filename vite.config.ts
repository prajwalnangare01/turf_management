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
                const fromEmail = data.from || env.RESEND_FROM_EMAIL || 'TurfFlow Arena <onboarding@resend.dev>';

                // If no real API key is configured or is a placeholder, return graceful simulation
                if (!apiKey || apiKey === 're_your_resend_api_key' || !apiKey.startsWith('re_')) {
                  console.log(`[Resend Simulated Email] To: ${data.to} | Subject: "${data.subject}"`);
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
                const resendResponse = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    from: fromEmail,
                    to: Array.isArray(data.to) ? data.to : [data.to],
                    subject: data.subject,
                    html: data.html,
                    text: data.text
                  })
                });

                const resJson = await resendResponse.json();

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

                const fast2smsKey = env.FAST2SMS_API_KEY || (env.SMS_PROVIDER === 'fast2sms' ? env.SMS_API_KEY : null);
                if (fast2smsKey && !fast2smsKey.includes('your_')) {
                  const payload = data.route === 'otp' && data.otpCode
                    ? { route: 'otp', variables_values: data.otpCode, numbers: cleanDigits }
                    : { route: 'q', message: cleanMessage, numbers: cleanDigits, flash: 0 };

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
                    provider: 'fast2sms'
                  }));
                  return;
                }

                // Default Simulation Mode
                console.log(`[SMS Dev Simulation] To: +91${cleanDigits} | Sender: ${activeSenderId} | Msg: "${cleanMessage.slice(0, 80)}..."`);
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  simulated: true,
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
        }
      }
    }
  };
});
