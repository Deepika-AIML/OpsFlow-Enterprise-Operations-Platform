# OpsFlow - Audit & Rebuild Changelog

This documents what was found in the original codebase and what changed,
organized the way the project brief asked for.

## A. What was already present / working

- A real Django + DRF backend with UUID-keyed models for Organization,
  Department, Client, Project, Task, and a fairly complete audit-log
  design (immutable at the model level, with an approval-workflow state
  machine already built into the `Task` model).
- JWT auth via `djangorestframework-simplejwt`, with role/org claims
  already being embedded in the token.
- A reasonably good starting set of DRF permission classes
  (`IsOrganizationMember`, role checks) already scoping most querysets by
  organization.
- A full set of frontend pages already existed with a consistent visual
  structure (sidebar, topbar, modals, dark mode toggle).

## B. What was broken

- **Public signup accepted a client-supplied `role` field** on an
  `AllowAny` endpoint, and the login page had a "Select Role (Demo RBAC)"
  dropdown that set the active role in `localStorage` - meaning a visitor
  could self-register as Admin, or simply relabel themselves as Admin in
  the browser. This was the most serious issue in the codebase.
- Public signup would **500** on the very first request - it read
  `request.user.organization` for an anonymous user (`AttributeError`),
  and the `User.organization` foreign key is non-nullable.
- `TaskSerializer` didn't expose `priority`, `assignee`, or `organization`
  at all - creating a task through the API failed with an integrity error
  (`organization`/`created_by` are required, non-nullable, and were never
  set anywhere).
- The Tasks queryset filtered through `project__organization`, which
  silently hid every task that had no project attached (`project` is
  optional on the model).
- `AuditLogViewSet` only required `IsAuthenticated` - any logged-in user,
  including Employees, could read the entire audit trail.
- The audit app's URL router was double-mounted
  (`/api/v1/audit/audit-logs/` *and* `/api/v1/audit-logs/audit-logs/`),
  and `apps/audit/utils.py` had a `log_action()` helper that referenced
  model fields (`resource_type`, `description`, `changes`) that don't
  exist on `AuditLog` - dead, broken code, unused but present.
- **The entire Organizations/Clients/Projects/Tasks frontend was
  disconnected from the real backend.** All four pages read and wrote
  `localStorage` directly; none of them called `/api/v1/...` at all,
  despite the backend having real, working (if incomplete) endpoints for
  all four.
- `UserSerializer.update()` called `request.user.is_admin()` - a method
  that didn't exist on the `User` model - so any `PATCH` to `/me/` by any
  user would crash with `AttributeError`.
- `frontend/index.html` was an empty file.
- Login/signup and every list page pulled in **Bootstrap 5 and Font
  Awesome via CDN**, which the brief explicitly disallows.
- `docker-compose.yml` ran **PostgreSQL**, not MySQL as required, and
  provisioned Celery + Redis containers that nothing in the codebase
  actually used (`grep`-confirmed zero `@shared_task` / `.delay()` /
  `apply_async()` calls anywhere).
- `wsgi.py` defaulted `DJANGO_SETTINGS_MODULE` to `config.settings.local`,
  a module that didn't exist.
- A stray, broken `config/settings.py` **file** sat alongside the
  `config/settings/` **package** (same name, same directory) - a leftover
  that could shadow or conflict with the real settings package depending
  on Python's import resolution, and whose own content
  (`from .settings.base import *`, referencing a `settings` package
  *inside itself*) wouldn't have worked in any case. Found and removed
  during the final project-structure review, since it's exactly the kind
  of thing that would only surface once someone actually tried to boot
  Django.
- Several test files used a role value (`"MEMBER"`) and a project status
  (`"ACTIVE"`) that aren't valid choices on those models, and one test
  referenced a `/tasks/<id>/approve/` action that no longer exists in this
  rebuild (see below).

## C. What was missing entirely

