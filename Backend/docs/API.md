# HTTP API reference

Base URL for local development:

```text
http://localhost:5000/api
```

Static files (profile uploads): `http://localhost:5000/uploads/...` (no `/api` prefix).

---

## Postman

1. **Import:** Postman → **Import** → **Raw text** → paste any **curl** block below → **Continue** → **Import**.
2. Replace placeholders:
   - `http://localhost:5000` if your server uses another host/port.
   - `YOUR_USER_TOKEN`, `YOUR_ADMIN_TOKEN`, etc. with a real JWT from login/register.
   - MongoDB `ObjectId` paths (e.g. `507f1f77bcf86cd799439011`) with real IDs from your DB.
3. **Collection variables (optional):** In Postman you can define `baseUrl` = `http://localhost:5000/api` and replace the URL in requests manually; the snippets below use the **full URL** so they import without variables.

**Postman-style curl** uses:

- `--location` — follow redirects (Postman default).
- `--request <METHOD>` — HTTP method.
- `--header 'Name: value'` — headers (single-quoted for portability).
- `--data-raw '...'` — raw JSON body (Postman’s “raw” body).
- `--form 'key=value'` — multipart fields (Postman’s form-data).

---

## Table of contents

1. [Quick endpoint index](#quick-endpoint-index)
2. [Health](#health)
3. [Profile images & multipart](#profile-images--multipart)
4. [User auth](#user-auth--apiuserauth)
5. [Vendor auth](#vendor-auth--apivendorauth)
6. [Admin auth](#admin-auth--apiadminauth)
7. [Delivery auth](#delivery-auth--apideliveryauth)
8. [Admin: users CRUD](#admin-users-crud--apiadminusers)
9. [Admin: vendors CRUD](#admin-vendors-crud--apiadminvendors)
10. [Admin: delivery partners CRUD](#admin-delivery-partners-crud--apiadmindelivery-boys)
11. [HTTP status codes](#http-status-codes)
12. [JWT & roles](#jwt--roles)
13. [Shell & Windows notes](#shell--windows-notes)

---

## Quick endpoint index

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | — |
| POST | `/api/user/auth/register` | — |
| POST | `/api/user/auth/login` | — |
| POST | `/api/user/auth/forgot-password` | — |
| POST | `/api/user/auth/reset-password` | — |
| GET | `/api/user/auth/me` | User JWT |
| PATCH | `/api/user/auth/me` | User JWT |
| DELETE | `/api/user/auth/me` | User JWT |
| POST | `/api/vendor/auth/register` | — |
| POST | `/api/vendor/auth/login` | — |
| POST | `/api/vendor/auth/forgot-password` | — |
| POST | `/api/vendor/auth/reset-password` | — |
| GET | `/api/vendor/auth/me` | Vendor JWT |
| PATCH | `/api/vendor/auth/me` | Vendor JWT |
| DELETE | `/api/vendor/auth/me` | Vendor JWT |
| POST | `/api/admin/auth/register` | — |
| POST | `/api/admin/auth/login` | — |
| POST | `/api/admin/auth/forgot-password` | — |
| POST | `/api/admin/auth/reset-password` | — |
| GET | `/api/admin/auth/me` | Admin JWT |
| PATCH | `/api/admin/auth/me` | Admin JWT |
| DELETE | `/api/admin/auth/me` | Admin JWT |
| POST | `/api/delivery/auth/register` | — |
| POST | `/api/delivery/auth/login` | — |
| POST | `/api/delivery/auth/refresh` | — |
| POST | `/api/delivery/auth/forgot-password/otp/send` | — |
| POST | `/api/delivery/auth/forgot-password/otp/verify` | — |
| POST | `/api/delivery/auth/forgot-password` | — |
| POST | `/api/delivery/auth/reset-password` | — |
| GET | `/api/delivery/auth/me` | Delivery JWT |
| PATCH | `/api/delivery/auth/me/password` | Delivery JWT |
| PATCH | `/api/delivery/auth/me` | Delivery JWT |
| DELETE | `/api/delivery/auth/me` | Delivery JWT |
| GET | `/api/delivery/profile` | Delivery JWT |
| PATCH | `/api/delivery/profile` | Delivery JWT |
| GET | `/api/delivery/documents` | Delivery JWT |
| PATCH | `/api/delivery/documents` | Delivery JWT |
| GET | `/api/admin/users` | Admin JWT |
| GET | `/api/admin/users/:id` | Admin JWT |
| POST | `/api/admin/users` | Admin JWT |
| PATCH | `/api/admin/users/:id` | Admin JWT |
| DELETE | `/api/admin/users/:id` | Admin JWT |
| GET | `/api/admin/vendors` | Admin JWT |
| GET | `/api/admin/vendors/:id` | Admin JWT |
| POST | `/api/admin/vendors` | Admin JWT |
| PATCH | `/api/admin/vendors/:id` | Admin JWT |
| DELETE | `/api/admin/vendors/:id` | Admin JWT |
| GET | `/api/admin/delivery-boys` | Admin JWT |
| GET | `/api/admin/delivery-boys/:id` | Admin JWT |
| POST | `/api/admin/delivery-boys` | Admin JWT |
| PATCH | `/api/admin/delivery-boys/:id` | Admin JWT |
| DELETE | `/api/admin/delivery-boys/:id` | Admin JWT |

---

## Health

### `GET /api/health`

```bash
curl --location --request GET 'http://localhost:5000/api/health'
```

**Example (200)**

```json
{
  "status": "ok",
  "uptime": 12.345,
  "timestamp": "2026-04-21T12:00:00.000Z"
}
```

---

## Profile images & multipart

- Form field for uploads: **`file`** (`utils/fileUploader.js`: allowed MIME types, **50 MB** max).
- **Register** / **PATCH …/auth/me**: JSON (`Content-Type: application/json`) **or** `multipart/form-data` with the same field names as JSON plus optional **`file`**.
- **PATCH** JSON: `profileImage` set to `""` or `null` clears image and deletes prior local `/uploads/...` file when applicable.

**Download an uploaded file**

```bash
curl --location --request GET 'http://localhost:5000/uploads/user/file-1234567890.jpg' \
--output saved.jpg
```

---

## User auth — `/api/user/auth`

JWT **`role`:** `user`. **Status:** `active` | `inactive` | `blocked`.

### `POST /api/user/auth/register` (JSON)

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/register' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Jane User",
  "email": "jane@example.com",
  "password": "secret123",
  "phone": "+15551234567",
  "gender": "female"
}'
```

### `POST /api/user/auth/register` (multipart + profile file)

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/register' \
--form 'name=Jane User' \
--form 'email=jane2@example.com' \
--form 'password=secret123' \
--form 'phone=+15551234567' \
--form 'gender=female' \
--form 'file=@"/path/to/photo.jpg"'
```

### `POST /api/user/auth/login`

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "jane@example.com",
  "password": "secret123"
}'
```

### `POST /api/user/auth/forgot-password`

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/forgot-password' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "jane@example.com"
}'
```

### `POST /api/user/auth/reset-password`

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{
  "token": "<resetToken>",
  "password": "newSecret456"
}'
```

### `GET /api/user/auth/me`

```bash
curl --location --request GET 'http://localhost:5000/api/user/auth/me' \
--header 'Authorization: Bearer YOUR_USER_TOKEN'
```

### `PATCH /api/user/auth/me` (multipart)

```bash
curl --location --request PATCH 'http://localhost:5000/api/user/auth/me' \
--header 'Authorization: Bearer YOUR_USER_TOKEN' \
--form 'name=Jane Q. User' \
--form 'phone=+15551230000' \
--form 'file=@"/path/to/new-photo.jpg"'
```

### `PATCH /api/user/auth/me` (JSON)

```bash
curl --location --request PATCH 'http://localhost:5000/api/user/auth/me' \
--header 'Authorization: Bearer YOUR_USER_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "fcm_id": "device-token-here",
  "profileImage": ""
}'
```

### `DELETE /api/user/auth/me`

```bash
curl --location --request DELETE 'http://localhost:5000/api/user/auth/me' \
--header 'Authorization: Bearer YOUR_USER_TOKEN'
```

---

## Vendor auth — `/api/vendor/auth`

JWT **`role`:** `vendor`. **Login** requires **`active`** (not `pending`).

### `POST /api/vendor/auth/register` (JSON)

```bash
curl --location --request POST 'http://localhost:5000/api/vendor/auth/register' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Acme Owner",
  "email": "vendor@example.com",
  "password": "secret123",
  "phone": "+15559876543",
  "businessName": "Acme Store",
  "gstNumber": "22AAAAA0000A1Z5"
}'
```

### `POST /api/vendor/auth/login`

```bash
curl --location --request POST 'http://localhost:5000/api/vendor/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "vendor@example.com",
  "password": "secret123"
}'
```

### `POST /api/vendor/auth/forgot-password`

```bash
curl --location --request POST 'http://localhost:5000/api/vendor/auth/forgot-password' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"vendor@example.com"}'
```

### `POST /api/vendor/auth/reset-password`

```bash
curl --location --request POST 'http://localhost:5000/api/vendor/auth/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{"token":"<resetToken>","password":"newSecret456"}'
```

### `GET /api/vendor/auth/me`

```bash
curl --location --request GET 'http://localhost:5000/api/vendor/auth/me' \
--header 'Authorization: Bearer YOUR_VENDOR_TOKEN'
```

### `PATCH /api/vendor/auth/me` (JSON)

```bash
curl --location --request PATCH 'http://localhost:5000/api/vendor/auth/me' \
--header 'Authorization: Bearer YOUR_VENDOR_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"businessName":"Acme Store LLC","gstNumber":""}'
```

### `PATCH /api/vendor/auth/me` (file only)

```bash
curl --location --request PATCH 'http://localhost:5000/api/vendor/auth/me' \
--header 'Authorization: Bearer YOUR_VENDOR_TOKEN' \
--form 'file=@"/path/to/logo.png"'
```

### `DELETE /api/vendor/auth/me`

```bash
curl --location --request DELETE 'http://localhost:5000/api/vendor/auth/me' \
--header 'Authorization: Bearer YOUR_VENDOR_TOKEN'
```

---

## Admin auth — `/api/admin/auth`

JWT **`role`:** `admin`.

### `POST /api/admin/auth/register`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/auth/register' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Site Admin",
  "email": "admin@example.com",
  "password": "secret123",
  "phone": "+15551110000"
}'
```

### `POST /api/admin/auth/login`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "admin@example.com",
  "password": "secret123"
}'
```

### `POST /api/admin/auth/forgot-password`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/auth/forgot-password' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"admin@example.com"}'
```

### `POST /api/admin/auth/reset-password`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/auth/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{"token":"<resetToken>","password":"newSecret456"}'
```

### `GET /api/admin/auth/me`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/auth/me' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `PATCH /api/admin/auth/me`

```bash
curl --location --request PATCH 'http://localhost:5000/api/admin/auth/me' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"name":"Super Admin","phone":"+15550001111"}'
```

### `DELETE /api/admin/auth/me`

```bash
curl --location --request DELETE 'http://localhost:5000/api/admin/auth/me' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

## Delivery auth — `/api/delivery/auth`

JWT **`role`:** `deliveryBoy`. Driver mobile app uses the standard envelope `{ status, message, data }`.

**Login requirements:** `status: active`, `approvalStatus: approved`, and a password set by admin (or self-register).

### `POST /api/delivery/auth/login`

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/login' \
--header 'Content-Type: application/json' \
--data-raw '{
  "email": "oldriver@gmail.com",
  "password": "yourPassword",
  "fcm_id": "optional-firebase-token"
}'
```

**Success (200):**

```json
{
  "status": true,
  "message": "Login successful",
  "data": [{
    "user": {
      "_id": "...",
      "name": "ola driver",
      "email": "oldriver@gmail.com",
      "phone": "8888888888",
      "gender": "male",
      "approvalStatus": "approved",
      "status": "active",
      "profileImage": "http://localhost:5000/uploads/delivery/..."
    },
    "token": "eyJ...",
    "refreshToken": "eyJ..."
  }]
}
```

### `POST /api/delivery/auth/refresh`

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/refresh' \
--header 'Content-Type: application/json' \
--data-raw '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Forgot password flow (driver app — 3 screens)

#### Screen 1 — `POST /api/delivery/auth/forgot-password/otp/send`

Send a 4-digit OTP to the driver's registered mobile number.

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/forgot-password/otp/send' \
--header 'Content-Type: application/json' \
--data-raw '{"phone":"8888888888"}'
```

**Success (200):**

```json
{
  "status": true,
  "message": "OTP sent successfully",
  "data": [{
    "phone": "8888888888",
    "phoneMasked": "+91 •••••• 8888",
    "purpose": "delivery_forgot_password",
    "expiresInSeconds": 300,
    "resendAfterSeconds": 30,
    "otp": "1234"
  }]
}
```

`otp` is returned only in development. Resend is blocked for 30 seconds (429 if too early).

Alias: `POST /api/delivery/auth/forgot-password` with `{ "phone": "8888888888" }`.

#### Screen 2 — `POST /api/delivery/auth/forgot-password/otp/verify`

Verify the 4-digit OTP from SMS.

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/forgot-password/otp/verify' \
--header 'Content-Type: application/json' \
--data-raw '{"phone":"8888888888","otp":"1234"}'
```

**Success (200):**

```json
{
  "status": true,
  "message": "OTP verified",
  "data": [{
    "phone": "8888888888",
    "phoneMasked": "+91 •••••• 8888",
    "otpVerified": true,
    "resetToken": "eyJ..."
  }]
}
```

Use `resetToken` on the next screen (valid 1 hour).

#### Screen 3 — `POST /api/delivery/auth/reset-password`

Create a new password after OTP verification.

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{
  "resetToken": "eyJ...",
  "password": "newSecret456",
  "confirmPassword": "newSecret456"
}'
```

**Success (200):**

```json
{
  "status": true,
  "message": "Password has been reset",
  "data": [{ "reset": true }]
}
```

### Legacy email forgot password — `POST /api/delivery/auth/forgot-password`

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/forgot-password' \
--header 'Content-Type: application/json' \
--data-raw '{"email":"oldriver@gmail.com"}'
```

In development, response `data[0].resetToken` contains the email reset token for testing.

### `POST /api/delivery/auth/reset-password` (email token)

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/reset-password' \
--header 'Content-Type: application/json' \
--data-raw '{"token":"<resetToken>","password":"newSecret456"}'
```

### `PATCH /api/delivery/auth/me/password`

```bash
curl --location --request PATCH 'http://localhost:5000/api/delivery/auth/me/password' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"currentPassword":"old","newPassword":"newSecret456"}'
```

### `POST /api/delivery/auth/register`

```bash
curl --location --request POST 'http://localhost:5000/api/delivery/auth/register' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Delivery Partner",
  "email": "rider@example.com",
  "password": "secret123",
  "phone": "+15552223333",
  "licenseNumber": "DL-12345",
  "vehicleType": "bike"
}'
```

### `GET /api/delivery/auth/me`

```bash
curl --location --request GET 'http://localhost:5000/api/delivery/auth/me' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN'
```

### `PATCH /api/delivery/auth/me`

```bash
curl --location --request PATCH 'http://localhost:5000/api/delivery/auth/me' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"vehicleType":"scooter","licenseNumber":"DL-99999"}'
```

### `DELETE /api/delivery/auth/me`

```bash
curl --location --request DELETE 'http://localhost:5000/api/delivery/auth/me' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN'
```

---

## Delivery profile — `/api/delivery/profile`

Driver app **Profile → Personal Information** screen.

### `GET /api/delivery/profile`

Fetch profile for header (name, phone, photo) and edit form.

```bash
curl --location --request GET 'http://localhost:5000/api/delivery/profile' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN'
```

**Success (200):**

```json
{
  "status": true,
  "message": "Profile fetched",
  "data": [{
    "_id": "...",
    "name": "Shreya Shah",
    "phone": "9517530286",
    "email": "shreyashah@example.com",
    "vehicleRegistrationNumber": "MP 09 AB 0000",
    "profileImage": "http://localhost:5000/uploads/delivery/...",
    "approvalStatus": "approved",
    "status": "active"
  }]
}
```

### `PATCH /api/delivery/profile` — Save Changes

Update personal information. Accepts **JSON** or **multipart/form-data** (for profile photo).

**JSON example:**

```bash
curl --location --request PATCH 'http://localhost:5000/api/delivery/profile' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Shreya Shah",
  "phone": "9517530286",
  "email": "shreyashah@example.com",
  "vehicleRegistrationNumber": "MP 09 AB 0000"
}'
```

**Multipart example (with photo):**

```bash
curl --location --request PATCH 'http://localhost:5000/api/delivery/profile' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN' \
--form 'name="Shreya Shah"' \
--form 'phone="9517530286"' \
--form 'email="shreyashah@example.com"' \
--form 'vehicleRegistrationNumber="MP 09 AB 0000"' \
--form 'profileImage=@"/path/to/photo.jpg"'
```

| Field | Aliases | Required on update |
|-------|---------|-------------------|
| Full name | `name`, `fullName`, `full_name` | Yes, if sent |
| Mobile | `phone`, `mobile`, `mobileNumber` | Yes, if sent |
| Email | `email`, `emailId` | Optional |
| Vehicle number | `vehicleRegistrationNumber`, `vehicleNumber` | Yes, if sent |
| Profile photo | `profileImage`, `profile_image`, `file` | Optional |

**Success (200):**

```json
{
  "status": true,
  "message": "Profile updated successfully",
  "data": [{ "...updated profile fields..." }]
}
```

Alias: `PATCH /api/delivery/auth/me` uses the same handler.

---

## Delivery documents — `/api/delivery/documents`

Driver app **Profile → Documents** screen.

### `GET /api/delivery/documents`

```bash
curl --location --request GET 'http://localhost:5000/api/delivery/documents' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN'
```

**Success (200):**

```json
{
  "status": true,
  "message": "Documents fetched",
  "data": [{
    "drivingLicense": {
      "status": "uploaded",
      "image": "http://192.168.1.51:5000/uploads/delivery/drivingLicenseFront-....jpg",
      "licenseNumber": "DKDFGSDFGMKN45GDF",
      "drivingLicenseFront": "http://192.168.1.51:5000/uploads/delivery/drivingLicenseFront-....jpg",
      "drivingLicenseBack": "http://192.168.1.51:5000/uploads/delivery/drivingLicenseBack-....jpg"
    },
    "aadharCard": {
      "status": "pending",
      "image": null
    }
  }]
}
```

`status` is `"uploaded"` when an image exists, otherwise `"pending"`.

### `PATCH /api/delivery/documents` — Save Changes

Accepts **JSON** or **multipart/form-data**.

**Multipart example:**

```bash
curl --location --request PATCH 'http://localhost:5000/api/delivery/documents' \
--header 'Authorization: Bearer YOUR_DELIVERY_TOKEN' \
--form 'licenseNumber="DKDFGSDFGMKN45GDF"' \
--form 'drivingLicenseFront=@"/path/to/dl-front.jpg"' \
--form 'drivingLicenseBack=@"/path/to/dl-back.jpg"' \
--form 'aadharCard=@"/path/to/aadhaar.jpg"'
```

| Field | Aliases | Notes |
|-------|---------|-------|
| License number | `licenseNumber`, `license_number` | Text |
| Driving license front | `drivingLicenseFront`, `drivingLicense`, `driving_license` | Image file |
| Driving license back | `drivingLicenseBack`, `driving_license_back` | Image file |
| Aadhar card | `aadhaarCard`, `aadharCard`, `aadhar_card` | Image file |

**Success (200):** same shape as GET, with updated document data.

---

## Admin: users CRUD — `/api/admin/users`

All requests need **`Authorization: Bearer YOUR_ADMIN_TOKEN`**.

### `GET /api/admin/users` (list + query)

Query: `page`, `limit` (max 100), optional `status`, optional `search`.

```bash
curl --location --request GET 'http://localhost:5000/api/admin/users?page=1&limit=10&status=active&search=jane' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `GET /api/admin/users/:id`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/users/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `POST /api/admin/users` (JSON)

```bash
curl --location --request POST 'http://localhost:5000/api/admin/users' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Managed User",
  "email": "managed@example.com",
  "password": "tempPassword123",
  "phone": "+15559990000",
  "status": "active"
}'
```

### `POST /api/admin/users` (multipart + avatar)

```bash
curl --location --request POST 'http://localhost:5000/api/admin/users' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--form 'name=Managed User' \
--form 'email=managed2@example.com' \
--form 'password=tempPassword123' \
--form 'phone=+15559990001' \
--form 'status=active' \
--form 'file=@"/path/to/avatar.jpg"'
```

### `PATCH /api/admin/users/:id`

```bash
curl --location --request PATCH 'http://localhost:5000/api/admin/users/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"status":"blocked","phone":"+15559991111"}'
```

### `DELETE /api/admin/users/:id`

```bash
curl --location --request DELETE 'http://localhost:5000/api/admin/users/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

## Admin: vendors CRUD — `/api/admin/vendors`

### `GET /api/admin/vendors`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/vendors?page=1&limit=20&status=pending' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `GET /api/admin/vendors/:id`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/vendors/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `POST /api/admin/vendors`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/vendors' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Owner",
  "email": "newvendor@example.com",
  "password": "secret123",
  "phone": "+15558887777",
  "businessName": "New Shop",
  "status": "active"
}'
```

### `PATCH /api/admin/vendors/:id`

```bash
curl --location --request PATCH 'http://localhost:5000/api/admin/vendors/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"status":"active"}'
```

### `DELETE /api/admin/vendors/:id`

```bash
curl --location --request DELETE 'http://localhost:5000/api/admin/vendors/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

## Admin: delivery partners CRUD — `/api/admin/delivery-boys`

### `GET /api/admin/delivery-boys`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/delivery-boys?search=bike&limit=25' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `GET /api/admin/delivery-boys/:id`

```bash
curl --location --request GET 'http://localhost:5000/api/admin/delivery-boys/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### `POST /api/admin/delivery-boys`

```bash
curl --location --request POST 'http://localhost:5000/api/admin/delivery-boys' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{
  "name": "Rider Two",
  "email": "rider2@example.com",
  "password": "secret123",
  "phone": "+15553334444",
  "vehicleType": "bike",
  "status": "active"
}'
```

### `PATCH /api/admin/delivery-boys/:id`

```bash
curl --location --request PATCH 'http://localhost:5000/api/admin/delivery-boys/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
--header 'Content-Type: application/json' \
--data-raw '{"status":"inactive"}'
```

### `DELETE /api/admin/delivery-boys/:id`

```bash
curl --location --request DELETE 'http://localhost:5000/api/admin/delivery-boys/507f1f77bcf86cd799439011' \
--header 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

---

## HTTP status codes

| Code | Typical meaning |
|------|------------------|
| 200 | OK |
| 201 | Created |
| 400 | Validation / bad request |
| 401 | Auth failed / invalid JWT |
| 403 | Wrong role or account blocked/inactive |
| 404 | Not found |
| 409 | Duplicate email |
| 413 | File too large (Multer) |
| 500 | Server error |

---

## JWT & roles

- Tokens use **`JWT_SECRET`** / expiry from `.env` (see `.env.example`).
- Each **`Authorization`** token must match the route’s app (user vs vendor vs admin vs delivery).
- **`blocked`** / **`inactive`** cannot use protected routes.

---

## Shell & Windows notes

- **Git Bash / macOS / Linux:** paste blocks as-is.
- **Windows CMD:** use straight single quotes as shown, or escape double quotes inside `--data-raw`.
- **PowerShell:** prefer **Postman import** for JSON; or run **`curl.exe`** (not the `curl` alias for `Invoke-WebRequest`):

```powershell
curl.exe --location --request GET 'http://localhost:5000/api/health'
```

- **JSON from file (any shell):**

```bash
curl --location --request POST 'http://localhost:5000/api/user/auth/login' \
--header 'Content-Type: application/json' \
--data-raw "@body-login.json"
```

`body-login.json`:

```json
{
  "email": "jane@example.com",
  "password": "secret123"
}
```
