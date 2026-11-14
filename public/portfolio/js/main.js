// Category filter tabs. All content is already real, server-delivered
// HTML (rendered by build.js): this just toggles visibility.
(() => {
  const tabs = document.querySelectorAll(".filter-tab");
  const cards = document.querySelectorAll(".case-study");

  if (!tabs.length || !cards.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const filter = tab.dataset.filter;

      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("filter-tab--active", active);
        t.setAttribute("aria-selected", String(active));
      });

      cards.forEach((card) => {
        const categories = card.dataset.category.split(" ");
        const show = filter === "all" || categories.includes(filter);
        card.classList.toggle("case-study--hidden", !show);
      });
    });
  });
})();

// Media viewer: every project's media sits in a thumbnail row; the selected
// item plays on the big screen. Videos autoplay muted while the card is on
// screen and pause when it scrolls away, to save bandwidth and battery.
(() => {
  const viewers = document.querySelectorAll("[data-viewer]");
  if (!viewers.length) return;

  const visible = new WeakMap();

  const playIfVisible = (viewer) => {
    const el = viewer.querySelector(".viewer__el");
    if (el && el.tagName === "VIDEO" && visible.get(viewer)) {
      el.muted = true;
      el.play().catch(() => {});
    }
  };

  const buildEl = (thumb) => {
    const { type, src, poster, alt } = thumb.dataset;
    let el;
    if (type === "video") {
      el = document.createElement("video");
      el.src = src;
      if (poster) el.poster = poster;
      el.muted = true;
      el.loop = true;
      el.playsInline = true;
      el.controls = true;
      el.preload = "metadata";
      el.setAttribute("aria-label", alt || "");
    } else {
      el = document.createElement("img");
      el.src = src;
      el.alt = alt || "";
    }
    el.className = "viewer__el";
    return el;
  };

  viewers.forEach((viewer) => {
    const stage = viewer.querySelector(".viewer__stage");
    const thumbs = viewer.querySelectorAll(".viewer__thumb");

    thumbs.forEach((thumb) => {
      thumb.addEventListener("click", () => {
        if (thumb.classList.contains("viewer__thumb--active")) return;

        const current = stage.querySelector(".viewer__el");
        if (current && current.tagName === "VIDEO") current.pause();

        stage.replaceChildren(buildEl(thumb));

        thumbs.forEach((t) => {
          const active = t === thumb;
          t.classList.toggle("viewer__thumb--active", active);
          t.setAttribute("aria-selected", String(active));
        });

        // A click is a clear intent to watch: play even if partly off screen.
        const el = stage.querySelector(".viewer__el");
        if (el.tagName === "VIDEO") {
          el.muted = true;
          el.play().catch(() => {});
        }
      });
    });
  });

  if (!("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const viewer = entry.target;
        visible.set(viewer, entry.isIntersecting);
        const el = viewer.querySelector(".viewer__el");
        if (!el || el.tagName !== "VIDEO") return;
        if (entry.isIntersecting) playIfVisible(viewer);
        else el.pause();
      });
    },
    { threshold: 0.5 }
  );

  viewers.forEach((v) => io.observe(v));
})();

// Hero opener: plays the intro video once, then settles on the Clio photo
// in the same spot. Falls back to the photo immediately if the video can't
// play at all (e.g. unsupported format): the photo is real markup either way.
(() => {
  const visual = document.getElementById("hero-visual");
  const opener = document.getElementById("hero-opener");

  if (!visual || !opener) return;

  const settle = () => visual.classList.add("hero__visual--settled");

  opener.addEventListener("ended", settle, { once: true });
  opener.addEventListener("error", settle, { once: true });
})();
