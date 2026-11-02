
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

  The root `sql.sql` file is the complete schema for a new database. It includes
  recurring-trip tables and the normalized unique phone/vehicle-plate fields.
  Its table creation statements are not an in-place upgrade; use the migrations
  below for an existing database.
  For an existing database, `BE\src\scripts\admin-operations-migration.sql`
  applies the admin and financial schema changes and backfills existing data
  without recreating the database.

  For an existing `booking` database, back it up and run
  `BE\migrations\20261019_add_feedback_and_chat.sql` once in a MySQL client before
  starting the backend. This adds partner replies to feedback and creates the
  conversation/message tables without dropping existing data. The migration is
  intentionally a one-time script because it adds columns to `feedbacks`.

  ## Recurring trips

  For an existing MySQL `booking` database, back it up and run
  `BE\database\migrations\20261023_recurring_trip_schedules.sql` once before
  using recurring trip creation. This migration is only needed for databases
  not created from the current root `sql.sql`.

  For an existing database, run
  `BE\database\migrations\20261029_add_secondary_trip_drivers.sql` once after
  the recurring-trip migration to add support for multiple secondary drivers
  on recurring schedule templates and trips. The primary driver remains in
  the existing `driver_id` column.

  For phone and license-plate validation on an existing database, back it up and
  run `BE\database\migrations\20261029_validate_unique_contact_identifiers.sql`
  once. Resolve any existing duplicate phone numbers within accounts/drivers and
  between accounts and drivers, as well as duplicate vehicle plates, before
  running the migration; its unique indexes intentionally stop if duplicates
  already exist within a table. This migration is only needed for databases not
  created from the current root `sql.sql`.

  Vehicle photos are uploaded to `BE\uploads\vehicles` and named from the
  vehicle ID. This feature does not require a database schema change or
  migration. Keep the backend uploads directory on persistent storage and
  include it in backups.

  The Partner Dashboard's **Quản lý chuyến → Lịch trình → Tạo lịch chạy định kỳ**
  flow previews each departure and estimated arrival, checks vehicle turnaround
  (minimum 60 minutes), driver overlap, and existing trips, then creates each
  valid trip and its seats in a MySQL transaction. It alternates trips between
  the selected endpoints: each chosen operating time starts an outbound cycle,
  followed by return trips after the minimum turnaround, continuing until the
  next chosen start or the selected end date.
  Each trip can have one primary driver and multiple secondary drivers; recurring
  schedule assignments are copied to every generated outbound and return trip.
  Choose all-or-nothing or explicitly allow valid trips only. Requests carry an
  idempotency key so retrying the same confirmation does not duplicate trips.
  Generated trips retain their estimated duration and arrival time; later edits
  to a saved template do not rewrite already generated trips. Trips with tickets
  cannot have their route, vehicle, departure/arrival time, price, or cancellation
  status changed through the regular schedule editor.

  Each template supports at most 91 calendar days, 8 departure times per day,
  and 728 generated trips per request. Scheduled departures are limited to
  08:00–20:00 local time. If the next leg after turnaround would depart after
  20:00, the cycle waits for the partner's next configured departure time on
  the following scheduled day. The current schema has route endpoints
  only (not pickup/drop-off stops or coordinates); enter stop, en-route rest,
  and buffer minutes as operator estimates. These four operating-time components
  determine each trip's arrival and automatic completion time; minimum turnaround
  is added before the next return trip departs. The backend refreshes trip status
  and settles completed trips once per minute while it is running. The 60-minute
  vehicle turnaround check is not a legal driver-hours compliance check.

  Account, driver, and booking phone numbers are validated as Vietnamese mobile
  numbers and normalized to the `0` prefix; account and driver phone numbers
  cannot be reused. Vehicle plates are validated and normalized before saving,
  and a database unique index prevents duplicate plates.

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
  