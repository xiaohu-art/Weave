import {enableThumbnailPreviews} from "./object-thumb-preview.mjs?v=20260911-figures";
import {enableQ3Magnifier} from "./q3-magnifier.mjs?v=20260911-hover";

// SVGs scale with the page; compensate text so ticks remain readable at any width.
function sizeChartText(svg) {
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  if (scale > 0) svg.style.setProperty("--q1-text-scale", String(1 / scale));
}

const chartResizeObserver = new ResizeObserver(entries => {
  entries.forEach(({ target }) => sizeChartText(target));
});

function observeCharts(root) {
  root.querySelectorAll(".q1-svg, .q3-svg").forEach(svg => {
    sizeChartText(svg);
    chartResizeObserver.observe(svg);
  });
}

async function loadFigure(container) {
  try {
    const response = await fetch(new URL(container.dataset.figureSrc, document.baseURI));
    if (!response.ok) throw new Error(`${container.id}: HTTP ${response.status}`);
    // This is a trusted, repository-owned HTML fragment, including SVG and MathML.
    container.innerHTML = await response.text();
    observeCharts(container);
    enableThumbnailPreviews(container);
    enableQ3Magnifier(container);
  } catch (error) {
    console.error(error);
    container.textContent = "Evaluation charts could not be loaded. Please refresh the page.";
  } finally {
    container.setAttribute("aria-busy", "false");
  }
}

document.querySelectorAll("[data-figure-src]").forEach(loadFigure);
