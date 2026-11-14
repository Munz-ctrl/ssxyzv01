// Single source of content for the portfolio.
// Edit this file, then run `node build.js` from public/portfolio/ to regenerate
// the static markup inside index.html. Do not hand-edit the generated
// sections of index.html: they will be overwritten on the next build.
//
// Writing rule: no em dashes in any copy on this site.

// Root-absolute so paths resolve under the /portfolio and /munzir rewrites.
const MEDIA = "/portfolio/media/";
const POSTER = MEDIA + "posters/";

// Media helpers. The first item in a case study's `media` list is what
// plays on the big screen when the page loads; every item shows in the
// thumbnail row underneath and can be clicked to swap onto the big screen.
const video = (file, alt, poster) => ({
  type: "video",
  src: MEDIA + file,
  poster: POSTER + (poster || file.replace(/\.[^.]+$/, "") + ".jpg"),
  alt,
});
const image = (file, alt) => ({ type: "image", src: MEDIA + file, alt });

export const siteMeta = {
  name: "Munzir Mukhtar",
  role: "Creative Technologist",
  roleDetail: "3D, Mixed Reality and Interactive",
  studio: "Founder, Virtuosus",
  tagline:
    "I build 3D that people experience: mixed reality activations, CGI moments, browser games and interactive worlds for artists and brands.",
  location: "New York, working globally",
  email: "77PhoenixLane@gmail.com",
  instagram: { handle: "@munzir_here", url: "https://instagram.com/munzir_here" },
  linkedin: "https://www.linkedin.com/in/munzir-mukhtar-85ab47363",
  // Master copies of all resume versions live in the "Munzir Mukhtar Resumes" doc.
  resume: MEDIA + "Munzir-Mukhtar-Resume.pdf",
  award: {
    name: "Clio Award",
    note: "Winner 2026, Music / Branded Content",
    badgeImage: MEDIA + "clio-1.png",
    heroImage: MEDIA + "clio-2.png",
    url: "https://clios.com/winners-gallery/details/198821",
  },
  // Separate accolade: the "2026 Official Honoree" certificate visible in
  // clio-1.png is from The Webby Awards, not the Clios.
  secondaryAward: {
    name: "The Webby Awards",
    note: "2026 Official Honoree",
  },
};

export const clients = [
  "Tyler, the Creator",
  "Lil Uzi Vert",
  "Ye",
  "Paramount",
  "Magic Johnson",
  "Jordan Brand",
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
  { id: "vfx", label: "CGI & VFX" },
  { id: "web-game", label: "Games & Interactive" },
  { id: "ai", label: "AI" },
  { id: "brand", label: "Brand & Product" },
];

export const about = {
  statement:
    "I'm the founder and lead creative behind Virtuosus. I take ideas from concept to launch: 3D and CGI, mixed reality activations, VFX, and the code that makes them interactive, from browser games with live multiplayer to AI-powered web tools. I've delivered campaign-scale work for artists and brands solo and with small teams, and I like owning the whole pipeline.",
  years: "7+",
  skills: [
    "Creative Technology & Interactive Prototyping",
    "3D Modeling, Texturing & Rendering",
    "CGI, VFX & Compositing",
    "AR / XR & Mixed Reality Activations",
    "Browser Games & Real-Time (HTML5 Canvas, JavaScript)",
    "AI Workflows (image and video generation, AI web tools)",
    "Cinema 4D · Redshift · Blender · ZBrush · Marvelous Designer",
    "After Effects · Unity · Unreal · Supabase · Vercel",
    "Creative Direction & Project Management",
  ],
  // TODO: swap for a final headshot/bio photo when available.
  photo: MEDIA + "abtmunz2.png",
};