- **Notifications** had no backend at all (no model, no app) despite the
  frontend having a `notifications.js` that faked entries in
  `localStorage`.
- **Forgot password / reset password** - no endpoints, no token
  generation, nothing. The frontend button did nothing.
- **Admin User Management** - no dedicated screen or endpoint for viewing/
  searching users, changing roles, or activating/deactivating accounts
  (only a raw list/create endpoint gated behind a role check that itself
  had the signup vulnerability feeding it).
- **Analytics/Dashboard** - the single existing endpoint
  (`OrganizationDashboardView`) returned a hardcoded `{"total_projects": 0,
  ...}` regardless of what was in the database. No growth analytics, no
  resource distribution, no recent-activity feed.
- A `priority` field on `Project` (required by the brief's "status,
  priority, client association" for Projects).
- Any real password-reset flow, Django admin registrations for most
  models, and `apps.py`/`admin.py` for the `authentication` app (it wasn't
  even a properly configured Django app - no `apps.py` at all).

## D. Removed - and why

- **`apps/documents` (S3/boto3 file uploads).** Not part of the requested
  functional scope (Organizations/Clients/Projects/Tasks/Users only), not
  wired to any frontend page, and it hardcoded fake AWS credentials that
  would only ever fail locally. Removing it also removes the `boto3`
  dependency entirely.
- **Celery + Redis.** Zero actual usage anywhere in the codebase (verified
  by grep before removing). Keeping unused infrastructure around
  contradicts "don't add technology you can't explain in an interview."
- **Bootstrap + Font Awesome CDN.** Explicitly disallowed by the brief;
  replaced with a small hand-written CSS design system
  (`frontend/css/style.css`) and an inline SVG icon set (`frontend/js/
  icons.js`), so the app has zero required external dependency for its
  core functionality (Chart.js/SheetJS remain as optional CDN-loaded
  *libraries* for charts and Excel export only).
- A leftover, unrelated data-processing script (`generate_subset.py`) and
  a `gryzzly_subset` dataset directory that had nothing to do with
  OpsFlow.
- A stale, auto-generated `schema.yml` snapshot (the live OpenAPI schema
  is served dynamically at `/api/v1/schema/` instead).
- Two redundant `docker/local` and `docker/production` directories with
  their own separate (Postgres-based) compose files, consolidated into
  one `docker-compose.yml`.
- A second, overlapping request-ID middleware
  (`core.middleware.RequestIDMiddleware` duplicated what
  `apps.audit.middleware.AuditContextMiddleware` already did, and the
  audit one's value was the one actually being used downstream).
- Two now-genuinely-unused DRF permission classes (`HasRole`,
  `IsAdminOrReadOnly`) that nothing in the codebase called.

## E. Authentication changes

- New `PublicSignupSerializer`: `full_name`, `email`, `password`,
  `password_confirm` only. Role is never read from the request body -
  every account is created with `role=EMPLOYEE` and auto-assigned to a
  single default Organization (`User.objects.get_default_organization()`,
  idempotent `get_or_create`).
- Added: logout (refresh-token blacklisting), `token/refresh/`, forgot/
  reset password (`PasswordResetService`, Django's own
  `PasswordResetTokenGenerator`, console email backend for local dev),
  self-service change-password.
- Removed the role dropdown from both the login and signup pages.

## F. RBAC changes

- Added `is_admin` / `is_manager` / `is_employee` / `is_admin_or_manager`
  properties on `User` (fixing the `is_admin()` crash and giving every
  permission class one consistent source of truth).
- `AuditLogViewSet` is now Admin-only.
- New `TaskPermission`: Admin/Manager get full CRUD; Employees get
  read-only plus "change the `status` of a task assigned to them" - the
  view (`TaskViewSet.perform_update`) strips any other field an Employee's
  request tries to change, server-side, regardless of what the request
  body contains. Status transitions themselves are delegated to the
  pre-existing `apps/tasks/services.py::transition_task_status()` - an
  already-correct, atomic (`select_for_update`), audited implementation of
  the same `ALLOWED_TRANSITIONS` state machine the model defines, found
  while integrating the view layer and reused rather than re-implemented.
- `OrganizationViewSet` is fully Admin-only (list/create/update/delete),
  and blocks deleting an Organization that still has users/clients/
  projects/tasks attached (previously this would have silently
  cascade-deleted Clients/Projects/Tasks via the FK `on_delete=CASCADE`).
- New Admin User Management endpoints with a "last active Admin" guard:
  the sole remaining Admin account cannot be demoted or deactivated
  through the API.
- The Admin role can never be assigned through any endpoint (signup,
  admin-provisioning, or role-change) - only `EMPLOYEE`/`MANAGER` are
  accepted; attempting `"role": "ADMIN"` returns a `400`.

## G. Frontend role-based changes

- `frontend/js/layout.js` renders the sidebar/topbar from one role-aware
  nav config and enforces a page guard on every protected page (checked
  against the cached role immediately, then re-confirmed against a fresh
  `/auth/me/` call in case a role changed mid-session). This is presented
  as a UX convenience throughout - the actual boundary is the API.
- Every CRUD page (Organizations, Clients, Projects, Tasks) now calls the
  real API and hides/shows create/edit/delete controls based on
  `Auth.isAdminOrManager()` / page-level role checks, matching the backend
  permission matrix exactly.

## H. Dashboard changes

- Rebuilt `apps/analytics` from scratch: `/dashboard/` (real counts,
  role-scoped: Admin sees system-wide totals + a User Overview block;
  Manager/Employee see their own Organization's totals), `/growth/`
  (bucketed by day/week/month depending on the 7d/30d/6m/1y range),
  `/distribution/` (status/priority breakdown with click-through totals),
  `/recent-activity/` (audit-log-backed, filtered to a "safe" subset of
  actions for non-Admins).
- Dashboard stat cards are clickable through to the relevant filtered page
  (e.g. "Inactive Users" → User Management pre-filtered).

## I. Database changes

- Added `priority` (`LOW`/`MEDIUM`/`HIGH`/`URGENT`) to `Project`, added
  directly into the existing initial migration since no real data existed
  yet for this fresh build.
- New `notifications` app with its own initial migration.
- No other schema changes - the existing Organization/Client/Project/Task/
  User/AuditLog schema was solid and was preserved.

## J. Docker / MySQL changes

- Switched from PostgreSQL to MySQL 8 (`mysqlclient` driver, per the
  Django docs' own recommendation).
- Consolidated to two services: `db` (MySQL, with a real healthcheck) and
  `web` (Django, serving the API *and* the static frontend - see the
  README for why). Removed the separate nginx frontend container, Celery,
  and Redis.
- New `docker/entrypoint.sh`: waits for MySQL to be reachable, runs
  migrations, seeds three demo accounts (idempotent), then starts the
  server.
- Fixed `wsgi.py`'s reference to a nonexistent settings module.

## K. Tests performed

**Static/logical verification actually performed in this environment**
(no network access to PyPI/apt, so Django itself could not be installed
or executed here):

- `python3 -m py_compile` on every backend `.py` file, including all
  migrations - full sweep, clean.
- `node --check` on every frontend `.js` file - clean.
- A scripted cross-check of every HTML page's `<script src>` / stylesheet
  `href` / internal page `href` against the actual files present - no
  broken references found.
- A scripted cross-check of every `document.getElementById(...)` call in
  each page's JS against that page's actual HTML element IDs - no
  mismatches found (aside from IDs created dynamically at runtime, which
  are expected not to appear in the static HTML).
- Manual trace of every `Api.get/post/patch/delete(...)` call site in the
  frontend against `config/urls.py` and each app's `urls.py` - endpoint
  paths verified to match exactly, including router-generated action URLs
  (e.g. `/notifications/unread-count/`) and the ordering that prevents a
  literal path like `/organizations/me/` from being swallowed by a
  router's `<pk>` pattern.
- Manual trace of the backend's custom exception-handler envelope
  (`{"error": {code, message, details, request_id}}`) against the
  frontend's error-parsing logic - found and fixed a mismatch where the
  frontend wasn't unwrapping that envelope, which would have shown a
  generic "Request could not be processed" instead of the real
  per-field validation error on every form.
- Rewrote and reasoned through (line by line, not executed) a full
  `APITestCase` suite: signup can't inject a role, login never trusts a
  client-supplied role, Admin-only enforcement on Organizations/Audit
  Logs/User Management, the last-Admin protection, tenant isolation
  between two Organizations, and the Task status-transition/locking
  rules.

**What I could NOT verify, and why:** this sandboxed tool environment has
no outbound access to PyPI or apt (confirmed - `pip install django` and
`apt-get update` both fail), and no Docker-in-Docker. That means I could
not actually run `docker compose up --build`, run migrations against a
real MySQL instance, execute the test suite, or click through the UI in a
real browser. **You should treat "actually run and test it" as the
required next step**, not something already confirmed - the checklist
below is exactly what to run.

## L. Exact commands to run locally

```bash
cp .env.example .env      # optional
docker compose up --build
```

Open **http://localhost:8000/**. Demo logins are in the README.

## M. Known limitations

- Not run end-to-end in a real Docker/MySQL environment by me - see
  section K above. Please run the checklist below.
- Project/Task member-management and Task comments/approval-history have
  working backend APIs but no dedicated frontend UI yet (see README →
  Future Improvements).
- Password reset email is console-only in local dev (no SMTP configured).
- Chart.js and SheetJS load from a public CDN at runtime - the *browser*
  needs internet access the first time those specific features are used;
  everything else works fully offline.
- `unique_together = ('organization', 'name')` on `Client` has no custom
  handling for the resulting `IntegrityError` if triggered - DRF's
  automatic `UniqueTogetherValidator` can't be generated because
  `organization` is a read-only field on the serializer. In practice this
  means creating two clients with the exact same name in the exact same
  Organization would surface as a generic 500 rather than a clean 400.
  Given the low likelihood of hitting this in the demo scope, it's
  documented here rather than fixed with a bigger serializer change.

## Manual verification checklist for you to run

1. `docker compose up --build` - both containers start, `web` waits for
   `db`'s healthcheck before migrating.
2. `docker compose logs web` - confirm migrations applied and the three
   demo users were created (idempotent - re-running is safe).
3. Open http://localhost:8000/ → redirects to `login.html`.
4. Log in as each of the three demo accounts; confirm the sidebar differs
   per role and matches the permission matrix in the README.
5. As Employee: confirm Organizations/User Management/Audit Logs are not
   in the sidebar, and that navigating to `organizations.html` directly
   redirects you back to the dashboard.
6. As Admin: create an Organization, a Client, a Project (with a
   priority), and a Task assigned to the Employee demo account.
7. Log in as Employee, confirm you can see that task and change its
   status, but not its title/assignee.
8. As Admin, open Audit Logs and confirm the create/update actions above
   were recorded with actor/timestamp/before-after values.
9. Try the CSV/Excel export buttons on Clients/Projects/Tasks/Audit Logs.
10. Try dark mode (Settings page, or the topbar toggle) - confirm it
    persists across a page reload and across different pages.
11. Log out, then try visiting `dashboard.html` directly - confirm it
    redirects to login.
12. Try "Forgot password" with the Employee account's email, then check
    `docker compose logs web` for the printed reset link, and complete the
    reset flow.
13. `docker compose exec web sh -c "cd src && python manage.py test"` -
    run the full test suite (see Known Limitations - I wrote and reasoned
    through these tests but could not execute them myself).
