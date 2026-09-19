/* ==========================================================================
   OpsFlow - Dashboard
   Real dashboard data + interactive growth/distribution charts.
   ========================================================================== */

(function () {
  "use strict";

  let currentRange = "30d";
  let currentDistType = "projects";

  /* ------------------------------------------------------------------------
     INITIALIZATION
     ------------------------------------------------------------------------ */

  async function initializeDashboard() {
    await Layout.init("dashboard");

    const user = Auth.getUser();

    const welcomeTitle =
      document.getElementById("welcome-title");

    if (welcomeTitle) {
      const firstName =
        user && user.first_name
          ? user.first_name
          : "";

      welcomeTitle.textContent =
        firstName
          ? `Welcome back, ${firstName}`
          : "Welcome back";
    }

    normalizeGrowthRangeButtons();

    bindKpiLinks();
    bindGrowthControls();
    bindDistributionControls();

    await Promise.allSettled([
      loadOverview(),
      loadGrowth(currentRange),
      loadDistribution(currentDistType),
      loadRecentActivity(),
    ]);
  }

  /* ------------------------------------------------------------------------
     RANGE LABELS
     ------------------------------------------------------------------------ */

  function normalizeGrowthRangeButtons() {
    const oldOneMonth =
      document.querySelector(
        '#growth-range-toggle button[data-range="1m"]'
      );

    if (oldOneMonth) {
      oldOneMonth.dataset.range = "3m";
      oldOneMonth.textContent = "3M";
    }

    const buttons =
      document.querySelectorAll(
        "#growth-range-toggle button"
      );

    buttons.forEach((button) => {
      button.type = "button";

      if (button.dataset.range === currentRange) {
        button.classList.add("active");
      }
    });
  }

  /* ------------------------------------------------------------------------
     KPI LINKS
     ------------------------------------------------------------------------ */

  const STAT_LINKS = {
    organizations: "organizations.html",
    clients: "clients.html",
    projects: "projects.html",
    tasks: "tasks.html",
  };

  function bindKpiLinks() {
    document.addEventListener(
      "click",
      function (event) {
        const card =
          event.target.closest(
            ".stat-card-clickable"
          );

        if (!card) return;

        const href = card.dataset.statLink;

        if (href) {
          window.location.href = href;
        }
      }
    );

    document.addEventListener(
      "keydown",
      function (event) {
        if (
          event.key !== "Enter" &&
          event.key !== " "
        ) {
          return;
        }

        const card =
          event.target.closest(
            ".stat-card-clickable"
          );

        if (!card) return;

        event.preventDefault();

        const href = card.dataset.statLink;

        if (href) {
          window.location.href = href;
        }
      }
    );
  }

  /* ------------------------------------------------------------------------
     OVERVIEW
     ------------------------------------------------------------------------ */

  async function loadOverview() {
    const grid =
      document.getElementById(
        "operational-stats"
      );

    if (!grid) return;

    grid.innerHTML = Array(4)
      .fill(
        '<div class="stat-card skeleton" style="height:78px;"></div>'
      )
      .join("");

    try {
      const data =
        await Api.get(
          "/analytics/dashboard/"
        );

      const op =
        data?.operational || {};

      grid.innerHTML = `
        ${statCard(
          "Organizations",
          op.organizations,
          "accent-clients",
          STAT_LINKS.organizations
        )}

        ${statCard(
          "Clients",
          op.clients,
          "accent-clients",
          STAT_LINKS.clients
        )}

        ${statCard(
          "Projects",
          op.projects,
          "accent-projects",
          STAT_LINKS.projects
        )}

        ${statCard(
          "Tasks",
          op.tasks,
          "accent-tasks",
          STAT_LINKS.tasks
        )}
      `;

      const userSection =
        document.getElementById(
          "user-overview-section"
        );

      const userGrid =
        document.getElementById(
          "user-stats"
        );

      if (
        data?.users &&
        userSection &&
        userGrid
      ) {
        userSection.classList.remove(
          "hidden"
        );

        const u = data.users;

        userGrid.innerHTML = `
          ${statCard(
            "Total Users",
            u.total_users,
            "",
            "user-management.html"
          )}

          ${statCard(
            "Employees",
            u.employees,
            "",
            "user-management.html?role=EMPLOYEE"
          )}

          ${statCard(
            "Managers",
            u.managers,
            "",
            "user-management.html?role=MANAGER"
          )}

          ${statCard(
            "Active Users",
            u.active_users,
            "accent-tasks",
            "user-management.html?is_active=true"
          )}

          ${statCard(
            "Inactive Users",
            u.inactive_users,
            "accent-warn",
            "user-management.html?is_active=false"
          )}
        `;
      } else if (userSection) {
        userSection.classList.add(
          "hidden"
        );
      }
    } catch (err) {
      grid.innerHTML = `
        <div
          class="empty-state"
          style="grid-column:1/-1;"
        >
          <p>
            Unable to load dashboard metrics.
          </p>
        </div>
      `;

      toastError(err);
    }
  }

  function statCard(
    label,
    value,
    accentClass = "",
    href = null
  ) {
    const clickable = Boolean(href);

    return `
      <div
        class="stat-card ${accentClass}"
        ${
          clickable
            ? `data-stat-link="${escapeHtml(
                href
              )}"`
            : ""
        }
        ${
          clickable
            ? "stat-card-clickable"
            : ""
        }
        tabindex="${clickable ? "0" : "-1"}"
        role="${clickable ? "link" : ""}"
      >
        <div class="stat-label">
          ${escapeHtml(label)}
        </div>

        <div class="stat-value">
          ${value ?? 0}
        </div>
      </div>
    `;
  }

  /* ------------------------------------------------------------------------
     GROWTH CONTROLS
     ------------------------------------------------------------------------ */

  function bindGrowthControls() {
    const growthToggle =
      document.getElementById(
        "growth-range-toggle"
      );

    if (!growthToggle) return;

    growthToggle.addEventListener(
      "click",
      function (event) {
        const button =
          event.target.closest(
            "button[data-range]"
          );

        if (!button) return;

        growthToggle
          .querySelectorAll("button")
          .forEach((item) =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add("active");

        currentRange =
          button.dataset.range;

        loadGrowth(currentRange);
      }
    );
  }

  /* ------------------------------------------------------------------------
     GROWTH
     ------------------------------------------------------------------------ */

  async function loadGrowth(range) {
    const canvas =
      document.getElementById(
        "growth-chart"
      );

    if (!canvas) return;

    showChartLoading(
      canvas,
      "Loading growth data..."
    );

    try {
      const data =
        await Api.get(
          "/analytics/growth/",
          { range }
        );

      if (
        !window.OpsFlowCharts ||
        typeof OpsFlowCharts.renderGrowth !==
          "function"
      ) {
        throw new Error(
          "Interactive chart renderer is not loaded."
        );
      }

      OpsFlowCharts.renderGrowth(
        canvas,
        data
      );
    } catch (err) {
      console.error(
        "Growth chart error:",
        err
      );

      showChartMessage(
        canvas,
        "Unable to load growth data."
      );

      toastError(err);
    }
  }

  /* ------------------------------------------------------------------------
     DISTRIBUTION CONTROLS
     ------------------------------------------------------------------------ */

  function bindDistributionControls() {
    const distToggle =
      document.getElementById(
        "dist-type-toggle"
      );

    if (!distToggle) return;

    distToggle.addEventListener(
      "click",
      function (event) {
        const button =
          event.target.closest(
            "button[data-type]"
          );

        if (!button) return;

        distToggle
          .querySelectorAll("button")
          .forEach((item) =>
            item.classList.remove(
              "active"
            )
          );

        button.classList.add("active");

        currentDistType =
          button.dataset.type;

        loadDistribution(
          currentDistType
        );
      }
    );
  }

  /* ------------------------------------------------------------------------
     DISTRIBUTION
     ------------------------------------------------------------------------ */

  async function loadDistribution(type) {
    const canvas =
      document.getElementById(
        "distribution-chart"
      );

    if (!canvas) return;

    showChartLoading(
      canvas,
      "Loading..."
    );

    try {
      const data =
        await Api.get(
          "/analytics/distribution/",
          { type }
        );

      if (
        !window.OpsFlowCharts ||
        typeof OpsFlowCharts.renderDistribution !==
          "function"
      ) {
        throw new Error(
          "Interactive chart renderer is not loaded."
        );
      }

      OpsFlowCharts.renderDistribution(
        canvas,
        data
      );

      renderDistributionBreakdown(
        type,
        data
      );
    } catch (err) {
      console.error(
        "Distribution chart error:",
        err
      );

      showChartMessage(
        canvas,
        "Unable to load distribution data."
      );

      toastError(err);
    }
  }

  function renderDistributionBreakdown(
    type,
    data
  ) {
    const container =
      document.getElementById(
        "distribution-breakdown"
      );

    if (!container) return;

    const breakdown =
      data?.breakdown || {};

    const labels =
      Object.keys(breakdown);

    const values =
      Object.values(breakdown);

    if (!labels.length) {
      container.innerHTML = `
        <div class="empty-state">
          No ${escapeHtml(type)}
          data available.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div
        class="flex-between text-sm distribution-total"
      >
        <span>
          Total ${escapeHtml(type)}
        </span>

        <span>
          ${data?.total ?? 0}
        </span>
      </div>

      ${labels
        .map(
          (label, index) => `
            <div
              class="flex-between text-sm distribution-row"
              data-distribution-label="${escapeHtml(
                label
              )}"
            >
              <span>
                ${statusBadge(label)}
              </span>

              <span>
                ${values[index] ?? 0}
              </span>
            </div>
          `
        )
        .join("")}
    `;
  }

  /* ------------------------------------------------------------------------
     RECENT ACTIVITY
     ------------------------------------------------------------------------ */

  /* ------------------------------------------------------------------------
   RECENT ACTIVITY
   ------------------------------------------------------------------------ */

async function loadRecentActivity() {
  const element = document.getElementById(
    "recent-activity-list"
  );

  if (!element) return;

  element.innerHTML = `
    <div class="loading-row">
      <span class="spinner"></span>
      Loading...
    </div>
  `;

  try {
    const items = await Api.get(
      "/analytics/recent-activity/",
      { limit: 10 }
    );

    if (!Array.isArray(items) || !items.length) {
      element.innerHTML = `
        <div
          class="empty-state"
          style="padding:30px;"
        >
          <div class="empty-icon">
            ${Icons.history || ""}
          </div>

          <p>
            No recent activity yet.
          </p>
        </div>
      `;

      return;
    }

    element.innerHTML = items
      .map((item) => {

        const actorName =
          String(
            item.actor_name ||
            item.user_name ||
            item.actor ||
            "User"
          ).trim();

        let description =
          String(
            item.description ||
            item.action ||
            ""
          ).trim();

        /*
         * ---------------------------------------------------------------
         * CLEAN LOGIN / LOGOUT ACTIVITY
         * ---------------------------------------------------------------
         *
         * Backend may return:
         *
         * "Deepika Sharma logged in a user"
         * "Deepika Sharma logged out a user"
         * "Deepika Sharma login a user"
         *
         * Dashboard should show:
         *
         * "Deepika Sharma logged in"
         * "Deepika Sharma logged out"
         */

        const lowerDescription =
          description.toLowerCase();

        let activityText = description;

        if (
          lowerDescription.includes("logged out") ||
          lowerDescription.includes("logout")
        ) {
          activityText = `${actorName} logged out`;
        }
        else if (
          lowerDescription.includes("logged in") ||
          lowerDescription.includes("login")
        ) {
          activityText = `${actorName} logged in`;
        }
        else {
          /*
           * For normal activities, keep the backend description.
           * If the backend already contains the actor name,
           * don't add it again.
           */
          activityText = description;

          if (
            !activityText.toLowerCase().startsWith(
              actorName.toLowerCase()
            )
          ) {
            activityText =
              `${actorName} ${activityText}`;
          }
        }

        /*
         * Login / logout indicator
         */
        const lowerActivity =
          activityText.toLowerCase();

        let statusDot = "";

        if (
          lowerActivity.includes("logged in")
        ) {
          statusDot = `
            <span
              class="activity-status-dot activity-status-online"
              title="Logged in"
            ></span>
          `;
        }
        else if (
          lowerActivity.includes("logged out")
        ) {
          statusDot = `
            <span
              class="activity-status-dot activity-status-offline"
              title="Logged out"
            ></span>
          `;
        }

        return `
          <div class="flex-between recent-activity-row">

            <div
              class="flex"
              style="
                gap:10px;
                align-items:center;
                min-width:0;
              "
            >

              <div
                class="avatar"
                style="
                  width:30px;
                  height:30px;
                  min-width:30px;
                  font-size:11px;
                "
              >
                ${initials(actorName)}
              </div>

              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:6px;
                  min-width:0;
                "
              >

                <span
                  class="text-sm recent-activity-text"
                >
                  ${escapeHtml(activityText)}
                </span>

                ${statusDot}

              </div>

            </div>

            <span
              class="text-sm recent-activity-time"
            >
              ${timeAgo(item.timestamp)}
            </span>

          </div>
        `;
      })
      .join("");

  } catch (err) {

    console.error(
      "Recent activity error:",
      err
    );

    element.innerHTML = `
      <p class="text-muted">
        Unable to load recent activity.
      </p>
    `;
  }
}
  /* ------------------------------------------------------------------------
     CHART STATES
     ------------------------------------------------------------------------ */

  function showChartLoading(
    canvas,
    message
  ) {
    if (!canvas) return;

    const wrapper =
      canvas.parentElement;

    if (!wrapper) return;

    let messageElement =
      wrapper.querySelector(
        ".chart-empty"
      );

    if (!messageElement) {
      messageElement =
        document.createElement("div");

      messageElement.className =
        "chart-empty";

      wrapper.appendChild(
        messageElement
      );
    }

    messageElement.textContent =
      message;

    messageElement.classList.remove(
      "hidden"
    );

    canvas.style.visibility =
      "hidden";
  }

  function showChartMessage(
    canvas,
    message
  ) {
    if (!canvas) return;

    const wrapper =
      canvas.parentElement;

    if (!wrapper) return;

    let messageElement =
      wrapper.querySelector(
        ".chart-empty"
      );

    if (!messageElement) {
      messageElement =
        document.createElement("div");

      messageElement.className =
        "chart-empty";

      wrapper.appendChild(
        messageElement
      );
    }

    messageElement.textContent =
      message;

    messageElement.classList.remove(
      "hidden"
    );

    canvas.style.visibility =
      "hidden";
  }

  /* ------------------------------------------------------------------------
     DISTRIBUTION ROW INTERACTION
     ------------------------------------------------------------------------ */

  document.addEventListener(
    "click",
    function (event) {
      const row =
        event.target.closest(
          ".distribution-row"
        );

      if (!row) return;

      document
        .querySelectorAll(
          ".distribution-row"
        )
        .forEach((item) =>
          item.classList.remove(
            "distribution-selected"
          )
        );

      row.classList.add(
        "distribution-selected"
      );
    }
  );

  /* ------------------------------------------------------------------------
     THEME REFRESH
     ------------------------------------------------------------------------ */

  window.refreshDashboardChartsForTheme =
    function () {
      if (
        window.OpsFlowCharts &&
        typeof OpsFlowCharts.refreshTheme ===
          "function"
      ) {
        OpsFlowCharts.refreshTheme();
      }
    };

  initializeDashboard().catch((error) => {
    console.error(
      "Dashboard initialization error:",
      error
    );
  });
})();