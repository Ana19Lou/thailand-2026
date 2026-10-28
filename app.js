const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/14TPUDpY6H1zdEYGDVELXBw4QDgmC7tv57lcs_iweP5I/gviz/tq?tqx=out:csv&gid=0";
const STORAGE_DATA_KEY = 'tailandia_roteiro_offline';
const STORAGE_SYNC_TIME_KEY = 'tailandia_ultima_sync';
const STORAGE_VISITED_KEY = 'tailandia_visitados';
const STORAGE_PACKING_KEY = 'tailandia_mala';
const STORAGE_BUDGET_KEY = 'tailandia_gastos';
const STORAGE_THEME_KEY = 'tailandia_tema';
const STORAGE_NOTES_KEY = 'tailandia_notas';
const STORAGE_INFO_KEY = 'tailandia_info_emergencia';
const STORAGE_USER_KEY = 'tailandia_utilizador_atual';

const USERS = ['Ana', 'Raquel'];
const USER_COLORS = { Ana: '#C9A227', Raquel: '#3B82C4' };
const USER_SHEETS = { Ana: GOOGLE_SHEET_CSV_URL, Raquel: GOOGLE_SHEET_CSV_URL };

let currentUser = null;
function pKey(base) { return base + '__' + currentUser; }

const DEFAULT_PACKING = [
    "Passaporte", "Seguro de viagem", "Adaptador de tomada (Tipo A/C/O)",
    "Powerbank", "Protetor solar", "Repelente de mosquitos", "Roupa leve e respirável",
    "Fato de banho", "Chinelos", "Medicação pessoal", "Cópias digitais dos documentos"
];

let map;
let routeLayerGroup;
let globalItinerary = [];
let visitedMap = {};
let eurToThb = null;

function loadJSON(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}
function saveJSON(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

let appBooted = false;
async function bootApp() {
    if (appBooted) return;
    appBooted = true;
    console.log('Tailândia app — build 2026-10-26-g');
    
    initTheme();
    initMap();
    initCurrency();
    renderUserRows();
    updateWorldClock();
    renderPhrases('');
    updateTranslateLangLabels();
    initTranslatorMicAvailability();
    const phraseSearchEl = document.getElementById('phrase-search');
    if (phraseSearchEl) phraseSearchEl.oninput = () => renderPhrases(phraseSearchEl.value);

    const saved = localStorage.getItem(STORAGE_USER_KEY);
    if (saved && USERS.includes(saved)) {
        currentUser = saved;
        updateUserBadge();
        await startAppForUser();
    } else {
        const usersWithData = USERS.filter(u => localStorage.getItem('tailandia_visitados__' + u) !== null);
        currentUser = usersWithData.length === 1 ? usersWithData[0] : USERS[0];
        localStorage.setItem(STORAGE_USER_KEY, currentUser);
        updateUserBadge();
        await startAppForUser();
        showToast(`A usar como ${currentUser} — toca no ícone "${currentUser[0]}" para mudar`);
    }
}

async function startAppForUser() {
    visitedMap = loadJSON(pKey(STORAGE_VISITED_KEY), {});
    const dadosOffline = localStorage.getItem(pKey(STORAGE_DATA_KEY));
    if (dadosOffline && dadosOffline !== "[]") {
        globalItinerary = JSON.parse(dadosOffline);
        renderUI(globalItinerary);
    } else {
        mostrarEstadoCarregamento();
    }
    initTools();
    initInfo();
    await fetchDadosDoRoteiro();
}

function mostrarEstadoCarregamento() {
    document.getElementById('bottom-nav').innerHTML = `
        <div class="skeleton skel-nav"></div><div class="skeleton skel-nav"></div>
        <div class="skeleton skel-nav"></div><div class="skeleton skel-nav"></div>`;
    document.getElementById('content-container').innerHTML = `
        <div style="padding:22px 18px 8px;">
            <div class="skeleton" style="height:110px; border-radius:16px; margin-bottom:14px;"></div>
            <div class="skeleton skel-block" style="width:60%;"></div>
            <div class="skeleton" style="height:24px; width:80%; margin-bottom:16px;"></div>
            <div class="skeleton" style="height:64px; border-radius:18px; margin-bottom:16px;"></div>
            <div class="skeleton skel-block" style="height:56px; border-radius:16px;"></div>
        </div>`;
}

function renderUserRows() {
    const wrap = document.getElementById('user-rows');
    if (!wrap) return;
    wrap.innerHTML = USERS.map(u => `
        <div class="user-row ${currentUser === u ? 'selected' : ''}" onclick="selectUser('${u}')">
            <div class="avatar" style="background:${USER_COLORS[u]};">${u[0]}</div>
            <span class="name">${u}</span>
            <i class="fa-solid fa-check check-mark"></i>
        </div>`).join('');
}
function closeAllSheets() {
    document.querySelectorAll('.sheet').forEach(s => s.classList.remove('open'));
    document.getElementById('sheet-overlay').classList.remove('open');
}
function centerInScroller(scroller, el, axis) {
    if (!scroller || !el) return;
    const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (axis === 'x') scroller.scrollTo({ left: scroller.scrollLeft + (er.left - sr.left) - (sr.width - er.width) / 2, behavior: 'smooth' });
    else scroller.scrollTo({ top: scroller.scrollTop + (er.top - sr.top) - (sr.height - er.height) / 2, behavior: 'smooth' });
}
window.addEventListener('load', () => {
    const root = document.getElementById('app-root');
    root.addEventListener('scroll', () => { root.scrollTop = 0; root.scrollLeft = 0; });
});

function openUserSheet() {
    closeAllSheets();
    renderUserRows();
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('user-sheet').classList.add('open');
}
function closeUserSheet() {
    document.getElementById('user-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
}
async function selectUser(name) {
    currentUser = name;
    localStorage.setItem(STORAGE_USER_KEY, name);
    updateUserBadge();
    closeUserSheet();
    await startAppForUser();
}
function updateUserBadge() {
    const badge = document.getElementById('user-badge');
    if (!badge || !currentUser) return;
    badge.textContent = currentUser[0];
    badge.style.background = USER_COLORS[currentUser] || 'var(--jade)';
    badge.title = currentUser;
}

function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME_KEY);
    const theme = saved || 'light';
    applyTheme(theme);
    document.getElementById('theme-toggle').onclick = () => {
        if (navigator.vibrate) navigator.vibrate(50);
        const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
    };
}
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    const icon = document.querySelector('#theme-toggle i');
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

async function fetchDadosDoRoteiro() {
    if (!currentUser) return;
    const btns = document.querySelectorAll('.sync-btn');
    btns.forEach(b => b.classList.add('syncing'));
    document.getElementById('header-location').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A sincronizar Excel...';

    const sheetUrl = USER_SHEETS[currentUser] || GOOGLE_SHEET_CSV_URL;
    const urlDireta = sheetUrl + "&_t=" + new Date().getTime();

    try {
        const res = await fetch(urlDireta);
        if (!res.ok) throw new Error("Falha ao ir buscar dados");
        const textoCsv = await res.text();

        Papa.parse(textoCsv, {
            header: true, skipEmptyLines: true,
            complete: function(results) {
                globalItinerary = transformarCSVemItinerario(results.data);
                if (globalItinerary.length === 0) throw new Error("Excel Vazio");
                localStorage.setItem(pKey(STORAGE_DATA_KEY), JSON.stringify(globalItinerary));
                const horaAtual = new Date().toLocaleString('pt-PT');
                localStorage.setItem(pKey(STORAGE_SYNC_TIME_KEY), horaAtual);
                mostrarBannerSucesso(horaAtual);
                renderUI(globalItinerary);
            }
        });
    } catch (error) {
        const dadosOffline = localStorage.getItem(pKey(STORAGE_DATA_KEY));
        if (dadosOffline && dadosOffline !== "[]") {
            globalItinerary = JSON.parse(dadosOffline);
            renderUI(globalItinerary);
            mostrarBannerAviso("A usar dados locais (Modo Offline)");
        } else {
            mostrarEstadoErro("Não foi possível ligar à folha. Verifica se está publicada na Web.");
        }
    } finally {
        btns.forEach(b => b.classList.remove('syncing'));
    }
}

function mostrarBannerSucesso(hora) {
    const banner = document.getElementById('offline-banner');
    banner.style.display = 'block'; banner.style.backgroundColor = '#0E7C66';
    banner.innerHTML = `<i class="fa-solid fa-check mr-1"></i> Sincronizado com sucesso! (${globalItinerary.length} dias)`;
    setTimeout(() => { banner.style.display = 'none'; }, 3500);
}

function mostrarBannerAviso(msg) {
    const banner = document.getElementById('offline-banner');
    banner.style.display = 'block'; banner.style.backgroundColor = '#E7A33E';
    banner.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${msg}`;
}

function mostrarEstadoErro(msg) {
    const container = document.getElementById('content-container');
    container.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:40px 30px; text-align:center; color:var(--ink-soft);">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:34px; margin-bottom:14px; color:var(--danger);"></i>
            <p style="font-weight:700; font-size:14px; color:var(--ink); margin-bottom:6px;">Erro de Sincronização</p>
            <p style="font-size:12.5px; margin-bottom:18px;">${msg}</p>
            <button onclick="fetchDadosDoRoteiro()" class="sync-btn"><i class="fa-solid fa-rotate"></i> Tentar de novo</button>
        </div>`;
}

