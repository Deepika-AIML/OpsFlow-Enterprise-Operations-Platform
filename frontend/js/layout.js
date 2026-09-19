/* ==========================================================================
   OpsFlow - Global Application Layout
   --------------------------------------------------------------------------
   Sidebar navigation
   Topbar
   Theme toggle
   Notifications
   User dropdown
   Logout
   Role-based page guards

   IMPORTANT:
   The topbar is rendered ONCE during initialization.
   After /auth/me/ refreshes the user, we update the sidebar only.
   This prevents replacing the topbar DOM and destroying its event handlers.
   ========================================================================== */

const NAV_ITEMS = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "dashboard.html",
    icon: "dashboard",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "organizations",
    label: "Organizations",
    href: "organizations.html",
    icon: "building",
    roles: ["ADMIN"],
  },
  {
    key: "clients",
    label: "Clients",
    href: "clients.html",
    icon: "briefcase",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "projects",
    label: "Projects",
    href: "projects.html",
    icon: "layers",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "tasks",
    label: "Tasks",
    href: "tasks.html",
    icon: "check",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "user-management",
    label: "User Management",
    href: "user-management.html",
    icon: "users",
    roles: ["ADMIN"],
  },
  {
    key: "audit-logs",
    label: "Audit Logs",
    href: "audit-logs.html",
    icon: "shield",
    roles: ["ADMIN"],
  },
];

const ACCOUNT_NAV_ITEMS = [
  {
    key: "notifications",
    label: "Notifications",
    href: "notifications.html",
    icon: "bell",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "profile",
    label: "Profile",
    href: "profile.html",
    icon: "user",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
  {
    key: "settings",
    label: "Settings",
    href: "settings.html",
    icon: "settings",
    roles: ["ADMIN", "MANAGER", "EMPLOYEE"],
  },
];

const ALL_NAV_ITEMS = [
  ...NAV_ITEMS,
  ...ACCOUNT_NAV_ITEMS,
];

const ROLE_LABELS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};


/* ==========================================================================
   LAYOUT OBJECT
   ========================================================================== */

