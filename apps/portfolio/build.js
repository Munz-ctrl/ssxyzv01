// Regenerates the static, crawlable sections of index.html from data/projects.js.
//
// Run after editing data/projects.js:
//   node apps/portfolio/build.js
//
// This keeps content changes to a single data file while index.html stays
// real, final, committed HTML (no client-side fetch/render on page load).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { siteMeta, clients, categories, about, caseStudies } from "./data/projects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "index.html");

const escapeHtml = (str) =>
  String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

const categoryLabel = (id) => categories.find((c) => c.id === id)?.label ?? id;

function renderCredibility() {
  const clientItems = clients
    .map((name) => `<li class="credibility__client">${escapeHtml(name)}</li>`)
    .join("\n            ");

  const secondary = siteMeta.secondaryAward
    ? `<p class="credibility__award-secondary">${escapeHtml(siteMeta.secondaryAward.name)} &middot; ${escapeHtml(siteMeta.secondaryAward.note)}</p>`
    : "";

  return `<div class="credibility__award">
          <img src="${siteMeta.award.badgeImage}" alt="${escapeHtml(siteMeta.award.name)} — ${escapeHtml(siteMeta.award.note)}" loading="lazy" width="300" height="300" class="credibility__award-image" />
          <div>
            <p class="credibility__award-name">${escapeHtml(siteMeta.award.name)} — ${escapeHtml(siteMeta.award.note)}</p>
            ${secondary}
          </div>
        </div>
        <div class="credibility__clients">
          <p class="credibility__clients-label">Selected clients</p>
          <ul class="credibility__client-list">
            ${clientItems}
          </ul>
        </div>`;
}

function renderFilters() {
  const tabs = categories
    .map(
      (c) =>
        `<button type="button" class="filter-tab" data-filter="${c.id}" role="tab" aria-selected="false">${escapeHtml(c.label)}</button>`
    )
    .join("\n          ");

  return `<button type="button" class="filter-tab filter-tab--active" data-filter="all" role="tab" aria-selected="true">All</button>
          ${tabs}`;
}

function renderMedia(cs) {
  const { media } = cs;
  if (media.type === "video") {
    const poster = media.poster ? ` poster="${escapeHtml(media.poster)}"` : "";
    return `<video class="case-study__media-el" src="${escapeHtml(media.src)}" muted loop playsinline preload="metadata"${poster} controls></video>`;
  }
  if (media.type === "image") {
    return `<img class="case-study__media-el" src="${escapeHtml(media.src)}" alt="${escapeHtml(cs.title)}" loading="lazy" />`;
  }
  // pending — real asset not delivered yet
  const link = media.link
    ? `<a class="case-study__media-link" href="${escapeHtml(media.link)}" target="_blank" rel="noopener">View reference &rarr;</a>`
    : "";
  return `<div class="case-study__media-pending">
              <p>${escapeHtml(media.note || "Media coming soon")}</p>
              ${link}
            </div>`;
}

function renderNarrativeRow(label, value) {
  if (!value) return "";
  return `<div class="case-study__row">
              <p class="case-study__row-label">${escapeHtml(label)}</p>
              <p class="case-study__row-value">${escapeHtml(value)}</p>
            </div>`;
}

function renderCaseStudy(cs) {
  const categoryAttr = cs.category.join(" ");
  const eyebrow = cs.category.map(categoryLabel).join(" &middot; ");
  const metaBits = [cs.client, cs.year].filter(Boolean).join(" &middot; ");

  const reach =
    cs.reach && cs.reach.length
      ? `<div class="case-study__reach">
              ${cs.reach
                .map(
                  (r) =>
                    `<div class="case-study__reach-item"><span class="case-study__reach-value">${escapeHtml(r.value)}</span><span class="case-study__reach-label">${escapeHtml(r.label)}</span></div>`
                )
                .join("\n              ")}
            </div>`
      : "";

  const press =
    cs.press && cs.press.length
      ? `<div class="case-study__press">
              <p class="case-study__row-label">Press</p>
              ${cs.press
                .map((p) => `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.label)}</a>`)
                .join("\n              ")}
            </div>`
      : "";

  const awardRef = cs.awardRef
    ? `<a class="case-study__award-ref" href="${escapeHtml(cs.awardRef.href)}">${escapeHtml(cs.awardRef.label)} &rarr;</a>`
    : "";

  const gallery =
    cs.gallery && cs.gallery.length
      ? `<div class="case-study__gallery">
              ${cs.gallery
                .map((src) =>
                  /\.(mp4|mov)$/i.test(src)
                    ? `<video src="${escapeHtml(src)}" muted loop playsinline preload="metadata" controls></video>`
                    : `<img src="${escapeHtml(src)}" alt="" loading="lazy" />`
                )
                .join("\n              ")}
            </div>`
      : "";

  const externalLink = cs.link
    ? `<a class="case-study__external" href="${escapeHtml(cs.link)}" target="_blank" rel="noopener">View project &rarr;</a>`
    : "";

  return `<article class="case-study${cs.flagship ? " case-study--flagship" : ""}" data-category="${categoryAttr}" id="${cs.id}">
          <div class="case-study__media">
            ${renderMedia(cs)}
          </div>
          <div class="case-study__body">
            <p class="case-study__eyebrow">${eyebrow}${cs.flagship ? " &middot; Flagship" : ""}</p>
            <h3 class="case-study__title">${escapeHtml(cs.title)}</h3>
            <p class="case-study__meta">${metaBits}${cs.role ? ` &middot; ${escapeHtml(cs.role)}` : ""}</p>
            ${awardRef}

            ${renderNarrativeRow("Brief", cs.brief)}
            ${renderNarrativeRow("Challenge", cs.challenge)}
            ${renderNarrativeRow("Concept", cs.concept)}
            ${renderNarrativeRow("Execution", cs.execution)}
            ${renderNarrativeRow("Result", cs.result)}

            ${reach}
            ${cs.credits ? `<p class="case-study__credits"><span class="case-study__row-label">Credits</span> ${escapeHtml(cs.credits)}</p>` : ""}
            ${press}
            ${gallery}
            ${externalLink}
          </div>
        </article>`;
}

function renderAbout() {
  const skills = about.skills.map((s) => `<li>${escapeHtml(s)}</li>`).join("\n            ");
  return `<p class="about__years"><span>${escapeHtml(about.years)}</span> years designing experiences</p>
          <p class="about__statement">${escapeHtml(about.statement)}</p>
          <ul class="about__skills">
            ${skills}
          </ul>`;
}

function replaceBetween(html, marker, content) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const startIdx = html.indexOf(start);
  const endIdx = html.indexOf(end);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`Marker ${marker} not found in index.html`);
  }
  return (
    html.slice(0, startIdx + start.length) +
    "\n        " +
    content +
    "\n        " +
    html.slice(endIdx)
  );
}

async function build() {
  let html = await readFile(INDEX_PATH, "utf8");

  html = replaceBetween(html, "CREDIBILITY", renderCredibility());
  html = replaceBetween(html, "FILTERS", renderFilters());
  html = replaceBetween(html, "CASE_STUDIES", caseStudies.map(renderCaseStudy).join("\n\n          "));
  html = replaceBetween(html, "ABOUT", renderAbout());

  await writeFile(INDEX_PATH, html, "utf8");
  console.log("Rebuilt apps/portfolio/index.html from data/projects.js");
}

build();
