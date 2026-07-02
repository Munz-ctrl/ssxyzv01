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