// Case studies, flagship first. `category` is an array of category ids from
// `categories` above: a project can belong to more than one tab.
// Rows left as null are simply not shown.
export const caseStudies = [
  {
    id: "uzi-vert-ufo",
    flagship: true,
    category: ["experiential", "ar-xr", "vfx"],
    title: "Lil Uzi Vert: Mixed Reality UFO Activation",
    client: "Lil Uzi Vert / Atlantic Records",
    year: 2024,
    role: "Creative Lead",
    brief:
      "Bring the alien world of Eternal Atake 2 into New York for the album rollout, as a UFO moment fans and press could experience and share.",
    challenge: null,
    concept: null,
    execution:
      "As Creative Lead, led the concept, directed the shoot and ran the CGI and VFX pipeline, from the UFO design through to the final mixed reality footage released for the rollout.",
    result:
      "Won a 2026 Clio Award (Music / Branded Content) and was covered by outlets including Complex and The New Yorker.",
    reach: [
      { value: "Clio", label: "Award winner 2026" },
    ],
    credits: null,
    press: [
      { label: "Clio winners gallery", url: "https://clios.com/winners-gallery/details/198821" },
    ],
    awardRef: { label: "Clio Award Winner 2026", href: "#credibility" },
    media: [
      video("MunzF_web.mp4", "Lil Uzi Vert UFO activation, main film"),
      video("revF_web.mp4", "Lil Uzi Vert UFO activation, crowd reaction"),
      video("UFOclip4.mp4", "UFO VFX shot"),
    ],
    emblem: MEDIA + "luvt.png",
    link: null,
  },
  {
    id: "tana-exe",
    flagship: false,
    category: ["web-game", "experiential"],
    title: "TANA.EXE: A Playable Album Rollout",
    client: "Tana",
    year: 2026,
    role: "Creator: art, game design and development",
    brief:
      "Turn a music artist's album rollout into a browser game world fans can live in, released in chapters across the campaign.",
    challenge:
      "It had to run instantly in any browser on phone or desktop with no app install, and hold a crowd of fans in the same room at the same time on release night.",
    concept:
      "Three chapters that follow the rollout. CH.1 Move In: fans unpack Tana's apartment and find the gold record. CH.2 Release Party: a live multiplayer listening party with a bouncer, room cap and chat. CH.3 Zombie Street: a wave-based zombie shooter on an NYC intersection.",
    execution:
      "Pixel art, sprites and collision maps, from reference photo to 4-way sprite sheets, built as a single HTML5 Canvas game with Supabase Realtime for multiplayer and deployed on Vercel. Includes character skins, mobile dual-joystick controls, 16-bit pixelate scene transitions, 4 weapons, tiered zombie waves and a leaderboard that rejects cheated scores.",
    result:
      "Each chapter shipped live during the campaign. The game passed 15,000 plays, 30% of players installed it as an app on their home screen, and 1,500 fans found the hidden exclusive content. The release party ran at a full 50 player room.",
    reach: [
      { value: "15k+", label: "Plays" },
      { value: "30%", label: "Installed as an app" },
      { value: "1,500", label: "Found the exclusive content" },
      { value: "50", label: "Player live room" },
    ],
    credits: "Solo build by Munzir Mukhtar for Tana",
    press: [],
    media: [
      video("tana.mp4", "TANA.EXE chapters 1 to 3, gameplay cut"),
      image("tana-process.jpg", "Character process: reference photo to pixel sprite to 4-way sprite sheet"),
      image("tana-roomfull.jpg", "Release party room at full capacity, 50 of 50 players"),
      image("tana-promo.jpg", "TANA.EXE promo art"),
    ],
    link: "https://popstar-life.com",
  },
  {
    id: "tyler-the-creator-cgi",
    flagship: false,
    category: ["vfx"],
    title: "Tyler, the Creator: Empire State CGI Moment",
    client: "Tyler, the Creator",
    year: 2025,
    role: "CGI Director",
    brief: "Direct a full CGI short around the Empire State Building for the rollout of Tyler, the Creator's DON'T TAP THE GLASS.",
    challenge: null,
    concept: null,
    execution: null,
    result: "Shared by the official Empire State Building account.",
    reach: [],
    credits: null,
    press: [
      { label: "Empire State Building post", url: "https://x.com/EmpireStateBldg/status/1947446591821942998" },
    ],
    media: [
      video("tylr_web.mp4", "Tyler, the Creator Empire State CGI short"),
      image("complxt.png", "The short as posted by the Empire State Building account"),
    ],
    emblem: MEDIA + "tylrt.png",
    link: "https://x.com/EmpireStateBldg/status/1947446591821942998",
  },
  {
    id: "sunsex-world",
    flagship: false,
    category: ["web-game", "ai", "vfx"],
    title: "SUNSEX: Isometric World and Social Platform",
    client: "Personal IP",
    year: null,
    role: "Creator, designer and developer",
    brief:
      "SUNSEX is my long-term creative IP: an isometric digital world layered over real life, where people show up as players with a profile, a place on the map and a style.",
    challenge: null,
    concept:
      "A real-life mirror RPG. Photoreal isometric locations, a live world map of players, and a nomad suitcase series that follows my own character through real places.",
    execution:
      "Designed the isometric CGI and built the platform at sunsex.xyz: a Leaflet world map with persistent player profiles on Supabase, plus DressUp, an AI avatar studio that runs virtual try-on and avatar generation through Replicate, with a credit system and Stripe checkout.",
    result: null,
    reach: [],
    credits: null,
    press: [],
    media: [
      image("ssx-compound.jpg", "SUNSEX isometric location render"),
      video("ssx-nomad.mp4", "Nomad suitcase sequence"),
      image("ssx-avatar.jpg", "DressUp AI avatar studio, player portrait"),
    ],
    link: "https://sunsex.xyz",
  },
  {
    id: "yeezy-ad-creation",
    flagship: false,
    category: ["brand", "vfx"],
    title: "YEEZY: Pods Product Visuals",
    client: "Ye / YEEZY",
    year: null,
    role: "3D Artist and Designer",
    brief:
      "Commissioned by Ye's team to design and render 3D product ad concepts for YEEZY Pods, with a secondary role in graphic design.",
    challenge: null,
    concept: null,
    execution: null,
    result: null,
    reach: [],
    credits: null,
    press: [],
    media: [
      video("podvid.MP4", "YEEZY Pods 3D product ad"),
      video("vul_web.mp4", "YEEZY campaign CGI"),
      image("yep.png", "Behind the scenes, and the YEEZY Pods ad live on Instagram"),
    ],
    emblem: MEDIA + "yzyt.png",
    link: null,
  },
  {
    id: "magic-johnson-animation",
    flagship: false,
    category: ["vfx"],
    title: "Magic Johnson: 3D Animation",
    client: "Magic Johnson",
    year: null,
    role: "3D Artist",
    brief: "A 3D animation piece created for Magic Johnson.",
    challenge: null,
    concept: null,
    execution: null,
    result: null,
    reach: [],
    credits: null,
    press: [],
    media: [video("MJ_web.mp4", "Magic Johnson 3D animation")],
    link: null,
  },
  {
    id: "air-jordan-3d-sneaker",
    flagship: false,
    category: ["vfx", "brand"],
    title: "Air Jordan: 3D Sneaker Rendition",
    client: "Jordan Brand",
    year: null,
    role: "3D Artist",
    brief: "A photoreal 3D CGI rendition of an Air Jordan sneaker.",
    challenge: null,
    concept: null,
    execution: null,
    result: null,
    reach: [],
    credits: null,
    press: [],
    media: [
      video("ajmet_web.mp4", "Air Jordan 3D sneaker render"),
      video("blkct.mp4", "Air Jordan render, alternate colorway"),
    ],
    link: null,
  },
];
