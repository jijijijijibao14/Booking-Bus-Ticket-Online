
  # Travel Ticket Booking Platform

  This is a code bundle for Travel Ticket Booking Platform. The original project is available at https://www.figma.com/design/Y4OA3jqaIBo7qwjIZMFhGd/Travel-Ticket-Booking-Platform.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Admin account and password storage

  User passwords are stored as scrypt hashes. For an existing database, stop the
  backend, back up the database, and run
  `npm run migrate-passwords --prefix .\BE` from PowerShell; this converts existing
  plaintext passwords, removes the plaintext column, and enforces a maximum of one
  admin account without dropping the database.

  To create the first admin from PowerShell, set the account details and enter the
  password at the hidden prompt:

  ```powershell
  $env:ADMIN_USERNAME = "vietgo-admin"
  $env:ADMIN_EMAIL = "admin@example.com"
  $env:ADMIN_FULL_NAME = "VIETGO Admin"
  $securePassword = Read-Host "Admin password (12+ characters)" -AsSecureString
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
  npm run create-admin --prefix .\BE
  Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_EMAIL, Env:ADMIN_FULL_NAME, Env:ADMIN_PASSWORD
  ```

  The command refuses to create another admin. Never put the admin password in SQL
  files or commit it to the repository.

  If the admin account exists but its password is unknown, reset it without
  changing any other account. From the project root in PowerShell:

  ```powershell
  $env:ADMIN_EMAIL = "admin@vietgo.vn"
  $securePassword = Read-Host "New admin password (12+ characters)" -AsSecureString
  $env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $securePassword).Password
  npm run reset-admin-password --prefix .\BE
  Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
  Remove-Variable securePassword
  ```

  The script updates only the Admin account matching `ADMIN_EMAIL` in the database
  configured for the backend. It does not create a new user or modify other
  accounts.

  To create exactly three partner accounts, use PowerShell from the project root.
  Password prompts are hidden; each password must have at least 12 characters.
  The backend hashes them with scrypt before inserting the accounts and partner
  profiles in one transaction:

  ```powershell
  $partners = @()
  1..3 | ForEach-Object {
    $number = $_
    $password = Read-Host "Password for partner $number (12+ characters)" -AsSecureString
    $plainPassword = [System.Net.NetworkCredential]::new("", $password).Password
    $partners += [PSCustomObject]@{
      username = Read-Host "Username for partner $number"
      email = Read-Host "Email for partner $number"
      fullName = Read-Host "Full name for partner $number"
      phone = Read-Host "Phone for partner $number (optional)"
      password = $plainPassword
      brandName = Read-Host "Bus company name for partner $number"
      licenseNumber = Read-Host "Business license number for partner $number"
      commissionRate = 10
    }
    Remove-Variable plainPassword, password
  }
  $env:VIETGO_PARTNERS_JSON = ConvertTo-Json -InputObject $partners -Compress
  npm run create-partners --prefix .\BE
  Remove-Item Env:VIETGO_PARTNERS_JSON
  Remove-Variable partners
  ```

  All three records are rolled back if any insert fails. They start as
  `Pending Approval`; no existing accounts are modified.

  The full `sql v2.sql` script drops and recreates the `booking` database; back up
  any existing data before running it. Do not use it as an in-place migration.

  For an existing `booking` database, back it up and run
  `BE\migrations\20261019_add_feedback_and_chat.sql` once in a MySQL client before
  starting the backend. This adds partner replies to feedback and creates the
  conversation/message tables without dropping existing data. The migration is
  intentionally a one-time script because it adds columns to `feedbacks`.

  ## Recurring trips

  For an existing MySQL `booking` database, back it up and run
  `BE\database\migrations\20261023_recurring_trip_schedules.sql` once before
  using recurring trip creation. Do not run the root `sql.sql` installation
  script against a database that contains data; it drops and recreates `booking`.

  The Partner Dashboard's **Quản lý chuyến → Lịch trình → Tạo lịch chạy định kỳ**
  flow previews each departure and estimated arrival, checks vehicle turnaround
  (minimum 60 minutes), configured transfer time, driver overlap, and existing
  trips, then creates each valid trip and its seats in a MySQL transaction.
  Choose all-or-nothing or explicitly allow valid trips only. Requests carry an
  idempotency key so retrying the same confirmation does not duplicate trips.
  Generated trips retain their estimated duration and arrival time; later edits
  to a saved template do not rewrite already generated trips. Trips with tickets
  cannot have their route, vehicle, departure/arrival time, price, or cancellation
  status changed through the regular schedule editor.

  Each template supports at most 91 calendar days, 8 departure times per day,
  and 728 generated trips per request. The current schema has route endpoints
  only (not pickup/drop-off stops or coordinates); enter stop, en-route rest,
  buffer, and between-route transfer minutes as operator estimates. The 60-minute
  vehicle turnaround check is not a legal driver-hours compliance check.

  Google Routes is optional. Enable the Routes API and billing/quotas for the
  Google Cloud project, then provide the key only to the backend process as
  `GOOGLE_MAPS_API_KEY`; never put it in frontend variables or commit it. The
  integration requests one traffic-unaware driving estimate per unique origin
  and destination, caches successful results for 30 days, and adds operator
  stop/rest/buffer values separately. Google pricing and quotas depend on the
  Cloud project and current Google Maps Platform pricing. If the key is absent,
  the request times out, or no route is returned, the preview identifies the
  issue and uses the duration entered by the partner.

  Run the focused recurrence tests and backend build from PowerShell:

  ```powershell
  npm test --prefix .\BE
  npm run build --prefix .\BE
  ```
  