## Plan

### 1. Auth & Roles
- Disable public signup. `/auth` becomes sign-in only (first-time signup allowed only when no users exist → becomes admin automatically via existing trigger).
- Add **Users** page (admin only): list profiles + roles, promote/demote between admin/worker, create worker account (email + temp password via edge function using service role), delete worker.
- An admin can promote any worker to admin (multiple admins allowed, already supported by `user_roles` table — no unique constraint on user_id).
- A safeguard: prevent demoting/deleting the last admin.

### 2. Categories → Sub-categories
- Add `parent_id uuid REFERENCES categories(id)` to `categories`.
- Seed two top-level categories: **OPTO** and **NPD** (cannot be deleted).
- Inside each, admins create sub-categories (e.g. Lens, Mirror under OPTO; Vernier, Screw Gauge under NPD).
- Products are attached to a sub-category.
- `Categories.tsx` shows OPTO and NPD as two top-level cards. `CategoryDetail.tsx` shows sub-categories or, if it is a sub-category, the products inside.

### 3. Labels (OPTO / NPD multi-tag)
- Already present: `products.labels product_label[]` with enum `{OPTO,NPD}`.
- Add labels multi-select in Add/Edit Product form.
- On Categories page, clicking OPTO or NPD shows products whose labels contain OPTO (so OPTO+NPD products appear in both lists).

### 4. Part No.
- Already present: `products.part_no text`. Duplicates allowed (per user's last clarification).
- Replace "Custom SKU" UI with **Part No.** input.
- Search and QR resolve by Part No. (fall back to product id / numeric code).

### 5. Worker product requests (prefilled approval)
- `product_requests` table already exists.
- Worker dashboard: "Request New Product" form → inserts into `product_requests` with full fields.
- Admin dashboard: "Pending Requests" list. **Approve** opens the Add Product form prefilled with the request data; on save, the request is marked `approved`. **Reject** marks `rejected`.

### 6. Structured Product Detail page
- Reorganise `ProductDetail.tsx` into a clean info card with labelled fields: Name, Part No., Specifications, Description, Type, Category (sub) / parent label, Supplier, Purchase Price (admin only), Selling Price, Current Stock, Reorder Level, Labels, Location.
- QR code rendered from Part No. (or id if missing). Scanner resolves by Part No. first.
- Related items section shown below.

### 7. Transactions with user name
- Already store `user_id`. Update transaction history view to join `profiles.display_name` and show "By: <name> (<role>)".
- Admins can perform purchase / sale / usage; workers can perform usage only (already enforced by RLS).

### 8. Separate dashboards
- `Dashboard.tsx` branches by role:
  - **Admin**: stock KPIs, low-stock alerts, pending requests, recent transactions with user names, quick add.
  - **Worker**: assigned actions (record usage, request new product, scan), own recent activity.

### 9. Migration summary
- `ALTER TABLE categories ADD COLUMN parent_id uuid REFERENCES categories(id) ON DELETE CASCADE;`
- Seed OPTO + NPD top-level rows (idempotent).
- Edge function `create-worker` (service role) for admin-created worker accounts.

### 10. Files touched
- New: `src/pages/Users.tsx`, `src/pages/Requests.tsx`, `supabase/functions/create-worker/index.ts`, migration file.
- Edited: `Auth.tsx`, `lib/auth.tsx`, `AppShell.tsx`, `App.tsx`, `Categories.tsx`, `CategoryDetail.tsx`, `Products.tsx`, `ProductDetail.tsx`, `Scan.tsx`, `Dashboard.tsx`.

Approve to proceed.