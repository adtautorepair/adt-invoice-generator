const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const nodemailer = require('nodemailer');
const { autoUpdater } = require('electron-updater');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    backgroundColor: '#0b2e6b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  win.loadFile('invoice-generator.html');
  // open external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  // Check GitHub for a newer version, download in the background, install on next restart.
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update ready',
        message: 'A new version (' + (info && info.version || '') + ') has been downloaded. It will be installed when you close the app.',
        buttons: ['Restart now', 'Later']
      }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', (err) => { console.error('autoUpdater error:', err && err.message); });
    try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { console.error(e); }
  }
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ---------- helpers ---------- */
function writeTempHtml(html) {
  const p = path.join(os.tmpdir(), 'adt-invoice-' + Date.now() + '.html');
  fs.writeFileSync(p, html, 'utf8');
  return p;
}
async function loadHiddenWindow(html) {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  const tmp = writeTempHtml(html);
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 300)); // let the embedded logo image decode
  w._tmp = tmp;
  return w;
}
function cleanupHiddenWindow(w) {
  try { if (w._tmp && fs.existsSync(w._tmp)) fs.unlinkSync(w._tmp); } catch (e) {}
  try { if (!w.isDestroyed()) w.close(); } catch (e) {}
}
async function renderPdfBuffer(html) {
  const w = await loadHiddenWindow(html);
  try {
    return await w.webContents.printToPDF({
      printBackground: true,
      pageSize: 'Letter',
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
  } finally { cleanupHiddenWindow(w); }
}

/* ---------- Save / open PDF ---------- */
ipcMain.handle('invoice:savePdf', async (e, { html, defaultName }) => {
  try {
    const pdf = await renderPdfBuffer(html);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultName || 'invoice.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, pdf);
    shell.openPath(filePath);
    return { ok: true, filePath };
  } catch (err) { return { ok: false, error: String(err) }; }
});

/* ---------- Render to PDF and open it (instant clean preview, no browser header) ---------- */
ipcMain.handle('invoice:openPdf', async (e, { html, name }) => {
  try {
    const pdf = await renderPdfBuffer(html);
    const safe = (name || 'invoice').replace(/[^\w.\- ]+/g, '_');
    const p = path.join(os.tmpdir(), safe + '.pdf');
    fs.writeFileSync(p, pdf);
    await shell.openPath(p);
    return { ok: true, path: p };
  } catch (err) { return { ok: false, error: String(err) }; }
});

/* ---------- Print to a physical printer (clean, no browser header) ---------- */
ipcMain.handle('invoice:print', async (e, { html }) => {
  const w = await loadHiddenWindow(html);
  return await new Promise((resolve) => {
    w.webContents.print(
      { silent: false, printBackground: true, margins: { marginType: 'custom', top: 36, bottom: 36, left: 36, right: 36 } },
      (success, reason) => { cleanupHiddenWindow(w); resolve({ ok: success, reason }); }
    );
  });
});

/* ---------- Email via SMTP (Gmail), with the invoice PDF attached ---------- */
function makeTransport(o) {
  const port = parseInt(o.port) || 465;
  return nodemailer.createTransport({
    host: o.host || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: o.user, pass: (o.pass || '').replace(/\s+/g, '') }
  });
}
ipcMain.handle('mail:test', async (e, o) => {
  try {
    const t = makeTransport(o);
    await t.verify();
    await t.sendMail({
      from: o.fromName ? `"${o.fromName}" <${o.user}>` : o.user,
      to: o.user,
      subject: 'Test email - AD&T Invoice Generator',
      text: 'This is a test from your Invoice Generator. If you received it, your email is connected correctly.'
    });
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
ipcMain.handle('mail:send', async (e, o) => {
  try {
    const t = makeTransport(o);
    const attachments = [];
    if (o.invoiceHtml) {
      const pdf = await renderPdfBuffer(o.invoiceHtml);
      attachments.push({ filename: (o.pdfName || 'invoice') + '.pdf', content: pdf });
    }
    await t.sendMail({
      from: o.fromName ? `"${o.fromName}" <${o.user}>` : o.user,
      to: o.to,
      subject: o.subject,
      text: o.text,
      attachments
    });
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

/* ---------- AI note helper (Google Gemini free tier) ---------- */
async function callGemini(apiKey, model, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey);
  const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3 } };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
// Ask the API which models this key can actually use, and pick a good text model.
async function pickModel(apiKey) {
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(apiKey));
    const data = await res.json().catch(() => ({}));
    const models = (data && data.models || []).filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      !/vision|image|imagen|tts|audio|embedding|aqa|gemma/i.test(m.name || ''));
    const byPref = (re) => models.find(m => re.test(m.name || ''));
    const chosen = byPref(/flash-latest/i) || byPref(/flash/i) || byPref(/latest/i) || models[0];
    return chosen ? String(chosen.name).replace(/^models\//, '') : null;
  } catch (e) { return null; }
}
ipcMain.handle('ai:improve', async (e, o) => {
  try {
    if (!o.apiKey) return { ok: false, error: 'No Gemini API key set (Settings > AI note helper).' };
    if (!o.text) return { ok: false, error: 'Nothing to improve.' };
    const prompt = 'You are helping a Canadian auto repair shop write the work-description note on a customer invoice. Rewrite the note below in clear, correct, professional English suitable for a customer invoice. Keep every specific detail (parts, services, measurements, recommendations). Do not invent details that are not present. Keep it concise. Return only the rewritten note with no preamble, quotation marks, or explanation.\n\nNote:\n' + o.text;
    let model = (o.model && String(o.model).trim()) || 'gemini-flash-latest';
    let { res, data } = await callGemini(o.apiKey, model, prompt);
    // If the chosen model is retired/unavailable, auto-discover a working one and retry once.
    if (!res.ok && /not found|not available|no longer available|not supported|unsupported/i.test(JSON.stringify(data || {}))) {
      const alt = await pickModel(o.apiKey);
      if (alt && alt !== model) { model = alt; ({ res, data } = await callGemini(o.apiKey, model, prompt)); }
    }
    if (!res.ok) return { ok: false, error: (data && data.error && data.error.message) || ('HTTP ' + res.status) };
    const out = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!out) return { ok: false, error: 'No response from the AI. Check your API key.' };
    return { ok: true, text: String(out).trim(), model };
  } catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});
