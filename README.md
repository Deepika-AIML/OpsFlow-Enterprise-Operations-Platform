# OpsFlow

A small operations-management platform for tracking **Organizations, Clients,
Projects and Tasks**, with backend-enforced role-based access control
(Admin / Manager / Employee), an audit trail, in-app notifications, and a
role-aware dashboard.

This repository is the audited-and-fixed version of an existing OpsFlow
codebase. See [`CHANGELOG.md`](./CHANGELOG.md) for exactly what was already
working, what was broken, and what changed.

---

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Django 5 + Django REST Framework | Batteries-included ORM/admin/auth, DRF gives serializers + permission classes for RBAC with almost no boilerplate. |
| Auth | JWT (`djangorestframework-simplejwt`) | Stateless, works cleanly for a JS frontend calling a REST API; access/refresh split limits the blast radius of a leaked access token. |
| Database | MySQL 8 | Required by the project brief; relational integrity for Organization → Client → Project → Task. |
| DB driver | `mysqlclient` | The driver the Django docs themselves recommend for MySQL. |
| Frontend | HTML5 + CSS3 + Vanilla JavaScript | No build step, nothing to compile, easy to explain line-by-line in an interview. Chart.js and SheetJS are loaded from a CDN purely as *libraries* (charts, .xlsx generation) - not frameworks. |
| Containerization | Docker + Docker Compose | One command starts the whole stack (API + frontend + MySQL). |

Deliberately **not** used: React/Vue/Angular, Bootstrap, Font Awesome,
Celery, Redis, microservices. None of them were required for what this app
actually does, and every one of them would have been dead weight (see the
changelog for what was actually removed and why).

### Why one container serves both the API and the frontend

The frontend has no build step, so Django serves it directly as static
files (see the catch-all route in `src/config/urls.py`) instead of running
a second nginx container. That means:

- No CORS configuration is needed for normal use (same origin).
- `docker compose up --build` only needs to coordinate two containers: `web` and `db`.
- A real production deployment would likely split these again (e.g. behind
  nginx/a CDN) - `config/settings/production.py` shows that direction with
  WhiteNoise - but for a local/demo deployment, combining them is simpler
  and there is no real downside.

---

## 2. Architecture overview

```
Browser (vanilla JS)
   |  fetch() with Authorization: Bearer <JWT>
   v
Django REST Framework  --- permission classes (RBAC) ---> Django ORM ---> MySQL
   |
   +-- apps/authentication  (User model, JWT login/signup, Admin user mgmt)
   +-- apps/organizations   (Organization, Department)
   +-- apps/clients         (Client)
   +-- apps/projects        (Project, ProjectMember)
   +-- apps/tasks           (Task, TaskComment, TaskApprovalHistory)
   +-- apps/audit           (AuditLog - immutable, Admin-only)
   +-- apps/notifications   (Notification - per-user inbox)
   +-- apps/analytics       (read-only aggregation over the apps above)
```

Every model that holds business data (`Client`, `Project`, `Task`, `User`)
has an `organization` foreign key. Requests are always scoped to
`request.user.organization` at the queryset level - a user literally
cannot retrieve another Organization's rows, regardless of what the
frontend does or doesn't show them. Admin is the one role with a
system-wide view (Organizations list, User Management, Audit Logs,
Analytics), because those are inherently cross-organization
administrative functions.

### Project structure

```
opsflow/
├── docker-compose.yml       # db (MySQL) + web (Django + frontend)
├── Dockerfile               # web image
├── docker/entrypoint.sh     # wait-for-db -> migrate -> seed -> runserver
├── .env.example
├── requirements.txt
├── frontend/                 # HTML5 + CSS3 + vanilla JS, served by Django
│   ├── *.html                 (one per page)
│   ├── css/style.css           (design system: variables, light/dark theme)
│   └── js/
│       ├── api.js              (JWT storage, auto-refresh, fetch wrapper)
│       ├── layout.js           (sidebar/topbar, role-based nav, page guards)
│       ├── ui.js                (toasts, confirm modal, empty/loading states)
│       ├── icons.js             (inline SVG icon set - no icon-font CDN)
│       ├── exportData.js        (CSV / XLSX export)
│       └── <page>.js            (one per page, calls the real API)
└── src/
    ├── manage.py
    ├── config/                  (settings, urls, wsgi)
    ├── core/                     (shared exception handler, permission classes)
    └── apps/
        ├── authentication/      (User, JWT views, signup, password reset, admin user mgmt)
        ├── organizations/       (Organization, Department)
        ├── clients/
        ├── projects/
        ├── tasks/
        ├── audit/
        ├── notifications/
        └── analytics/
```

---

## 3. Authentication flow

