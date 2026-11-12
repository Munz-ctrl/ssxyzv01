import { supabase } from '/shared/js/supabase.js';

const DEMO_PID = 'MUNZ';

// DOM refs
const dashMode      = document.getElementById('dashMode');
const authBtn       = document.getElementById('authBtn');
const logoutBtn     = document.getElementById('logoutBtn');
const authDialog    = document.getElementById('authDialog');
const closeAuth     = document.getElementById('closeAuthDialog');
const guestPrompt   = document.getElementById('guestPrompt');
const guestLoginBtn = document.getElementById('guestLoginBtn');
const actionsList   = document.getElementById('actionsList');
const actionsTitle  = document.getElementById('actionsTitle');
const actionsCopy   = document.getElementById('actionsCopy');
const cardLabel     = document.getElementById('cardLabel');
const playerName    = document.getElementById('playerName');
const playerTag     = document.getElementById('playerTag');
const avatarImg     = document.getElementById('avatarImg');
const xpFill        = document.getElementById('xpFill');
const levelLabel    = document.getElementById('levelLabel');
const footerText    = document.getElementById('footerText');

// Auth dialog tab switching
document.querySelectorAll('.dtab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dpanel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.panel + 'Panel').classList.add('active');
  });
});

// Open / close auth dialog
function openAuth() { authDialog.showModal(); }
function closeAuthDialog() { authDialog.close(); }

authBtn.addEventListener('click', openAuth);
guestLoginBtn.addEventListener('click', openAuth);
closeAuth.addEventListener('click', closeAuthDialog);
authDialog.addEventListener('click', e => { if (e.target === authDialog) closeAuthDialog(); });

// Sign in
document.getElementById('siBtn').addEventListener('click', async () => {
  const email = document.getElementById('siEmail').value.trim();
  const pass  = document.getElementById('siPass').value;
  const status = document.getElementById('siStatus');
  status.textContent = 'Signing in...';

  const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
  if (error) {
    status.textContent = error.message;
  } else {
    closeAuthDialog();
    await init();
  }
});

// Sign up
document.getElementById('suBtn').addEventListener('click', async () => {
  const email = document.getElementById('suEmail').value.trim();
  const pass  = document.getElementById('suPass').value;
  const status = document.getElementById('suStatus');
  status.textContent = 'Creating account...';

  const { error } = await supabase.auth.signUp({ email, password: pass });
  if (error) {
    status.textContent = error.message;
  } else {
    status.textContent = 'Check your email to confirm your account.';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  await init();
});


// ── Render helpers ───────────────────────────────────────────

function renderPlayerCard(player) {
  playerName.textContent = player.name || player.pid;
  levelLabel.textContent = `LVL ${String(player.level || 1).padStart(2, '0')}`;

  const xpPct = Math.min(100, ((player.xp || 0) % 1000) / 10);
  xpFill.style.width = xpPct + '%';

  if (player.avatar) {
    avatarImg.src = player.avatar;
  }
}

function buildActions(pills) {
  actionsList.innerHTML = '';
  pills.forEach(({ href, title, sub, primary }) => {
    const a = document.createElement('a');
    a.href = href;
    a.className = 'dash-pill' + (primary ? ' primary' : '');
    a.innerHTML = `<span class="pill-title">${title}</span><span class="pill-sub">${sub}</span>`;
    actionsList.appendChild(a);
  });
}


// ── Main init ────────────────────────────────────────────────

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();
  const authUser = sessionData?.session?.user || null;

  // Always load MUNZ for baseline
  const { data: munz } = await supabase
    .from('players')
    .select('*')
    .eq('pid', DEMO_PID)
    .maybeSingle();

  if (authUser) {
    // ── Logged-in state ──────────────────────────────────────
    authBtn.style.display = 'none';
    logoutBtn.style.display = '';
    guestPrompt.style.display = 'none';

    // Look up user's own player
    const { data: myPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('owner_id', authUser.id)
      .maybeSingle();

    if (myPlayer) {
      // Has a linked player
      cardLabel.textContent = 'Player';
      playerTag.textContent = myPlayer.is_public ? 'public player · on the map' : 'private profile';
      dashMode.textContent = myPlayer.pid;
      footerText.textContent = `SUNSEX_MIRROR · logged in as ${myPlayer.name || myPlayer.pid}`;
      renderPlayerCard(myPlayer);

      actionsTitle.textContent = 'Your world';
      actionsCopy.textContent = 'Your connected profile and tools.';

      buildActions([
        { href: '/map',          title: 'Global Map',        sub: 'view zones, players & locations', primary: true },
        { href: '/dressup',      title: 'Avatar Studio',     sub: 'create & style your look' },
        { href: '/nomadsuitcase',title: 'Nomad Suitcase',    sub: 'MUNZ featured showcase' },
        { href: `/edit-profile?id=${myPlayer.pid}`, title: 'Edit Profile', sub: 'update your name, avatar & mission' },
      ]);

    } else {
      // Logged in but no player yet
      cardLabel.textContent = 'Demo';
      playerTag.textContent = 'player profile not yet activated';
      dashMode.textContent = 'logged in · no player';
      footerText.textContent = `SUNSEX_MIRROR · account active · no player assigned`;
      if (munz) renderPlayerCard(munz);

      actionsTitle.textContent = 'Get started';
      actionsCopy.textContent = 'Your account is active. Explore the world while your player profile is being set up.';

      buildActions([
        { href: '/map',          title: 'Global Map',     sub: 'explore the world', primary: true },
        { href: '/dressup',      title: 'Avatar Studio',  sub: 'try the dress-up tool' },
        { href: '/nomadsuitcase',title: 'Nomad Suitcase', sub: 'MUNZ featured showcase' },
      ]);
    }

  } else {
    // ── Guest state ──────────────────────────────────────────
    authBtn.style.display = '';
    logoutBtn.style.display = 'none';
    guestPrompt.style.display = 'flex';

    cardLabel.textContent = 'Demo Player';
    playerTag.textContent = 'default demo profile · isometric mirror';
    dashMode.textContent = 'guest mode';
    footerText.textContent = 'SUNSEX_MIRROR · guest mode · viewing MUNZ';

    if (munz) renderPlayerCard(munz);

    actionsTitle.textContent = 'Explore the world';
    actionsCopy.textContent = 'Viewing demo player MUNZ. Log in to access your own profile.';

    buildActions([
      { href: '/map',          title: 'Global Map',        sub: 'view all players & locations', primary: true },
      { href: '/dressup',      title: 'Avatar Studio',     sub: 'try the AI dress-up tool' },
      { href: '/nomadsuitcase',title: 'Nomad Suitcase',    sub: 'MUNZ featured showcase' },
    ]);
  }
}

init();
