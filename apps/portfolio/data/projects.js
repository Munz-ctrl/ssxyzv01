// Single source of content for the portfolio.
// Edit this file, then run `node build.js` from apps/portfolio/ to regenerate
// the static markup inside index.html. Do not hand-edit the generated
// sections of index.html — they will be overwritten on the next build.

// Root-absolute so paths still resolve correctly when this page is served
// through a Vercel rewrite (e.g. /portfolio, /munzir) instead of its real
// file path — a relative "media/..." path breaks under those short URLs.
const MEDIA = "/apps/portfolio/media/";

export const siteMeta = {
  name: "Munzir Mukhtar",
  role: "Experiential Reality Designer",
  studio: "Founder, Virtuosus",
  tagline:
    "I design VFX, AR/XR, and mixed reality activations, 3D worlds, games, and brand identity for artists and brands.",
  location: "New York — working globally",
  email: "77PhoenixLane@gmail.com",
  instagram: { handle: "@munzir_here", url: "https://instagram.com/munzir_here" },
  // Real, already-available Clio assets. Hero uses clio-2 (holding the award)
  // as a static placeholder until the real Uzi Vert activation video is provided.
  award: {
    name: "Clio Award",
    note: "Winner",
    badgeImage: MEDIA + "clio-1.png",
    heroImage: MEDIA + "clio-2.png",
  },
  // Separate accolade — the "2026 Official Honoree" certificate visible in
  // clio-1.png is from The Webby Awards, not the Clios. Kept distinct so the
  // two aren't conflated.
  secondaryAward: {
    name: "The Webby Awards",
    note: "2026 Official Honoree",
  },
};

export const clients = [
  "Tyler, the Creator",
  "Lil Uzi Vert",
  "Ye",
  "Hulu",
  "Clarks",
  "GBNY",
  "Daily Paper",
  "Stranger Things",
  "OVO",
  "JD Sports",
  "Tom Brady",
  "Dame Dash",
  "RCA Records",
  "Atlantic Records",
];

export const categories = [
  { id: "experiential", label: "Experiential / Activations" },
  { id: "ar-xr", label: "AR & XR" },
  { id: "vfx", label: "VFX" },
  { id: "web-game", label: "Web & Game Design" },
  { id: "brand", label: "Brand & Graphic" },
];

export const about = {
  statement:
    "As lead artist, project manager, and co-founder at Virtuosus, I oversee the full creative pipeline — from concept and design to final CGI, VFX, and interactive experiences. I balance hands-on visual creation with team coordination to bring ambitious ideas to life on schedule.",
  years: "9+",
  skills: [
    "3D Modeling & Texturing",
    "Lighting, Rendering & Compositing",
    "VFX & Motion Graphics",
    "AR / XR & Mixed Reality",
    "Cinema 4D · Houdini · After Effects · Unity",
    "Art Direction & Pipeline Management",
  ],
  // TODO: swap for a final headshot/bio photo when available.
  photo: MEDIA + "abtmunz2.png",
};

// Case studies, flagship first. `category` is an array of category ids from
// `categories` above — a project can belong to more than one tab.
//
// `media.type` is one of:
//   "video"   — { type: "video", src, poster }
//   "image"   — { type: "image", src }
//   "pending" — { type: "pending", note, link } real asset not delivered yet;
//               renders a text/link placeholder instead of broken media.
export const caseStudies = [
  {
    id: "uzi-vert-ufo",
    flagship: true,
    category: ["experiential", "ar-xr"],
    title: "Lil Uzi Vert — Mixed Reality UFO Activation",
    client: "Lil Uzi Vert / Atlantic Records",
    year: 2026,
    role: "Creative Lead",
    brief:
      "Design and lead a mixed reality activation supporting the NYC rollout of Lil Uzi Vert's album — a UFO-themed experience bringing the album's world into physical space for fans and press.",
    challenge: "TODO — add the creative/production challenge for this activation.",
    concept: "TODO — add the core creative concept.",
    execution: "TODO — add build/production/execution details.",
    result: "TODO — add outcome/reception details.",
    reach: [], // TODO e.g. [{ label: "Impressions", value: "TODO" }]
    credits: "TODO — collaborators, agency, production team",
    press: [], // TODO e.g. [{ label: "Coverage name", url: "TODO" }]
    // Minimal cross-link back to the Clio credibility strip, per request —
    // the award is presented on its own first, then noted here.
    awardRef: { label: "Clio Award Winner", href: "#credibility" },
    // TODO: replace with the real activation video once delivered.
    media: { type: "pending", note: "Activation video coming soon", link: null },
    gallery: [],
    link: null,
  },
  {
    id: "tyler-the-creator-cgi",
    flagship: false,
    category: ["vfx"],
    title: "Tyler the Creator — CGI Moment",
    client: "Tyler, the Creator",
    year: null, // TODO
    role: "TODO — e.g. CGI / VFX Artist",
    brief: "TODO — add the client's ask for this piece.",
    challenge: "TODO",
    concept: "TODO",
    execution: "TODO",
    result: "TODO",
    reach: [],
    credits: "TODO",
    press: [
      { label: "View post", url: "https://x.com/EmpireStateBldg/status/1947446591821942998" },
    ],
    media: { type: "video", src: MEDIA + "tylr.MP4", poster: MEDIA + "tylrt.png" },
    gallery: [MEDIA + "complxt.png"],
    link: "https://x.com/EmpireStateBldg/status/1947446591821942998",
  },
  {
    id: "yeezy-ad-creation",
    flagship: false,
    category: ["brand", "vfx"],
    title: "YEEZY — Ad Creation",
    client: "Ye / YEEZY",
    year: null, // TODO
    role: "TODO — e.g. Visual Designer",
    brief:
      "Commissioned by Ye's team to create compelling visual ads, with a secondary role in graphic design.",
    challenge: "TODO",
    concept: "TODO",
    execution: "TODO",
    result: "TODO",
    reach: [],
    credits: "TODO",
    press: [],
    media: { type: "video", src: MEDIA + "podvid.MP4", poster: null },
    gallery: [MEDIA + "vul.MP4", MEDIA + "yep.png"],
    link: null,
  },
  {
    id: "sunsex-isometric-world",
    flagship: false,
    category: ["web-game"],
    title: "Sunsex — Isometric World",
    client: "Personal IP",
    year: null, // TODO
    role: "Creator / Designer",
    brief:
      "Sunsex is my long-term creative IP project — an isometric digital world layered over reality, documented through visual art.",
    challenge: "TODO",
    concept: "TODO",
    execution: "TODO",
    result: "TODO",
    reach: [],
    credits: "TODO",
    press: [],
    // TODO: no lookdev media delivered yet.
    media: { type: "pending", note: "Lookdev media coming soon", link: null },
    gallery: [],
    link: null,
  },
];
