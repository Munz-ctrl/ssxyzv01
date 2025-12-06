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

    // each project starts with first media as main
    projectsData.forEach((p) => {
      p.mainIndex = 0;
    });

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

  // --- normalize media items for this project ---
  const mediaItems = [];

  // 1) primary thumb (can be image OR video file)
  if (project.thumb) {
    const ext = project.thumb.split(".").pop().toLowerCase();
    const isVideoExt = ["mp4", "mov", "webm"].includes(ext);

    mediaItems.push({
      type: isVideoExt ? "video" : "image",
      src: project.thumb,
    });
  }

  // 2) explicit video (if different from thumb)
  if (project.video && project.video !== project.thumb) {
    mediaItems.push({
      type: "video",
      src: project.video,
    });
  }

  // 3) optional extra media (from projects.json)
  if (Array.isArray(project.extraMedia)) {
    project.extraMedia.forEach((src) => {
      const ext = src.split(".").pop().toLowerCase();
      const isVideoExt = ["mp4", "mov", "webm"].includes(ext);
      mediaItems.push({
        type: isVideoExt ? "video" : "image",
        src,
      });
    });
  }


   const mainIndex = typeof project.mainIndex === "number" ? project.mainIndex : 0;
  const mainItem = mediaItems[mainIndex] || mediaItems[0] || null;

  const secondaryItems = mediaItems
    .map((item, idx) => ({ ...item, idx }))
    .filter((item) => item.idx !== mainIndex);


  // choose a layout hint: landscape vs portrait (optional future field)
  const layoutHint = project.layout || "landscape"; // or "portrait"
  card.classList.add(`project-card--layout-${layoutHint}`);

  // ---- MEDIA WRAPPER ----
  const media = document.createElement("div");
  media.className = "project-card__media";

  let mainVideoEl = null;

  if (mainItem) {
    const main = document.createElement("div");
    main.className = "project-card__media-main";

    if (mainItem.type === "video") {
      mainVideoEl = document.createElement("video");
      mainVideoEl.className = "project-card__video";
      mainVideoEl.src = mainItem.src;
      mainVideoEl.muted = true;
      mainVideoEl.loop = true;
      mainVideoEl.playsInline = true;
      mainVideoEl.preload = "metadata";
      main.appendChild(mainVideoEl);
    } else {
      const imgEl = document.createElement("img");
      imgEl.className = "project-card__thumb";
      imgEl.src = mainItem.src;
      imgEl.alt = project.title;
      imgEl.loading = "lazy";
      main.appendChild(imgEl);
    }

    media.appendChild(main);
  }

  // optional secondary strip (thumbnails, extra angles, etc.)
   // IG-style dots pager instead of strip
  if (mediaItems.length > 1) {
    const pager = document.createElement("div");
    pager.className = "project-card__pager";

    mediaItems.forEach((item, idx) => {
      const dot = document.createElement("button");
      dot.className = "project-card__dot";
      if (idx === mainIndex) dot.classList.add("project-card__dot--active");

      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        if (idx === mainIndex) return;

        project.mainIndex = idx;
        const freshCard = createProjectCard(project);
        card.replaceWith(freshCard);
      });

      pager.appendChild(dot);
    });

    media.appendChild(pager);
  }


  card.appendChild(media);


    // ---- DETAILS (text block) ----
  const details = document.createElement("div");
  details.className = "project-card__details";

  const titleEl = document.createElement("h2");
  titleEl.className = "project-card__title";
  titleEl.textContent = project.title;

  const metaEl = document.createElement("p");
  metaEl.className = "project-card__meta";
  metaEl.textContent = project.meta;

  details.appendChild(titleEl);
  details.appendChild(metaEl);

  card.appendChild(details);



  // --- Interaction logic (hover / tap to play primary video) ---
  const activateVideo = () => {
    if (!mainVideoEl) return;
    card.classList.add("project-card--video-active");
    const playPromise = mainVideoEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
  };

  const deactivateVideo = () => {
    if (!mainVideoEl) return;
    card.classList.remove("project-card--video-active");
    mainVideoEl.pause();
    mainVideoEl.currentTime = 0;
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

  // First card: just drop it in
  if (!oldCard || direction === 0) {
    viewerEl.innerHTML = "";
    viewerEl.appendChild(newCard);
    updateRailActive();
    return;
  }

  // Place new card slightly offset + transparent
  const offset = 24; // px, subtle shift
  if (direction > 0) {
    // next card: comes from below
    newCard.style.transform = `translateY(${offset}px)`;
  } else if (direction < 0) {
    // previous card: comes from above
    newCard.style.transform = `translateY(-${offset}px)`;
  }
  newCard.style.opacity = "0";

  viewerEl.appendChild(newCard);

  // Animate both cards in one frame
  requestAnimationFrame(() => {
    if (direction > 0) {
      oldCard.style.transform = `translateY(-${offset}px)`;
    } else {
      oldCard.style.transform = `translateY(${offset}px)`;
    }
    oldCard.style.opacity = "0";

    newCard.style.transform = "translateY(0)";
    newCard.style.opacity = "1";
  });

  // Clean up old card after transition
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
