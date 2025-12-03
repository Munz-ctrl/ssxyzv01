const gridEl = document.getElementById("project-grid");
const isTouchDevice =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Fetch projects from JSON
fetch("projects.json")
  .then((res) => res.json())
  .then((projects) => {
    projects.forEach((project) => renderProjectCard(project));
  })
  .catch((err) => {
    console.error("Failed to load projects.json", err);
  });

function renderProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  card.dataset.hasVideo = project.video ? "true" : "false";

  // Give each card a stable ID based on title (for debugging / linking)
card.dataset.projectId = project.title;


  const media = document.createElement("div");
  media.className = "project-card__media";

  let videoEl = null;

  if (project.video) {
    videoEl = document.createElement("video");
    videoEl.className = "project-card__video";
    videoEl.src = project.video;
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";
    media.appendChild(videoEl);
  }

  const imgEl = document.createElement("img");
  imgEl.className = "project-card__thumb";
  imgEl.src = project.thumb;
  imgEl.alt = project.title;
  imgEl.loading = "lazy";
  media.appendChild(imgEl);

  const overlay = document.createElement("div");
  overlay.className = "project-card__overlay";
  media.appendChild(overlay);

  const label = document.createElement("div");
  label.className = "project-card__label";

  const titleEl = document.createElement("h2");
  titleEl.className = "project-card__title";
  titleEl.textContent = project.title;
  label.appendChild(titleEl);

  const metaEl = document.createElement("p");
  metaEl.className = "project-card__meta";
  metaEl.textContent = project.meta;
  label.appendChild(metaEl);

  media.appendChild(label);
  card.appendChild(media);
  gridEl.appendChild(card);



  // ----- SCROLL → STACKED MINI CARDS LOGIC (desktop only) -----

const stackColumn = document.getElementById("stack-column");
const stackedMap = new Map(); // originalCard -> miniCard

function setupStacking() {
  if (!stackColumn) return;

  const cards = Array.from(document.querySelectorAll(".project-card"));

  // Nothing to do if no cards or on small screens
  if (!cards.length) return;

  const isDesktop = window.innerWidth >= 1024;
  if (!isDesktop) {
    // Clean up any stack if we go back to mobile
    stackedMap.forEach((mini) => mini.remove());
    stackedMap.clear();
    cards.forEach((card) => {
      card.classList.remove("project-card--stacked-original");
    });
    return;
  }

  function handleScroll() {
    const triggerY = 140; // when card's bottom passes this from top, it goes to stack

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const isAbove = rect.bottom < triggerY;

      if (isAbove) {
        if (!stackedMap.has(card)) {
          // Create a tiny clone for the side stack
          const mini = card.cloneNode(true);
          mini.classList.add("stack-card");

          // Optional: remove hover-video behavior for minis
          mini.querySelectorAll("video").forEach((v) => {
            v.removeAttribute("autoplay");
            v.pause && v.pause();
          });

          stackColumn.appendChild(mini);
          stackedMap.set(card, mini);
          card.classList.add("project-card--stacked-original");
        }
      } else {
        if (stackedMap.has(card)) {
          const mini = stackedMap.get(card);
          mini.remove();
          stackedMap.delete(card);
          card.classList.remove("project-card--stacked-original");
        }
      }
    });
  }

  // Initial pass + listeners
  handleScroll();
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", () => {
    // Re-run setup on resize so stack turns off on smaller viewports
    setupStacking();
  });
}

// Wait until cards are rendered, then enable stacking
window.addEventListener("load", () => {
  // tiny timeout to ensure fetch-render finished
  setTimeout(setupStacking, 200);
});




  // --- Interaction logic ---

  const activateVideo = () => {
    if (!videoEl) return;
    card.classList.add("project-card--video-active");
    const playPromise = videoEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
  };

  const deactivateVideo = () => {
    if (!videoEl) return;
    card.classList.remove("project-card--video-active");
    videoEl.pause();
    videoEl.currentTime = 0;
  };

  if (!isTouchDevice) {
    // Desktop hover preview
    card.addEventListener("mouseenter", activateVideo);
    card.addEventListener("mouseleave", deactivateVideo);
  } else {
    // Mobile: first tap = preview, second tap = open link (if exists)
    let isActive = false;

    card.addEventListener("click", (e) => {
      e.preventDefault();

      if (!project.video) {
        if (project.link && project.link !== "#") {
          window.location.href = project.link;
        }
        return;
      }

      if (!isActive) {
        isActive = true;
        activateVideo();
      } else {
        if (project.link && project.link !== "#") {
          window.location.href = project.link;
        }
      }
    });
  }
}
