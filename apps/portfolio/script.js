// Simple project data – plug your real files here:
const projects = [
  {
    title: "Panther Morph – Sneaker Spot",
    meta: "Commercial · CGI / VFX",
    thumb: "media/panther-thumb.jpg",          // JPG/PNG thumbnail
    video: "media/panther-preview.mp4",        // short muted preview OR null if using GIF
    link: "#",                                 // later can link to case-study page
  },
  {
    title: "Isometric City – Sunsex World",
    meta: "Experimental · Isometric Environment",
    thumb: "media/sunsex-city-thumb.jpg",
    video: "media/sunsex-city-preview.mp4",
    link: "#"
  },
  {
    title: "AR Filter – Fashion Drop",
    meta: "Social AR · Instagram / TikTok",
    thumb: "media/ar-filter-thumb.gif",        // can use GIF only, video: null
    video: null,
    link: "#"
  }
];

const gridEl = document.getElementById("project-grid");

// Detect basic "touch" capability (rough but fine to start)
const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

// Build cards
projects.forEach((project) => {
  const card = document.createElement("article");
  card.className = "project-card";

  // let CSS/JS know whether there is a video
  card.dataset.hasVideo = project.video ? "true" : "false";

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

  // --- Interaction logic ---

  const activateVideo = () => {
    if (!videoEl) return;
    card.classList.add("project-card--video-active");
    const playPromise = videoEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {
        // Autoplay blocked – silently ignore, fallback shows thumbnail
      });
    }
  };

  const deactivateVideo = () => {
    if (!videoEl) return;
    card.classList.remove("project-card--video-active");
    videoEl.pause();
    videoEl.currentTime = 0;
  };

  if (!isTouchDevice) {
    // Desktop: hover to preview
    card.addEventListener("mouseenter", activateVideo);
    card.addEventListener("mouseleave", deactivateVideo);
  } else {
    // Mobile / touch: first tap = preview, second tap (soon) can open link
    let isActive = false;

    card.addEventListener("click", (e) => {
      // If you want label click to navigate while preview is active, you can check e.target here
      e.preventDefault();

      if (!project.video) {
        // No video, just go to link (when you add real case-study pages)
        if (project.link && project.link !== "#") {
          window.location.href = project.link;
        }
        return;
      }

      if (!isActive) {
        isActive = true;
        activateVideo();
      } else {
        // Second tap: navigate if link exists
        if (project.link && project.link !== "#") {
          window.location.href = project.link;
        }
      }
    });
  }
});