function transformarCSVemItinerario(linhasCSV) {
    const diasMap = {};
    const itinerarioAgrupado = [];

    linhasCSV.forEach((linha) => {
        const row = {};
        for (let key in linha) {
            const safeKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
            row[safeKey] = linha[key];
        }

        const diaVal = row['dia'];
        if (!diaVal || String(diaVal).trim() === "") return;

        const idDia = "dia_" + String(diaVal).trim();
        if (!diasMap[idDia]) {
            diasMap[idDia] = {
                id: idDia, dayNum: String(diaVal).trim(), date: row['data'] || "",
                title: row['titulo'] || "", location: row['localizacao'] || row['local'] || "",
                hotel: row['hotel'] || row['alojamento'] || "", coords: []
            };
            itinerarioAgrupado.push(diasMap[idDia]);
        }

        const tTipo = row['transportetipo'] || row['transporte'] || "";
        let transporteLocal = null;
        if (tTipo && tTipo !== "-" && tTipo.trim() !== "") {
            transporteLocal = {
                type: tTipo.trim(),
                time: (row['transportetempo'] || row['tempo'] || "").trim(),
                icon: (row['transporteicone'] || row['icone'] || "fa-arrow-right").trim(),
                note: (row['transportenota'] || row['nota'] || "").trim()
            };
        }

        const lat = parseFloat(String(row['latitude'] || row['lat'] || "").replace(',', '.'));
        const lng = parseFloat(String(row['longitude'] || row['lng'] || row['lon'] || "").replace(',', '.'));

        diasMap[idDia].coords.push({
            name: row['nomelocal'] || row['local'] || row['nome'] || "",
            lat: lat, lng: lng,
            desc: row['descricao'] || "",
            mapsLink: (() => { const raw = (row['mapslink'] || row['maps'] || row['linkmaps'] || "").trim(); return /^https?:\/\//i.test(raw) ? raw : ""; })(),
            transport: transporteLocal
        });
    });

    return itinerarioAgrupado;
}

function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function buildPlaceUrl(name, location, lat, lng, explicitLink) {
    if (explicitLink) return explicitLink;
    const hasCoords = !isNaN(lat) && !isNaN(lng);
    if (isIOS()) return hasCoords ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}` : `https://maps.apple.com/?q=${encodeURIComponent(name + ' ' + location)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hasCoords ? `${lat},${lng}` : (name + ' ' + location))}`;
}
function buildDirectionsUrl(originLat, originLng, originText, destLat, destLng, destText) {
    const hasOrigin = !isNaN(originLat) && !isNaN(originLng), hasDest = !isNaN(destLat) && !isNaN(destLng);
    if (isIOS()) {
        const saddr = hasOrigin ? `${originLat},${originLng}` : encodeURIComponent(originText);
        const daddr = hasDest ? `${destLat},${destLng}` : encodeURIComponent(destText);
        return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`;
    }
    const origin = hasOrigin ? `${originLat},${originLng}` : encodeURIComponent(originText);
    const destination = hasDest ? `${destLat},${destLng}` : encodeURIComponent(destText);
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

const RIDE_APP_DEFS = {
    bolt: { label: 'Bolt', icon: 'fa-bolt', color: '#34D07F', copyAssist: true, buildScheme: () => `bolt://` },
    grab: { label: 'Grab', icon: 'fa-car-side', color: '#00B14F', copyAssist: true, buildScheme: () => isIOS() ? `grab://` : `intent://#Intent;package=com.grabtaxi.passenger;end` },
    uber: { label: 'Uber', icon: 'fa-car', color: '#111111', isUniversalLink: true, buildScheme: (o, d) => `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${o.lat}&pickup[longitude]=${o.lng}&pickup[formatted_address]=${encodeURIComponent(o.addr)}&dropoff[latitude]=${d.lat}&dropoff[longitude]=${d.lng}&dropoff[formatted_address]=${encodeURIComponent(d.addr)}`, iosTerm: 'Uber', androidTerm: 'Uber' }
};
function detectRideApps(typeStr) {
    if (!typeStr) return [];
    const tokens = typeStr.toLowerCase().split(/[\/,]| e | and |&|\+/i).map(t => t.trim()).filter(Boolean);
    const matched = [];
    Object.keys(RIDE_APP_DEFS).forEach(key => { if (tokens.some(t => t.includes(key))) matched.push(key); });
    return matched;
}

function showToast(msg) {
    if (navigator.vibrate) navigator.vibrate(40);
    let toast = document.getElementById('app-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.style.cssText = 'position:absolute; left:50%; bottom:118px; transform:translateX(-50%); background:var(--jade-deep); color:#fff; padding:10px 18px; border-radius:99px; font-size:12px; font-weight:600; z-index:200; box-shadow:0 4px 14px rgba(0,0,0,0.35); max-width:85%; text-align:center;';
        document.getElementById('app-root').appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => { toast.style.display = 'none'; }, 2400);
}

function tryOpenRideApp(schemeUrl, appKey) {
    const def = RIDE_APP_DEFS[appKey];
    const term = isIOS() ? def.iosTerm : def.androidTerm;
    const storeUrl = isIOS() ? `https://apps.apple.com/search?term=${encodeURIComponent(term)}` : `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps`;
    let left = false;
    const markLeft = () => { left = true; };
    window.addEventListener('blur', markLeft, { once: true });
    document.addEventListener('visibilitychange', markLeft, { once: true });
    window.location.href = schemeUrl;
    setTimeout(() => {
        window.removeEventListener('blur', markLeft);
        document.removeEventListener('visibilitychange', markLeft);
        if (!left) window.location.href = storeUrl;
    }, 1300);
}

function copyAndOpenRideApp(schemeUrl, appKey, address) {
    const finish = () => {
        showToast(`Endereço copiado — cola no destino: "${address}"`);
        setTimeout(() => tryOpenRideApp(schemeUrl, appKey), 500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(address).then(finish).catch(finish); } 
    else { finish(); }
}

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([13.7563, 100.5018], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { 
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);
    routeLayerGroup = L.layerGroup().addTo(map);
    setTimeout(() => { map.invalidateSize(); }, 400);
}

function renderRouteOnMap(dayData) {
    routeLayerGroup.clearLayers();
    const validCoords = dayData.coords.filter(c => !isNaN(c.lat) && !isNaN(c.lng));
    if (validCoords.length === 0) return;
    const points = validCoords.map(c => [c.lat, c.lng]);

    validCoords.forEach((coord, idx) => {
        const color = idx === 0 ? '#0E7C66' : (idx === points.length - 1 ? '#E0574C' : '#C9A227');
        const customIcon = L.divIcon({
            className: 'dummy',
            html: `<div style="background-color:${color}; width:24px; height:24px; border-radius:50%; border:3px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3); display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:800;">${idx + 1}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12]
        });

        const openUrl = buildPlaceUrl(coord.name, dayData.location, coord.lat, coord.lng, coord.mapsLink);
        L.marker([coord.lat, coord.lng], { icon: customIcon })
            .bindPopup(`<b>${idx + 1}. ${coord.name}</b><br><span style="font-size:11px;color:gray;">${coord.desc}</span><br><a href="${openUrl}" target="_blank" rel="noopener noreferrer" style="color:#0E7C66;font-weight:700;font-size:11px;">Abrir no Maps →</a>`)
            .addTo(routeLayerGroup);
    });

    if (points.length > 1) { map.fitBounds(L.polyline(points).getBounds(), { padding: [40, 40], paddingTopLeft: [20, 90] }); } 
    else { map.setView(points[0], 14); }

    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i], p2 = points[i + 1];
        fetch(`https://router.project-osrm.org/route/v1/driving/${p1[1]},${p1[0]};${p2[1]},${p2[0]}?geometries=geojson`)
            .then(res => res.json())
            .then(data => {
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    L.polyline(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), { color: '#0E7C66', weight: 4, opacity: 0.85 }).addTo(routeLayerGroup);
                } else {
                    L.polyline([p1, p2], { color: '#0E7C66', weight: 4, dashArray: '6, 8', opacity: 0.85 }).addTo(routeLayerGroup);
                }
            })
            .catch(() => L.polyline([p1, p2], { color: '#0E7C66', weight: 4, dashArray: '6, 8', opacity: 0.85 }).addTo(routeLayerGroup));
    }
}

function dayCompletion(day) {
    const customs = loadJSON(pKey('tailandia_paragens_' + day.id), []);
    const total = day.coords.length + customs.length;
    if (total === 0) return { done: 0, total: 0, pct: 0 };
    let done = 0;
    day.coords.forEach((c, i) => { if (visitedMap[day.id + '_' + i]) done++; });
    customs.forEach(c => { if (c.done) done++; });
    return { done, total, pct: Math.round((done / total) * 100) };
}

function buildStepsHtml(day) {
    let stepsHtml = '<div class="timeline">';
    day.coords.forEach((coord, i) => {
        const hasCoords = !isNaN(coord.lat) && !isNaN(coord.lng);
        const canOpen = hasCoords || !!coord.mapsLink;
        const openUrl = buildPlaceUrl(coord.name, day.location, coord.lat, coord.lng, coord.mapsLink);
        const visitKey = day.id + '_' + i;
        const isDone = !!visitedMap[visitKey];
        const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
        const noteData = notes[visitKey];

        stepsHtml += `
            <div class="step-row ${isDone ? 'done' : ''}" id="row-${visitKey}" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:8px;">
                <div class="step-dot">${i + 1}</div>
                ${canOpen ? `<a class="step-card" style="flex:1;" href="${openUrl}" target="_blank" rel="noopener noreferrer">` : `<div class="step-card" style="flex:1;">`}
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <h4 style="font-weight:700; font-size:13.5px; line-height:1.3; margin:0; color:var(--ink);">${coord.name}</h4>
                        ${canOpen ? '<i class="fa-solid fa-arrow-up-right-from-square" style="color:#CBD5E1; font-size:10px; margin-top:2px;"></i>' : ''}
                    </div>
                    ${coord.desc ? `<p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">${coord.desc}</p>` : ''}
                ${canOpen ? '</a>' : '</div>'}
                <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
                    <div class="note-btn ${noteData ? 'has-note' : ''}" onclick="event.stopPropagation(); openNoteSheet('${day.id}', ${i}, '${coord.name.replace(/'/g, "\\'")}')" title="Nota / foto"><i class="fa-solid fa-note-sticky"></i></div>
                    <div class="visit-check ${isDone ? 'checked' : ''}" onclick="event.stopPropagation(); toggleVisited('${day.id}', ${i})"><i class="fa-solid fa-check"></i></div>
                </div>
            </div>
            ${noteData ? `<div class="note-preview">${noteData.photo ? `<img src="${noteData.photo}">` : ''}${noteData.text ? `<p>${noteData.text}</p>` : ''}</div>` : ''}`;

        if (coord.transport) {
            let destLat = NaN, destLng = NaN, destText = coord.name + ' ' + day.location;
            if (i < day.coords.length - 1) {
                const next = day.coords[i + 1];
                destLat = next.lat; destLng = next.lng; destText = next.name + ' ' + day.location;
            } else {
                destLat = coord.lat; destLng = coord.lng;
            }

            const rideApps = detectRideApps(coord.transport.type);
            if (rideApps.length > 0 && hasCoords && !isNaN(destLat) && !isNaN(destLng)) {
                const origin = { lat: coord.lat, lng: coord.lng, addr: coord.name + ' ' + day.location };
                const dest = { lat: destLat, lng: destLng, addr: destText };
                stepsHtml += `<div style="font-size:10.5px; color:var(--ink-soft); margin:0 0 5px 42px;">${coord.transport.time ? coord.transport.time + ' · ' : ''}toca para abrir com o trajeto preenchido:</div>`;
                stepsHtml += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin:0 0 10px 42px;">`;
                rideApps.forEach(key => {
                    const def = RIDE_APP_DEFS[key];
                    const scheme = def.buildScheme(origin, dest);
                    if (def.isUniversalLink) {
                        stepsHtml += `<a class="ride-app-btn" style="--ride-color:${def.color}" href="${scheme}" target="_blank" rel="noopener noreferrer"><i class="fa-solid ${def.icon}"></i> ${def.label}</a>`;
                    } else {
                        const addrEsc = dest.addr.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                        stepsHtml += `<button class="ride-app-btn" style="--ride-color:${def.color}" onclick="copyAndOpenRideApp('${scheme}', '${key}', '${addrEsc}')"><i class="fa-solid ${def.icon}"></i> ${def.label}</button>`;
                    }
                });
                stepsHtml += `</div>`;
                if (coord.transport.note) stepsHtml += `<div style="font-size:10.5px; color:var(--ink-soft); margin:-4px 0 14px 42px;">${coord.transport.note}</div>`;
            } else {
                const dirUrl = buildDirectionsUrl(coord.lat, coord.lng, coord.name + ' ' + day.location, destLat, destLng, destText);
                stepsHtml += `
                    <a class="transit-pill shadow-sm" href="${dirUrl}" target="_blank" rel="noopener noreferrer" title="Navegar">
                        <i class="fa-solid ${coord.transport.icon}"></i>
                        <span>${coord.transport.type}</span> <span style="opacity:0.5;">•</span> <span>${coord.transport.time}</span>
                    </a>
                    ${coord.transport.note ? `<div style="font-size:10.5px; color:var(--ink-soft); margin:-4px 0 14px 42px;">${coord.transport.note}</div>` : `<div style="margin-bottom:12px;"></div>`}`;
            }
        }
    });

    const customs = loadJSON(pKey('tailandia_paragens_' + day.id), []);
    customs.forEach(c => {
        const isDone = !!c.done;
        const openUrl = buildPlaceUrl(c.name, day.location, NaN, NaN, c.link);
        stepsHtml += `
            <div class="step-row ${isDone ? 'done' : ''}" style="display:flex; align-items:flex-start; gap:10px; margin-bottom:8px;">
                <div class="step-dot" style="background:var(--gold);"><i class="fa-solid fa-plus" style="font-size:10px;"></i></div>
                <a class="step-card" style="flex:1;" href="${openUrl}" target="_blank" rel="noopener noreferrer">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <h4 style="font-weight:700; font-size:13.5px; margin:0; color:var(--ink);">${c.name}<span class="custom-tag">Teu</span></h4>
                    </div>
                    ${c.note ? `<p style="font-size:12px; color:var(--ink-soft); margin:4px 0 0;">${c.note}</p>` : ''}
                </a>
                <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
                    <div class="note-btn" onclick="event.stopPropagation(); deleteCustomStop('${day.id}', '${c.id}')" title="Remover"><i class="fa-solid fa-trash"></i></div>
                    <div class="visit-check ${isDone ? 'checked' : ''}" onclick="event.stopPropagation(); toggleCustomStop('${day.id}', '${c.id}')"><i class="fa-solid fa-check"></i></div>
                </div>
            </div>`;
    });

    stepsHtml += `<button class="add-stop-btn" onclick="openCustomStopSheet('${day.id}')"><i class="fa-solid fa-plus"></i> Adicionar paragem</button>`;
    stepsHtml += '</div>';
    return stepsHtml;
}

function buildDayPanelHtml(day) {
    const comp = dayCompletion(day);
    return `
        <div class="day-hero skeleton" id="hero-${day.id}"></div>
        <div class="day-stats">${renderDayStatsHtml(day)}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span class="location-tag"><i class="fa-solid fa-location-dot"></i> ${day.location}</span>
            <span class="weather-chip" id="weather-${day.id}" style="display:none; color:var(--ink-soft); background: var(--line);"><i class="fa-solid fa-cloud"></i> --</span>
            <button onclick="fetchDadosDoRoteiro()" class="sync-btn"><i class="fa-solid fa-rotate"></i> Sync</button>
        </div>
        <h2 class="display" style="font-size:22px; font-weight:600; line-height:1.2; margin:0 0 10px; color:var(--ink);">${day.title}</h2>
        <div class="day-progress-wrap">
            <div class="day-progress-track"><div class="day-progress-fill" id="progress-${day.id}" style="width:${comp.pct}%;"></div></div>
            <span class="day-progress-label" id="progress-label-${day.id}">${comp.done}/${comp.total} visitados</span>
        </div>
        <div class="hotel-card">
            <i class="fa-solid fa-bed" style="color:var(--gold); font-size:16px;"></i>
            <div><div style="font-size:9px; text-transform:uppercase; letter-spacing:0.06em; font-weight:700; color:var(--gold);">Alojamento</div><div style="font-size:13px; font-weight:600;">${day.hotel}</div></div>
        </div>
        ${buildStepsHtml(day)}`;
}

function rerenderDayPanel(day) {
    const panel = document.getElementById(`panel-${day.id}`);
    if (panel) panel.innerHTML = buildDayPanelHtml(day);
    const comp = dayCompletion(day);
    const navItem = document.getElementById(`nav-${day.id}`);
    if (navItem) navItem.classList.toggle('done', comp.total > 0 && comp.done === comp.total);
    loadWeatherForDay(day);
    loadDayHero(day);
}

function renderUI(itinerario) {
    const container = document.getElementById('content-container');
    const nav = document.getElementById('bottom-nav');
    container.innerHTML = ''; nav.innerHTML = '';

    itinerario.forEach((day, index) => {
        const comp = dayCompletion(day);
        const navBtn = document.createElement('div');
        navBtn.className = `nav-item ${index === 0 ? 'active' : ''} ${comp.total > 0 && comp.done === comp.total ? 'done' : ''}`;
        navBtn.id = `nav-${day.id}`;
        navBtn.innerHTML = `<div class="nav-date">${day.date}</div><div class="nav-day">Dia ${day.dayNum}</div><div class="nav-indicator"></div>`;
        navBtn.onclick = () => selectDay(index);
        nav.appendChild(navBtn);

        const panel = document.createElement('div');
        panel.id = `panel-${day.id}`; panel.className = `tab-content ${index === 0 ? 'active' : ''}`;
        panel.style.padding = '22px 18px 8px';
        panel.innerHTML = buildDayPanelHtml(day);
        container.appendChild(panel);
    });
    renderTripStatus(itinerario);
    if (itinerario.length > 0) selectDay(currentDayIndex < itinerario.length ? currentDayIndex : 0);
}

function toggleVisited(dayId, idx) {
    if (navigator.vibrate) navigator.vibrate(50);
    const key = dayId + '_' + idx;
    visitedMap[key] = !visitedMap[key];
    saveJSON(pKey(STORAGE_VISITED_KEY), visitedMap);

    const row = document.getElementById(`row-${key}`);
    if (row) row.classList.toggle('done', !!visitedMap[key]);
    const check = row ? row.querySelector('.visit-check') : null;
    if (check) check.classList.toggle('checked', !!visitedMap[key]);

    const day = globalItinerary.find(d => d.id === dayId);
    if (!day) return;
    const comp = dayCompletion(day);
    const fill = document.getElementById(`progress-${dayId}`);
    const label = document.getElementById(`progress-label-${dayId}`);
    if (fill) fill.style.width = comp.pct + '%';
    if (label) label.textContent = `${comp.done}/${comp.total} visitados`;
    const navItem = document.getElementById(`nav-${dayId}`);
    if (navItem) navItem.classList.toggle('done', comp.total > 0 && comp.done === comp.total);
}

let currentDayIndex = 0;
function selectDay(index, direction) {
    if (navigator.vibrate) navigator.vibrate(20);
    const day = globalItinerary[index];
    if (!day) return;
    if (!direction) direction = index > currentDayIndex ? 'right' : index < currentDayIndex ? 'left' : 'none';
    currentDayIndex = index;

    document.getElementById('header-location').innerHTML = `<i class="fa-solid fa-bed"></i> ${day.hotel.split('(')[0].trim()}`;
    document.getElementById('ring-num').textContent = day.dayNum;
    document.getElementById('ring-tot').textContent = 'de ' + globalItinerary.length;
    const pct = globalItinerary.length > 1 ? Math.round(((index + 1) / globalItinerary.length) * 100) : 100;
    document.getElementById('day-ring').style.setProperty('--pct', pct);

    document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active', 'dir-left', 'dir-right'));
    const panel = document.getElementById(`panel-${day.id}`);
    panel.classList.add('active');
    if (direction === 'left') panel.classList.add('dir-left');
    if (direction === 'right') panel.classList.add('dir-right');

    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeNav = document.getElementById(`nav-${day.id}`); activeNav.classList.add('active');
    centerInScroller(document.getElementById('bottom-nav'), activeNav, 'x');
    renderRouteOnMap(day); document.getElementById('content-container').scrollTop = 0;
    loadWeatherForDay(day);
    loadDayHero(day);
}

(function setupSwipe() {
    const el = document.getElementById('content-container');
    let startX = 0, startY = 0, tracking = false;
    el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0 && currentDayIndex < globalItinerary.length - 1) selectDay(currentDayIndex + 1, 'right');
            else if (dx > 0 && currentDayIndex > 0) selectDay(currentDayIndex - 1, 'left');
        }
    }, { passive: true });
})();

