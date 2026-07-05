// Category filter tabs only. All content is already real, server-delivered
// HTML (rendered by build.js) — this just toggles visibility, no fetching
// or rendering happens here.
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

// Hero opener: plays the intro video once, then settles on the Clio photo
// in the same spot. Falls back to the photo immediately if the video can't
// play at all (e.g. unsupported format) — the photo is real markup either way.
(() => {
  const visual = document.getElementById("hero-visual");
  const opener = document.getElementById("hero-opener");

  if (!visual || !opener) return;

  const settle = () => visual.classList.add("hero__visual--settled");

  opener.addEventListener("ended", settle, { once: true });
  opener.addEventListener("error", settle, { once: true });
})();
