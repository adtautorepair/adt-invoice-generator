# AD&T Invoice Generator — Setup Guide

## Installing the app

1. Double-click **`AD&T Invoice Generator Setup 1.0.0.exe`** (found in the `dist` folder).
2. Choose where to install (or accept the default) and finish.
3. A **desktop icon** and Start-menu shortcut are created. Double-click to open.

The app runs fully offline. All invoices and customers are saved on this computer.

---

## First-time setup (in the app → Settings)

1. **Company information** — confirm the name, address, phone, email, and enter the **HST/GST business number**.
2. **Logo & branding** — the AD&T logos are already built in. Adjust the **logo size** slider if needed and click **Save all settings**.
3. **Service / price list** — add the common jobs (oil change, brake job, etc.) with prices so they appear in the Quick-add dropdown.

---

## Setting up email (sending invoices from Gmail)

The app sends invoices straight from David's Gmail with the PDF attached. Gmail requires a one-time **App Password** (a special 16-character password just for this app):

1. Go to **myaccount.google.com** → **Security**.
2. Turn on **2-Step Verification** (required before App Passwords appear).
3. Search for **App passwords**, create one named "Invoice App", and copy the **16-character code**.
4. In the app → **Settings → Email account (SMTP)**:
   - SMTP host: `smtp.gmail.com`
   - Port: `465`
   - Your Gmail address: David's Gmail
   - App password: paste the 16-character code
   - "From" name: `AD&T General Auto Repair`
5. Click **Save all settings**, then **Send test email to myself** — David should receive a test email.

Once connected, the **"Email to customer"** button sends the invoice PDF to the customer automatically.

---

## Everyday use

- **Create** tab: fill in customer, vehicle, and parts/labor → **Print / Save PDF** (opens a clean PDF to print or save), or **Email to customer**.
- Tick **"Mark as PAID"** to print it as a **receipt** with the PAID stamp.
- **History** tab: search, reprint, or copy any past invoice.
- **Customers** tab: the database builds itself as you save invoices; set a "next service due" date to get reminders.

---

## Backups (important)

Data lives on this computer only. In **Settings → Backup & data**, click **Export backup** regularly and keep the file in a OneDrive/Google Drive folder or email it to David. If the computer is ever replaced, **Import backup** restores everything.

---

## Updating the app later

To ship a new version, rebuild with `npm run dist` and share the new `Setup.exe`.
