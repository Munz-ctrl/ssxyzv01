(function(){
  function $(id){ return document.getElementById(id); }
  function toAbsoluteHttpUrl(u){ if(!u) return ''; let s=String(u).trim().replace(/^url\((.*)\)$/i,'$1').replace(/^['"]|['"]$/g,''); if(!/^https?:\/\//i.test(s)) s=new URL(s, window.location.origin).href; return s; }

  const params = new URLSearchParams(window.location.search);
  const qsHero = params.get('hero');
  const qsName = params.get('pname');
  const qsId   = params.get('pid');
  const qsSkin = params.get('skin');
  const qsBrand= params.get('brand');

  const hero = $('hero');
  const badgeNameEl = $('playerNameLabel');
  const badgeIdEl   = $('playerIdLabel');
  const brandLogo   = $('brandLogo');
  const animatedWMEl= $('animatedWatermarkText');
  const statusEl    = $('status');
  const btnUpload   = $('btnUpload');
  const btnGenerate = $('btnGenerate');
  const fileInput   = $('fileInput');
  const garmentPreview = $('garmentPreview');
  const thumbWrap   = document.querySelector('.thumb-wrap');
  const btnUndo     = $('btnUndo');
  const btnSave     = $('btnSave');
  const resetBtn    = $('btnResetHero');
  const skinSelectorEl = $('skinSelector');
  const skinSelectEl   = $('skinSelect');
  const garmentGrid = $('garmentGrid');

  const DEFAULT_HERO_IMG = hero?.getAttribute('data-default-hero') || '/shared/assets/fallbackIsoAvatar.webp';

  const cropModal = $('cropModal');
  const cropImage = $('cropImage');
  const cropConfirmBtn = $('cropConfirmBtn');
  const cropCancelBtn  = $('cropCancelBtn');

  let cropper = null; let pendingFileName = null;
  let brandConfig = null; let availableSkins = [];
  let currentPlayer = { name: qsName || 'SUNSEX', id: qsId || 'TRYON', heroUrl: qsHero || DEFAULT_HERO_IMG };
  let currentSkinName = qsSkin || 'Fitting Room'; let signedInLabel = qsId || 'anonymous';
  let garmentPublicUrl = null; let historyStack = []; let hasGeneratedOnce = false;

  function setHeroImage(url){ if(!hero) return; const fallback = hero.getAttribute('data-default-hero') || DEFAULT_HERO_IMG; const finalUrl = toAbsoluteHttpUrl(url||fallback); hero.style.backgroundImage = `url(\"${finalUrl}\")`; hero.setAttribute('data-person-url', finalUrl); }
  (function(){ setHeroImage(currentPlayer.heroUrl); })();

  function updatePlayerBadge(){ if(badgeNameEl) badgeNameEl.textContent = currentPlayer.name; if(badgeIdEl) badgeIdEl.textContent = '#'+currentPlayer.id; }
  updatePlayerBadge();

  function getWatermarkText(){ return `SUNSEX_FITTING_ROOM_☂\nSigned in as: ${signedInLabel}\nCollection: ${currentSkinName}`; }
  function runWatermarkTyping(){ if(!animatedWMEl) return; let i=0; function t(){ const s=getWatermarkText(); if(i<=s.length){ animatedWMEl.textContent = s.slice(0,i++); } else i=0; setTimeout(t,38);} t(); }
  runWatermarkTyping();

  function initHeroBackground(){ if(!hero) return; const absUrl = toAbsoluteHttpUrl(currentPlayer.heroUrl); hero.style.backgroundImage = `url(\"${absUrl}\")`; hero.setAttribute('data-person-url', absUrl); }
  initHeroBackground();

  async function initBrandAndGarments(){ try{ const r = await fetch('/apps/tryon/brands.json'); if(r.ok){ const list = await r.json().catch(()=>null); if(Array.isArray(list)){ const target = qsBrand || 'default'; brandConfig = list.find(b=>b.id===target) || list.find(b=>b.id==='default') || null; } } if(brandConfig){ if(brandConfig.displayName) currentPlayer.name = brandConfig.displayName; if(brandConfig.tag) currentPlayer.id = brandConfig.tag; if(brandConfig.skinLabel) currentSkinName = brandConfig.skinLabel; if(brandConfig.hero) setHeroImage(brandConfig.hero); updatePlayerBadge(); if(brandConfig.brandLogo && brandLogo){ const img = brandLogo.querySelector('img'); if(img){ img.src = brandConfig.brandLogo; img.alt = brandConfig.displayName || ''; } } if(brandConfig.id) document.body.classList.add(`brand-${brandConfig.id}`); if(Array.isArray(brandConfig.items) && brandConfig.items.length>0){ populateGarmentGrid(brandConfig.items); return; } }
    const fallback = await fetch('/shared/data/suitcaseItems.json').catch(()=>null);
    if(fallback){ const items = await fallback.json().catch(()=>null); if(Array.isArray(items)) populateGarmentGrid(items); }
  }catch(e){ console.warn('initBrandAndGarments failed', e); }
  }
  if(garmentGrid) initBrandAndGarments();

  function populateGarmentGrid(items){ if(!garmentGrid || !Array.isArray(items)) return; garmentGrid.innerHTML=''; items.forEach(item=>{ const slot=document.createElement('div'); slot.className='slot'; slot.dataset.empty='false'; const img=document.createElement('img'); img.src = item.image; img.alt=item.name; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain'; slot.appendChild(img); slot.title=item.name; slot.addEventListener('click', ()=>{ document.querySelectorAll('#garmentGrid .slot').forEach(s=>s.classList.remove('selected')); slot.classList.add('selected'); garmentPublicUrl = toAbsoluteHttpUrl(item.overlayImage || item.image); if(garmentPreview) garmentPreview.src = garmentPublicUrl; if(thumbWrap) thumbWrap.classList.remove('empty'); if(btnGenerate) btnGenerate.disabled = !hero?.getAttribute('data-person-url'); }); garmentGrid.appendChild(slot); }); }

  function updateThumbEmpty(){ try{ const hasSrc = garmentPreview.getAttribute && garmentPreview.getAttribute('src'); if(thumbWrap) thumbWrap.classList.toggle('empty', !hasSrc); }catch(_){ } }
  updateThumbEmpty();

  // Upload / Crop
  fileInput?.addEventListener('change', e=>{ const files = e.target.files; if(!files || !files[0]) return; const file = files[0]; if(cropper){ cropper.destroy(); cropper=null; } cropModal?.classList.remove('crop-hidden'); cropModal?.classList.add('crop-visible'); const objectUrl = URL.createObjectURL(file); pendingFileName = file.name || 'photo'; cropImage.onload = ()=>{ if(cropper) cropper.destroy(); cropper = new Cropper(cropImage, { aspectRatio:9/16, viewMode:1, dragMode:'move', autoCropArea:1, background:false, movable:true, zoomable:true, scalable:false, rotatable:false }); }; cropImage.src = objectUrl; statusEl && (statusEl.textContent = 'Adjust your crop, then confirm.'); });

  cropConfirmBtn?.addEventListener('click', async ()=>{ if(!cropper) return; try{ cropConfirmBtn.disabled=true; cropCancelBtn && (cropCancelBtn.disabled=true); const canvas = cropper.getCroppedCanvas({ width:1080, height:1920, imageSmoothingEnabled:true, imageSmoothingQuality:'high' }); if(!canvas) throw new Error('Crop failed'); const blob = await new Promise(res=>canvas.toBlob(res,'image/png')); if(!blob) throw new Error('No blob'); const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null); if(sb?.storage){ try{ const safe = (pendingFileName||'photo').replace(/[^a-z0-9\.\-_]/gi,'_'); const path = `tryon/person/${Date.now()}-${safe}.png`; const { error } = await sb.storage.from('userassets').upload(path, blob, { upsert:true, contentType:'image/png' }); if(!error){ const { data } = sb.storage.from('userassets').getPublicUrl(path); if(data?.publicUrl) setHeroImage(data.publicUrl); else setHeroImage(URL.createObjectURL(blob)); }else setHeroImage(URL.createObjectURL(blob)); }catch(e){ setHeroImage(URL.createObjectURL(blob)); } } else setHeroImage(URL.createObjectURL(blob)); cropModal?.classList.add('crop-hidden'); cropModal?.classList.remove('crop-visible'); cropper.destroy(); cropper=null; pendingFileName=null; cropImage.src=''; fileInput.value=''; statusEl && (statusEl.textContent='Photo updated. Pick a garment to try on.'); if(btnGenerate) btnGenerate.disabled = !garmentPublicUrl; }catch(err){ console.error(err); statusEl && (statusEl.textContent='Upload failed. Try again.'); cropModal?.classList.add('crop-hidden'); cropModal?.classList.remove('crop-visible'); cropper?.destroy(); cropper=null; pendingFileName=null; cropImage.src=''; fileInput.value=''; } finally{ cropConfirmBtn.disabled=false; cropCancelBtn && (cropCancelBtn.disabled=false); } });

  cropCancelBtn?.addEventListener('click', ()=>{ cropModal?.classList.add('crop-hidden'); cropModal?.classList.remove('crop-visible'); cropper?.destroy(); cropper=null; pendingFileName=null; cropImage.src=''; fileInput.value=''; statusEl && (statusEl.textContent='Upload cancelled.'); });
  btnUpload?.addEventListener('click', ()=>fileInput.click());

  // Generate
  btnGenerate?.addEventListener('click', async ()=>{ const personUrl = toAbsoluteHttpUrl(hero?.getAttribute('data-person-url')); if(!personUrl){ statusEl && (statusEl.textContent='Upload your photo first.'); return; } if(!garmentPublicUrl){ statusEl && (statusEl.textContent='Pick a garment from the collection.'); return; } btnGenerate.disabled=true; statusEl && (statusEl.textContent='Generating your try-on…'); try{ const payload = { model:'google/nano-banana', personUrl, garmentUrl: garmentPublicUrl, prompt:'Dress the uploaded person image with the selected garment.' }; const res = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }); const body = await res.json().catch(()=>({})); if(!res.ok){ statusEl && (statusEl.textContent = 'Generation failed: ' + (body.details || body.error || res.statusText)); throw new Error('Try-on API error'); } const outputUrl = body.outputUrl || body.image || body.output; if(!outputUrl) throw new Error('No output URL returned'); let finalUrl = outputUrl; try{ const sb = window.supabase || (typeof supabase !== 'undefined' ? supabase : null); if(sb?.storage){ const imgRes = await fetch(outputUrl, { mode:'cors' }); if(imgRes.ok){ const blob = await imgRes.blob(); const ext = (blob.type && blob.type.includes('png'))?'png':'jpg'; const key = `generated/tryon/${Date.now()}.${ext}`; const { error } = await sb.storage.from('userassets').upload(key, blob, { contentType: blob.type || 'image/png', upsert:true }); if(!error){ const { data } = sb.storage.from('userassets').getPublicUrl(key); if(data?.publicUrl) finalUrl = data.publicUrl; } } } }catch(e){ console.warn('save to supabase failed', e); }
    const currentUrl = toAbsoluteHttpUrl(hero.getAttribute('data-person-url')); if(currentUrl && currentUrl !== finalUrl) historyStack.push(currentUrl); hero.style.transition='filter .18s ease, opacity .18s ease'; hero.style.opacity='0.85'; setTimeout(()=>{ hero.style.backgroundImage = `url(\"${finalUrl}\")`; hero.setAttribute('data-person-url', finalUrl); hero.style.opacity = '1'; },180); statusEl && (statusEl.textContent='Done.'); hasGeneratedOnce=true; btnUndo && (btnUndo.style.display = historyStack.length ? 'inline-block' : 'none'); btnSave && (btnSave.style.display='inline-block'); resetBtn && (resetBtn.style.display='inline-block'); }catch(err){ console.error(err); statusEl && (statusEl.textContent='Generation failed: '+(err.message||err)); } finally{ btnGenerate.disabled=false; } });

  // Reset / Undo / Download
  resetBtn?.addEventListener('click', ()=>{ const url = toAbsoluteHttpUrl(DEFAULT_HERO_IMG); hero.style.transition='filter .18s ease, opacity .18s ease'; hero.style.opacity='0.85'; setTimeout(()=>{ hero.style.backgroundImage = `url(\"${url}\")`; hero.setAttribute('data-person-url', url); hero.style.opacity = '1'; },180); garmentPreview.removeAttribute('src'); garmentPublicUrl = null; document.querySelectorAll('#garmentGrid .slot').forEach(s=>s.classList.remove('selected')); historyStack = []; btnUndo && (btnUndo.style.display='none'); btnSave && (btnSave.style.display='none'); resetBtn && (resetBtn.style.display='none'); hasGeneratedOnce=false; updateThumbEmpty(); if(btnGenerate) btnGenerate.disabled=true; });

  btnUndo?.addEventListener('click', ()=>{ if(!historyStack.length) return; const previousUrl = historyStack.pop(); hero.style.transition='filter .18s ease, opacity .18s ease'; hero.style.opacity='0.85'; setTimeout(()=>{ hero.style.backgroundImage = `url(\"${previousUrl}\")`; hero.setAttribute('data-person-url', previousUrl); hero.style.opacity='1'; },180); btnUndo && (btnUndo.style.display = historyStack.length ? 'inline-block' : 'none'); });

  function loadImageWithCors(url){ return new Promise((resolve,reject)=>{ const img=new Image(); img.crossOrigin='anonymous'; img.onload = ()=>resolve(img); img.onerror = reject; img.src = url; }); }

  async function downloadCurrentHero(){ const url = toAbsoluteHttpUrl(hero.getAttribute('data-person-url')); if(!url) return; const filename = `${currentPlayer.name}-${currentPlayer.id}-tryon-${Date.now()}.png`; const canvas = $('downloadCanvas'); if(!canvas){ try{ const resp = await fetch(url); if(!resp.ok) throw new Error('HTTP '+resp.status); const blob = await resp.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); }catch(e){ const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); } return; } try{ const img = await loadImageWithCors(url); const w = img.naturalWidth || img.width || 1080; const h = img.naturalHeight || img.height || 1920; canvas.width=w; canvas.height=h; const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,w,h); ctx.drawImage(img,0,0,w,h); const pad=Math.round(h*0.03); const wmText=getWatermarkText(); const lines = wmText.split('\n'); const fontSize = Math.max(16, Math.round(h*0.022)); const lineHeight = Math.round(fontSize*1.2); ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`; ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.textBaseline='bottom'; ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=4; let baseY = h - pad - 6; for(let i = lines.length-1; i >=0; i--){ ctx.fillText(lines[i], pad*1.5, baseY); baseY -= lineHeight; } canvas.toBlob(blob=>{ if(!blob) throw new Error('Canvas export failed'); const a=document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); }, 'image/png', 0.95); }catch(err){ console.warn('Watermarked download failed, falling back to raw image:', err); try{ const resp = await fetch(url); if(!resp.ok) throw new Error('HTTP '+resp.status); const blob = await resp.blob(); const a=document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove(); }catch(e){ const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); } } }

  btnSave?.addEventListener('click', downloadCurrentHero);

})();
