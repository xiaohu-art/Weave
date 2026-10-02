// Fill in each video's path, failure type (title), and explanation (description).
// Paths are relative to docs/index.html, e.g. "./media/failure-cases/case-1.mp4".
// Leave src empty until the video exists to show a placeholder without a failed request.
const failureCases = [
  { src: "./failure/anchor_pos.mp4", title: "Failure Case 1", description: "Root position deviation." },
  { src: "./failure/obj_pos.mp4", title: "Failure Case 2", description: "Object position deviation." },
  { src: "./failure/obj_ori.mp4", title: "Failure Case 3", description: "Object orientation deviation." },
  { src: "./failure/ee_height.mp4", title: "Failure Case 4", description: "End-effector height deviation." },
  { src: "./failure/bad_contact.mp4", title: "Failure Case 5", description: "Bad contact condition." },
];

const carousel = document.querySelector("#failure-carousel");
const viewport = carousel.querySelector(".failure-viewport");
const track = carousel.querySelector(".failure-track");
const template = carousel.querySelector("#failure-template");
const status = carousel.querySelector(".failure-status");
const previous = carousel.querySelector(".failure-prev");
const next = carousel.querySelector(".failure-next");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let currentIndex = 0;
let animation = null;

const slides = failureCases.map((item, index) => {
  const element = template.content.firstElementChild.cloneNode(true);
  const video = element.querySelector("video");
  const placeholder = element.querySelector(".failure-placeholder");
  const caption = element.querySelector(".failure-caption");
  element.dataset.index = index;
  element.setAttribute("aria-label", `${index + 1} of ${failureCases.length}`);
  caption.id = `failure-caption-${index + 1}`;
  caption.title = [item.title, item.description].filter(Boolean).join(" — ");
  element.querySelector(".failure-title").textContent = item.title;
  element.querySelector(".failure-description").textContent = item.description ? `— ${item.description}` : "";
  element.querySelector(".failure-count").textContent = `${index + 1} / ${failureCases.length}`;
  video.setAttribute("aria-labelledby", caption.id);
  video.muted = true;
  video.addEventListener("error", () => {
    video.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = "Video unavailable. Please try another case.";
  });
  track.append(element);
  return { element, video, placeholder, item };
});

function wrapIndex(index) {
  return (index + slides.length) % slides.length;
}

function neighbors(index) {
  return [wrapIndex(index - 1), index, wrapIndex(index + 1)];
}

function loadPreview(index) {
  const { video, placeholder, item } = slides[index];
  if (!item.src || video.hasAttribute("src")) return;
  video.hidden = false;
  placeholder.hidden = true;
  video.src = item.src;
  video.load();
}

function syncVideos(play = false) {
  const visible = neighbors(currentIndex);
  slides.forEach(({ element, video, placeholder }, index) => {
    element.inert = index !== currentIndex;
    element.setAttribute("aria-hidden", String(index !== currentIndex));
    if (index !== currentIndex) video.pause();
    if (visible.includes(index)) {
      loadPreview(index);
    } else if (video.hasAttribute("src")) {
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "Video coming soon";
    }
  });
  status.textContent = `${failureCases[currentIndex].title}, ${currentIndex + 1} of ${slides.length}`;
  carousel.dataset.index = currentIndex;
  const { video, item } = slides[currentIndex];
  if (play && item.src) {
    // Native controls remain usable when browser policy prevents playback.
    video.play().catch(() => {});
  }
}

function translationFor(index) {
  const element = slides[index].element;
  return `translateX(${(viewport.clientWidth - element.offsetWidth) / 2 - element.offsetLeft}px)`;
}

function alignTrack() {
  track.style.transform = translationFor(currentIndex);
}

async function move(direction) {
  if (animation) return;
  const targetIndex = wrapIndex(currentIndex + direction);
  slides.forEach(({ video }) => video.pause());
  neighbors(targetIndex).forEach(loadPreview);

  // Rotate the real cards instead of cloning videos at the loop boundary.
  if (direction < 0) track.prepend(track.lastElementChild);
  alignTrack();
  animation = track.animate(
    [{ transform: track.style.transform }, { transform: translationFor(targetIndex) }],
    { duration: reducedMotion.matches ? 0 : 340, easing: "cubic-bezier(.22,.61,.36,1)" },
  );
  await animation.finished;
  if (direction > 0) track.append(track.firstElementChild);
  currentIndex = targetIndex;
  alignTrack();
  syncVideos(true);
  animation = null;
}

previous.addEventListener("click", () => move(-1));
next.addEventListener("click", () => move(1));
track.prepend(track.lastElementChild);
alignTrack();
syncVideos(true);
const resizeObserver = new ResizeObserver(() => {
  if (animation) animation.finish();
  else alignTrack();
});
resizeObserver.observe(viewport);
previous.disabled = false;
next.disabled = false;
