# Traction Outsourcing HR (Web App)

A multi-company HR web app. Static HTML/CSS/JS front-end, Google Apps Script as the API, and one Google Sheet per company as the database.

## Structure

```
web-app/
  README.md
  .gitignore
  docs/
    ARCHITECTURE.md     how the pieces fit, security rules, limits
    SHEET_SCHEMA.md     every tab (table) and column in a company Sheet
    BUILD_PLAN.md       the step-by-step build order and status
    DEPLOY_BACKEND.md   click-by-click guide to put the backend on your Google account
    GO_LIVE.md          the whole path from laptop to live site, with a smoke-test checklist
    OPERATIONS.md       backups, restore, new companies, updates, troubleshooting
    SECURITY.md         what protects the system and its honest limits
    SOCIAL_PREVIEW.md   how link previews (WhatsApp, Facebook, LinkedIn, X) are set up and tested
  backend/              Google Apps Script project (the API). Paste into script.google.com
    appsscript.json     manifest
    Code.gs             entry point and action router (add new actions here)
    Schema.gs           table definitions (tabs and columns)
    Db.gs               read/insert/update helpers over Sheets
    Auth.gs             password hashing, sessions, lockout
    Companies.gs        company signup, login, logout, me
    Permissions.gs      which role may do what
    Employees.gs        departments, employees, CV files, dashboard summary
    Leave.gs            leave types, holidays, requests, balances, approvals, calendar
    Attendance.gs       clock in/out (with the GPS location check and work sites), daily and monthly attendance, working hours
    Payroll.gs          Nigeria PAYE and pension maths, salary records, payroll runs, payslips
    Recruitment.gs      jobs, public careers page, applicants, offer letters, hiring
    Onboarding.gs       onboarding checklist template and tasks
    Performance.gs      review cycles, reviews, goals
    Expenses.gs         expense claims, approval, payment
    Training.gs         courses, records, compliance matrix
    Docs.gs             receipt and certificate uploads (replaced files are kept, only the owner deletes)
    EmployeeDocs.gs     employee documents: upload, HR review, required list, missing and expiring
    Finance.gs          light finance module: budgets, petty cash, invoices and bills, payments, month-end pack
    Advances.gs         salary advances: request, approval, payment, repayment through payroll
    Reports.gs          analytics for owner and HR
    Audit.gs            activity log (who did what, when)
    Backup.gs           backups, nightly trigger, restore
    Util.gs             date and time helpers (Lagos time)
    Users.gs            staff logins, password reset/change
    Setup.gs            run-once setup, invite code, upgrade helpers
  frontend/             everything that gets hosted (GitHub Pages / web host)
    index.html          sign in
    signup.html         create a company (needs the invite code)
    dashboard.html, employees.html, employee.html, departments.html, users.html, account.html,
    leave.html, leave-settings.html, attendance.html, payroll.html, payroll-run.html, payslips.html, payslip.html,
    performance.html, review.html, expenses.html, training.html, documents.html, finance.html,
    recruitment.html, applicant.html, offer.html, onboarding.html, advances.html, reports.html, audit.html (activity log and backups, owner only),
    404.html              opens company addresses such as hr.tolnigeria.com/<company-code>/employees (rules in js/pretty-url.js)
    careers.html          the PUBLIC page candidates use (careers.html?company=<code>)
    css/                tokens.css (brand), base.css, components.css (login), app.css (app shell)
    js/                 config.js, api.js, auth.js, ui.js, money.js (naira, words, CSV), layout.js (sidebar/menu), employee-form.js, geo.js (reads the phone's location for clock-in), geo-rules.js (one person's location rule: exempt, or limited to work sites), progress.js (the loading bar and spinner), credentials.js (the "give these sign-in details to the employee" pop-up)
    js/pages/           one script per page
    assets/img/         logo and icon
  dev/                  development only, never deployed
    mock-server.js      runs the real backend code locally against fake Google services
    gas-shims.js        the fake Google services
    test-backend.js     checks for company signup, login and sessions
    test-employees.js   checks for roles, employees, departments, users and CV files
    test-leave.js       checks for leave, holidays, approvals and attendance
    test-payroll.js     checks for PAYE (against the company's own sheet), runs and payslips
    test-recruitment.js checks for jobs, careers page, applicants, offers, hiring, onboarding
    test-performance.js checks for review cycles, reviews and goals
    test-expenses.js    checks for expense claims, approvals and payment
    test-training.js    checks for courses, records and the compliance matrix
    test-documents.js   checks for employee documents (upload, review, re-upload, owner-only delete)
    test-finance.js     checks for the Accountant role, petty cash, invoices, VAT and withholding, month-end
    test-security.js    checks for rate limits, password rule, audit log, backups and restore
    test-links.js       checks for company links and the not-found page
    test-advances.js    checks for salary advances and their repayment through payroll
    test-reports.js     checks every analytics figure against independently worked out values
    test-logins.js      checks logins made with an employee or added later: sign-in works, forced password change, roles, nothing half-made
    test-speed.js       checks the table cache: repeat reads skip the Sheet, every write shows at once, nothing stale is served
    test-geo.js         checks the GPS clock-in: required location, work sites, per-employee rules, flag and block modes, distance maths
    seed-demo.js        builds the ACME NIGERIA LTD demo company (fake people and data) for screenshots
    capture-promo.js    takes phone and desktop screenshots of the demo company with headless Chrome
    make-promo-assets.py  puts the phone screenshots in phone frames and builds one showcase picture per role
  promo/                promotional pictures (never uploaded to the website): screenshots/, framed/, showcase/, gallery.html
```

## Try it on this laptop (no Google needed)

```bash
node dev/mock-server.js
```

Open http://localhost:8787. The invite code is printed in the terminal. Data is saved in `dev/mock-data.json` (delete it to start fresh). This is a local imitation: nothing is written to your real Google Drive.

Run the backend checks:

```bash
node dev/test-backend.js
node dev/test-employees.js
node dev/test-leave.js
node dev/test-payroll.js
node dev/test-recruitment.js
node dev/test-performance.js
node dev/test-expenses.js
node dev/test-training.js
node dev/test-security.js
node dev/test-links.js
node dev/test-advances.js
node dev/test-reports.js
node dev/test-geo.js
node dev/test-speed.js
node dev/test-logins.js
node dev/test-documents.js
node dev/test-finance.js
```

## Front-end only (no backend)

From `frontend/`: `python -m http.server 5500`, then http://localhost:5500. Pages load but sign-in reports the backend is not connected.

## Go live later

Follow `docs/GO_LIVE.md` (it links to `docs/DEPLOY_BACKEND.md` for the Google account steps). In short: deploy the backend, run `selfTest`, paste the Web App URL into `PRODUCTION_API_URL` in `frontend/js/config.js`, and upload the contents of `frontend/` to GitHub Pages or any static host. Do not upload `dev/`.

## Status

See `docs/BUILD_PLAN.md`.

## Promotional screenshots

The demo company is fake and lives in `dev/demo-data.json` (separate from your own test data). To rebuild the pictures:

```bash
node dev/seed-demo.js
```

Start the demo server (PowerShell), then capture and build:

```powershell
$env:MOCK_DATA='dev\demo-data.json'; $env:MOCK_PORT='8788'; $env:MOCK_NOW='2026-10-06T10:20'; node dev/mock-server.js
```

```bash
node dev/capture-promo.js
python dev/make-promo-assets.py
```

Re-run the seed and restart the demo server before each capture, because the server records every sign-in. Open `promo/gallery.html` to browse the results.
