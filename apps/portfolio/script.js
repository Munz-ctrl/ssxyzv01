const viewerEl = document.getElementById("project-viewer");
const stackColumn = document.getElementById("stack-column");
const isTouchDevice =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

let projectsData = [];

let isTransitioning = false;

// Fetch projects from JSON
fetch("projects.json")
  .then((res) => res.json())
    .then((projects) => {
    projectsData = projects;
    buildSideRail(projectsData);
    showCurrentProject(); // start on top of stack
  })

  .catch((err) => {
    console.error("Failed to load projects.json", err);
  });

function createProjectCard(project) {
  const card = document.createElement("article");
  card.className = "project-card";
  card.dataset.hasVideo = project.video ? "true" : "false";

  card.dataset.projectId = project.title;
  card.dataset.stackThumb =
    project.stackThumb ||
    project.stackImage ||
    project.stackPng ||
    project.thumb;

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

  // --- Interaction logic (same as before) ---
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
    card.addEventListener("mouseenter", activateVideo);
    card.addEventListener("mouseleave", deactivateVideo);
  } else {
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

  return card;
}

/* ---------- viewer + side rail logic ---------- */

function showCurrentProject(direction = 0) {
  if (!projectsData.length) return;

  const project = projectsData[0]; // top of stack = active

  const oldCard = viewerEl.querySelector(".project-card");
  const newCard = createProjectCard(project);

  // If there's no existing card, just show instantly
  if (!oldCard || direction === 0) {
    viewerEl.innerHTML = "";
    viewerEl.appendChild(newCard);
    updateRailActive();
    return;
  }

  // Start positions for animation
  if (direction > 0) {
    // moving forward: new card comes from bottom
    newCard.style.transform = "translateY(110%)";
  } else if (direction < 0) {
    // moving backward: new card comes from top
    newCard.style.transform = "translateY(-110%)";
  }
  newCard.style.opacity = "0";

  viewerEl.appendChild(newCard);

  // Animate old card out
  requestAnimationFrame(() => {
    if (direction > 0) {
      oldCard.style.transform = "translateY(-110%)";
    } else {
      oldCard.style.transform = "translateY(110%)";
    }
    oldCard.style.opacity = "0";
  });

  // Animate new card in on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      newCard.style.transform = "translateY(0)";
      newCard.style.opacity = "1";
    });
  });

  // Remove old card after transition
  const cleanup = () => {
    oldCard.removeEventListener("transitionend", cleanup);
    if (oldCard.parentNode === viewerEl) {
      viewerEl.removeChild(oldCard);
    }
  };
  oldCard.addEventListener("transitionend", cleanup);

  updateRailActive();
}



function buildSideRail(projects) {
  if (!stackColumn) return;
  stackColumn.innerHTML = "";

  projects.forEach((project, index) => {
    const btn = document.createElement("button");
    btn.className = "stack-thumb";
    if (index === 0) btn.classList.add("stack-thumb--active");

    const img = document.createElement("img");
    img.className = "stack-thumb__image";
    img.src = project.stackThumb || project.thumb;
    img.alt = project.title;

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      if (index === 0) return; // already active

      // Rotate array so clicked item becomes index 0
      projectsData = projectsData
        .slice(index)
        .concat(projectsData.slice(0, index));

      buildSideRail(projectsData);
      showCurrentProject();
    });

    stackColumn.appendChild(btn);
  });
}


function updateRailActive() {
  if (!stackColumn) return;
  const thumbs = stackColumn.querySelectorAll(".stack-thumb");

  thumbs.forEach((thumb, idx) => {
  thumb.classList.toggle("stack-thumb--active", idx === 0);
});


  // Keep active thumb roughly centered in the rail
  const active = stackColumn.querySelector(".stack-thumb--active");
  if (active) {
    const offset =
      active.offsetTop -
      stackColumn.clientHeight / 2 +
      active.clientHeight / 2;
    stackColumn.scrollTo({ top: offset, behavior: "smooth" });
  }
}

function stepProject(delta) {
  if (isTransitioning || !projectsData.length) return;

  if (delta > 0) {
    // Scroll down: take first item and move to bottom
    const first = projectsData.shift();
    projectsData.push(first);
  } else if (delta < 0) {
    // Scroll up: take last item and move to top
    const last = projectsData.pop();
    projectsData.unshift(last);
  } else {
    return;
  }

  isTransitioning = true;

  buildSideRail(projectsData);
  showCurrentProject(delta);

  setTimeout(() => {
    isTransitioning = false;
  }, 350);
}

// Desktop wheel navigation over main viewer
viewerEl.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (e.deltaY > 20) {
      stepProject(1);
    } else if (e.deltaY < -20) {
      stepProject(-1);
    }
  },
  { passive: false }
);

// Mobile swipe navigation
let touchStartY = null;

viewerEl.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    touchStartY = e.touches[0].clientY;
  }
});

viewerEl.addEventListener("touchend", (e) => {
  if (touchStartY === null) return;
  const dy = e.changedTouches[0].clientY - touchStartY;

  if (Math.abs(dy) > 40) {
    // swipe up = next card, swipe down = previous card
    if (dy < 0) {
      stepProject(1);
    } else {
      stepProject(-1);
    }
  }

  touchStartY = null;
});
