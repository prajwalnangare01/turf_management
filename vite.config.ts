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
