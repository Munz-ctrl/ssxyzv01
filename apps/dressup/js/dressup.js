// DressUp page logic (plain JS)

// Put near the top of dressup.js
function toAbsoluteHttpUrl(maybeUrl) {
  if (!maybeUrl) return "";
  // strip CSS url("...") wrappers and quotes
  let s = String(maybeUrl).trim()
    .replace(/^url\((.*)\)$/i, "$1")
    .replace(/^['"]|['"]$/g, "");
  // make absolute if relative
  if (!/^https?:\/\//i.test(s)) {
    s = new URL(s, window.location.origin).href;
  }
  return s;
}

// Ensure the hero dataset is initialized on load (in case it wasn't)
(function initHero() {
  var fallback = document.getElementById('hero').getAttribute('data-default-hero') || './assets/munz-base-portrait.jpg';
  var url = toAbsoluteHttpUrl(fallback);
  var hero = document.getElementById('hero');
  hero.style.backgroundImage = 'url("' + url + '")';
  hero.setAttribute('data-person-url', url);
})();





(async () => {
  try {
    const sb = window.supabase;
    if (!sb) return; // script tag fix above will make this truthy
    const { data: sess } = await sb.auth.getSession();
    if (!sess?.session?.user) {
      await sb.auth.signInAnonymously();
    }
  } catch (e) {
    console.warn('Anon auth not required / or failed:', e?.message || e);
  }
})();



const $ = (id) => document.getElementById(id);

const statusEl = $('status');
const hero = $('hero');
const btnUpload = $('btnUpload');
const btnGenerate = $('btnGenerate');
const fileInput = $('fileInput');
const garmentPreview = $('garmentPreview');

let garmentPublicUrl = null;

// 1) Boot hero image
(function initHero() {
  var params = new URLSearchParams(window.location.search);
  var qsHero = params.get('hero');
  var fallback = hero.getAttribute('data-default-hero') || './assets/munz-base-portrait.png';
  var url = qsHero || fallback;

  hero.style.backgroundImage = 'url("' + url + '")';
  hero.setAttribute('data-person-url', url); // keep current base for next gen
})();

// 2) Upload flow
btnUpload.addEventListener('click', function () {
  fileInput.click();
});

fileInput.addEventListener('change', async function (e) {
  var files = e.target.files;
  if (!files || !files[0]) return;
  var file = files[0];

  try {
    statusEl.textContent = 'Uploading garment…';

    // Supabase client is exposed by ../supabase.js as window.supabase or export.
    // If it exports `supabase`, grab from window for safety:
    var sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) throw new Error('Supabase client not found');

    var path = 'garments/' + Date.now() + '-' + file.name;
    var uploadRes = await sb.storage.from('userassets').upload(path, file, { upsert: true });
    if (uploadRes.error) throw uploadRes.error;

    var pub = await sb.storage.from('userassets').getPublicUrl(path);
    garmentPublicUrl = pub.data.publicUrl;

    garmentPreview.src = garmentPublicUrl;
    btnGenerate.disabled = false;
    statusEl.textContent = 'Garment ready. Hit “Generate on Munz”.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Upload failed: ' + (err.message || err);
  }
});

btnGenerate.addEventListener('click', async function () {
  if (!garmentPublicUrl) return;

  btnGenerate.disabled = true;
  statusEl.textContent = 'Generating… this can take a few seconds.';

  try {
    const personUrlRel = hero.getAttribute('data-person-url');
    // 👇 ensure absolute
    const personUrl = personUrlRel.startsWith('http')
      ? personUrlRel
      : new URL(personUrlRel, window.location.origin).href;

    // garmentPublicUrl from Supabase is already absolute
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/nano-banana',
        personUrl,
        garmentUrl: garmentPublicUrl,
        prompt: "Dress the person image with the uploaded garment. Keep identity, isometric portrait, photoreal, clean seams, natural lighting."
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('Generate error:', body);
      throw new Error('Try-on API error');
    }

    const payload = await res.json();
    const outputUrl = payload.outputUrl || payload.image || payload.output;
    if (!outputUrl) throw new Error('No output URL returned');

    hero.style.transition = 'filter .18s ease, opacity .18s ease';
    hero.style.opacity = '0.85';
    setTimeout(() => {
      hero.style.backgroundImage = `url("${outputUrl}")`;
      hero.setAttribute('data-person-url', outputUrl);
      hero.style.opacity = '1';
    }, 180);

    statusEl.textContent = 'Done.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Generation failed: ' + (err.message || err);
  } finally {
    btnGenerate.disabled = false;
  }
});