const STORAGE_WEATHER_KEY = 'tailandia_tempo_cache';
async function loadWeatherForDay(day) {
    const chip = document.getElementById(`weather-${day.id}`);
    if (!chip) return;
    const coord = day.coords.find(c => !isNaN(c.lat) && !isNaN(c.lng));
    if (!coord) { chip.style.display = 'none'; return; }

    chip.style.display = 'inline-flex';
    chip.style.cursor = 'pointer';
    chip.onclick = () => loadWeatherForDay(day);
    chip.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> a atualizar...`;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lng}&current=temperature_2m,weather_code&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('no weather');
        const data = await res.json();
        if (!data.current) throw new Error('no current');
        const temp = Math.round(data.current.temperature_2m);
        const icon = weatherIcon(data.current.weather_code);
        chip.innerHTML = `<i class="fa-solid ${icon}"></i> ${temp}°C agora`;
        chip.style.color = '#fff'; chip.style.background = 'var(--jade)';
        const weatherCache = loadJSON(STORAGE_WEATHER_KEY, {});
        weatherCache[day.id] = { temp, icon, time: Date.now() };
        saveJSON(STORAGE_WEATHER_KEY, weatherCache);
    } catch (e) {
        const weatherCache = loadJSON(STORAGE_WEATHER_KEY, {});
        const cached = weatherCache[day.id];
        if (cached) {
            const mins = Math.round((Date.now() - cached.time) / 60000);
            const whenText = mins < 60 ? `há ${mins} min` : 'há mais de 1h';
            chip.innerHTML = `<i class="fa-solid ${cached.icon}"></i> ${cached.temp}°C (${whenText})`;
            chip.style.color = 'var(--ink-soft)'; chip.style.background = 'var(--line)';
        } else { chip.style.display = 'none'; }
    }
}
function weatherIcon(code) {
    if (code === 0) return 'fa-sun';
    if (code <= 3) return 'fa-cloud-sun';
    if (code >= 51 && code <= 67) return 'fa-cloud-rain';
    if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
    if (code >= 95) return 'fa-bolt';
    return 'fa-cloud';
}

let currentNoteKey = null;
function openNoteSheet(dayId, idx, stopName) {
    closeAllSheets();
    currentNoteKey = dayId + '_' + idx;
    const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
    const existing = notes[currentNoteKey] || {};
    document.getElementById('note-sheet-title').textContent = stopName || 'A minha nota';
    document.getElementById('note-text').value = existing.text || '';
    const drop = document.getElementById('photo-drop');
    if (existing.photo) { drop.innerHTML = `<img src="${existing.photo}">`; } 
    else { drop.innerHTML = `<span id="photo-drop-label"><i class="fa-solid fa-camera"></i> Toca para adicionar uma foto</span>`; }
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('note-sheet').classList.add('open');
}
function closeNoteSheet() {
    document.getElementById('note-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
    currentNoteKey = null;
}
function closeAnySheet() {
    if (document.getElementById('note-sheet').classList.contains('open')) { closeNoteSheet(); return; }
    if (document.getElementById('custom-stop-sheet').classList.contains('open')) { closeCustomStopSheet(); return; }
    if (document.getElementById('category-sheet').classList.contains('open')) { closeCategorySheet(); return; }
    if (document.getElementById('nearby-sheet').classList.contains('open')) { closeNearbySheet(); return; }
    if (document.getElementById('user-sheet').classList.contains('open')) { closeUserSheet(); return; }
    closeSheet();
}

function compressImage(file, maxW, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxW / img.width);
                const canvas = document.createElement('canvas');
                canvas.width = img.width * scale; canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject; img.src = e.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
    });
}
async function onNotePhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;
    const drop = document.getElementById('photo-drop');
    drop.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin"></i> a preparar foto...</span>`;
    try {
        const dataUrl = await compressImage(file, 800, 0.7);
        drop.innerHTML = `<img src="${dataUrl}">`;
    } catch (e) {
        drop.innerHTML = `<span><i class="fa-solid fa-triangle-exclamation"></i> não foi possível carregar a foto</span>`;
    }
}
function saveNote() {
    if (!currentNoteKey) return;
    const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
    const text = document.getElementById('note-text').value.trim();
    const img = document.querySelector('#photo-drop img');
    const photo = img ? img.src : null;
    if (!text && !photo) { delete notes[currentNoteKey]; }
    else { notes[currentNoteKey] = { text, photo }; }
    try { saveJSON(pKey(STORAGE_NOTES_KEY), notes); } 
    catch (e) { alert('Não foi possível guardar — a foto pode ser demasiado grande. Tenta uma foto mais pequena ou só texto.'); return; }
    refreshNotePreview(currentNoteKey);
    closeNoteSheet();
}
function deleteNote() {
    if (!currentNoteKey) return;
    const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
    delete notes[currentNoteKey];
    saveJSON(pKey(STORAGE_NOTES_KEY), notes);
    refreshNotePreview(currentNoteKey);
    closeNoteSheet();
}
function refreshNotePreview(key) {
    const row = document.getElementById(`row-${key}`);
    if (!row) return;
    const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
    const noteData = notes[key];
    const btn = row.querySelector('.note-btn');
    if (btn) btn.classList.toggle('has-note', !!noteData);
    const existingPreview = row.nextElementSibling;
    if (existingPreview && existingPreview.classList.contains('note-preview')) existingPreview.remove();
    if (noteData) {
        const div = document.createElement('div');
        div.className = 'note-preview';
        div.innerHTML = `${noteData.photo ? `<img src="${noteData.photo}">` : ''}${noteData.text ? `<p>${noteData.text}</p>` : ''}`;
        row.insertAdjacentElement('afterend', div);
    }
}