const Layout = {

  /* ------------------------------------------------------------------------
     INITIALIZATION
     ------------------------------------------------------------------------ */

  async init(pageKey, titleOverride) {

    if (
      typeof Auth === "undefined" ||
      typeof Auth.isLoggedIn !== "function"
    ) {
      console.error("Auth is not available.");
      return null;
    }

    if (!Auth.isLoggedIn()) {
      window.location.href = "login.html";
      return null;
    }


    /* Apply stored theme immediately. */

    applyTheme(getStoredTheme());


    let user =
      typeof Auth.getUser === "function"
        ? Auth.getUser()
        : null;


    /* ----------------------------------------------------------------------
       Cached-role page guard
       ---------------------------------------------------------------------- */

    if (
      user &&
      this.isBlocked(pageKey, user.role)
    ) {
      this.redirectUnauthorized();

      /*
       * Never allow the page to continue initialization
       * while the browser is navigating away.
       */
      return new Promise(() => {});
    }


    /* ----------------------------------------------------------------------
       Render global shell
       ---------------------------------------------------------------------- */

    this.renderSidebar(
      pageKey,
      user ? user.role : null
    );

    /*
     * IMPORTANT:
     * Topbar is rendered only once.
     */
    this.renderTopbar(
      pageKey,
      user,
      titleOverride
    );


    /*
     * Wire the newly-created topbar controls.
     */
    this.wireGlobalControls();


    consumeFlash();


    /* ----------------------------------------------------------------------
       Refresh user from backend
       ---------------------------------------------------------------------- */

    try {

      const freshUser =
        await Api.get("/auth/me/");

      if (freshUser) {
        user = freshUser;

        Auth.setUser(user);
      }


      if (
        !user ||
        user.is_active === false
      ) {

        toast(
          "Your account has been deactivated. Please contact an administrator.",
          "error",
          8000
        );

        setTimeout(
          () => this.logout(),
          1500
        );

        return null;
      }


      /*
       * Update sidebar because role may have changed.
       *
       * DO NOT renderTopbar() here.
       *
       * Re-rendering the topbar would replace:
       * #theme-toggle
       * #notif-bell
       * #user-chip-toggle
       * #user-menu
       *
       * and would destroy their existing event handlers.
       */
      this.renderSidebar(
        pageKey,
        user.role
      );


      /*
       * Update the existing theme button only.
       */
      this.updateThemeButton();


      /*
       * Check server-side role again.
       */
      if (
        this.isBlocked(
          pageKey,
          user.role
        )
      ) {

        this.redirectUnauthorized();

        return new Promise(() => {});
      }

    } catch (error) {

      /*
       * If /auth/me/ fails for a non-authentication reason,
       * continue using cached user information.
       */
      console.warn(
        "Unable to refresh current user:",
        error
      );
    }


    /*
     * Notification badge is non-critical.
     */
    this.refreshUnreadBadge();


    return user;
  },


  /* ------------------------------------------------------------------------
     PAGE GUARDS
     ------------------------------------------------------------------------ */

  isBlocked(pageKey, role) {

    const item =
      ALL_NAV_ITEMS.find(
        (entry) =>
          entry.key === pageKey
      );

    return !!(
      item &&
      !item.roles.includes(role)
    );
  },


  enforcePageGuard(
    pageKey,
    role
  ) {

    if (
      this.isBlocked(
        pageKey,
        role
      )
    ) {

      this.redirectUnauthorized();
    }
  },


  redirectUnauthorized() {

    sessionStorage.setItem(
      "opsflow_flash",
      JSON.stringify({
        type: "warning",
        message:
          "You do not have permission to view that page.",
      })
    );

    window.location.href =
      "dashboard.html";
  },


  /* ==========================================================================
     SIDEBAR
     ========================================================================== */

  renderSidebar(
    activeKey,
    role
  ) {

    const el =
      document.getElementById(
        "sidebar"
      );

    if (!el) {
      return;
    }


    const visible =
      (items) =>
        items.filter(
          (item) =>
            !role ||
            item.roles.includes(role)
        );


    const renderLinks =
      (items) =>

        items
          .map(
            (item) => `

              <li>

                <a
                  href="${item.href}"
                  class="${
                    item.key === activeKey
                      ? "active"
                      : ""
                  }"
                >

                  ${
                    Icons[item.icon] ||
                    ""
                  }

                  <span>
                    ${escapeHtml(
                      item.label
                    )}
                  </span>

                </a>

              </li>

            `
          )
          .join("");


    el.innerHTML = `

      <div class="sidebar-brand">

        <span class="logo-mark">
          OF
        </span>

        OpsFlow

      </div>


      <div class="nav-section-label">
        Workspace
      </div>


      <ul class="nav-list">

        ${renderLinks(
          visible(NAV_ITEMS)
        )}

      </ul>


      <div class="nav-section-label">
        Account
      </div>


      <ul class="nav-list">

        ${renderLinks(
          visible(
            ACCOUNT_NAV_ITEMS
          )
        )}

      </ul>


      <div class="sidebar-foot">

        Signed in as ${
          role
            ? (
                ROLE_LABELS[role] ||
                role
              )
            : "..."

        }

      </div>

    `;
  },


  /* ==========================================================================
     TOPBAR
     ========================================================================== */

  renderTopbar(
    pageKey,
    user,
    titleOverride
  ) {

    const el =
      document.getElementById(
        "topbar"
      );

    if (!el) {
      return;
    }


    const item =
      ALL_NAV_ITEMS.find(
        (entry) =>
          entry.key === pageKey
      );


    const title =
      titleOverride ||
      (
        item
          ? item.label
          : "OpsFlow"
      );


    const name =
      user
        ? (
            user.first_name
              ? `${user.first_name} ${
                  user.last_name || ""
                }`.trim()
              : user.email
          )
        : "...";


    const role =
      user
        ? (
            ROLE_LABELS[user.role] ||
            user.role
          )
        : "";


    el.innerHTML = `

      <div
        class="flex"
        style="
          align-items:center;
          gap:14px;
        "
      >

        <button
          class="icon-btn hidden"
          id="mobile-nav-toggle"
          aria-label="Menu"
          type="button"
        >
          ${
            Icons.chevronDown ||
            ""
          }
        </button>


        <div class="topbar-title">

          ${escapeHtml(title)}

        </div>

      </div>


      <div class="topbar-actions">


        <!-- ===============================================================
             THEME
             =============================================================== -->

        <button
          class="icon-btn"
          id="theme-toggle"
          title="Toggle dark mode"
          aria-label="Toggle dark mode"
          type="button"
        ></button>


        <!-- ===============================================================
             NOTIFICATIONS
             =============================================================== -->

        <div class="dropdown-wrap">

          <button
            class="icon-btn"
            id="notif-bell"
            aria-label="Notifications"
            aria-expanded="false"
            aria-haspopup="true"
            type="button"
          >

            ${
              Icons.bell ||
              ""
            }


            <span
              class="badge-dot hidden"
              id="notif-dot"
            ></span>

          </button>


          <div
            class="dropdown-panel"
            id="notif-panel"
          >

            <div class="dropdown-panel-head">

              <span>
                Notifications
              </span>


              <button
                class="btn btn-ghost btn-sm"
                id="notif-mark-all"
                type="button"
              >
                Mark all read
              </button>

            </div>


            <div id="notif-panel-body">

              <div class="loading-row">

                <span class="spinner"></span>

                Loading...

              </div>

            </div>

          </div>

        </div>


        <!-- ===============================================================
             USER MENU
             =============================================================== -->

        <div class="dropdown-wrap">

          <button
            class="user-chip"
            id="user-chip-toggle"
            type="button"
            aria-expanded="false"
            aria-haspopup="true"
          >

            <div class="avatar">

              ${initials(name)}

            </div>


            <div class="user-chip-info">

              <div class="name">

                ${escapeHtml(name)}

              </div>


              <div class="role">

                ${escapeHtml(role)}

              </div>

            </div>


            ${
              Icons.chevronDown ||
              ""
            }

          </button>


          <div
            class="dropdown-menu"
            id="user-menu"
          >

            <a href="profile.html">

              ${
                Icons.user ||
                ""
              }

              Profile

            </a>


            <a href="settings.html">

              ${
                Icons.settings ||
                ""
              }

              Settings

            </a>


            <hr>


            <button
              id="logout-btn"
              type="button"
            >

              ${
                Icons.logout ||
                ""
              }

              Log out

            </button>

          </div>

        </div>

      </div>

    `;


    this.updateThemeButton();
  },


  /* ==========================================================================
     THEME BUTTON
     ========================================================================== */

  updateThemeButton() {

    const button =
      document.getElementById(
        "theme-toggle"
      );

    if (!button) {
      return;
    }


    const dark =
      getStoredTheme() === "dark";


    button.innerHTML =
      dark
        ? Icons.sun
        : Icons.moon;


    button.title =
      dark
        ? "Switch to light mode"
        : "Switch to dark mode";


    button.setAttribute(
      "aria-label",
      dark
        ? "Switch to light mode"
        : "Switch to dark mode"
    );
  },


  /* ==========================================================================
     GLOBAL EVENT HANDLERS
     ========================================================================== */

  wireGlobalControls() {

    const themeButton =
      document.getElementById(
        "theme-toggle"
      );

    const logoutButton =
      document.getElementById(
        "logout-btn"
      );

    const userToggle =
      document.getElementById(
        "user-chip-toggle"
      );

    const userMenu =
      document.getElementById(
        "user-menu"
      );

    const bell =
      document.getElementById(
        "notif-bell"
      );

    const notifPanel =
      document.getElementById(
        "notif-panel"
      );

    const markAll =
      document.getElementById(
        "notif-mark-all"
      );


    /* ----------------------------------------------------------------------
       THEME
       ---------------------------------------------------------------------- */

    if (
      themeButton &&
      !themeButton.dataset.bound
    ) {

      themeButton.dataset.bound =
        "true";


      themeButton.addEventListener(
        "click",
        (event) => {

          event.preventDefault();
          event.stopPropagation();


          const next =
            getStoredTheme() === "dark"
              ? "light"
              : "dark";


          applyTheme(next);

          this.updateThemeButton();


          /*
           * Ask charts to redraw using
           * the new theme colors.
           */
          if (
            window.OpsFlowCharts &&
            typeof
              window.OpsFlowCharts
                .refreshTheme ===
                "function"
          ) {

            window.OpsFlowCharts
              .refreshTheme();

          } else if (
            typeof
              window.refreshDashboardChartsForTheme ===
              "function"
          ) {

            window.refreshDashboardChartsForTheme();
          }

        }
      );
    }


    /* ----------------------------------------------------------------------
       LOGOUT
       ---------------------------------------------------------------------- */

    if (
      logoutButton &&
      !logoutButton.dataset.bound
    ) {

      logoutButton.dataset.bound =
        "true";


      logoutButton.addEventListener(
        "click",
        (event) => {

          event.preventDefault();
          event.stopPropagation();

          this.logout();

        }
      );
    }


    /* ----------------------------------------------------------------------
       USER DROPDOWN
       ---------------------------------------------------------------------- */

    if (
      userToggle &&
      userMenu &&
      !userToggle.dataset.bound
    ) {

      userToggle.dataset.bound =
        "true";


      userToggle.addEventListener(
        "click",
        (event) => {

          event.preventDefault();
          event.stopPropagation();


          const shouldOpen =
            !userMenu.classList.contains(
              "open"
            );


          this.closeNotifications();


          userMenu.classList.toggle(
            "open",
            shouldOpen
          );


          userToggle.setAttribute(
            "aria-expanded",
            String(shouldOpen)
          );

        }
      );
    }


    /* ----------------------------------------------------------------------
       NOTIFICATIONS
       ---------------------------------------------------------------------- */

    if (
      bell &&
      notifPanel &&
      !bell.dataset.bound
    ) {

      bell.dataset.bound =
        "true";


      bell.addEventListener(
        "click",
        async (event) => {

          event.preventDefault();
          event.stopPropagation();


          const shouldOpen =
            !notifPanel.classList.contains(
              "open"
            );


          this.closeUserMenu();


          notifPanel.classList.toggle(
            "open",
            shouldOpen
          );


          bell.setAttribute(
            "aria-expanded",
            String(shouldOpen)
          );


          if (shouldOpen) {

            await this.loadNotifPanel();

          }

        }
      );
    }


    /* ----------------------------------------------------------------------
       MARK ALL READ
       ---------------------------------------------------------------------- */

    if (
      markAll &&
      !markAll.dataset.bound
    ) {

      markAll.dataset.bound =
        "true";


      markAll.addEventListener(
        "click",
        async (event) => {

          event.preventDefault();
          event.stopPropagation();


          try {

            markAll.disabled =
              true;

            markAll.textContent =
              "Updating...";


            await Api.post(
              "/notifications/mark-all-read/"
            );


            await this.loadNotifPanel();

            await this.refreshUnreadBadge();


            if (
              typeof toast ===
              "function"
            ) {

              toast(
                "All notifications marked as read.",
                "success"
              );
            }


          } catch (error) {

            console.error(
              "Mark all notifications error:",
              error
            );


            if (
              typeof toastError ===
              "function"
            ) {

              toastError(error);
            }


          } finally {

            markAll.disabled =
              false;

            markAll.textContent =
              "Mark all read";
          }

        }
      );
    }


    /* ----------------------------------------------------------------------
       SINGLE OUTSIDE CLICK LISTENER
       ---------------------------------------------------------------------- */

    if (
      !document.body.dataset
        .opsflowLayoutClickBound
    ) {

      document.body.dataset
        .opsflowLayoutClickBound =
        "true";


      document.addEventListener(
        "click",
        (event) => {

          const currentUserToggle =
            document.getElementById(
              "user-chip-toggle"
            );

          const currentUserMenu =
            document.getElementById(
              "user-menu"
            );

          const currentBell =
            document.getElementById(
              "notif-bell"
            );

          const currentNotifPanel =
            document.getElementById(
              "notif-panel"
            );


          /* User menu */

          if (
            currentUserToggle &&
            currentUserMenu &&
            !currentUserToggle.contains(
              event.target
            ) &&
            !currentUserMenu.contains(
              event.target
            )
          ) {

            currentUserMenu.classList.remove(
              "open"
            );

            currentUserToggle.setAttribute(
              "aria-expanded",
              "false"
            );
          }


          /* Notification panel */

          if (
            currentBell &&
            currentNotifPanel &&
            !currentBell.contains(
              event.target
            ) &&
            !currentNotifPanel.contains(
              event.target
            )
          ) {

            currentNotifPanel.classList.remove(
              "open"
            );

            currentBell.setAttribute(
              "aria-expanded",
              "false"
            );
          }

        }
      );
    }
  },


  /* ==========================================================================
     CLOSE MENUS
     ========================================================================== */

  closeUserMenu() {

    const menu =
      document.getElementById(
        "user-menu"
      );

    const toggle =
      document.getElementById(
        "user-chip-toggle"
      );


    if (menu) {
      menu.classList.remove(
        "open"
      );
    }


    if (toggle) {

      toggle.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  },


  closeNotifications() {

    const panel =
      document.getElementById(
        "notif-panel"
      );

    const bell =
      document.getElementById(
        "notif-bell"
      );


    if (panel) {

      panel.classList.remove(
        "open"
      );
    }


    if (bell) {

      bell.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  },


  /* ==========================================================================
     UNREAD NOTIFICATION BADGE
     ========================================================================== */

  async refreshUnreadBadge() {

    try {

      const response =
        await Api.get(
          "/notifications/unread-count/"
        );


      const dot =
        document.getElementById(
          "notif-dot"
        );


      if (!dot) {
        return;
      }


      const count =
        Number(
          response?.unread_count || 0
        );


      dot.classList.toggle(
        "hidden",
        count <= 0
      );

    } catch (error) {

      /*
       * Notifications are optional UI.
       * Never break the dashboard because
       * notification API is unavailable.
       */

      console.warn(
        "Unread notification count unavailable:",
        error
      );
    }
  },


  /* ==========================================================================
     NOTIFICATION PANEL
     ========================================================================== */

  async loadNotifPanel() {

    const body =
      document.getElementById(
        "notif-panel-body"
      );


    if (!body) {
      return;
    }


    body.innerHTML = `

      <div class="loading-row">

        <span class="spinner"></span>

        Loading...

      </div>

    `;


    try {

      const response =
        await Api.get(
          "/notifications/",
          {
            page_size: 8,
          }
        );


      const items =
        Array.isArray(response)
          ? response
          : (
              Array.isArray(
                response?.results
              )
                ? response.results
                : []
            );


      if (!items.length) {

        body.innerHTML = `

          <div
            class="empty-state"
            style="padding:32px 16px;"
          >

            <div class="empty-icon">

              ${
                Icons.bell ||
                ""
              }

            </div>


            <p>
              No notifications yet.
            </p>

          </div>

        `;

        return;
      }


      body.innerHTML =
        items
          .map(
            (notification) => {

              const unread =
                !notification.is_read;


              return `

                <a
                  href="notifications.html"
                  style="
                    display:block;
                    padding:12px 14px;
                    border-bottom:1px solid var(--border-soft);
                    ${
                      unread
                        ? "background:var(--brand-tint);"
                        : ""
                    }
                  "
                >

                  <div
                    class="text-sm"
                    style="
                      color:var(--ink);
                    "
                  >

                    ${escapeHtml(
                      notification.verb ||
                        notification.message ||
                        "Notification"
                    )}

                  </div>


                  <div
                    class="text-sm"
                    style="
                      color:var(--ink-faint);
                      margin-top:2px;
                    "
                  >

                    ${
                      typeof timeAgo ===
                      "function"
                        ? timeAgo(
                            notification.created_at
                          )
                        : ""
                    }

                  </div>

                </a>

              `;
            }
          )
          .join("");


    } catch (error) {

      console.error(
        "Notification panel error:",
        error
      );


      body.innerHTML = `

        <div
          class="empty-state"
          style="padding:32px 16px;"
        >

          <p>
            Couldn't load notifications.
          </p>


          <button
            class="btn btn-outline btn-sm"
            id="retry-notifications"
            type="button"
          >
            Retry
          </button>

        </div>

      `;


      document
        .getElementById(
          "retry-notifications"
        )
        ?.addEventListener(
          "click",
          () =>
            this.loadNotifPanel()
        );
    }
  },


  /* ==========================================================================
     LOGOUT
     ========================================================================== */

  async logout() {

    try {

      const refresh =
        typeof Auth.getRefresh ===
        "function"
          ? Auth.getRefresh()
          : null;


      if (refresh) {

        await Api.post(
          "/auth/logout/",
          {
            refresh: refresh,
          }
        );
      }

    } catch (error) {

      console.warn(
        "Backend logout request failed; clearing local session.",
        error
      );
    }


    Auth.clear();


    window.location.href =
      "login.html";
  },
};


/* ==========================================================================
   THEME HELPERS
   ========================================================================== */

function getStoredTheme() {

  const stored =
    localStorage.getItem(
      "opsflow_theme"
    );


  return stored === "dark"
    ? "dark"
    : "light";
}


function applyTheme(theme) {

  const normalized =
    theme === "dark"
      ? "dark"
      : "light";


  document.documentElement.setAttribute(
    "data-theme",
    normalized
  );


  localStorage.setItem(
    "opsflow_theme",
    normalized
  );


  /*
   * Update visible button if the
   * topbar already exists.
   */
  if (
    typeof Layout !==
    "undefined"
  ) {

    Layout.updateThemeButton();
  }


  /*
   * Tell the chart renderer that
   * CSS/theme colors changed.
   */
  if (
    window.OpsFlowCharts &&
    typeof
      window.OpsFlowCharts.refreshTheme ===
      "function"
  ) {

    window.OpsFlowCharts.refreshTheme();
  }
}


/* ==========================================================================
   Apply theme immediately
   ========================================================================== */

applyTheme(
  getStoredTheme()
);