/* Notifications - personal feed, backed by /api/v1/notifications/. A user
   only ever sees their own notifications; there is no role check here
   because the backend queryset is already scoped to request.user. */
(function () {
  Layout.init("notifications").then(load);

  document.getElementById("read-filter").addEventListener("change", load);
  document.getElementById("mark-all-btn").addEventListener("click", async () => {
    try {
      await Api.post("/notifications/mark-all-read/");
      toast("All notifications marked as read.", "success");
      load();
      Layout.refreshUnreadBadge();
    } catch (err) { toastError(err); }
  });

  async function load() {
    const list = document.getElementById("notif-list");
    list.innerHTML = `<div class="loading-row"><span class="spinner"></span>Loading...</div>`;
    try {
      const data = await Api.get("/notifications/", {
        is_read: document.getElementById("read-filter").value || undefined,
        page_size: 100,
      });
      const items = data.results || data;
      if (!items.length) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">${Icons.bell}</div><h3>No notifications</h3><p>You're all caught up.</p></div>`;
        return;
      }
      list.innerHTML = items.map((n) => `
        <div class="flex-between" data-id="${n.id}" style="padding:14px 20px;border-bottom:1px solid var(--border-soft); ${n.is_read ? "" : "background:var(--brand-tint);"}">
          <div>
            <div style="font-size:0.9rem;">${escapeHtml(n.verb)}</div>
            <div class="text-sm" style="color:var(--ink-faint);margin-top:3px;">${formatDateTime(n.created_at)}</div>
          </div>
          ${n.is_read ? "" : `<button class="btn btn-outline btn-sm" data-mark="${n.id}">Mark read</button>`}
        </div>
      `).join("");
      list.querySelectorAll("[data-mark]").forEach((btn) => btn.addEventListener("click", () => markRead(btn.dataset.mark)));
    } catch (err) {
      list.innerHTML = `<div class="empty-state"><p>Unable to load notifications.</p></div>`;
    }
  }

  async function markRead(id) {
    try {
      await Api.post(`/notifications/${id}/mark-read/`);
      load();
      Layout.refreshUnreadBadge();
    } catch (err) { toastError(err); }
  }
})();
