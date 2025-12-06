const viewerEl = document.getElementById("project-viewer");
const stackColumn = document.getElementById("stack-column");

const pagerEl = document.getElementById("media-pager");


const isTouchDevice =
  "ontouchstart" in window || navigator.maxTouchPoints > 0;

let projectsData = [];

let isTransitioning = false;

let mediaTimer = null;

function clearMediaTimer() {
  if (mediaTimer) {
    clearTimeout(mediaTimer);
    mediaTimer = null;
  }
}

// central place to build mediaItems for a project
function getMediaItems(project) {
  const mediaItems = [];

  // 1) primary thumb (image OR video)
  if (project.thumb) {
    const ext = project.thumb.split(".").pop().toLowerCase();
    const isVideoExt = ["mp4", "mov", "webm"].includes(ext);

    mediaItems.push({
      type: isVideoExt ? "video" : "image",
      src: project.thumb,
    });
  }

  // 2) explicit video if different
  if (project.video && project.video !== project.thumb) {
    mediaItems.push({
      type: "video",
      src: project.video,
    });
  }

  // 3) optional extra media
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

  return mediaItems;
}


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
  const mediaItems = getMediaItems(project);


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



  return card;
}



function advanceMedia(project, direction = 1) {
  const mediaItems = getMediaItems(project);
  if (mediaItems.length <= 1) return;

  const len = mediaItems.length;
  const current = typeof project.mainIndex === "number" ? project.mainIndex : 0;
  project.mainIndex = (current + direction + len) % len;

  const currentCard = viewerEl.querySelector(".project-card");
  if (!currentCard) return;

  const freshCard = createProjectCard(project);
  currentCard.replaceWith(freshCard);

  setupMediaAdvance(project, freshCard);
    
  renderPager(project);

}

function setupMediaAdvance(project, card) {
  clearMediaTimer();

  const mediaItems = getMediaItems(project);
  if (!mediaItems.length) return;

  // Autoplay any videos on this card
  const videos = card.querySelectorAll("video");
  videos.forEach((videoEl) => {
    videoEl.muted = true;
    videoEl.playsInline = true;
    const playPromise = videoEl.play();
    if (playPromise && playPromise.catch) {
      playPromise.catch(() => {});
    }
  });

  if (mediaItems.length <= 1) {
    // only one media – nothing to auto-advance
    return;
  }

  const mainIndex =
    typeof project.mainIndex === "number" ? project.mainIndex : 0;
  const mainItem = mediaItems[mainIndex];

  if (mainItem.type === "video") {
    // advance when video ends
    const mainVideo = card.querySelector(".project-card__video");
    if (!mainVideo) return;

    mainVideo.loop = false;

    const onEnded = () => {
      mainVideo.removeEventListener("ended", onEnded);
      advanceMedia(project, 1);
    };

    mainVideo.addEventListener("ended", onEnded);
  } else {
    // image / gif: advance every 5 seconds
    mediaTimer = setTimeout(() => {
      advanceMedia(project, 1);
    }, 5000);
  }
}


function renderPager(project) {
  if (!pagerEl) return;

  const mediaItems = getMediaItems(project);
  pagerEl.innerHTML = "";

  if (mediaItems.length <= 1) {
    pagerEl.style.display = "none";
    return;
  }

  pagerEl.style.display = "flex";

  const mainIndex =
    typeof project.mainIndex === "number" ? project.mainIndex : 0;

  mediaItems.forEach((item, idx) => {
    const dot = document.createElement("button");
    dot.className = "project-card__dot";
    if (idx === mainIndex) dot.classList.add("project-card__dot--active");

    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx === mainIndex) return;

      project.mainIndex = idx;

      const currentCard = viewerEl.querySelector(".project-card");
      if (!currentCard) return;

      const freshCard = createProjectCard(project);
      currentCard.replaceWith(freshCard);

      clearMediaTimer();
      setupMediaAdvance(project, freshCard);
      renderPager(project);
    });

    pagerEl.appendChild(dot);
  });
}



/* ---------- viewer + side rail logic ---------- */
function showCurrentProject(direction = 0) {
  if (!projectsData.length) return;

  const project = projectsData[0]; // top of stack = active
  clearMediaTimer();

  const oldCard = viewerEl.querySelector(".project-card");
  const card = createProjectCard(project);

  // Start new card slightly offset + transparent
  card.style.opacity = "0";
  if (direction > 0) {
    card.style.transform = "translateY(20px)";
  } else if (direction < 0) {
    card.style.transform = "translateY(-20px)";
  } else {
    card.style.transform = "translateY(8px)";
  }

  // Replace content with the new card
  viewerEl.innerHTML = "";
  viewerEl.appendChild(card);

  updateRailActive();
  setupMediaAdvance(project, card);
  renderPager(project);

  // Let the browser paint once, then animate to resting state
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.opacity = "1";
      card.style.transform = "translateY(0)";
    });
  });
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
  }, 111);
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

window.addEventListener("resize", () => {
  if (!projectsData.length) return;
  // Re-render the current top project to fit new viewport
  showCurrentProject(0);
});