1. **Sign up** (`POST /api/v1/auth/register/`, public): Full Name, Email,
   Password, Confirm Password only. There is no role field on this
   endpoint or its frontend form - every account created here is forced to
   `EMPLOYEE` server-side and assigned to the single default Organization.
2. **Login** (`POST /api/v1/auth/token/`): email + password only, no role
   selector anywhere. The response is a JWT access/refresh pair; the
   access token's payload carries the role purely so the frontend can
   render the right UI immediately - **every** protected endpoint
   independently re-reads the role from the database on every request, so
   nothing about authorization depends on that claim being trusted.
3. **Session handling**: the access token lives 30 minutes; `api.js`
   transparently calls `/api/v1/auth/token/refresh/` on a 401 and retries
   the original request once. If the refresh token itself is invalid/
   expired, the user is redirected to the login page with a
   "Your session has expired" message.
4. **Logout** (`POST /api/v1/auth/logout/`): blacklists the refresh token
   (`rest_framework_simplejwt.token_blacklist`) so it can't be replayed.
5. **Forgot / reset password**: `POST /api/v1/auth/password-reset/` always
   returns the same generic 200 response whether or not the email exists
   (no account enumeration). In local dev there's no real mail server -
   the reset email (and link) is printed by the **console** email backend
   straight to the `web` container's logs:
   ```
   docker compose logs -f web
   ```
   `POST /api/v1/auth/password-reset/confirm/` verifies the token
   (`django.contrib.auth.tokens.PasswordResetTokenGenerator`, 1 hour
   expiry, single-use - it's invalidated the moment the password changes)
   and sets the new password.

## 4. RBAC (Role-Based Access Control)

Three roles: **Admin**, **Manager**, **Employee**. The Admin role cannot be
obtained through *any* HTTP request - not signup, not the admin user
management screen. It only exists via `manage.py createsuperuser` or the
bundled `seed_demo_users` command. This is enforced in code
(`ASSIGNABLE_ROLES` in `apps/authentication/serializers.py` excludes
`ADMIN`), not just hidden in the UI.

**The frontend never decides what a user is allowed to do.** Every
list/create/update/delete endpoint has its own DRF `permission_classes`
that re-checks the role from the database. Hiding a sidebar link or a
button is a UX convenience; if you tamper with `localStorage`, change the
URL, or call the API directly with curl, you get the same `403 Forbidden`
either way.

### Permission matrix

| Module | Admin | Manager | Employee |
|---|---|---|---|
| Dashboard | Full (system-wide) | Own org | Own org |
| Organizations | Full CRUD | No access (403) | No access (403) |
| Clients | Full CRUD | Full CRUD | Read-only |
| Projects | Full CRUD | Full CRUD | Read-only |
| Tasks | Full CRUD | Full CRUD | Read-only, **except**: may change the `status` of a task assigned to them (and only that field, and only along an allowed transition) |
| User Management | Full (role EMPLOYEE↔MANAGER, activate/deactivate) | No access (403) | No access (403) |
| Audit Logs | Read-only, system-wide | No access (403) | No access (403) |
| Notifications | Own notifications only | Own notifications only | Own notifications only |
| Profile / Settings | Self only | Self only | Self only |

Example of what "backend-enforced" means in this codebase: an Employee
hitting `POST /api/v1/projects/` gets `403 {"detail": "You do not have
permission to perform this action."}` - not a validation error, not a
silent no-op. There's a regression test for exactly this
(`apps/projects/tests.py::test_rbac_project_creation`).

### What happens if...

- **...someone edits `localStorage` to say they're an Admin?** Nothing. The
  JWT is signed server-side; the frontend nav would show more links, but
  every one of those API calls still gets checked against the real role
  in the database and returns `403`.
- **...the JWT expires mid-session?** The next API call gets a `401`,
  `api.js` silently refreshes the access token and retries once. If the
  refresh token has also expired, the user is redirected to login.
- **...an Admin demotes/deactivates the only Admin account?** Blocked with
  a `400` before it happens (`UserManagementDetailView.patch` in
  `apps/authentication/views.py`).

## 5. Database overview

Every business model carries `organization` (except `Organization` itself)
so a single deployment can host multiple Organizations without their data
mixing. Key relationships:

```
Organization 1--* Department
Organization 1--* User      (role: ADMIN / MANAGER / EMPLOYEE)
Organization 1--* Client
Organization 1--* Project --* Task
                     ^            ^
                   Client      assignee (User), created_by (User)
```

`AuditLog` rows are immutable at the model level (`save()`/`delete()` raise
`ValidationError` on any attempted mutation) and at the API level (the
ViewSet is `ReadOnlyModelViewSet`, Admin-only).

## 6. API overview

All endpoints are under `/api/v1/`. Interactive docs (Swagger UI, powered
by `drf-spectacular`) are at **`/api/v1/docs/swagger/`** once the server is
running.

| Endpoint | Notes |
|---|---|
| `POST /auth/register/` | Public signup - forces role=EMPLOYEE |
| `POST /auth/token/`, `POST /auth/token/refresh/`, `POST /auth/logout/` | JWT |
| `POST /auth/password-reset/`, `POST /auth/password-reset/confirm/` | Forgot/reset password |
| `GET/PATCH /auth/me/` | Own profile (name only is writable) |
| `POST /auth/change-password/` | Requires current password |
| `GET /org-members/` | Lightweight colleague list, for assignee pickers |
| `GET/POST /admin/users/`, `GET/PATCH /admin/users/<id>/` | Admin-only user management |
| `GET/POST/PATCH/DELETE /organizations/` | Admin-only |
| `GET /organizations/me/` | Any authenticated user's own org |
| `GET/POST/PATCH/DELETE /clients/`, `/projects/`, `/tasks/` | Search/filter/sort/RBAC per the matrix above |
| `GET /audit-logs/` | Admin-only, read-only |
| `GET/POST /notifications/`, `.../unread-count/`, `.../mark-all-read/`, `.../<id>/mark-read/` | Always scoped to the caller |
| `GET /analytics/dashboard/`, `/growth/`, `/distribution/`, `/recent-activity/` | Real DB aggregates, role-scoped |

## 7. Local setup

### Requirements

Docker and Docker Compose. Nothing else needs to be installed on your host
machine - Python, Django and MySQL all run inside containers.

### First run

```bash
git clone <this-repo>
cd opsflow
cp .env.example .env        # optional - see below
docker compose up --build
```

That single command: builds the `web` image, starts MySQL, waits for it to
report healthy, runs migrations, creates three demo accounts (idempotent -
safe to re-run), and starts the Django dev server.

> `.env` is optional. `docker-compose.yml` has a working default for every
> variable, so `docker compose up --build` works even without creating one.
> Copy `.env.example` to `.env` only if you want to change something
> (ports, demo passwords, etc.).

### Open the app

**http://localhost:8000/**

### Normal run / stop

```bash
docker compose up      # subsequent runs (no rebuild needed)
docker compose down    # stop everything
docker compose down -v # stop and wipe the MySQL volume (fresh start)
```

### Demo / test accounts

Created automatically on first boot by `manage.py seed_demo_users`:

| Role | Email | Password |
|---|---|---|
| Admin | admin@opsflow.local | Admin@12345 |
| Manager | manager@opsflow.local | Manager@12345 |
| Employee | employee@opsflow.local | Employee@12345 |

Change these by setting `ADMIN_EMAIL` / `ADMIN_PASSWORD` / etc. in `.env`
before the first `docker compose up`. You can also create more users
through the public signup page, or as an Admin via User Management.

Django's own admin site is also available at **`/admin/`** using the Admin
account above - useful for quickly inspecting data during development.

## 8. Environment variables

See [`.env.example`](./.env.example) for the full list with safe local
defaults. Nothing in it is a real secret - it's a local-dev configuration
file, not a production one.

## 9. Troubleshooting

- **"port is already allocated"** - something else on your machine is
  already using 8000 or 3306. Stop it, or change the port mapping in
  `docker-compose.yml`.
- **`web` keeps restarting / can't connect to MySQL** - MySQL's first boot
  (creating the database/user) can take 20-30 seconds. `web`'s entrypoint
  waits for it, but check `docker compose logs db` if it's still failing
  after a minute.
- **Forgot-password link never arrives** - there's no real mail server in
  local dev by design; the reset link is printed to
  `docker compose logs web` (see Authentication flow above).
- **Excel export or dashboard charts don't render** - both Chart.js and
  SheetJS load from a public CDN at runtime, so the *browser* needs
  internet access for those two specific features (everything else works
  fully offline once the containers are up).
- **"CSRF" or 401 errors when calling the API directly with curl** - the
  API uses JWT (`Authorization: Bearer <token>`), not session cookies;
  make sure you're sending that header.

## 10. Future improvements

- Project/Task member management (`POST/DELETE /projects/<id>/members/...`)
  exists on the backend but has no dedicated frontend UI yet.
- Task comments and the per-task approval history (`TaskComment`,
  `TaskApprovalHistory`) are modeled and populated automatically on every
  status change, but aren't yet surfaced in the Tasks UI.
- Department management has a working API but no dedicated frontend page.
- Real email delivery (SMTP) for password reset, instead of the console
  backend.

See [`CHANGELOG.md`](./CHANGELOG.md) for the full audit findings, what was
fixed, and known limitations of this local Docker setup versus a real test
run.

## 11. Screenshots

_(placeholder - add screenshots of the dashboard, tasks board, and admin
user management here once you've run the app locally)_
