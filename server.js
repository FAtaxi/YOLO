const express = require('express');
const session = require('express-session');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { createMollieClient } = require('@mollie/api-client');
const cors = require('cors');
const twilio = require('twilio');
require('dotenv').config({ path: path.resolve(__dirname, '../../twilio.env') });

// Twilio client initialiseren
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Gebruik test-API-key uit env of hardcoded (alleen voor test!)
const mollie = createMollieClient({
  apiKey: 'test_BzzwVfz5eDbPn5HCHKKt2DDHzSHEk7'
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware om Content-Security-Policy header te verwijderen
app.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});

// CORS instellen voor frontend op GitHub Pages
app.use(cors({
  origin: 'https://fataxi.github.io',
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: false
}));

// Eenvoudige gebruikersnaam en wachtwoord (alleen op de server zichtbaar)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Ahllen2@';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'fa-taxi-geheim',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 uur
}));

// Statische bestanden serveren (klant.html, admin.html, etc.)
// Statische bestanden uit de projectroot én backend-map serveren
app.use(express.static(path.resolve(__dirname, '..')));
app.use(express.static(path.resolve(__dirname)));

// Middleware: beveilig admin.html
app.use('/admin.html', (req, res, next) => {
  if (req.session && req.session.ingelogd) {
    next();
  } else {
    res.redirect('/login');
  }
});

// Loginpagina (simpel HTML-formulier)
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="nl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Login</title>
      <style>
        body { background: #191919; color: #ffd700; font-family: 'Segoe UI', sans-serif; min-height:100vh; display:flex; align-items:center; justify-content:center; }
        .loginbox { background:#232526; border-radius:12px; box-shadow:0 2px 18px #ffd70044; padding:2.2rem 2.2rem 1.6rem 2.2rem; max-width:340px; width:100%; }
        h2 { color:gold; text-align:center; margin-bottom:1.2rem; }
        label { color:#ffd700; margin-top:0.7rem; display:block; }
        input { width:100%; padding:0.6rem; border-radius:7px; border:none; background:#191919; color:#ffd700; margin-bottom:1.2rem; font-size:1.07rem; }
        button { width:100%; background: linear-gradient(90deg,#fffbe6 0%,#ffd700 100%); color:#222; font-weight:bold; border:none; border-radius:8px; padding:0.7em 1.2em; font-size:1.1rem; cursor:pointer; }
        .fout { color:#ff4d4d; text-align:center; margin-bottom:1rem; }
      </style>
    </head>
    <body>
      <form class="loginbox" method="POST" action="/login">
        <h2>Admin inloggen</h2>
        ${(req.query.fout ? '<div class="fout">Onjuiste gebruikersnaam of wachtwoord</div>' : '')}
        <label for="gebruikersnaam">Gebruikersnaam</label>
        <input type="text" id="gebruikersnaam" name="gebruikersnaam" autocomplete="username" required autofocus>
        <label for="wachtwoord">Wachtwoord</label>
        <input type="password" id="wachtwoord" name="wachtwoord" autocomplete="current-password" required>
        <button type="submit">Inloggen</button>
      </form>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { gebruikersnaam, wachtwoord } = req.body;
  if (gebruikersnaam === ADMIN_USER && wachtwoord === ADMIN_PASS) {
    req.session.ingelogd = true;
    res.redirect('/admin.html');
  } else {
    res.redirect('/login?fout=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Endpoint: e-mail rit details as PDF
app.post('/email-rit', (req, res) => {
  const rit = req.body;
  const doc = new PDFDocument();
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', async () => {
    const pdfBuffer = Buffer.concat(chunks);
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: process.env.SMTP_USER,
        subject: `Rit ${rit.ritId} Details`,
        text: 'Zie bijlage voor rit details.',
        attachments: [{ filename: `rit-${rit.ritId}.pdf`, content: pdfBuffer }]
      });
      res.json({ status: 'ok' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Verzenden mislukt' });
    }
  });
  doc.text(`Rit details:\n${JSON.stringify(rit, null, 2)}`);
  doc.end();
});

// Endpoint: Start iDEAL betaling
app.post('/api/pay', async (req, res) => {
  const { amount, description } = req.body;
  if (!amount || !description) return res.status(400).json({ error: 'Ongeldige aanvraag' });
  try {
    const payment = await mollie.payments.create({
      amount: { currency: 'EUR', value: Number(amount).toFixed(2) },
      description,
      method: 'ideal',
      // Eerst een generieke redirectUrl, daarna direct updaten met payment.id
      redirectUrl: 'https://yolo-n9xa.onrender.com/betaalstatus.html',
      webhookUrl: 'https://yolo-n9xa.onrender.com/api/webhook'
    });
    console.log('[PAY] payment aangemaakt:', payment.id);
    console.log('[PAY] payment object:', JSON.stringify(payment, null, 2));
    // Update de payment met de juiste redirectUrl zodat Mollie na afronden terugstuurt met id
    const redirectUrl = `https://yolo-n9xa.onrender.com/betaalstatus.html?id=${payment.id}`;
    try {
      await mollie.payments.update(payment.id, { redirectUrl });
      console.log('[PAY] redirectUrl succesvol geüpdatet naar:', redirectUrl);
    } catch (e) {
      console.error('Kon Mollie redirectUrl niet updaten:', e.message);
    }
    console.log('DEBUG: Mollie payment.id:', payment.id);
    console.log('DEBUG: Mollie redirectUrl die hoort bij deze betaling:', redirectUrl);
    res.json({ checkoutUrl: payment.getCheckoutUrl() });
  } catch (err) {
    console.error('Mollie betaling error:', err);
    res.status(500).json({ error: 'Mollie betaling mislukt' });
  }
});

// CORS preflight handler voor /api/pay
app.options('/api/pay', (req, res) => {
  res.header('Access-Control-Allow-Origin', 'https://fataxi.github.io');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// Endpoint: Payment status ophalen via Mollie
app.get('/api/payment-status', async (req, res) => {
  const paymentId = req.query.id;
  if (!paymentId) return res.status(400).json({ error: 'Geen paymentId opgegeven' });
  try {
    const payment = await mollie.payments.get(paymentId);
    res.json({ status: payment.status });
  } catch (err) {
    res.status(500).json({ error: 'Status ophalen mislukt' });
  }
});

// Mollie webhook endpoint
app.post('/api/webhook', express.json(), (req, res) => {
  console.log('[WEBHOOK] Ontvangen van Mollie:', JSON.stringify(req.body));
  res.status(200).send('ok');
});

// WhatsApp endpoint
app.post('/api/whatsapp', async (req, res) => {
  const { to, message } = req.body;
  
  if (!to || !message) {
    return res.status(400).json({ error: 'Telefoonnummer en bericht zijn verplicht' });
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${to}`
    });
    
    res.json({ 
      status: 'success',
      messageId: result.sid,
      timestamp: result.dateCreated
    });
  } catch (err) {
    console.error('Twilio WhatsApp error:', err);
    res.status(500).json({ 
      error: 'WhatsApp bericht versturen mislukt',
      details: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server gestart op http://localhost:${PORT}`);
});
