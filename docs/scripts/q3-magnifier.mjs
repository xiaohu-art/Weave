const svgNamespace = "http://www.w3.org/2000/svg";
const zoom = 3;

export function enableQ3Magnifier(root) {
  const charts = [...root.querySelectorAll(".q3-svg")];
  if (!charts.length) return;

  // Keep the overlay inside Q3 so its cloned curves inherit the same colors.
  const lens = document.createElement("div");
  lens.className = "q3-magnifier";
  lens.hidden = true;
  lens.setAttribute("aria-hidden", "true");
  const title = document.createElement("span");
  title.className = "q3-magnifier-title";
  const detail = document.createElementNS(svgNamespace, "svg");
  detail.classList.add("q3-magnifier-svg");
  const crosshair = document.createElementNS(svgNamespace, "path");
  crosshair.classList.add("q3-magnifier-crosshair");
  crosshair.setAttribute("vector-effect", "non-scaling-stroke");
  lens.append(detail, title);
  root.querySelector(".q3-fig").append(lens);
  let activeChart = null;

  function hideLens() {
    lens.hidden = true;
    charts.forEach(chart => chart.classList.remove("q3-can-zoom"));
  }

  for (const chart of charts) {
    const xAxis = chart.querySelector("line.q1-axis:not(.q3-y-axis)");
    const yAxis = chart.querySelector(".q3-y-axis");
    const bounds = {
      left: xAxis.x1.baseVal.value,
      right: xAxis.x2.baseVal.value,
      top: yAxis.y1.baseVal.value,
      bottom: yAxis.y2.baseVal.value,
    };
    // Clone only the plot, once. Endpoint labels and other annotations stay outside the lens.
    const plot = document.createElementNS(svgNamespace, "g");
    chart.querySelectorAll(".q1-grid, .q3-raw, .q3-line").forEach(source => {
      const copy = source.cloneNode(true);
      copy.setAttribute("vector-effect", "non-scaling-stroke");
      plot.append(copy);
    });

    chart.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      const matrix = chart.getScreenCTM();
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      if (point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) {
        hideLens();
        return;
      }
      if (activeChart !== chart) {
        detail.replaceChildren(plot, crosshair);
        title.textContent = `${chart.closest("figure").querySelector("figcaption").textContent.trim()} · ${zoom}×`;
        activeChart = chart;
      }
      chart.classList.add("q3-can-zoom");
      lens.hidden = false;

      const scale = Math.hypot(matrix.a, matrix.b);
      const width = detail.clientWidth / (zoom * scale);
      const height = detail.clientHeight / (zoom * scale);
      const left = Math.max(bounds.left, Math.min(point.x - width / 2, bounds.right - width));
      const top = Math.max(bounds.top, Math.min(point.y - height / 2, bounds.bottom - height));
      detail.setAttribute("viewBox", `${left} ${top} ${width} ${height}`);
      const arm = 6 / (zoom * scale);
      crosshair.setAttribute("d", `M ${point.x - arm} ${point.y} H ${point.x + arm} M ${point.x} ${point.y - arm} V ${point.y + arm}`);

      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const box = lens.getBoundingClientRect();
      let x = event.clientX + 18;
      let y = event.clientY + 18;
      if (x + box.width > viewportWidth - 12) x = event.clientX - box.width - 18;
      if (y + box.height > viewportHeight - 12) y = event.clientY - box.height - 18;
      lens.style.left = `${Math.max(12, Math.min(x, viewportWidth - box.width - 12))}px`;
      lens.style.top = `${Math.max(12, Math.min(y, viewportHeight - box.height - 12))}px`;
    });
    chart.addEventListener("pointerleave", hideLens);
  }

  document.addEventListener("scroll", hideLens, true);
  window.addEventListener("resize", hideLens);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideLens();
  });
}
