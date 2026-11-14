// Regenerates the static, crawlable sections of index.html from data/projects.js.
//
// Run after editing data/projects.js (from this folder):
//   node build.js
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

  const awardName = `${escapeHtml(siteMeta.award.name)} &middot; ${escapeHtml(siteMeta.award.note)}`;
  const awardLink = siteMeta.award.url
    ? `<a class="credibility__award-link" href="${escapeHtml(siteMeta.award.url)}" target="_blank" rel="noopener">View on clios.com &rarr;</a>`
    : "";

  return `<div class="credibility__award">
          <img src="${siteMeta.award.badgeImage}" alt="${escapeHtml(siteMeta.award.name)} winner" loading="lazy" width="300" height="300" class="credibility__award-image" />
          <div>
            <p class="credibility__award-name">${awardName}</p>
            ${secondary}
            ${awardLink}
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
  const used = new Set(caseStudies.flatMap((cs) => cs.category));
  const tabs = categories
    .filter((c) => used.has(c.id))
    .map(
      (c) =>
        `<button type="button" class="filter-tab" data-filter="${c.id}" role="tab" aria-selected="false">${escapeHtml(c.label)}</button>`
    )
    .join("\n          ");

  return `<button type="button" class="filter-tab filter-tab--active" data-filter="all" role="tab" aria-selected="true">All</button>
          ${tabs}`;
}

// Big screen element for one media item.
function stageEl(item) {
  if (item.type === "video") {
    const poster = item.poster ? ` poster="${escapeHtml(item.poster)}"` : "";
    return `<video class="viewer__el" src="${escapeHtml(item.src)}"${poster} muted loop playsinline preload="metadata" controls aria-label="${escapeHtml(item.alt)}"></video>`;
  }
  return `<img class="viewer__el" src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" loading="lazy" />`;
}

// Media viewer: one big screen plus a thumbnail row of every item.
// js/main.js swaps the selected thumbnail onto the big screen.
function renderViewer(cs) {
  const items = cs.media || [];
  if (!items.length) {
    return `<div class="viewer__pending"><p>Media coming soon</p></div>`;
  }

  const strip =
    items.length > 1
      ? `<div class="viewer__strip" role="tablist" aria-label="${escapeHtml(cs.title)} media">
              ${items
                .map((item, i) => {
                  const thumb = item.type === "video" ? item.poster : item.src;
                  const icon = item.type === "video" ? `<span class="viewer__play" aria-hidden="true"></span>` : "";
                  return `<button type="button" class="viewer__thumb${i === 0 ? " viewer__thumb--active" : ""}" role="tab" aria-selected="${i === 0}" data-type="${item.type}" data-src="${escapeHtml(item.src)}"${item.poster ? ` data-poster="${escapeHtml(item.poster)}"` : ""} data-alt="${escapeHtml(item.alt)}" aria-label="Show ${escapeHtml(item.alt)}">
                <img src="${escapeHtml(thumb)}" alt="" loading="lazy" />${icon}
              </button>`;
                })
                .join("\n              ")}
            </div>`
      : "";

  return `<div class="viewer" data-viewer>
            <div class="viewer__stage">
              ${stageEl(items[0])}
            </div>
            ${strip}
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
  const eyebrow = cs.category.map((id) => escapeHtml(categoryLabel(id))).join(" &middot; ");
  const metaBits = [cs.client, cs.year].filter(Boolean).map(escapeHtml).join(" &middot; ");

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

  const externalLink = cs.link
    ? `<a class="case-study__external" href="${escapeHtml(cs.link)}" target="_blank" rel="noopener">View project &rarr;</a>`
    : "";

  const emblem = cs.emblem
    ? `<div class="case-study__emblem">
            <img src="${escapeHtml(cs.emblem)}" alt="${escapeHtml(cs.client)} emblem" loading="lazy" />
          </div>`
    : "";

  const articleClasses = [
    "case-study",
    cs.flagship ? "case-study--flagship" : "",
    cs.emblem ? "case-study--has-emblem" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<article class="${articleClasses}" data-category="${categoryAttr}" id="${cs.id}">
          <div class="case-study__media">
            ${renderViewer(cs)}
          </div>
          <div class="case-study__body">
            <p class="case-study__eyebrow">${eyebrow}${cs.flagship ? " &middot; Flagship" : ""}</p>
            <h3 class="case-study__title">${escapeHtml(cs.title)}</h3>
            <p class="case-study__meta">${metaBits}${cs.role ? ` &middot; ${escapeHtml(cs.role)}` : ""}</p>
            ${awardRef}

            ${renderNarrativeRow("Brief", cs.brief)}
            ${renderNarrativeRow("Challenge", cs.challenge)}
            ${renderNarrativeRow("Concept", cs.concept)}
            ${renderNarrativeRow("What I did", cs.execution)}
            ${renderNarrativeRow("Result", cs.result)}

            ${reach}
            ${cs.credits ? `<p class="case-study__credits"><span class="case-study__row-label">Credits</span> ${escapeHtml(cs.credits)}</p>` : ""}
            ${press}
            ${externalLink}
          </div>
          ${emblem}
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

// Optional contact buttons (LinkedIn, resume) shown in the header and the
// contact section once their URLs are set in siteMeta.
function renderHeaderContact() {
  const links = [
    `<a href="mailto:${escapeHtml(siteMeta.email)}" class="site-contact__link" aria-label="Email Munzir">Email</a>`,
    siteMeta.linkedin
      ? `<a href="${escapeHtml(siteMeta.linkedin)}" class="site-contact__link" target="_blank" rel="noopener" aria-label="Munzir on LinkedIn">LinkedIn</a>`
      : "",
    `<a href="${escapeHtml(siteMeta.instagram.url)}" class="site-contact__link" target="_blank" rel="noopener" aria-label="Munzir on Instagram">Instagram</a>`,
    siteMeta.resume
      ? `<a href="${escapeHtml(siteMeta.resume)}" class="site-contact__link" target="_blank" rel="noopener">Resume</a>`
      : "",
  ];
  return links.filter(Boolean).join("\n        ");
}

function renderContactLinks() {
  const links = [
    `<a href="mailto:${escapeHtml(siteMeta.email)}" class="btn btn--primary">${escapeHtml(siteMeta.email)}</a>`,
    siteMeta.linkedin
      ? `<a href="${escapeHtml(siteMeta.linkedin)}" class="btn btn--ghost" target="_blank" rel="noopener">LinkedIn</a>`
      : "",
    siteMeta.resume
      ? `<a href="${escapeHtml(siteMeta.resume)}" class="btn btn--ghost" target="_blank" rel="noopener">Resume (PDF)</a>`
      : "",
    `<a href="${escapeHtml(siteMeta.instagram.url)}" class="btn btn--ghost" target="_blank" rel="noopener">${escapeHtml(siteMeta.instagram.handle)}</a>`,
  ];
  return links.filter(Boolean).join("\n          ");
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

  html = replaceBetween(html, "HEADER_CONTACT", renderHeaderContact());
  html = replaceBetween(html, "CREDIBILITY", renderCredibility());
  html = replaceBetween(html, "FILTERS", renderFilters());
  html = replaceBetween(html, "CASE_STUDIES", caseStudies.map(renderCaseStudy).join("\n\n          "));
  html = replaceBetween(html, "ABOUT", renderAbout());
  html = replaceBetween(html, "CONTACT_LINKS", renderContactLinks());

  if (/—/.test(html)) console.warn("Warning: index.html contains an em dash.");

  await writeFile(INDEX_PATH, html, "utf8");
  console.log("Rebuilt public/portfolio/index.html from data/projects.js");
}

build();
