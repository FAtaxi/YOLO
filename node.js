const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = 3000;

// Eenvoudige gebruikersnaam en wachtwoord (alleen op de server zichtbaar)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'Ahllen2@';

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'fa-taxi-geheim',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 uur
}));

// Statische bestanden serveren (index.html, admin.html, etc.)
app.use(express.static(path.join(__dirname, '..')));

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

app.listen(PORT, () => {
  console.log(`Server gestart op http://localhost:${PORT}`);
});

