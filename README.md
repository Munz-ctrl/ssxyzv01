# ssxyzv01

FOR cHATgpt REF this is our file structure 

/ssxyzv01
/
├── index.html                ← new bubbly root home
├── api/
│   └── generate.js
├── apps/
│   ├── ssx-demo/             ← main game MVP (map + dashboard)
│   │   ├── dashboard.html    ← player profile / inventory / avatar edit
│   │   ├── map.html          ← global map hub (you can reuse current map.html here)
│   │   ├── css/
│   │   │   └── ssx-demo.css
│   │   └── js/
│   │       ├── ssx-dashboard.js
│   │       └── ssx-map.js
│   │
│   ├── tools/                ← public digital stuff / misc
│   │   ├── dressup/
│   │   │   ├── assets/...
│   │   │   ├── css/dressup.css
│   │   │   ├── js/dressup.js
│   │   │   └── dressup.html
│   │   ├── tryon/
│   │   │   ├── assets/...
│   │   │   ├── css/tryon.css
│   │   │   ├── js/tryon.js
│   │   │   └── tryon.html
│   │   ├── puffcounter/
│   │   │   └── index.html
│   │   └── suitcase/         ← optional: old nomadsuitcase page
│   │       └── nomadsuitcase.html
│   │
│   └── brand-demos/          ← hidden / unlisted pitch links
│       ├── yahweh-demo.html
│       └── telfar-demo.html
│
└── shared/
    ├── assets/...
    ├── css/
    │   ├── styles.css
    │   └── home.css          ← NEW for root bubbles
    ├── data/...
    └── js/
        ├── main.js
        ├── ssxyz.js
        ├── playerUtils.js
        └── supabase.js