const INFO_FIELDS = ['contact', 'embassy', 'insurance', 'blood', 'allergies'];
function initInfo() {
    const data = loadJSON(pKey(STORAGE_INFO_KEY), {});
    INFO_FIELDS.forEach(f => {
        const el = document.getElementById('info-' + f);
        if (!el) return;
        el.value = data[f] || '';
        el.oninput = debounceSaveInfo;
    });
}
let infoSaveTimeout = null;
function debounceSaveInfo() { clearTimeout(infoSaveTimeout); infoSaveTimeout = setTimeout(saveInfo, 500); }
function saveInfo() {
    const data = {};
    INFO_FIELDS.forEach(f => { const el = document.getElementById('info-' + f); if (el) data[f] = el.value; });
    saveJSON(pKey(STORAGE_INFO_KEY), data);
    const note = document.getElementById('info-saved-note');
    note.classList.add('show');
    setTimeout(() => note.classList.remove('show'), 1200);
}

const PT_MONTHS = { jan:0, fev:1, mar:2, abr:3, mai:4, jun:5, jul:6, ago:7, set:8, out:9, nov:10, dez:11 };
function parseTripDate(str) {
    if (!str) return null;
    const s = String(str).trim().toLowerCase();
    let m = s.match(/(\d{1,2})\s*(?:de)?\s*([a-zçã]{3,})/i);
    if (m) {
        const day = parseInt(m[1]);
        const monthKey = m[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 3);
        if (PT_MONTHS.hasOwnProperty(monthKey)) {
            const yearMatch = s.match(/(20\d{2})/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 2026;
            return new Date(year, PT_MONTHS[monthKey], day);
        }
    }
    const parsed = Date.parse(str);
    return isNaN(parsed) ? null : new Date(parsed);
}

function renderTripStatus(itinerario) {
    const el = document.getElementById('trip-status-line');
    if (!el || itinerario.length === 0) return;
    const firstDate = parseTripDate(itinerario[0].date);
    const lastDate = parseTripDate(itinerario[itinerario.length - 1].date);
    if (!firstDate || !lastDate) { el.style.display = 'none'; return; }

    const today = new Date(); today.setHours(0,0,0,0);
    firstDate.setHours(0,0,0,0); lastDate.setHours(0,0,0,0);

    const msPerDay = 86400000;
    if (today < firstDate) {
        const days = Math.round((firstDate - today) / msPerDay);
        el.innerHTML = `<i class="fa-solid fa-plane-departure"></i> ${days === 1 ? 'Falta 1 dia!' : `Faltam ${days} dias!`}`;
    } else if (today >= firstDate && today <= lastDate) {
        const dayNum = Math.round((today - firstDate) / msPerDay) + 1;
        el.innerHTML = `<i class="fa-solid fa-sun"></i> Estás na viagem! Dia ${dayNum} de ${itinerario.length}`;
    } else {
        el.innerHTML = `<i class="fa-solid fa-heart"></i> Já viveram esta viagem — que saudades!`;
    }
    el.style.display = 'inline-flex';
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseTransportMinutes(str) {
    if (!str) return null;
    let total = 0, found = false;
    const hMatch = str.match(/(\d+(?:[.,]\d+)?)\s*h/i);
    if (hMatch) { total += parseFloat(hMatch[1].replace(',', '.')) * 60; found = true; }
    const mMatch = str.match(/(\d+)\s*min/i);
    if (mMatch) { total += parseInt(mMatch[1]); found = true; }
    return found ? Math.round(total) : null;
}
function formatMinutes(m) {
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rem = m % 60;
    return rem > 0 ? `${h}h${String(rem).padStart(2,'0')}` : `${h}h`;
}
function computeDayStats(day) {
    const validCoords = day.coords.filter(c => !isNaN(c.lat) && !isNaN(c.lng));
    let distanceKm = 0;
    for (let i = 0; i < validCoords.length - 1; i++) {
        distanceKm += haversineKm(validCoords[i].lat, validCoords[i].lng, validCoords[i+1].lat, validCoords[i+1].lng);
    }
    let minutes = 0, hasTime = false;
    day.coords.forEach(c => {
        if (c.transport && c.transport.time) {
            const m = parseTransportMinutes(c.transport.time);
            if (m != null) { minutes += m; hasTime = true; }
        }
    });
    const customCount = loadJSON(pKey('tailandia_paragens_' + day.id), []).length;
    return { stops: day.coords.length + customCount, distanceKm, minutes, hasTime };
}
function renderDayStatsHtml(day) {
    const stats = computeDayStats(day);
    let html = `<span><i class="fa-solid fa-map-pin"></i> ${stats.stops} paragens</span>`;
    if (stats.distanceKm > 0.05) html += `<span><i class="fa-solid fa-route"></i> ${stats.distanceKm.toFixed(1)} km</span>`;
    if (stats.hasTime) html += `<span><i class="fa-solid fa-clock"></i> ~${formatMinutes(stats.minutes)} em trajetos</span>`;
    return html;
}

const LOCATION_HERO_IMAGES = {
    'chiang mai': { url: 'https://res.klook.com/image/upload/fl_lossy.progressive,q_60/Mobile/City/cswglxpstphljdourpfu.jpg', position: 'center bottom' },
    'krabi': { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/33/fd/2f/krabi-town.jpg?w=1200&h=700&s=1', position: 'center bottom' },
    'banguecoque': { url: 'https://waytovietnam.com/userfiles/images/TRavel%20Guide/Thailand/Bangkok%20City.jpg', position: 'center center' },
    'bangkok': { url: 'https://waytovietnam.com/userfiles/images/TRavel%20Guide/Thailand/Bangkok%20City.jpg', position: 'center center' },
    'ayutthaya': { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/07/ba/32/7e/photo0jpg.jpg?w=900&h=500&s=1', position: 'center 30%' }
};
const DEFAULT_HERO_IMAGE = { url: 'https://cdn.forevervacation.com/uploads/blog/thailand-visitor-guide-things-to-do-4406.jpg', position: 'center top' };

function normalizeText(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function getHeroImage(day) {
    const text = normalizeText(day.location + ' ' + day.title);
    for (const key in LOCATION_HERO_IMAGES) { if (text.includes(normalizeText(key))) return LOCATION_HERO_IMAGES[key]; }
    return DEFAULT_HERO_IMAGE;
}
function heroFallbackIcon(day) {
    const text = normalizeText(day.title + ' ' + day.location);
    if (/praia|ilha|phi phi|koh|krabi/.test(text)) return 'fa-umbrella-beach';
    if (/templo|wat|palacio/.test(text)) return 'fa-torii-gate';
    if (/mercado|market/.test(text)) return 'fa-store';
    if (/voo|aeroporto|airport/.test(text)) return 'fa-plane';
    return 'fa-compass';
}
function applyHeroFallback(el, dayId) {
    const day = globalItinerary.find(d => d.id === dayId);
    el.classList.remove('skeleton');
    el.style.background = 'linear-gradient(135deg, #0E7C66, #0A2E2A)';
    el.innerHTML = `<i class="fa-solid ${day ? heroFallbackIcon(day) : 'fa-compass'} hero-fallback-icon"></i>`;
}
function loadDayHero(day) {
    const el = document.getElementById(`hero-${day.id}`);
    if (!el) return;
    el.classList.remove('skeleton');
    el.style.background = 'none';
    const info = getHeroImage(day);
    el.innerHTML = `<img src="${info.url}" style="width:100%; height:100%; object-fit:cover; object-position:${info.position};" onerror="applyHeroFallback(document.getElementById('hero-${day.id}'), '${day.id}')">`;
}

let myLocationMarker = null;
let lastGeoPosition = null;

function placeMeOnMap(lat, lng) {
    if (myLocationMarker) map.removeLayer(myLocationMarker);
    const icon = L.divIcon({
        className: 'dummy',
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#3B82C4;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,196,0.3);"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9]
    });
    myLocationMarker = L.marker([lat, lng], { icon }).addTo(map);
}

function locateMe() {
    if (navigator.vibrate) navigator.vibrate(50);
    const btn = document.getElementById('locate-btn');
    if (!navigator.geolocation) { showToast('O teu dispositivo não suporta localização.'); return; }
    btn.classList.add('locating');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            btn.classList.remove('locating');
            const { latitude, longitude } = pos.coords;
            lastGeoPosition = { lat: latitude, lng: longitude };
            placeMeOnMap(latitude, longitude);
            map.setView([latitude, longitude], 14);
            highlightNearestStop(latitude, longitude);
        },
        (err) => {
            btn.classList.remove('locating');
            if (err.code === 1) showToast('Permissão de localização recusada. Ativa-a nas definições do navegador.');
            else if (err.code === 3) showToast('Demorou demasiado a obter a localização. Tenta outra vez.');
            else showToast('Não foi possível obter a tua localização.');
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

const NEARBY_CAT_ICONS = { restaurant: 'fa-utensils', cafe: 'fa-mug-hot', bar: 'fa-martini-glass', fast_food: 'fa-burger', attraction: 'fa-camera', viewpoint: 'fa-mountain-sun', museum: 'fa-landmark', gallery: 'fa-palette' };
const NEARBY_CAT_LABELS = { restaurant: 'Restaurante', cafe: 'Café', bar: 'Bar', fast_food: 'Comida rápida', attraction: 'Atração', viewpoint: 'Miradouro', museum: 'Museu', gallery: 'Galeria' };

// ATUALIZADO PARA SUPORTAR O NOVO FILTRO
function findNearbyPlaces() {
    if (navigator.vibrate) navigator.vibrate(50);
    const btn = document.getElementById('nearby-btn');
    if (!navigator.geolocation) { showToast('O teu dispositivo não suporta localização.'); return; }
    btn.classList.add('loading');
    
    // Procura por padrão com filtro total
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            lastGeoPosition = { lat: latitude, lng: longitude };
            placeMeOnMap(latitude, longitude);
            map.setView([latitude, longitude], 15);
            highlightNearestStop(latitude, longitude);
            await searchNearbyPOIs(latitude, longitude, 'all');
            btn.classList.remove('loading');
        },
        (err) => {
            btn.classList.remove('loading');
            if (err.code === 1) showToast('Permissão de localização recusada. Ativa-a nas definições do navegador.');
            else showToast('Não foi possível obter a tua localização.');
        },
        { enableHighAccuracy: true, timeout: 8000 }
    );
}

// ATUALIZADO: Aceita o 'type' para reduzir a área (500m comida / 800m atração)
async function searchNearbyPOIs(lat, lng, type = 'all') {
    openNearbySheet();
    document.getElementById('nearby-list').innerHTML = '<p style="font-size:12px;color:var(--ink-soft);text-align:center;padding:24px 0;"><i class="fa-solid fa-spinner fa-spin"></i> A procurar sítios num raio de 1.5 km...</p>';
    
    let queryPart = '';
    if (type === 'food') {
        queryPart = `nwr["amenity"~"restaurant|cafe|bar|fast_food|food_court"](around:1500,${lat},${lng});`;
    } else if (type === 'attraction') {
        queryPart = `nwr["tourism"~"attraction|viewpoint|museum|gallery"](around:1500,${lat},${lng});`;
    } else {
        queryPart = `nwr["amenity"~"restaurant|cafe|bar|fast_food"](around:1500,${lat},${lng}); nwr["tourism"~"attraction|viewpoint|museum|gallery"](around:1500,${lat},${lng});`;
    }

    const query = `[out:json][timeout:15];(${queryPart});out center 20;`;
    
    // Lista de servidores atualizada e reordenada (do mais rápido/estável para o mais sobrecarregado)
    const endpoints = [
        'https://overpass.osm.ch/api/interpreter',       // Servidor suíço (muito fiável e rápido)
        'https://overpass.kumi.systems/api/interpreter', // Alternativa robusta
        'https://overpass-api.de/api/interpreter'        // Oficial (costuma ser o mais sobrecarregado, fica para último)
    ];

    try {
        let data = null, lastErr = null;
        for (const url of endpoints) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 8000);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query),
                    signal: ctrl.signal
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                data = await res.json();
                break; // Se um servidor responder bem, para o loop
            } catch (e) { lastErr = e; }
            finally { clearTimeout(timer); }
        }
        
        if (!data) throw lastErr || new Error('sem resposta dos servidores');
        
        const results = (data.elements || [])
            .filter(el => el.tags && el.tags.name)
            .map(el => {
                const elLat = el.lat != null ? el.lat : (el.center && el.center.lat);
                const elLng = el.lon != null ? el.lon : (el.center && el.center.lon);
                const dist = haversineKm(lat, lng, elLat, elLng);
                const cat = el.tags.amenity || el.tags.tourism || 'local';
                return { name: el.tags.name, cat, dist, lat: elLat, lng: elLng };
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 15); // Mostrar os 15 mais próximos

        renderNearbyList(results);
    } catch (e) {
        console.error("Overpass erro:", e);
        document.getElementById('nearby-list').innerHTML = '<p style="font-size:12px;color:var(--ink-soft);text-align:center;padding:24px 0;">Servidores de mapas ocupados. Tenta de novo num instante.</p>';
    }
}

// NOVA FUNÇÃO: Disparada pelas tabs no 'Perto de ti'
function triggerNearbyFilter(type, btnElement) {
    if (navigator.vibrate) navigator.vibrate(40);
    
    const tabs = btnElement.parentElement.querySelectorAll('.sheet-tab');
    tabs.forEach(t => t.classList.remove('active'));
    btnElement.classList.add('active');

    // Usa o cache da localização guardada sem pedir permissão de novo
    if (lastGeoPosition) {
        searchNearbyPOIs(lastGeoPosition.lat, lastGeoPosition.lng, type);
    }
}

function renderNearbyList(results) {
    const wrap = document.getElementById('nearby-list');
    if (results.length === 0) { wrap.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);text-align:center;padding:24px 0;">Não encontrámos nada perto de ti agora.</p>'; return; }
    wrap.innerHTML = results.map(r => {
        const distText = r.dist < 1 ? `${Math.round(r.dist * 1000)} m` : `${r.dist.toFixed(1)} km`;
        const url = `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`;
        return `<a class="nearby-item" href="${url}" target="_blank" rel="noopener noreferrer">
            <div class="n-icon"><i class="fa-solid ${NEARBY_CAT_ICONS[r.cat] || 'fa-location-dot'}"></i></div>
            <div class="n-main"><div class="n-name">${r.name}</div><div class="n-cat">${NEARBY_CAT_LABELS[r.cat] || r.cat}</div></div>
            <div class="n-dist">${distText}</div>
        </a>`;
    }).join('');
}

function openNearbySheet() {
    closeAllSheets();
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('nearby-sheet').classList.add('open');
}
function closeNearbySheet() {
    document.getElementById('nearby-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
}

let translateDirection = 'pt-th';
let lastTranslation = '';
let lastTranslationLang = 'th';
let recognizer = null;
let isRecording = false;

function updateTranslateLangLabels() {
    const fromEl = document.getElementById('translate-lang-from');
    const toEl = document.getElementById('translate-lang-to');
    if (!fromEl) return;
    if (translateDirection === 'pt-th') { fromEl.textContent = '🇵🇹 Português'; toEl.textContent = '🇹🇭 Tailandês'; }
    else { fromEl.textContent = '🇹🇭 Tailandês'; toEl.textContent = '🇵🇹 Português'; }
}
function swapTranslateDirection() {
    if (navigator.vibrate) navigator.vibrate(30);
    translateDirection = translateDirection === 'pt-th' ? 'th-pt' : 'pt-th';
    updateTranslateLangLabels();
    document.getElementById('translate-input').value = '';
    document.getElementById('translate-output-box').style.display = 'none';
    document.getElementById('translate-status').textContent = '';
}
async function translateViaGoogle(text, from, to) {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
    if (!res.ok) throw new Error('google translate failed');
    const data = await res.json();
    return data[0].map(seg => seg[0]).join('');
}
async function translateViaMyMemory(text, from, to) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
    if (!res.ok) throw new Error('mymemory failed');
    const data = await res.json();
    if (!data.responseData || !data.responseData.translatedText) throw new Error('no translation');
    return data.responseData.translatedText;
}
async function doTranslate() {
    if (navigator.vibrate) navigator.vibrate(30);
    const input = document.getElementById('translate-input').value.trim();
    const status = document.getElementById('translate-status');
    const outBox = document.getElementById('translate-output-box');
    const outEl = document.getElementById('translate-output');
    if (!input) return;
    status.textContent = 'A traduzir...';
    const [from, to] = translateDirection === 'pt-th' ? ['pt', 'th'] : ['th', 'pt'];
    try {
        let translated;
        try { translated = await translateViaGoogle(input, from, to); }
        catch (e) { translated = await translateViaMyMemory(input, from, to); }
        outEl.textContent = translated;
        outBox.style.display = 'flex';
        status.textContent = '';
        lastTranslation = translated;
        lastTranslationLang = to;
    } catch (e) {
        status.textContent = 'Não foi possível traduzir agora — verifica a ligação.';
    }
}
function speakTranslation() {
    if (!lastTranslation) return;
    if (!('speechSynthesis' in window)) { showToast('A leitura por voz não é suportada neste aparelho.'); return; }
    const utter = new SpeechSynthesisUtterance(lastTranslation);
    utter.lang = lastTranslationLang === 'th' ? 'th-TH' : 'pt-PT';
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
}
function toggleMic() {
    const micBtn = document.getElementById('translate-mic-btn');
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { showToast('Ditado por voz não suportado neste navegador (funciona no Chrome Android).'); return; }
    if (isRecording) { recognizer && recognizer.stop(); return; }
    recognizer = new SpeechRec();
    recognizer.lang = translateDirection === 'pt-th' ? 'pt-PT' : 'th-TH';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onstart = () => { isRecording = true; micBtn.classList.add('recording'); };
    recognizer.onerror = () => { isRecording = false; micBtn.classList.remove('recording'); showToast('Não foi possível captar áudio.'); };
    recognizer.onend = () => { isRecording = false; micBtn.classList.remove('recording'); };
    recognizer.onresult = (event) => {
        const text = event.results[0][0].transcript;
        document.getElementById('translate-input').value = text;
        doTranslate();
    };
    recognizer.start();
}
function initTranslatorMicAvailability() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('translate-mic-btn');
    if (!SpeechRec && micBtn) {
        micBtn.disabled = true;
        micBtn.title = 'Não suportado neste navegador (funciona no Chrome Android)';
    }
}

