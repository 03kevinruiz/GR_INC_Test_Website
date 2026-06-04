/**
 * gallery-api.js
 *
 * Shared script included on every service page AND our-work.html.
 * Fetches project data from the admin API and renders photo gallery cards.
 * Also injects and controls the lightbox modal.
 *
 * Service page usage:
 *   <div id="service-gallery" data-service-slug="kitchen-remodeling"></div>
 *   <script src="gallery-api.js"></script>
 *
 * Our-Work page usage:
 *   <div id="all-services-gallery"></div>
 *   <script src="gallery-api.js"></script>
 */
(function () {
  'use strict';

  // ── API base: same-origin when served through admin-server.js (port 3001)
  //    Falls back to localhost:3001 when the page is served on a different port.
  const API = window.location.port === '3001'
    ? '/api'
    : 'http://localhost:3001/api';

  const UPLOADS = window.location.port === '3001'
    ? '/uploads'
    : 'http://localhost:3001/uploads';

  // ── Fetch helpers ──────────────────────────────────────────────────────────
  async function get(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return r.json();
    } catch (_) { return null; }
  }

  // ── Photo card HTML ────────────────────────────────────────────────────────
  function photoCardHTML(project, coverFile, count) {
    const hasPhoto = coverFile && count > 0;
    return `
      <button type="button"
        class="photo-card rounded-[4px] overflow-hidden shadow-card bg-white group cursor-pointer text-left w-full block hover:shadow-card-lg transition-shadow duration-300 focus-visible:ring-2 focus-visible:ring-t500"
        data-gallery-project="${project.id}"
        data-gallery-label="${esc(project.name)}">
        <div class="overflow-hidden relative">
          ${hasPhoto
            ? `<img src="${UPLOADS}/${esc(coverFile)}" alt="${esc(project.name)}"
                 class="w-full h-56 object-cover group-hover:scale-[1.04] transition-transform duration-500"
                 style="image-orientation:from-image;" loading="lazy" />`
            : `<div class="w-full h-56 bg-t100 flex items-center justify-center">
                 <svg class="w-12 h-12 text-t400/40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
                 </svg>
               </div>`
          }
          ${count > 0 ? `<span class="absolute top-2 right-2 bg-black/60 text-white font-heading font-bold text-[9px] tracking-[0.12em] uppercase px-2 py-1 rounded-[3px]">${count} Photo${count !== 1 ? 's' : ''}</span>` : ''}
          ${hasPhoto ? `<span class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20 pointer-events-none">
            <span class="bg-white/90 text-t800 font-heading font-bold text-[10px] tracking-[0.12em] uppercase px-3 py-1.5 rounded-full shadow-card flex items-center gap-1.5">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
              Expand Gallery
            </span>
          </span>` : ''}
        </div>
        <div class="p-4">
          <p class="font-heading font-semibold text-[14px] text-t800">${esc(project.name)}</p>
          ${project.location ? `<p class="text-[12px] text-t600/60 mt-0.5">📍 ${esc(project.location)}</p>` : ''}
        </div>
      </button>
    `;
  }

  // ── "No projects yet" placeholder ─────────────────────────────────────────
  function emptyStateHTML(serviceName) {
    return `
      <div class="col-span-full py-12 text-center text-t600/60">
        <svg class="w-12 h-12 mx-auto mb-3 text-t400/30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
        </svg>
        <p class="font-heading font-semibold text-[14px] text-t700 mb-1">${serviceName} photos coming soon</p>
        <p class="text-[13px]">Real project photos will appear here once uploaded.</p>
      </div>
    `;
  }

  // ── Lightbox modal ─────────────────────────────────────────────────────────
  let galleryPhotos = [];
  let galIdx = 0;

  function injectModal() {
    if (document.getElementById('gapi-modal')) return;
    const tpl = document.createElement('div');
    tpl.innerHTML = `
      <div id="gapi-modal" class="fixed inset-0 z-[200] hidden" role="dialog" aria-modal="true" aria-label="Photo Gallery">
        <div id="gapi-backdrop" class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 flex flex-col items-center justify-center min-h-full px-4 py-8">
          <div class="w-full max-w-[900px]">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-3 min-w-0">
                <p id="gapi-title" class="font-heading font-bold text-white text-[15px] tracking-[-0.01em] truncate"></p>
                <span id="gapi-counter" class="flex-shrink-0 font-body text-white/50 text-[13px]"></span>
              </div>
              <button id="gapi-close" class="flex-shrink-0 ml-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 active:scale-95 transition-[background-color,transform] duration-150 flex items-center justify-center text-white" aria-label="Close">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div id="gapi-viewer" class="relative overflow-hidden rounded-[4px] shadow-card-lg select-none" style="height:500px;">
              <img id="gapi-img" class="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none" style="image-orientation:from-image;" src="" alt="" />
              <button id="gapi-prev" class="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-[background-color,transform] duration-150 flex items-center justify-center text-white" aria-label="Previous">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
              </button>
              <button id="gapi-next" class="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 hover:bg-black/75 active:scale-95 transition-[background-color,transform] duration-150 flex items-center justify-center text-white" aria-label="Next">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
            <div class="mt-3 overflow-x-auto" style="scrollbar-width:thin;scrollbar-color:#2E8FA5 #1a1a2e;">
              <div id="gapi-thumbs" class="flex gap-2 pb-1"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(tpl.firstElementChild);

    document.getElementById('gapi-close').addEventListener('click', closeGallery);
    document.getElementById('gapi-backdrop').addEventListener('click', closeGallery);
    document.getElementById('gapi-prev').addEventListener('click', () => showPhoto(galIdx - 1));
    document.getElementById('gapi-next').addEventListener('click', () => showPhoto(galIdx + 1));
    document.addEventListener('keydown', e => {
      if (!document.getElementById('gapi-modal').classList.contains('hidden')) {
        if (e.key === 'ArrowLeft')  showPhoto(galIdx - 1);
        if (e.key === 'ArrowRight') showPhoto(galIdx + 1);
        if (e.key === 'Escape')     closeGallery();
      }
    });
  }

  function openGallery(photos, title, startIdx) {
    galleryPhotos = photos;
    galIdx = startIdx || 0;
    document.getElementById('gapi-title').textContent = title;
    renderThumbs();
    showPhoto(galIdx);
    document.getElementById('gapi-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeGallery() {
    document.getElementById('gapi-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function showPhoto(idx) {
    const n = galleryPhotos.length;
    galIdx = ((idx % n) + n) % n;
    const photo = galleryPhotos[galIdx];
    document.getElementById('gapi-img').src = `${UPLOADS}/${photo.filename}`;
    document.getElementById('gapi-img').alt = photo.original_filename || '';
    document.getElementById('gapi-counter').textContent = `${galIdx + 1} / ${n}`;
    document.getElementById('gapi-prev').style.display = n < 2 ? 'none' : '';
    document.getElementById('gapi-next').style.display = n < 2 ? 'none' : '';
    // Scroll active thumb into view
    const thumbs = document.getElementById('gapi-thumbs').children;
    if (thumbs[galIdx]) {
      thumbs[galIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      Array.from(thumbs).forEach((t, i) => t.classList.toggle('ring-2', i === galIdx));
    }
  }

  function renderThumbs() {
    const strip = document.getElementById('gapi-thumbs');
    strip.innerHTML = galleryPhotos.map((p, i) => `
      <button type="button"
        class="flex-shrink-0 w-[72px] h-[52px] rounded overflow-hidden border-2 ${i === galIdx ? 'border-t500 ring-2 ring-t500' : 'border-transparent'} hover:border-t400 transition-[border-color] duration-150"
        style="padding:0"
        onclick="(function(btn){
          var strip=btn.closest('#gapi-thumbs');
          var idx=Array.from(strip.children).indexOf(btn);
          window.__gapiShowPhoto(idx);
        })(this)">
        <img src="${UPLOADS}/${esc(p.filename)}" alt="" class="w-full h-full object-cover" style="image-orientation:from-image;" loading="lazy" />
      </button>
    `).join('');
    // Expose for inline handlers
    window.__gapiShowPhoto = idx => showPhoto(idx);
  }

  // ── Wire card clicks on a container ───────────────────────────────────────
  function wireCardClicks(container, projectMediaMap) {
    container.querySelectorAll('[data-gallery-project]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.dataset.galleryProject);
        const label = btn.dataset.galleryLabel || '';
        const photos = (projectMediaMap[pid] || []).filter(m => m.media_type === 'photo');
        if (!photos.length) return;
        openGallery(photos, label, 0);
      });
    });
  }

  // ── Service page: render single service gallery ────────────────────────────
  async function renderServiceGallery(rootEl) {
    const slug = rootEl.dataset.serviceSlug;
    if (!slug) return;

    rootEl.innerHTML = '<div class="col-span-full py-8 text-center text-t600/50 text-[13px]">Loading projects…</div>';

    const services = await get(`${API}/services`);
    if (!services) { rootEl.innerHTML = emptyStateHTML(''); return; }

    const service = services.find(s => s.slug === slug);
    if (!service) { rootEl.innerHTML = emptyStateHTML(''); return; }

    const projects = await get(`${API}/services/${service.id}/projects`);
    if (!projects || !projects.length) {
      rootEl.innerHTML = emptyStateHTML(service.name);
      return;
    }

    // Fetch media for all projects in parallel
    const mediaResults = await Promise.all(
      projects.map(p => get(`${API}/projects/${p.id}/media`))
    );

    const projectMediaMap = {};
    const cards = projects.map((p, i) => {
      const media = mediaResults[i] || [];
      projectMediaMap[p.id] = media;
      const cover = p.cover_media_id
        ? media.find(m => m.id === p.cover_media_id)
        : media.find(m => m.media_type === 'photo') || media[0];
      return photoCardHTML(p, cover?.filename || null, media.length);
    }).join('');

    rootEl.innerHTML = cards;
    wireCardClicks(rootEl, projectMediaMap);
  }

  // ── Our-Work page: render all services grouped ─────────────────────────────
  async function renderAllServicesGallery(rootEl) {
    rootEl.innerHTML = '<div class="py-8 text-center text-t600/50 text-[13px]">Loading portfolio…</div>';

    const services = await get(`${API}/services`);
    if (!services || !services.length) {
      rootEl.innerHTML = '<p class="text-center text-t600/50 py-8">No services found.</p>';
      return;
    }

    // Fetch projects for all services in parallel
    const allProjects = await Promise.all(
      services.map(s => get(`${API}/services/${s.id}/projects`))
    );

    // Collect only services that have projects
    const servicesWithProjects = services
      .map((s, i) => ({ service: s, projects: allProjects[i] || [] }))
      .filter(({ projects }) => projects.length > 0);

    if (!servicesWithProjects.length) {
      rootEl.innerHTML = `
        <div class="text-center py-16 text-t600/60">
          <svg class="w-14 h-14 mx-auto mb-4 text-t400/30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"/>
          </svg>
          <p class="font-heading font-semibold text-[16px] text-t700 mb-2">Portfolio coming soon</p>
          <p class="text-[14px]">Real project photos will appear here as work is completed and photos are uploaded.</p>
        </div>
      `;
      return;
    }

    // Fetch media for all projects
    const allMedia = {};
    await Promise.all(
      servicesWithProjects.flatMap(({ projects }) =>
        projects.map(async p => {
          allMedia[p.id] = await get(`${API}/projects/${p.id}/media`) || [];
        })
      )
    );

    // Render service sections
    let html = '';
    for (const { service, projects } of servicesWithProjects) {
      const cards = projects.map(p => {
        const media = allMedia[p.id] || [];
        const cover = p.cover_media_id
          ? media.find(m => m.id === p.cover_media_id)
          : media.find(m => m.media_type === 'photo') || media[0];
        return photoCardHTML(p, cover?.filename || null, media.length);
      }).join('');

      html += `
        <div class="mb-16 reveal" id="service-${service.slug}">
          <div class="flex items-center gap-4 mb-8">
            <span class="text-3xl">${service.icon || '🏠'}</span>
            <div>
              <h2 class="font-heading font-bold text-[26px] text-t800 leading-tight tracking-[-0.02em]">${esc(service.name)}</h2>
              ${service.description ? `<p class="text-[14px] text-t600/65 mt-0.5">${esc(service.description)}</p>` : ''}
            </div>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-service-projects="${service.id}">
            ${cards}
          </div>
        </div>
      `;
    }

    rootEl.innerHTML = html;

    // Wire all card clicks
    rootEl.querySelectorAll('[data-gallery-project]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = parseInt(btn.dataset.galleryProject);
        const label = btn.dataset.galleryLabel || '';
        const photos = (allMedia[pid] || []).filter(m => m.media_type === 'photo');
        if (!photos.length) return;
        openGallery(photos, label, 0);
      });
    });

    // Trigger scroll reveal if observer already set up on the page
    if (window.__gapiRevealObserver) {
      rootEl.querySelectorAll('.reveal').forEach(el => window.__gapiRevealObserver.observe(el));
    }
  }

  // ── HTML escape ────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    injectModal();

    const svcEl = document.getElementById('service-gallery');
    if (svcEl) renderServiceGallery(svcEl);

    const allEl = document.getElementById('all-services-gallery');
    if (allEl) renderAllServicesGallery(allEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
