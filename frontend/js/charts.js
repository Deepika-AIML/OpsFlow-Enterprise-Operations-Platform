/* ==========================================================================
   OpsFlow - Interactive Canvas Charts
   No external chart library required.
   ========================================================================== */

(function () {
  "use strict";

  const chartStates = new WeakMap();

  const SERIES_META = {
    users: {
      label: "Users",
      color: "--info",
    },
    organizations: {
      label: "Organizations",
      color: "--brand",
    },
    projects: {
      label: "Projects",
      color: "--accent",
    },
    tasks: {
      label: "Tasks",
      color: "--success",
    },
  };

  function cssVar(name, fallback) {
    const value =
      getComputedStyle(
        document.documentElement
      )
        .getPropertyValue(name)
        .trim();

    return value || fallback;
  }

  function numberFormat(value) {
    return new Intl.NumberFormat(
      "en-IN"
    ).format(value);
  }

  function normalizeGrowth(payload) {
    const rows =
      Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

    let series =
      Array.isArray(payload?.series)
        ? payload.series
        : [];

    if (!series.length && rows.length) {
      series = [
        {
          key: "users",
          label: "Users",
        },
        {
          key: "organizations",
          label: "Organizations",
        },
        {
          key: "projects",
          label: "Projects",
        },
        {
          key: "tasks",
          label: "Tasks",
        },
      ];
    }

    const activeSeries =
      series.filter(
        (item) =>
          item &&
          item.key &&
          rows.some(
            (row) =>
              Number(row[item.key]) > 0
          )
      );

    return {
      rows,
      series: activeSeries,
      hasData:
        Boolean(payload?.has_data) ||
        rows.some((row) =>
          series.some(
            (item) =>
              Number(row[item.key]) > 0
          )
        ),
    };
  }

  function getCanvasSize(canvas) {
    const rect =
      canvas.getBoundingClientRect();

    return {
      width: Math.max(
        320,
        Math.round(rect.width)
      ),
      height: Math.max(
        220,
        Math.round(rect.height)
      ),
    };
  }

  function prepareCanvas(
    canvas,
    width,
    height
  ) {
    const ratio =
      window.devicePixelRatio || 1;

    canvas.width =
      Math.round(width * ratio);

    canvas.height =
      Math.round(height * ratio);

    canvas.style.width =
      `${width}px`;

    canvas.style.height =
      `${height}px`;

    const context =
      canvas.getContext("2d");

    context.setTransform(
      ratio,
      0,
      0,
      ratio,
      0,
      0
    );

    return context;
  }

  function clearChartMessage(canvas) {
    const wrapper =
      canvas.parentElement;

    if (!wrapper) return;

    const message =
      wrapper.querySelector(
        ".chart-empty"
      );

    if (message) {
      message.classList.add(
        "hidden"
      );
    }

    canvas.style.visibility =
      "visible";
  }

  function ensureTooltip(canvas) {
    const wrapper =
      canvas.parentElement;

    if (!wrapper) return null;

    if (
      getComputedStyle(wrapper)
        .position === "static"
    ) {
      wrapper.style.position =
        "relative";
    }

    let tooltip =
      wrapper.querySelector(
        ".opsflow-chart-tooltip"
      );

    if (!tooltip) {
      tooltip =
        document.createElement("div");

      tooltip.className =
        "opsflow-chart-tooltip";

      tooltip.style.position =
        "absolute";

      tooltip.style.display =
        "none";

      tooltip.style.pointerEvents =
        "none";

      tooltip.style.padding =
        "8px 10px";

      tooltip.style.border =
        "1px solid var(--border)";

      tooltip.style.borderRadius =
        "7px";

      tooltip.style.background =
        "var(--surface)";

      tooltip.style.color =
        "var(--ink)";

      tooltip.style.boxShadow =
        "var(--shadow-2)";

      tooltip.style.fontSize =
        "12px";

      tooltip.style.lineHeight =
        "1.45";

      tooltip.style.zIndex =
        "5";

      wrapper.appendChild(
        tooltip
      );
    }

    return tooltip;
  }

  function hideTooltip(canvas) {
    const wrapper =
      canvas.parentElement;

    const tooltip =
      wrapper?.querySelector(
        ".opsflow-chart-tooltip"
      );

    if (tooltip) {
      tooltip.style.display =
        "none";
    }
  }

  function showTooltip(
    canvas,
    state,
    index,
    x,
    y
  ) {
    const tooltip =
      ensureTooltip(canvas);

    if (!tooltip) return;

    const row =
      state.rows[index];

    if (!row) return;

    const lines =
      state.series.map(
        (series) => {
          const value =
            Number(
              row[series.key] || 0
            );

          return `
            <div>
              <strong>
                ${escapeText(
                  series.label
                )}
              </strong>
              ${numberFormat(value)}
            </div>
          `;
        }
      );

    tooltip.innerHTML = `
      <div
        style="
          font-weight:650;
          margin-bottom:4px;
        "
      >
        ${escapeText(
          row.label || row.date || ""
        )}
      </div>

      ${lines.join("")}
    `;

    tooltip.style.display =
      "block";

    const wrapper =
      canvas.parentElement;

    const maxLeft =
      wrapper.clientWidth -
      tooltip.offsetWidth -
      8;

    const left =
      Math.min(
        Math.max(
          8,
          x + 12
        ),
        Math.max(
          8,
          maxLeft
        )
      );

    const top =
      Math.min(
        Math.max(
          8,
          y -
            tooltip.offsetHeight -
            10
        ),
        Math.max(
          8,
          wrapper.clientHeight -
            tooltip.offsetHeight -
            8
        )
      );

    tooltip.style.left =
      `${left}px`;

    tooltip.style.top =
      `${top}px`;
  }

  function drawEmpty(
    canvas,
    message
  ) {
    const { width, height } =
      getCanvasSize(canvas);

    clearChartMessage(canvas);

    const context =
      prepareCanvas(
        canvas,
        width,
        height
      );

    context.clearRect(
      0,
      0,
      width,
      height
    );

    context.fillStyle =
      cssVar(
        "--ink-faint",
        "#7C8798"
      );

    context.font =
      "14px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    context.textAlign =
      "center";

    context.textBaseline =
      "middle";

    context.fillText(
      message,
      width / 2,
      height / 2
    );

    canvas.style.visibility =
      "visible";

    hideTooltip(canvas);
  }

  /* ==========================================================================
     GROWTH CHART
     ========================================================================== */

  function drawGrowth(
    canvas,
    payload
  ) {
    const normalized =
      normalizeGrowth(payload);

    if (
      !normalized.rows.length ||
      !normalized.series.length
    ) {
      drawEmpty(
        canvas,
        "No growth data available yet"
      );

      chartStates.set(canvas, {
        type: "growth",
        rows: [],
        series: [],
      });

      return;
    }

    clearChartMessage(canvas);

    const { width, height } =
      getCanvasSize(canvas);

    const context =
      prepareCanvas(
        canvas,
        width,
        height
      );

    context.clearRect(
      0,
      0,
      width,
      height
    );

    const padding = {
      top: 34,
      right: 18,
      bottom: 36,
      left: 48,
    };

    const plotWidth =
      width -
      padding.left -
      padding.right;

    const plotHeight =
      height -
      padding.top -
      padding.bottom;

    const values =
      normalized.rows.flatMap(
        (row) =>
          normalized.series.map(
            (series) =>
              Number(
                row[series.key] || 0
              )
          )
      );

    const maxValue =
      Math.max(
        1,
        ...values
      );

    const tickCount = 4;

    const gridColor =
      cssVar(
        "--border-soft",
        "#E9EDF1"
      );

    const textColor =
      cssVar(
        "--ink-faint",
        "#7C8798"
      );

    context.lineWidth = 1;
    context.strokeStyle =
      gridColor;

    context.fillStyle =
      textColor;

    context.font =
      "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    context.textAlign =
      "right";

    for (
      let tick = 0;
      tick <= tickCount;
      tick++
    ) {
      const ratio =
        tick / tickCount;

      const y =
        padding.top +
        plotHeight -
        ratio * plotHeight;

      context.beginPath();

      context.moveTo(
        padding.left,
        y
      );

      context.lineTo(
        width -
          padding.right,
        y
      );

      context.stroke();

      const value =
        Math.round(
          ratio * maxValue
        );

      context.fillText(
        numberFormat(value),
        padding.left - 8,
        y + 4
      );
    }

    const xForIndex = (index) => {
      if (
        normalized.rows.length === 1
      ) {
        return (
          padding.left +
          plotWidth / 2
        );
      }

      return (
        padding.left +
        (index /
          (normalized.rows.length - 1)) *
          plotWidth
      );
    };

    const yForValue = (value) =>
      padding.top +
      plotHeight -
      (value / maxValue) *
        plotHeight;

    /* X-axis labels */

    context.fillStyle =
      textColor;

    context.textAlign =
      "center";

    const labelStep =
      normalized.rows.length >
      14
        ? Math.ceil(
            normalized.rows.length /
              7
          )
        : 1;

    normalized.rows.forEach(
      (row, index) => {
        if (
          index % labelStep !== 0 &&
          index !==
            normalized.rows.length - 1
        ) {
          return;
        }

        context.fillText(
          row.label || row.date,
          xForIndex(index),
          height - 12
        );
      }
    );

    /* Lines */

    normalized.series.forEach(
      (series) => {
        const meta =
          SERIES_META[
            series.key
          ] || {};

        const color =
          cssVar(
            meta.color ||
              "--brand",
            "#2F5D62"
          );

        context.beginPath();

        normalized.rows.forEach(
          (row, index) => {
            const x =
              xForIndex(index);

            const y =
              yForValue(
                Number(
                  row[series.key] ||
                    0
                )
              );

            if (index === 0) {
              context.moveTo(
                x,
                y
              );
            } else {
              context.lineTo(
                x,
                y
              );
            }
          }
        );

        context.strokeStyle =
          color;

        context.lineWidth = 2.5;
        context.lineJoin = "round";
        context.lineCap = "round";
        context.stroke();

        /* Points */

        normalized.rows.forEach(
          (row, index) => {
            const x =
              xForIndex(index);

            const y =
              yForValue(
                Number(
                  row[series.key] ||
                    0
                )
              );

            context.beginPath();

            context.arc(
              x,
              y,
              3.2,
              0,
              Math.PI * 2
            );

            context.fillStyle =
              color;

            context.fill();

            context.beginPath();

            context.arc(
              x,
              y,
              1.4,
              0,
              Math.PI * 2
            );

            context.fillStyle =
              cssVar(
                "--surface",
                "#FFFFFF"
              );

            context.fill();
          }
        );
      }
    );

    /* Legend */

    let legendX =
      padding.left;

    const legendY = 15;

    context.font =
      "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    context.textAlign =
      "left";

    normalized.series.forEach(
      (series) => {
        const meta =
          SERIES_META[
            series.key
          ] || {};

        const color =
          cssVar(
            meta.color ||
              "--brand",
            "#2F5D62"
          );

        context.fillStyle =
          color;

        context.beginPath();

        context.arc(
          legendX + 4,
          legendY,
          4,
          0,
          Math.PI * 2
        );

        context.fill();

        context.fillStyle =
          cssVar(
            "--ink-soft",
            "#4B5768"
          );

        context.fillText(
          series.label,
          legendX + 12,
          legendY + 4
        );

        legendX +=
          28 +
          context.measureText(
            series.label
          ).width;
      }
    );

    const state = {
      type: "growth",
      rows: normalized.rows,
      series: normalized.series,
      width,
      height,
      padding,
      xForIndex,
      yForValue,
    };

    chartStates.set(
      canvas,
      state
    );

    bindGrowthInteraction(
      canvas
    );
  }

  function bindGrowthInteraction(
    canvas
  ) {
    if (
      canvas.dataset.interactiveBound
    ) {
      return;
    }

    canvas.dataset.interactiveBound =
      "true";

    canvas.addEventListener(
      "mousemove",
      (event) => {
        const state =
          chartStates.get(canvas);

        if (
          !state ||
          state.type !== "growth" ||
          !state.rows.length
        ) {
          return;
        }

        const rect =
          canvas.getBoundingClientRect();

        const x =
          event.clientX -
          rect.left;

        const firstX =
          state.xForIndex(0);

        const lastX =
          state.xForIndex(
            state.rows.length - 1
          );

        const ratio =
          lastX === firstX
            ? 0
            : (x - firstX) /
              (lastX - firstX);

        const index = Math.max(
          0,
          Math.min(
            state.rows.length - 1,
            Math.round(
              ratio *
                (state.rows.length - 1)
            )
          )
        );

        const pointX =
          state.xForIndex(index);

        let nearestY =
          state.yForValue(0);

        let nearestDistance =
          Infinity;

        state.series.forEach(
          (series) => {
            const y =
              state.yForValue(
                Number(
                  state.rows[index][
                    series.key
                  ] || 0
                )
              );

            const distance =
              Math.abs(
                y -
                  (event.clientY -
                    rect.top)
              );

            if (
              distance <
              nearestDistance
            ) {
              nearestDistance =
                distance;

              nearestY = y;
            }
          }
        );

        showTooltip(
          canvas,
          state,
          index,
          pointX,
          nearestY
        );
      }
    );

    canvas.addEventListener(
      "mouseleave",
      () =>
        hideTooltip(canvas)
    );
  }

  /* ==========================================================================
     DISTRIBUTION CHART
     ========================================================================== */

  function normalizeDistribution(
    payload
  ) {
    const breakdown =
      payload?.breakdown || {};

    return Object.entries(
      breakdown
    )
      .map(
        ([label, value]) => ({
          label,
          value: Number(value) || 0,
        })
      )
      .filter(
        (item) =>
          Number.isFinite(item.value)
      );
  }

  function drawDistribution(
    canvas,
    payload
  ) {
    const items =
      normalizeDistribution(
        payload
      );

    if (!items.length) {
      drawEmpty(
        canvas,
        "No distribution data available"
      );

      chartStates.set(canvas, {
        type: "distribution",
        items: [],
      });

      return;
    }

    clearChartMessage(canvas);

    const { width, height } =
      getCanvasSize(canvas);

    const context =
      prepareCanvas(
        canvas,
        width,
        height
      );

    context.clearRect(
      0,
      0,
      width,
      height
    );

    const padding = {
      top: 18,
      right: 18,
      bottom: 48,
      left: 42,
    };

    const plotWidth =
      width -
      padding.left -
      padding.right;

    const plotHeight =
      height -
      padding.top -
      padding.bottom;

    const maxValue =
      Math.max(
        1,
        ...items.map(
          (item) => item.value
        )
      );

    const gridColor =
      cssVar(
        "--border-soft",
        "#E9EDF1"
      );

    const textColor =
      cssVar(
        "--ink-faint",
        "#7C8798"
      );

    const barGap =
      Math.min(
        18,
        plotWidth /
          Math.max(
            1,
            items.length * 4
          )
      );

    const barWidth =
      Math.max(
        16,
        (plotWidth -
          barGap *
            (items.length - 1)) /
          items.length
      );

    context.strokeStyle =
      gridColor;

    context.fillStyle =
      textColor;

    context.font =
      "11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

    context.textAlign =
      "right";

    for (
      let tick = 0;
      tick <= 4;
      tick++
    ) {
      const ratio =
        tick / 4;

      const y =
        padding.top +
        plotHeight -
        ratio * plotHeight;

      context.beginPath();

      context.moveTo(
        padding.left,
        y
      );

      context.lineTo(
        width -
          padding.right,
        y
      );

      context.stroke();

      context.fillText(
        numberFormat(
          Math.round(
            ratio * maxValue
          )
        ),
        padding.left - 7,
        y + 4
      );
    }

    const bars = [];

    items.forEach(
      (item, index) => {
        const x =
          padding.left +
          index *
            (barWidth + barGap);

        const barHeight =
          (item.value /
            maxValue) *
          plotHeight;

        const y =
          padding.top +
          plotHeight -
          barHeight;

        const color =
          cssVar(
            "--brand",
            "#2F5D62"
          );

        context.fillStyle =
          color;

        context.beginPath();

        if (
          typeof context.roundRect ===
          "function"
        ) {
          context.roundRect(
            x,
            y,
            barWidth,
            barHeight,
            5
          );
        } else {
          context.rect(
            x,
            y,
            barWidth,
            barHeight
          );
        }

        context.fill();

        context.fillStyle =
          textColor;

        context.textAlign =
          "center";

        context.fillText(
          item.label,
          x +
            barWidth / 2,
          height - 15
        );

        bars.push({
          x,
          y,
          width: barWidth,
          height: barHeight,
          item,
        });
      }
    );

    chartStates.set(canvas, {
      type: "distribution",
      items,
      bars,
    });

    bindDistributionInteraction(
      canvas
    );
  }

  function bindDistributionInteraction(
    canvas
  ) {
    if (
      canvas.dataset.interactiveBound
    ) {
      return;
    }

    canvas.dataset.interactiveBound =
      "true";

    canvas.addEventListener(
      "mousemove",
      (event) => {
        const state =
          chartStates.get(canvas);

        if (
          !state ||
          state.type !==
            "distribution"
        ) {
          return;
        }

        const rect =
          canvas.getBoundingClientRect();

        const x =
          event.clientX -
          rect.left;

        const y =
          event.clientY -
          rect.top;

        const bar =
          state.bars.find(
            (item) =>
              x >= item.x &&
              x <=
                item.x +
                  item.width &&
              y >= item.y &&
              y <=
                item.y +
                  item.height
          );

        if (!bar) {
          hideTooltip(canvas);
          return;
        }

        const tooltip =
          ensureTooltip(canvas);

        if (!tooltip) return;

        tooltip.innerHTML = `
          <strong>
            ${escapeText(
              bar.item.label
            )}
          </strong>

          <div>
            ${numberFormat(
              bar.item.value
            )}
          </div>
        `;

        tooltip.style.display =
          "block";

        tooltip.style.left =
          `${Math.min(
            x + 12,
            canvas.clientWidth -
              tooltip.offsetWidth -
              8
          )}px`;

        tooltip.style.top =
          `${Math.max(
            8,
            y -
              tooltip.offsetHeight -
              10
          )}px`;
      }
    );

    canvas.addEventListener(
      "mouseleave",
      () =>
        hideTooltip(canvas)
    );
  }

  /* ==========================================================================
     HELPERS
     ========================================================================== */

  function escapeText(value) {
    return String(value ?? "")
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  }

  function renderGrowth(
    canvas,
    payload
  ) {
    if (!canvas) return;

    drawGrowth(
      canvas,
      payload
    );
  }

  function renderDistribution(
    canvas,
    payload
  ) {
    if (!canvas) return;

    drawDistribution(
      canvas,
      payload
    );
  }

  function refreshTheme() {
    document
      .querySelectorAll(
        "#growth-chart"
      )
      .forEach((canvas) => {
        const state =
          chartStates.get(canvas);

        if (
          state &&
          state.type === "growth"
        ) {
          drawGrowth(
            canvas,
            {
              data: state.rows,
              series: state.series,
              has_data:
                state.rows.length > 0,
            }
          );
        }
      });

    document
      .querySelectorAll(
        "#distribution-chart"
      )
      .forEach((canvas) => {
        const state =
          chartStates.get(canvas);

        if (
          state &&
          state.type ===
            "distribution"
        ) {
          drawDistribution(
            canvas,
            {
              breakdown:
                Object.fromEntries(
                  state.items.map(
                    (item) => [
                      item.label,
                      item.value,
                    ]
                  )
                ),
            }
          );
        }
      });
  }

  window.OpsFlowCharts = {
    renderGrowth,
    renderDistribution,
    refreshTheme,

    destroy(canvas) {
      if (!canvas) return;

      chartStates.delete(canvas);

      hideTooltip(canvas);

      canvas
        .getContext("2d")
        ?.clearRect(
          0,
          0,
          canvas.width,
          canvas.height
        );
    },

    isAvailable: () => true,
  };
})();