const NEWS_FEED_URL = 'https://www.bangkokpost.com/rss/data/topstories.xml';
const STORAGE_NEWS_CACHE_KEY = 'tailandia_noticias_cache';
let newsLoaded = false;

function timeAgo(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    return `há ${Math.round(hours / 24)}d`;
}

async function fetchNewsItems() {
    try {
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(NEWS_FEED_URL)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
                return data.items.slice(0, 10).map(it => ({ title: it.title || '', link: it.link || '', pubDate: it.pubDate || '' })).filter(it => it.title && it.link);
            }
        }
    } catch (e) { }

    const proxies = [
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`
    ];
    let lastError = null;
    for (const buildProxyUrl of proxies) {
        try {
            const res = await fetch(buildProxyUrl(NEWS_FEED_URL));
            if (!res.ok) throw new Error('proxy responded with ' + res.status);
            const text = await res.text();
            if (!text || !text.includes('<item')) throw new Error('empty or invalid feed');
            const xml = new DOMParser().parseFromString(text, 'text/xml');
            const items = Array.from(xml.querySelectorAll('item')).slice(0, 10).map(item => ({
                title: item.querySelector('title')?.textContent || '',
                link: item.querySelector('link')?.textContent || '',
                pubDate: item.querySelector('pubDate')?.textContent || ''
            })).filter(it => it.title && it.link);
            if (items.length > 0) return items;
            throw new Error('no items parsed');
        } catch (e) { lastError = e; }
    }
    throw lastError || new Error('all news sources failed');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function translateHeadlines(items) {
    const results = [];
    for (const it of items) {
        let titlePt = null;
        try { titlePt = await translateViaGoogle(it.title, 'en', 'pt'); }
        catch (e) {
            try { titlePt = await translateViaMyMemory(it.title, 'en', 'pt'); }
            catch (e2) { titlePt = null; }
        }
        results.push({ ...it, titlePt });
        await sleep(120);
    }
    return results;
}

async function loadNews(manual) {
    const btn = document.getElementById('news-refresh-btn');
    const wrap = document.getElementById('news-list');
    if (btn) btn.classList.add('spinning');
    if (!newsLoaded) wrap.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);text-align:center;padding:20px 0;"><i class="fa-solid fa-spinner fa-spin"></i> A carregar notícias...</p>';
    try {
        const items = await fetchNewsItems();
        if (items.length === 0) throw new Error('no items');

        const translated = await translateHeadlines(items);
        saveJSON(STORAGE_NEWS_CACHE_KEY, { items: translated, time: Date.now() });
        renderNews(translated);
        newsLoaded = true;
        if (manual) showToast('📰 Notícias atualizadas');
    } catch (e) {
        const cached = loadJSON(STORAGE_NEWS_CACHE_KEY, null);
        if (cached) {
            renderNews(cached.items, cached.time);
            if (manual) showToast('Não foi possível atualizar agora — a mostrar a última versão guardada.');
        } else {
            wrap.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);text-align:center;padding:20px 0;">Não foi possível carregar notícias agora. Tenta de novo mais tarde.</p>';
            if (manual) showToast('Não foi possível carregar notícias agora.');
        }
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}
function renderNews(items, cachedTime) {
    const wrap = document.getElementById('news-list');
    const staleNote = cachedTime ? `<p style="font-size:10.5px;color:var(--ink-soft);text-align:center;margin-bottom:8px;">Sem ligação — a mostrar a última versão guardada.</p>` : '';
    wrap.innerHTML = staleNote + items.map(it => `
        <a class="news-item" href="${it.link}" target="_blank" rel="noopener noreferrer">
            <div class="news-title-pt">${it.titlePt || it.title}</div>
            ${it.titlePt ? `<div class="news-title-en">${it.title}</div>` : ''}
            <div class="news-meta">Bangkok Post ${it.pubDate ? '· ' + timeAgo(it.pubDate) : ''}</div>
        </a>`).join('');
}

function highlightNearestStop(lat, lng) {
    let best = null;
    globalItinerary.forEach((day, dayIdx) => {
        day.coords.forEach((c, i) => {
            if (!isNaN(c.lat) && !isNaN(c.lng)) {
                const dist = haversineKm(lat, lng, c.lat, c.lng);
                if (!best || dist < best.dist) best = { dist, dayIdx, i, day, coord: c };
            }
        });
    });
    if (!best) return;
    if (best.dayIdx !== currentDayIndex) selectDay(best.dayIdx);
    setTimeout(() => {
        const row = document.getElementById(`row-${best.day.id}_${best.i}`);
        if (row) {
            centerInScroller(document.getElementById('content-container'), row, 'y');
            row.classList.add('nearest-highlight');
            setTimeout(() => row.classList.remove('nearest-highlight'), 3600);
        }
    }, 400);
    const distText = best.dist < 1 ? `${Math.round(best.dist * 1000)} m` : `${best.dist.toFixed(1)} km`;
    showToast(`📍 Mais perto de ti: ${best.coord.name} (${distText})`);
}

function updateWorldClock() {
    const ptEl = document.getElementById('clock-pt');
    const thEl = document.getElementById('clock-th');
    const diffEl = document.getElementById('clock-diff');
    if (!ptEl) return;
    const now = new Date();
    const ptTime = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
    const thTime = now.toLocaleTimeString('pt-PT', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    ptEl.textContent = ptTime; thEl.textContent = thTime;
    const ptHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon', hour: 'numeric', hour12: false }));
    const thHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false }));
    let diff = thHour - ptHour;
    if (diff < 0) diff += 24;
    diffEl.innerHTML = `<i class="fa-solid fa-arrow-right-arrow-left"></i><span>+${diff}h</span>`;
}
setInterval(updateWorldClock, 30000);

const PHRASEBOOK = [
    { cat: 'Cumprimentos', items: [
        { pt: 'Olá', thai: 'สวัสดี', ph: 'sa-wat-dii' },
        { pt: 'Obrigado/a', thai: 'ขอบคุณ', ph: 'khòp khun' },
        { pt: 'Sim', thai: 'ใช่', ph: 'châi' },
        { pt: 'Não', thai: 'ไม่ใช่', ph: 'mâi châi' },
        { pt: 'Desculpa / Com licença', thai: 'ขอโทษ', ph: 'khǒ thôot' },
        { pt: 'Como estás?', thai: 'สบายดีไหม', ph: 'sabaai dii mǎi' },
        { pt: 'Não entendo', thai: 'ไม่เข้าใจ', ph: 'mâi khâo jai' },
        { pt: 'Falas inglês?', thai: 'พูดอังกฤษได้ไหม', ph: 'phûut angkrit dâi mǎi' }
    ]},
    { cat: 'Números', items: [
        { pt: '1', thai: 'หนึ่ง', ph: 'nùeng' },
        { pt: '2', thai: 'สอง', ph: 'sǎwng' },
        { pt: '3', thai: 'สาม', ph: 'sǎam' },
        { pt: '4', thai: 'สี่', ph: 'sìi' },
        { pt: '5', thai: 'ห้า', ph: 'hâa' },
        { pt: '10', thai: 'สิบ', ph: 'sìp' },
        { pt: '100', thai: 'ร้อย', ph: 'rói' }
    ]},
    { cat: 'No restaurante', items: [
        { pt: 'Quanto custa?', thai: 'เท่าไหร่', ph: 'tâo rài' },
        { pt: 'A conta, por favor', thai: 'เช็คบิลด้วย', ph: 'chék bin dûai' },
        { pt: 'Não picante, por favor', thai: 'ไม่เผ็ด', ph: 'mâi pèt' },
        { pt: 'Delicioso', thai: 'อร่อย', ph: 'a-ròi' },
        { pt: 'Água, por favor', thai: 'ขอน้ำ', ph: 'khǒ náam' },
        { pt: 'Sou vegetariano/a', thai: 'ฉันกินเจ', ph: 'chǎn kin jee' }
    ]},
    { cat: 'Transportes e direções', items: [
        { pt: 'Para onde?', thai: 'ไปไหน', ph: 'pai nǎi' },
        { pt: 'Pare aqui, por favor', thai: 'จอดตรงนี้', ph: 'jòt trong níi' },
        { pt: 'Onde é a casa de banho?', thai: 'ห้องน้ำอยู่ไหน', ph: 'hông náam yùu nǎi' },
        { pt: 'Esquerda', thai: 'ซ้าย', ph: 'sái' },
        { pt: 'Direita', thai: 'ขวา', ph: 'khwǎa' },
        { pt: 'Direto/reto', thai: 'ตรงไป', ph: 'trong pai' }
    ]},
    { cat: 'Emergência', items: [
        { pt: 'Ajuda!', thai: 'ช่วยด้วย', ph: 'chûai dûai' },
        { pt: 'Preciso de um médico', thai: 'ต้องการหมอ', ph: 'tông kaan mǎw' },
        { pt: 'Chame a polícia', thai: 'เรียกตำรวจ', ph: 'rîak tam-rùat' },
        { pt: 'Estou perdido/a', thai: 'ฉันหลงทาง', ph: 'chǎn lǒng thaang' }
    ]}
];
function renderPhrases(filter) {
    const wrap = document.getElementById('phrases-list');
    if (!wrap) return;
    const q = (filter || '').trim().toLowerCase();
    let html = '';
    PHRASEBOOK.forEach(group => {
        const items = q ? group.items.filter(it => it.pt.toLowerCase().includes(q) || it.ph.toLowerCase().includes(q)) : group.items;
        if (items.length === 0) return;
        html += `<div class="phrase-category">${group.cat}</div>`;
        items.forEach(it => {
            html += `<div class="phrase-row">
                <div class="phrase-pt">${it.pt}</div>
                <div class="phrase-thai">${it.thai}</div>
                <div class="phrase-phonetic">${it.ph}</div>
            </div>`;
        });
    });
    wrap.innerHTML = html || '<p style="font-size:12px;color:var(--ink-soft);">Sem resultados.</p>';
}

function openSheet() {
    closeAllSheets();
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('tools-sheet').classList.add('open');
    const activePane = document.querySelector('.sheet-tab.active');
    if (activePane && activePane.dataset.pane === 'pane-currency') fetchExchangeRate(false);
}
function closeSheet() {
    document.getElementById('sheet-overlay').classList.remove('open');
    document.getElementById('tools-sheet').classList.remove('open');
}
function switchPane(tabEl) {
    if (navigator.vibrate) navigator.vibrate(30);
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sheet-pane').forEach(p => p.classList.remove('active'));
    tabEl.classList.add('active');
    document.getElementById(tabEl.dataset.pane).classList.add('active');
    centerInScroller(tabEl.parentElement, tabEl, 'x');
    if (tabEl.dataset.pane === 'pane-currency') fetchExchangeRate(false);
    if (tabEl.dataset.pane === 'pane-memories') renderMemories();
    if (tabEl.dataset.pane === 'pane-phrases') renderPhrases(document.getElementById('phrase-search').value);
    if (tabEl.dataset.pane === 'pane-info') updateWorldClock();
    if (tabEl.dataset.pane === 'pane-news' && !newsLoaded) loadNews(false);
}

let currentCustomStopDay = null;
function openCustomStopSheet(dayId) {
    closeAllSheets();
    currentCustomStopDay = dayId;
    document.getElementById('custom-stop-name').value = '';
    document.getElementById('custom-stop-note').value = '';
    document.getElementById('custom-stop-link').value = '';
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('custom-stop-sheet').classList.add('open');
}
function closeCustomStopSheet() {
    document.getElementById('custom-stop-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
    currentCustomStopDay = null;
}
function saveCustomStop() {
    if (!currentCustomStopDay) return;
    const name = document.getElementById('custom-stop-name').value.trim();
    if (!name) return;
    const note = document.getElementById('custom-stop-note').value.trim();
    const link = document.getElementById('custom-stop-link').value.trim();
    const key = 'tailandia_paragens_' + currentCustomStopDay;
    const list = loadJSON(pKey(key), []);
    list.push({ id: 'c' + Date.now(), name, note, link, done: false });
    saveJSON(pKey(key), list);
    const dayId = currentCustomStopDay;
    closeCustomStopSheet();
    const day = globalItinerary.find(d => d.id === dayId);
    if (day) rerenderDayPanel(day);
}
function toggleCustomStop(dayId, stopId) {
    if (navigator.vibrate) navigator.vibrate(50);
    const key = 'tailandia_paragens_' + dayId;
    const list = loadJSON(pKey(key), []);
    const item = list.find(s => s.id === stopId);
    if (item) item.done = !item.done;
    saveJSON(pKey(key), list);
    const day = globalItinerary.find(d => d.id === dayId);
    if (day) rerenderDayPanel(day);
}
function deleteCustomStop(dayId, stopId) {
    const key = 'tailandia_paragens_' + dayId;
    let list = loadJSON(pKey(key), []);
    list = list.filter(s => s.id !== stopId);
    saveJSON(pKey(key), list);
    const day = globalItinerary.find(d => d.id === dayId);
    if (day) rerenderDayPanel(day);
}

function renderMemories() {
    const wrap = document.getElementById('memories-list');
    const notes = loadJSON(pKey(STORAGE_NOTES_KEY), {});
    const items = [];
    globalItinerary.forEach(day => {
        day.coords.forEach((coord, i) => {
            const n = notes[day.id + '_' + i];
            if (n) items.push({ dayLabel: `Dia ${day.dayNum}`, name: coord.name, text: n.text, photo: n.photo });
        });
        const customs = loadJSON(pKey('tailandia_paragens_' + day.id), []);
        customs.forEach(c => {
            if (c.note) items.push({ dayLabel: `Dia ${day.dayNum}`, name: c.name, text: c.note, photo: null });
        });
    });
    if (items.length === 0) {
        wrap.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);">Ainda sem memórias guardadas. Adiciona notas e fotos aos sítios que visitares!</p>';
        return;
    }
    wrap.innerHTML = items.map(it => `
        <div class="memory-item">
            ${it.photo ? `<img src="${it.photo}">` : `<div class="no-photo"><i class="fa-solid fa-note-sticky"></i></div>`}
            <div class="m-main">
                <div class="m-day">${it.dayLabel}</div>
                <div class="m-name">${it.name}</div>
                ${it.text ? `<p class="m-text">"${it.text}"</p>` : ''}
            </div>
        </div>`).join('');
}

function initTools() {
    let packing = loadJSON(pKey(STORAGE_PACKING_KEY), null);
    if (!packing) { packing = DEFAULT_PACKING.map(t => ({ text: t, checked: false })); saveJSON(pKey(STORAGE_PACKING_KEY), packing); }
    renderPacking(packing);

    renderBudget(loadJSON(pKey(STORAGE_BUDGET_KEY), []));
    renderCategorySelect();

    document.getElementById('packing-input').onkeydown = e => { if (e.key === 'Enter') addPackingItem(); };
    document.getElementById('budget-desc').onkeydown = e => { if (e.key === 'Enter') addExpense(); };
}

function renderPacking(list) {
    const wrap = document.getElementById('packing-list');
    wrap.innerHTML = list.map((item, i) => `
        <div class="tool-row ${item.checked ? 'checked' : ''}">
            <div class="tool-check ${item.checked ? 'checked' : ''}" onclick="togglePacking(${i})"><i class="fa-solid fa-check"></i></div>
            <div class="tool-text">${item.text}</div>
            <button class="tool-del" onclick="deletePacking(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('') || '<p style="font-size:12px;color:var(--ink-soft);">Sem itens ainda.</p>';

    const total = list.length;
    const done = list.filter(i => i.checked).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('packing-progress-fill').style.width = pct + '%';
    document.getElementById('packing-progress-label').textContent = `${done}/${total} prontos`;
}
function togglePacking(i) {
    if (navigator.vibrate) navigator.vibrate(30);
    const list = loadJSON(pKey(STORAGE_PACKING_KEY), []);
    list[i].checked = !list[i].checked;
    saveJSON(pKey(STORAGE_PACKING_KEY), list);
    renderPacking(list);
}
function deletePacking(i) {
    const list = loadJSON(pKey(STORAGE_PACKING_KEY), []);
    list.splice(i, 1);
    saveJSON(pKey(STORAGE_PACKING_KEY), list);
    renderPacking(list);
}
function addPackingItem() {
    const input = document.getElementById('packing-input');
    const val = input.value.trim();
    if (!val) return;
    const list = loadJSON(pKey(STORAGE_PACKING_KEY), []);
    list.push({ text: val, checked: false });
    saveJSON(pKey(STORAGE_PACKING_KEY), list);
    renderPacking(list);
    input.value = '';
}

