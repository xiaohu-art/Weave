// Reuse the thumbnail asset in a floating preview without changing table geometry.
const preview = document.createElement("img");
preview.className = "object-thumb-preview";
preview.alt = "";
preview.setAttribute("aria-hidden", "true");
preview.hidden = true;
document.body.append(preview);

function showPreview(thumbnail) {
  preview.src = thumbnail.currentSrc || thumbnail.src;
  preview.hidden = false;
  const bounds = thumbnail.getBoundingClientRect();
  const width = preview.offsetWidth;
  const height = preview.offsetHeight;
  const margin = 12;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  let left = bounds.right + margin;
  if (left + width > viewportWidth - margin) left = bounds.left - width - margin;
  const top = bounds.top + (bounds.height - height) / 2;
  preview.style.left = `${Math.max(margin, Math.min(left, viewportWidth - width - margin))}px`;
  preview.style.top = `${Math.max(margin, Math.min(top, viewportHeight - height - margin))}px`;
}

function hidePreview() {
  preview.hidden = true;
}

export function enableThumbnailPreviews(root) {
  root.querySelectorAll(".data-dist td.thumb img").forEach(thumbnail => {
    // Keyboard users can inspect the same enlarged image by tabbing to it.
    thumbnail.tabIndex = 0;
    thumbnail.alt = thumbnail.closest("td").nextElementSibling.textContent.trim();
    thumbnail.addEventListener("pointerenter", event => {
      if (event.pointerType !== "touch") showPreview(thumbnail);
    });
    thumbnail.addEventListener("pointerleave", hidePreview);
    thumbnail.addEventListener("focus", () => showPreview(thumbnail));
    thumbnail.addEventListener("blur", hidePreview);
  });
}

enableThumbnailPreviews(document);

document.addEventListener("keydown", event => {
  if (event.key === "Escape") hidePreview();
});
document.addEventListener("scroll", hidePreview, true);
window.addEventListener("resize", hidePreview);