const STORAGE_CUSTOM_CATS_KEY = 'tailandia_categorias_custom';
const BASE_CATEGORIES = [
    { key: 'Comida', emoji: '🍜', color: '#E0574C' },
    { key: 'Transporte', emoji: '🚕', color: '#3B82C4' },
    { key: 'Compras', emoji: '🛍️', color: '#C9A227' },
    { key: 'Alojamento', emoji: '🏨', color: '#0E7C66' }
];
const FALLBACK_CATEGORY = { key: 'Outro', emoji: '✨', color: '#8B6FB3' };
const CUSTOM_CAT_PALETTE = ['#E0574C', '#3B82C4', '#C9A227', '#0E7C66', '#8B6FB3', '#D9773D'];

function getCustomCategories() { return loadJSON(pKey(STORAGE_CUSTOM_CATS_KEY), []); }
function getAllCategories() { return [...BASE_CATEGORIES, ...getCustomCategories(), FALLBACK_CATEGORY]; }
function getCategoryMeta(key) { return getAllCategories().find(c => c.key === key) || FALLBACK_CATEGORY; }

function renderCategorySelect(selectedKey) {
    const sel = document.getElementById('budget-cat');
    if (!sel) return;
    const cats = getAllCategories();
    sel.innerHTML = cats.map(c => `<option value="${c.key}">${c.emoji} ${c.key}</option>`).join('')
        + `<option value="__add__">➕ Nova categoria...</option>`;
    sel.value = selectedKey && cats.some(c => c.key === selectedKey) ? selectedKey : cats[0].key;
    sel.onchange = () => { if (sel.value === '__add__') { openCategorySheet(); } };
}

function openCategorySheet() {
    closeAllSheets();
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-cat-emoji').value = '';
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('category-sheet').classList.add('open');
}
function closeCategorySheet() {
    document.getElementById('category-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
    renderCategorySelect();
}
function saveNewCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) return;
    const emoji = document.getElementById('new-cat-emoji').value.trim() || '🏷️';
    const customs = getCustomCategories();
    if (customs.some(c => c.key.toLowerCase() === name.toLowerCase())) {
        renderCategorySelect(name);
        document.getElementById('category-sheet').classList.remove('open');
        document.getElementById('sheet-overlay').classList.remove('open');
        return;
    }
    const color = CUSTOM_CAT_PALETTE[customs.length % CUSTOM_CAT_PALETTE.length];
    customs.push({ key: name, emoji, color });
    saveJSON(pKey(STORAGE_CUSTOM_CATS_KEY), customs);
    document.getElementById('category-sheet').classList.remove('open');
    document.getElementById('sheet-overlay').classList.remove('open');
    renderCategorySelect(name);
}

function renderBudget(list) {
    const wrap = document.getElementById('budget-list');
    const total = list.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    document.getElementById('budget-total-amount').textContent = '€' + total.toFixed(2);
    wrap.innerHTML = list.map((e, i) => {
        const meta = getCategoryMeta(e.cat || 'Outro');
        return `
        <div class="tool-row">
            <span style="font-size:16px;">${meta.emoji}</span>
            <div class="budget-row-main">
                <span class="desc">${e.desc}</span>
                <span class="cat-label" style="color:${meta.color};">${meta.key}</span>
            </div>
            <div style="font-weight:700; font-size:13px; color:var(--jade); flex-shrink:0;">€${parseFloat(e.amount).toFixed(2)}</div>
            <button class="tool-del" onclick="deleteExpense(${i})"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
    }).join('') || '<p style="font-size:12px;color:var(--ink-soft);">Ainda sem gastos registados.</p>';
}
function addExpense() {
    if (navigator.vibrate) navigator.vibrate(30);
    const descInput = document.getElementById('budget-desc');
    const amountInput = document.getElementById('budget-amount');
    const catInput = document.getElementById('budget-cat');
    const desc = descInput.value.trim();
    const amount = parseFloat(amountInput.value);
    if (!desc || isNaN(amount) || catInput.value === '__add__') return;
    const list = loadJSON(pKey(STORAGE_BUDGET_KEY), []);
    list.push({ desc, amount, cat: catInput.value });
    saveJSON(pKey(STORAGE_BUDGET_KEY), list);
    renderBudget(list);
    descInput.value = ''; amountInput.value = '';
}
function deleteExpense(i) {
    const list = loadJSON(pKey(STORAGE_BUDGET_KEY), []);
    list.splice(i, 1);
    saveJSON(pKey(STORAGE_BUDGET_KEY), list);
    renderBudget(list);
}

const STORAGE_RATE_KEY = 'tailandia_taxa_cambio';
function initCurrency() {
    const cached = loadJSON(STORAGE_RATE_KEY, null);
    if (cached) { eurToThb = cached.rate; updateRateNote(cached.rate, cached.time, true); }
    fetchExchangeRate(false);
}

async function fetchExchangeRate(manual) {
    const btn = document.getElementById('rate-refresh-btn');
    if (btn) btn.classList.add('spinning');
    try {
        const res = await fetch('https://api.frankfurter.dev/v1/latest?from=EUR&to=THB');
        if (!res.ok) throw new Error('rate fetch failed');
        const data = await res.json();
        eurToThb = data.rates.THB;
        const now = Date.now();
        saveJSON(STORAGE_RATE_KEY, { rate: eurToThb, time: now });
        updateRateNote(eurToThb, now, false);
        convertFrom('eur');
    } catch (e) {
        if (!eurToThb) {
            eurToThb = 39;
            updateRateNote(eurToThb, null, true);
        } else if (manual) {
            const note = document.getElementById('conv-rate-note');
            note.textContent = `Sem ligação — a usar a última taxa conhecida.`;
        }
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}

function updateRateNote(rate, time, isFallback) {
    const note = document.getElementById('conv-rate-note');
    if (!note) return;
    let whenText = 'taxa aproximada';
    if (time) {
        const mins = Math.round((Date.now() - time) / 60000);
        whenText = mins < 1 ? 'agora mesmo' : mins < 60 ? `há ${mins} min` : 'há mais de 1h';
    }
    note.textContent = `1 EUR ≈ ${rate.toFixed(2)} THB ${isFallback ? '(sem ligação, ' + whenText + ')' : '(atualizado ' + whenText + ')'}`;
}

function swapCurrencyFocus() {
    const eurEl = document.getElementById('conv-eur');
    const thbEl = document.getElementById('conv-thb');
    const tmp = eurEl.value; eurEl.value = thbEl.value; thbEl.value = tmp;
    if (thbEl.value) convertFrom('thb'); else if (eurEl.value) convertFrom('eur');
}
function convertFrom(source) {
    if (!eurToThb) return;
    const eurEl = document.getElementById('conv-eur');
    const thbEl = document.getElementById('conv-thb');
    if (source === 'eur') {
        const v = parseFloat(eurEl.value);
        thbEl.value = isNaN(v) ? '' : (v * eurToThb).toFixed(2);
    } else {
        const v = parseFloat(thbEl.value);
        eurEl.value = isNaN(v) ? '' : (v / eurToThb).toFixed(2);
    }
}

window.addEventListener('load', bootApp);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}