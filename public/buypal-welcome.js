/* ============================================================
   BuyPal · Bienvenida con confeti para el dashboard de Chatwoot
   Self-contained: inyecta su propio CSS, corre solo al entrar.
   Colócalo en public/buypal-welcome.js de tu fork y referéncialo
   en app/views/layouts/vueapp.html.erb antes de </body>.
   Todos los ids/clases van con prefijo wg- para no chocar con Chatwoot.
   ============================================================ */
(function () {
  'use strict';

  /* ================== CONFIG — lo único que editas ================== */
  var CONFIG = {
    media:      '/perrito-baile.mp4',                     // URL de GIF o video (mp4/webm/mov). Vacío = perrito SVG
    mensaje:    '¡Vamos {nombre}!',     // {nombre} = agente logueado
    frase:      'Una venta más que ayer 🚀', // texto de la ventanita del borde
    tiempo:     3,                      // seg que dura la tarjeta antes de volar
    estilo:     'cohete',               // suave | cohete | boomerang | tornado | pelota
    formato:    'vertical',            // cuadrado | vertical (9:16)
    piezas:     250,                   // confeti (0 = sin confeti)
    esquinas:   true,                  // 4 bailarines en las esquinas
    tam:        250,                   // tamaño de los bailarines (px)
    audio:      '',                    // URL de audio; vacío = pop sintetizado
    volumen:    70,                    // 0-100
    frecuencia: 'sesion',              // sesion | dia | siempre
    nombre:     'crack',               // fallback si no se lee el agente

    /* --- Panel de ventas del día (opcional · Supabase). Vacío = sin panel --- */
    supabaseUrl: 'https://fxwndndaabyktruigxal.supabase.co',
    supabaseKey: 'sb_publishable_SneWwcbXYItpg1dIyjT0Kw_CinL31Jd',                   // publishable (sb_publishable_...) o anon (eyJ...)
    proxy:       '',                   // o webhook n8n que devuelva las filas
    tabla:       'pedidos',
    campo:       'agente',
    base:        'created_at',         // created_at = cuándo se vendió · fecha = fecha del pedido
    vendedores:  ['Wendy', 'Cesar', 'Gian']
  };

  /* ================== CSS (se inyecta solo) ================== */
  var CSS = `
    #wg-panel .wg-fila .wg-nom{font-style:normal}
  #wg-panel .wg-fila.wg-yo{background:#f0f7ff;border-radius:10px;padding:7px 9px;margin:0 -5px}
  #wg-panel .wg-elegir{margin-top:12px;text-align:center}
  #wg-panel .wg-elegir small{font-size:11px;color:#8494ab;display:block;margin-bottom:7px}
  #wg-panel .wg-quien{display:flex;gap:6px;justify-content:center;flex-wrap:wrap}
  #wg-panel .wg-quien button{border:0;border-radius:9px;padding:6px 12px;font-size:12px;
    font-weight:600;background:#eef2f7;color:#42536e;cursor:pointer;font-family:inherit}
  #wg-panel .wg-quien button:hover{background:linear-gradient(135deg,#1f93ff,#7c4dff);color:#fff}
  #wg-panel .wg-perrito-panel{width:140px;height:100px;border-radius:12px;display:block;margin:0 auto 8px;background:#eaf3ff;object-fit:cover}
  #wg-confeti{position:fixed;inset:0;z-index:99997;pointer-events:none}
  #wg-welcome{position:fixed;top:50%;left:50%;z-index:99999;pointer-events:none;
    transform:translate(-50%,-50%) scale(.55);opacity:0;
    animation:wg-in .55s cubic-bezier(.2,1.3,.4,1) forwards}
  #wg-welcome .wg-card{display:flex;flex-direction:column;align-items:center;gap:12px;
    background:#fff;padding:20px 24px 22px;border-radius:20px;
    box-shadow:0 18px 55px rgba(11,18,32,.32);transition:opacity .3s ease,transform .3s ease}
  #wg-welcome .wg-media{width:190px;height:190px;border-radius:14px;display:block;background:#eaf3ff;object-fit:cover}
  #wg-welcome span{font-size:17px;font-weight:700;color:#16233a;transition:opacity .2s}
  #wg-welcome.wg-despidiendo .wg-card{opacity:0;transform:scale(.9)}
  @keyframes wg-in{to{transform:translate(-50%,-50%) scale(1);opacity:1}}
  #wg-vuela{position:fixed;z-index:100000;pointer-events:none;border-radius:14px;background:#eaf3ff;
    object-fit:cover;transform-origin:top left;filter:drop-shadow(0 12px 26px rgba(11,18,32,.28))}
  #wg-tab{position:fixed;right:0;top:50%;z-index:99998;display:flex;align-items:center;gap:8px;
    padding:11px 14px 11px 12px;border:0;border-radius:12px 0 0 12px;background:#fff;
    box-shadow:-6px 0 22px rgba(11,18,32,.16);font-family:inherit;cursor:pointer;
    transform:translateY(-50%);opacity:0;transition:padding-right .2s}
  #wg-tab.wg-visible{opacity:1}
  #wg-tab:hover{padding-right:20px}
  #wg-tab .wg-flecha{width:15px;height:15px;display:block;color:#5c6b83;transition:transform .25s}
  #wg-tab:hover .wg-flecha{transform:translateX(-3px)}
  #wg-tab .wg-punto{width:9px;height:9px;border-radius:50%;background:#1f93ff;
    box-shadow:0 0 0 0 rgba(31,147,255,.55);animation:wg-latido 2.2s ease-out infinite}
  @keyframes wg-latido{0%{box-shadow:0 0 0 0 rgba(31,147,255,.5)}
    70%{box-shadow:0 0 0 9px rgba(31,147,255,0)}100%{box-shadow:0 0 0 0 rgba(31,147,255,0)}}
  @keyframes wg-aterriza{0%{transform:translateY(-50%) scale(.72)}
    55%{transform:translateY(-50%) scale(1.09)}100%{transform:translateY(-50%) scale(1)}}
  #wg-tab.wg-aterriza{animation:wg-aterriza .42s cubic-bezier(.3,1.4,.5,1) both}
  @media (prefers-reduced-motion:reduce){#wg-tab .wg-punto{animation:none}}
  #wg-panel{position:fixed;right:14px;top:50%;z-index:99998;width:380px;
  transform:translate(24px,-50%) scale(.94);opacity:0;visibility:hidden;background:#fff;
  border-radius:18px;padding:18px 18px 20px;box-shadow:0 20px 55px rgba(11,18,32,.26);text-align:center;
  transition:transform .35s cubic-bezier(.2,1.1,.35,1),opacity .28s,visibility .35s}
#wg-panel .wg-cabecera{display:flex;gap:12px;align-items:flex-start;margin-bottom:8px}
#wg-panel .wg-perrito-lateral{width:100px;height:80px;border-radius:10px;background:#eaf3ff;object-fit:cover;flex-shrink:0;display:block}
#wg-panel .wg-cabecera-derecha{flex:1;text-align:left}
#wg-panel .wg-cabecera-derecha p{margin:0 0 6px;font-size:13px;font-weight:700;color:#16233a;line-height:1.4}
  #wg-panel.wg-abierto{transform:translate(0,-50%) scale(1);opacity:1;visibility:visible}
  #wg-panel .wg-media{width:150px;height:150px;display:block;margin:0 auto;background:#eaf3ff;border-radius:14px;object-fit:cover}
  body.wg-vertical #wg-welcome .wg-media{width:176px;height:313px}
  body.wg-vertical #wg-panel{width:380px}
  body.wg-vertical #wg-panel .wg-media{width:132px;height:235px}
  body.wg-vertical #wg-fiesta .wg-bailarin{height:calc(var(--wg-tam,130px) * 16 / 9)}
  body.wg-vertical #wg-fiesta .wg-media{object-fit:cover}
  #wg-panel p{margin:14px 0 0;font-size:15px;font-weight:700;color:#16233a;line-height:1.45}
  #wg-panel .wg-ventas{margin-top:14px;text-align:left}
  #wg-panel .wg-mio{background:linear-gradient(135deg,#1f93ff,#7c4dff);color:#fff;border-radius:14px;padding:12px 14px;text-align:center}
  #wg-panel .wg-mio b{display:block;font-size:30px;line-height:1.05;letter-spacing:-.02em}
  #wg-panel .wg-mio small{display:block;font-size:11px;opacity:.9;margin-top:3px;letter-spacing:.04em;text-transform:uppercase}
  #wg-panel .wg-monto{display:block;font-size:14px;font-weight:700;margin-top:7px}
  #wg-panel .wg-rank{margin-top:12px;display:flex;flex-direction:column;gap:8px}
  #wg-panel .wg-fila{font-size:12px;color:#42536e}
  #wg-panel .wg-fila .wg-top{display:flex;justify-content:space-between;font-weight:600;margin-bottom:3px}
  #wg-panel .wg-fila.wg-yo .wg-top{color:#1f93ff}
  #wg-panel .wg-barra{height:7px;border-radius:99px;background:#e9eef5;overflow:hidden}
  #wg-panel .wg-barra i{display:block;height:100%;border-radius:99px;background:#c3d3e6;transition:width .5s ease}
  #wg-panel .wg-fila.wg-yo .wg-barra i{background:linear-gradient(90deg,#1f93ff,#7c4dff)}
  #wg-panel .wg-pie{margin-top:11px;display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:#8494ab}
  #wg-panel .wg-recargar{border:0;background:#eef2f7;color:#5c6b83;border-radius:8px;padding:4px 9px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit}
  #wg-panel .wg-recargar:hover{background:#e0e6ee;color:#16233a}
  #wg-panel .wg-error{font-size:11.5px;color:#b4442a;background:#fdeeea;border-radius:9px;padding:9px 10px;line-height:1.45}
  #wg-panel .wg-cargando{font-size:12px;color:#8494ab;text-align:center;padding:14px 0}
  #wg-panel .wg-cerrar{position:absolute;top:8px;right:8px;width:28px;height:28px;padding:0;border:0;
    border-radius:50%;background:#eef2f7;color:#5c6b83;font-size:16px;line-height:1;cursor:pointer}
  #wg-panel .wg-cerrar:hover{background:#e0e6ee;color:#16233a}
  .wg-perro{transform-origin:50% 92%}
  .wg-bailando .wg-perro{animation:wg-bailar .62s ease-in-out infinite alternate}
  img.wg-bailando,video.wg-bailando{transform-origin:50% 92%;animation:wg-bailar .62s ease-in-out infinite alternate}
  @keyframes wg-bailar{from{transform:rotate(-7deg) translateY(0)}to{transform:rotate(7deg) translateY(-8px)}}
  #wg-fiesta{position:fixed;inset:0;z-index:99996;pointer-events:none;transition:opacity .35s ease}
  #wg-fiesta.wg-off{opacity:0}
  #wg-fiesta .wg-bailarin{position:absolute;width:var(--wg-tam,130px);height:var(--wg-tam,130px);
    opacity:0;transform:scale(.4);animation:wg-entra .5s cubic-bezier(.2,1.5,.4,1) forwards}
  #wg-fiesta .wg-media{width:100%;height:100%;display:block;border-radius:14px;object-fit:contain;
    filter:drop-shadow(0 10px 22px rgba(11,18,32,.22))}
  @keyframes wg-entra{to{opacity:1;transform:scale(1)}}
  #wg-fiesta .wg-tl{top:22px;left:22px;animation-delay:.05s}
  #wg-fiesta .wg-tr{top:22px;right:22px;animation-delay:.15s}
  #wg-fiesta .wg-bl{bottom:22px;left:22px;animation-delay:.25s}
  #wg-fiesta .wg-br{bottom:22px;right:22px;animation-delay:.35s}
  #wg-fiesta .wg-tl .wg-perro,#wg-fiesta .wg-tl .wg-bailando{animation-delay:-.05s}
  #wg-fiesta .wg-tr .wg-perro,#wg-fiesta .wg-tr .wg-bailando{animation-delay:-.31s}
  #wg-fiesta .wg-bl .wg-perro,#wg-fiesta .wg-bl .wg-bailando{animation-delay:-.15s}
  #wg-fiesta .wg-br .wg-perro,#wg-fiesta .wg-br .wg-bailando{animation-delay:-.46s}
  @media (max-width:640px){#wg-fiesta .wg-bailarin{--wg-tam:84px}}
  @media (prefers-reduced-motion:reduce){
    #wg-welcome,.wg-bailando .wg-perro,img.wg-bailando,video.wg-bailando,
    #wg-fiesta .wg-bailarin,#wg-tab.wg-aterriza{animation-duration:.01ms!important}
    #wg-panel{transition-duration:.01ms!important}}`;

  var st = document.createElement('style');
  st.id = 'wg-estilos';
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ================== ESTADO ================== */
  var AGENTE = '';
  var timers = [], gifURL = '';
  var blobEsVideo = false;
  var ctxAudio = null, audioURL = '', volumen = 0.7, avisado = false;
  var rafConfeti = null, medirConfeti = null;

  var SUPA = {
    url: '', key: '', proxy: '', tabla: 'pedidos',
    campo: 'agente', base: 'created_at',
    vendedores: ['Wendy', 'Cesar', 'Gian'],
    excluir: ['ANULADO', 'CANCELADO', 'RECHAZADO']
  };

  /* ================== PERRITO / MEDIA ================== */
  function perritoSVG(bailando, clase) {
    return '<svg class="' + (clase || '') + (bailando ? ' wg-bailando' : '') + '" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Perrito">' +
      '<g class="wg-perro">' +
        '<ellipse cx="100" cy="178" rx="34" ry="6" fill="#c9dcf2"/>' +
        '<rect x="76" y="118" width="48" height="46" rx="18" fill="#b9773f"/>' +
        '<rect x="80" y="152" width="14" height="22" rx="7" fill="#a3652f"/>' +
        '<rect x="106" y="152" width="14" height="22" rx="7" fill="#a3652f"/>' +
        '<path d="M124 130 q26 -10 20 -34" stroke="#b9773f" stroke-width="11" stroke-linecap="round" fill="none"/>' +
        '<circle cx="100" cy="86" r="40" fill="#cf8b4c"/>' +
        '<path d="M64 62 q-16 -26 4 -34 q16 -4 20 22z" fill="#a3652f"/>' +
        '<path d="M136 62 q16 -26 -4 -34 q-16 -4 -20 22z" fill="#a3652f"/>' +
        '<ellipse cx="100" cy="104" rx="24" ry="18" fill="#f6e2c8"/>' +
        '<circle cx="86" cy="80" r="6" fill="#22303f"/><circle cx="114" cy="80" r="6" fill="#22303f"/>' +
        '<circle cx="88" cy="78" r="2" fill="#fff"/><circle cx="116" cy="78" r="2" fill="#fff"/>' +
        '<ellipse cx="100" cy="98" rx="9" ry="7" fill="#22303f"/>' +
        '<path d="M100 105 v6 M100 111 q-9 8 -16 1 M100 111 q9 8 16 1" stroke="#22303f" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
      '</g></svg>';
  }

  function esVideo(url) {
    if (/^data:video\//i.test(url || '')) return true;
    if (/^blob:/i.test(url || '')) return blobEsVideo;
    return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url || '');
  }

  function media(url, bailando, extra) {
    var clase = 'wg-media ' + (extra || '');
    if (!url) return perritoSVG(bailando, clase);
    if (bailando) clase += ' wg-bailando';
    if (esVideo(url)) {
      return '<video class="' + clase + '" src="' + url + '" autoplay muted loop playsinline disablepictureinpicture></video>';
    }
    return '<img class="' + clase + '" src="' + url + '" alt="">';
  }

  /* ================== SONIDO ================== */
  function audio() {
    if (!ctxAudio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxAudio = new AC();
    }
    if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(function () {});
    return ctxAudio;
  }

  function desbloquear() {
    var a = audio();
    if (a && a.state === 'running') {
      document.removeEventListener('pointerdown', desbloquear);
      document.removeEventListener('keydown', desbloquear);
    }
  }
  document.addEventListener('pointerdown', desbloquear);
  document.addEventListener('keydown', desbloquear);

  function pop(a, t, vol) {
    var largo = 0.18;
    var buf = a.createBuffer(1, a.sampleRate * largo, a.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    var ruido = a.createBufferSource(); ruido.buffer = buf;
    var filtro = a.createBiquadFilter();
    filtro.type = 'bandpass'; filtro.frequency.value = 1400; filtro.Q.value = 0.9;
    var g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + largo);
    ruido.connect(filtro).connect(g).connect(a.destination);
    ruido.start(t); ruido.stop(t + largo);
    var o = a.createOscillator(), og = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.09);
    og.gain.setValueAtTime(vol * 0.55, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og).connect(a.destination);
    o.start(t); o.stop(t + 0.13);
  }

  function chispas(a, t, vol, cuantas) {
    var escala = [1046, 1318, 1568, 2093, 2637];
    for (var i = 0; i < cuantas; i++) {
      var ini = t + 0.12 + Math.random() * 1.1;
      var o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.value = escala[(Math.random() * escala.length) | 0] * (Math.random() < 0.3 ? 2 : 1);
      g.gain.setValueAtTime(0, ini);
      g.gain.linearRampToValueAtTime(vol * 0.13, ini + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.22);
      o.connect(g).connect(a.destination);
      o.start(ini); o.stop(ini + 0.24);
    }
  }

  function sonarConfeti() {
    if (volumen <= 0) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (audioURL) {
      var el = new Audio(audioURL);
      el.volume = Math.min(1, volumen);
      el.play().catch(function () { aviso(); });
      return;
    }
    var a = audio();
    if (!a) return;
    if (a.state !== 'running') { aviso(); return; }
    var t = a.currentTime + 0.02;
    pop(a, t, volumen * 0.9);
    pop(a, t + 0.13, volumen * 0.5);
    chispas(a, t, volumen, 16);
  }

  /* En el dashboard el agente ya interactuó al loguearse, así que
     normalmente el audio suena. Si el navegador lo bloquea, se calla. */
  function aviso() { avisado = true; }

  /* ================== CONFETI ================== */
  function pararConfeti() {
    if (rafConfeti) cancelAnimationFrame(rafConfeti);
    rafConfeti = null;
    if (medirConfeti) { window.removeEventListener('resize', medirConfeti); medirConfeti = null; }
    var c = document.getElementById('wg-confeti');
    if (c) c.remove();
  }

  function lanzarConfeti(cantidad, duracion) {
    pararConfeti();
    if (!cantidad) return;
    sonarConfeti();
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var cv = document.createElement('canvas');
    cv.id = 'wg-confeti';
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    medirConfeti = function () {
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      cv.style.width = window.innerWidth + 'px';
      cv.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    medirConfeti();
    window.addEventListener('resize', medirConfeti);
    var colores = ['#1f93ff', '#12b981', '#f59e0b', '#ef4476', '#7c4dff', '#ffd233'];
    var piezas = [];
    for (var i = 0; i < cantidad; i++) {
      piezas.push({
        x: Math.random() * window.innerWidth,
        y: -20 - Math.random() * window.innerHeight * 0.9,
        w: 6 + Math.random() * 7, h: 9 + Math.random() * 11,
        c: colores[(Math.random() * colores.length) | 0],
        vy: 1.6 + Math.random() * 2.8, vx: -0.9 + Math.random() * 1.8,
        giro: Math.random() * Math.PI * 2, vgiro: -0.11 + Math.random() * 0.22,
        bal: Math.random() * Math.PI * 2, cinta: Math.random() < 0.35
      });
    }
    var inicio = performance.now();
    function frame(t) {
      var vida = t - inicio;
      var fin = Math.min(1, Math.max(0, (vida - (duracion - 900)) / 900));
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (var i = 0; i < piezas.length; i++) {
        var p = piezas[i];
        p.bal += 0.045; p.y += p.vy;
        p.x += p.vx + Math.sin(p.bal) * 1.1;
        p.giro += p.vgiro;
        if (p.y > window.innerHeight + 30) { p.y = -25; p.x = Math.random() * window.innerWidth; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.giro);
        ctx.globalAlpha = 1 - fin; ctx.fillStyle = p.c;
        if (p.cinta) { ctx.scale(1, Math.cos(p.bal * 1.5)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (vida < duracion) rafConfeti = requestAnimationFrame(frame);
      else pararConfeti();
    }
    rafConfeti = requestAnimationFrame(frame);
  }

  /* ================== LIMPIEZA ================== */
  function limpiar() {
    timers.forEach(clearTimeout); timers = [];
    pararConfeti();
          ['wg-welcome', 'wg-tab', 'wg-panel', 'wg-vuela', 'wg-fiesta', 'wg-video-lateral'].forEach(function(id) {
      var e = document.getElementById(id); if (e) e.remove();
    });
  }

  /* ================== LOS 4 DE LAS ESQUINAS ================== */
  function montarFiesta(tam) {
    var esquinas = ['wg-tl', 'wg-tr', 'wg-bl', 'wg-br'];
    var cont = document.createElement('div');
    cont.id = 'wg-fiesta';
    cont.setAttribute('aria-hidden', 'true');
    var html = '';
    for (var i = 0; i < esquinas.length; i++) {
      html += '<div class="wg-bailarin ' + esquinas[i] + '" style="--wg-tam:' + tam + 'px">' + media(gifURL, true) + '</div>';
    }
    cont.innerHTML = html;
    document.body.appendChild(cont);
    Array.prototype.forEach.call(cont.querySelectorAll('img,video'), function (v) {
      v.addEventListener('error', function () { v.outerHTML = perritoSVG(true, 'wg-media'); });
      if (v.tagName === 'VIDEO') { v.muted = true; v.play().catch(function () {}); }
    });
    return cont;
  }

  function quitarFiesta() {
    var f = document.getElementById('wg-fiesta');
    if (!f) return;
    f.classList.add('wg-off');
    timers.push(setTimeout(function () { if (f.parentNode) f.remove(); }, 400));
  }

  /* ================== SUPABASE ================== */
  function ventanaHoy() {
    var ahora = new Date(Date.now() - 5 * 3600 * 1000);
    var dia = ahora.toISOString().slice(0, 10);
    var desde = new Date(dia + 'T00:00:00Z');
    desde.setUTCHours(desde.getUTCHours() + 5);
    var hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
    return { dia: dia, desde: desde.toISOString(), hasta: hasta.toISOString() };
  }

  function traerVentas() {
    var v = ventanaHoy();
    var campos = 'sync_id,id,estado,cantidad,precio_unitario,' + SUPA.campo;
    var filtro = SUPA.base === 'fecha'
      ? '&fecha=eq.' + v.dia
      : '&created_at=gte.' + v.desde + '&created_at=lt.' + v.hasta;
    var url, opciones;
    if (SUPA.proxy) {
      url = SUPA.proxy + (SUPA.proxy.indexOf('?') === -1 ? '?' : '&') +
        'dia=' + v.dia + '&desde=' + encodeURIComponent(v.desde) +
        '&hasta=' + encodeURIComponent(v.hasta) + '&base=' + SUPA.base;
      opciones = {};
    } else {
      url = SUPA.url.replace(/\/+$/, '') + '/rest/v1/' + SUPA.tabla +
        '?select=' + encodeURIComponent(campos) + filtro + '&limit=5000';
      opciones = { headers: { apikey: SUPA.key, Authorization: 'Bearer ' + SUPA.key } };
    }
    return fetch(url, opciones).then(function (r) {
      if (!r.ok) return r.text().then(function (t) {
        if (/secret API key/i.test(t)) throw new Error('Esa es la key secreta y Supabase la bloquea en el navegador. Usa la publishable (sb_publishable_...) o la anon (eyJ...).');
        if (r.status === 401 || r.status === 403) throw new Error('Supabase ' + r.status + ': key inválida o sin permiso de lectura sobre "' + SUPA.tabla + '".');
        throw new Error('Supabase ' + r.status + ' · ' + t.slice(0, 140));
      });
      return r.json();
    }).then(function (datos) {
      if (datos && !Array.isArray(datos)) datos = datos.filas || datos.data || [];
            if (!Array.isArray(datos)) datos = [];
      var acum = {};
      SUPA.vendedores.forEach(function (n) { acum[n] = { nombre: n, pedidos: 0, monto: 0, productos: 0, _vistos: {} }; });
      datos.forEach(function (fila) {
        var quien = fila[SUPA.campo], llave = null;
        for (var k in acum) { if (normal(k) === normal(quien)) { llave = k; break; } }
        if (!llave) return;
        var a = acum[llave];
        var pedido = fila.sync_id || ('id:' + fila.id);
        if (!a._vistos[pedido]) { a._vistos[pedido] = 1; a.pedidos += 1; }
        var cant = Number(fila.cantidad) || 0;
        var precio = Number(fila.precio_unitario) || 0;
        a.monto += cant * precio; a.productos += cant;
      });
      return { dia: v.dia, base: SUPA.base, filas: SUPA.vendedores.map(function (n) { return acum[n]; }) };
    });
  }

  function normal(t) {
    var v = (t == null ? '' : String(t)).trim().toLowerCase();
    if (v.normalize) v = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return v;
  }

  function soles(n) {
    return 'S/ ' + (Math.round(n * 100) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /* ================== PESTAÑA + VENTANITA ================== */
  function montarTab(frase) {
    var conVentas = !!(SUPA.key || SUPA.proxy);
    var tab = document.createElement('button');
    tab.id = 'wg-tab';
    tab.type = 'button';
    tab.setAttribute('aria-expanded', 'false');
    tab.setAttribute('aria-label', 'Abrir mensaje');
    tab.innerHTML =
      '<svg class="wg-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      '<span class="wg-punto"></span>';
    var panel = document.createElement('div');
    panel.id = 'wg-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Mensaje del día');
            var mediaTag = media(gifURL, false);
    if (esVideo(gifURL)) {
      mediaTag = '<video class="wg-perrito-lateral" src="' + gifURL + '" autoplay muted loop playsinline disablepictureinpicture></video>';
    }
    panel.innerHTML = '<button class="wg-cerrar" type="button" aria-label="Cerrar">✕</button>' +
      '<div class="wg-cabecera">' + mediaTag +
      '<div class="wg-cabecera-derecha"><p></p></div></div>' +
      (conVentas ? '<div class="wg-ventas"><div class="wg-cargando">Cargando ventas…</div></div>' : '');
    var zona = panel.querySelector('.wg-ventas');

            function pintar(res) {
      var yo = (AGENTE || '').trim();

      /* ranking: más pedidos primero, desempate por monto */
      var filas = res.filas.slice().sort(function (a, b) {
        return (b.pedidos - a.pedidos) || (b.monto - a.monto);
      });

      var tope = 1;
      filas.forEach(function (f) { if (f.pedidos > tope) tope = f.pedidos; });

      /* ¿cuál fila soy yo? */
      var mio = null;
      var yoNorm = normal(yo), yoPrimero = yoNorm.split(' ')[0];
      filas.forEach(function (f) {
        var fn = normal(f.nombre);
        if (fn === yoNorm || fn === yoPrimero || yoNorm.indexOf(fn) === 0) mio = f;
      });

      var pos = mio ? filas.indexOf(mio) + 1 : 0;

      /* mensaje: solo para asesores, siempre en positivo */
      var msg = 'Ranking vendedores :)';
      if (mio) {
        var pools = {
          cero: [
            'Hoy es página en blanco 🌱',
            'La primera del día te está esperando 💪',
            'Cada mañana es un nuevo comienzo ☀️',
            'Listo para arrancar 🚀'
          ],
          lider: [
            '¡Estás liderando, ' + mio.nombre + '! 🔥',
            '¡Nadie te alcanza hoy, ' + mio.nombre + '! 🏆',
            '¡Vas primero! Sigue con todo 🚀'
          ],
          bien: [
            mio.pedidos + ' familias confiaron en ti hoy 💙',
            '¡' + mio.pedidos + ' ventas! Vas construyendo tu día 🌟',
            mio.pedidos + ' mamás felices gracias a ti 🤱',
            'Ya llevas ' + soles(mio.monto) + ' hoy. ¡Bien ahí! ✨',
            'Cada venta suma. Sigue así 💪'
          ]
        };
        var pool = mio.pedidos === 0 ? pools.cero : (pos === 1 ? pools.lider : pools.bien);
        msg = pool[Math.floor(Math.random() * pool.length)];
      }

      /* cabecera: mensaje + mi contador */
      var cabDer = panel.querySelector('.wg-cabecera-derecha');
      if (cabDer) {
        var mioHTML = '';
        if (mio) {
          mioHTML = '<div class="wg-mio" style="margin-top:4px;padding:8px 10px"><b>' + mio.pedidos + '</b>' +
            '<small>' + (mio.pedidos === 1 ? 'venta hoy' : 'ventas hoy') + '</small>' +
            '<span class="wg-monto">' + soles(mio.monto) + '</span></div>';
        }
        cabDer.innerHTML = '<p class="wg-msg"></p>' + mioHTML;
        cabDer.querySelector('.wg-msg').textContent = msg;
      }

      /* tabla del equipo */
      var med = ['🥇', '🥈', '🥉'];
      var h = '<div class="wg-rank">';
      filas.forEach(function (f, i) {
        var esYo = mio && f.nombre === mio.nombre;
        h += '<div class="wg-fila' + (esYo ? ' wg-yo' : '') + '">' +
          '<div class="wg-top"><span>' + (med[i] || '') + ' <i class="wg-nom"></i></span>' +
          '<span>' + f.pedidos + ' · ' + soles(f.monto) + '</span></div>' +
          '<div class="wg-barra"><i style="width:' + Math.round(f.pedidos / tope * 100) + '%"></i></div></div>';
      });
      h += '</div>';

      h += '<div class="wg-pie"><span>' + res.dia + '</span><button class="wg-recargar" type="button">Actualizar</button></div>';
      zona.innerHTML = h;

      /* nombres por textContent (seguro ante caracteres raros) */
      var nombres = zona.querySelectorAll('.wg-nom');
      for (var i = 0; i < nombres.length; i++) nombres[i].textContent = filas[i].nombre;

      zona.querySelector('.wg-recargar').addEventListener('click', cargar);
    }
    function cargar() {
      if (!conVentas || !zona) return;
      zona.innerHTML = '<div class="wg-cargando">Cargando ventas…</div>';
      traerVentas().then(pintar).catch(function (e) {
        zona.innerHTML = '<div class="wg-error"></div>' +
          '<div class="wg-pie"><span></span><button class="wg-recargar" type="button">Reintentar</button></div>';
        zona.querySelector('.wg-error').textContent = 'No pude leer las ventas. ' + e.message;
        zona.querySelector('.wg-recargar').addEventListener('click', cargar);
      });
    }
    cargar();

    document.body.appendChild(tab);
    document.body.appendChild(panel);
    [tab, panel].forEach(function (n) {
      var v = n.querySelector('video');
      if (v) { v.muted = true; v.play().catch(function () {}); }
    });

    function abrir() {
      cargar();
      panel.classList.add('wg-abierto');
      tab.setAttribute('aria-expanded', 'true');
      tab.style.opacity = '0';
      tab.style.pointerEvents = 'none';
    }
    function cerrar() {
      panel.classList.remove('wg-abierto');
      tab.setAttribute('aria-expanded', 'false');
      tab.style.opacity = '1';
      tab.style.pointerEvents = 'auto';
    }
    tab.addEventListener('click', abrir);
    panel.querySelector('.wg-cerrar').addEventListener('click', cerrar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('wg-abierto')) cerrar();
    });
    return tab;
  }

  /* ================== VUELO FLIP ================== */
  var ESTILOS = {
    suave: function (dx, dy, s) {
      var arco = -Math.min(90, Math.abs(dx) * 0.14);
      return { duracion: 900, easing: 'cubic-bezier(.45,.05,.3,1)', pasos: [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (dx * 0.55) + 'px,' + (dy * 0.42 + arco) + 'px) scale(' + (1 - (1 - s) * 0.45) + ') rotate(-9deg)', offset: 0.5 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(0deg)', opacity: 0 }
      ] };
    },
    cohete: function (dx, dy, s) {
      return { duracion: 620, easing: 'cubic-bezier(.7,0,.35,1)', pasos: [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (dx * -0.06) + 'px,' + (dy * 0.05) + 'px) scale(.9) rotate(6deg)', offset: 0.16 },
        { transform: 'translate(' + (dx * 0.7) + 'px,' + (dy * 0.7) + 'px) scale(' + (s * 2.2) + ') rotate(-16deg)', offset: 0.62 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(0deg)', opacity: 0 }
      ] };
    },
    boomerang: function (dx, dy, s) {
      return { duracion: 1150, easing: 'cubic-bezier(.35,.1,.25,1)', pasos: [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(-140px,-60px) scale(.85) rotate(-22deg)', offset: 0.26 },
        { transform: 'translate(' + (dx * 0.62) + 'px,' + (dy * 0.3 - 70) + 'px) scale(' + (1 - (1 - s) * 0.55) + ') rotate(14deg)', offset: 0.68 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(0deg)', opacity: 0 }
      ] };
    },
    tornado: function (dx, dy, s) {
      return { duracion: 1000, easing: 'cubic-bezier(.4,0,.3,1)', pasos: [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (dx * 0.3) + 'px,' + (dy * 0.3 - 55) + 'px) scale(' + (1 - (1 - s) * 0.3) + ') rotate(280deg)', offset: 0.38 },
        { transform: 'translate(' + (dx * 0.72) + 'px,' + (dy * 0.7 + 30) + 'px) scale(' + (1 - (1 - s) * 0.72) + ') rotate(560deg)', offset: 0.72 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(720deg)', opacity: 0 }
      ] };
    },
    pelota: function (dx, dy, s) {
      return { duracion: 1250, easing: 'linear', pasos: [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (dx * 0.3) + 'px,' + (dy * 0.55 + 120) + 'px) scale(' + (1 - (1 - s) * 0.3) + ') rotate(40deg)', offset: 0.3, easing: 'cubic-bezier(.4,0,1,.5)' },
        { transform: 'translate(' + (dx * 0.52) + 'px,' + (dy * 0.3 - 40) + 'px) scale(' + (1 - (1 - s) * 0.5) + ') rotate(120deg)', offset: 0.52, easing: 'cubic-bezier(0,.5,.4,1)' },
        { transform: 'translate(' + (dx * 0.78) + 'px,' + (dy * 0.8 + 70) + 'px) scale(' + (1 - (1 - s) * 0.75) + ') rotate(220deg)', offset: 0.76, easing: 'cubic-bezier(.4,0,1,.5)' },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ') rotate(320deg)', opacity: 0 }
      ] };
    }
  };

  function volarHaciaTab(caja, frase, estilo) {
    quitarFiesta();
    var origen = caja.querySelector('.wg-media');
    var desde = origen.getBoundingClientRect();
    var tab = montarTab(frase);
    var hasta = tab.querySelector('.wg-punto').getBoundingClientRect();
    var clon = origen.cloneNode(true);
    clon.id = 'wg-vuela';
    clon.classList.remove('wg-bailando');
    clon.style.left = desde.left + 'px';
    clon.style.top = desde.top + 'px';
    clon.style.width = desde.width + 'px';
    clon.style.height = desde.height + 'px';
    document.body.appendChild(clon);
    if (clon.tagName === 'VIDEO') { clon.muted = true; clon.play().catch(function () {}); }
    caja.classList.add('wg-despidiendo');
    origen.style.opacity = '0';
    var dx = (hasta.left + hasta.width / 2) - (desde.left + desde.width / 2);
    var dy = (hasta.top + hasta.height / 2) - (desde.top + desde.height / 2);
    var s = Math.max(0.05, hasta.width / desde.width);
    var receta = (ESTILOS[estilo] || ESTILOS.suave)(dx, dy, s);
    var duracion = receta.duracion;
    function aterrizar() {
      if (caja.parentNode) caja.remove();
      tab.classList.add('wg-visible', 'wg-aterriza');
      if (clon.parentNode) clon.remove();
    }
    if (typeof clon.animate === 'function') {
      var vuelo = clon.animate(receta.pasos, { duration: duracion, easing: receta.easing, fill: 'forwards' });
      vuelo.onfinish = aterrizar;
      timers.push(setTimeout(aterrizar, duracion + 250));
    } else {
      clon.style.transition = 'transform ' + duracion + 'ms cubic-bezier(.45,.05,.3,1)';
      requestAnimationFrame(function () { clon.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')'; });
      timers.push(setTimeout(aterrizar, duracion));
    }
  }

  
   /* ================== SECUENCIA ================== */
  function aplicarConfig() {
    gifURL = (CONFIG.media || '').trim();
    document.body.classList.toggle('wg-vertical', CONFIG.formato === 'vertical');
    SUPA.url        = CONFIG.supabaseUrl || '';
    SUPA.key        = (CONFIG.supabaseKey || '').trim();
    SUPA.proxy      = (CONFIG.proxy || '').trim();
    SUPA.tabla      = CONFIG.tabla || 'pedidos';
    SUPA.campo      = CONFIG.campo || 'agente';
    SUPA.base       = CONFIG.base || 'created_at';
    SUPA.vendedores = CONFIG.vendedores || SUPA.vendedores;
    audioURL = (CONFIG.audio || '').trim();
    volumen  = Math.min(1, Math.max(0, (parseInt(CONFIG.volumen, 10) || 0) / 100));
  }

  /* Recarga: solo la pestaña, sin confeti ni tarjeta */
  function soloTab() {
    if (document.getElementById('wg-tab')) return;
    aplicarConfig();
    var tab = montarTab(CONFIG.frase || 'Da lo mejor de ti :)');
    tab.classList.add('wg-visible', 'wg-aterriza');
  }
   /* saludo según la hora de Lima y el nombre del asesor */
  function saludo(nombre) {
    var corto = String(nombre).trim().split(' ')[0];
    var h = new Date(Date.now() - 5 * 3600 * 1000).getUTCHours();
    var momento = h < 12 ? 'Buenos días' : (h < 19 ? 'Buenas tardes' : 'Buenas noches');
    var frases = [
      momento + ', ' + corto + ' 👋',
      '¡Qué bueno verte, ' + corto + '!',
      momento + ', ' + corto + '. Hoy es tuyo 🚀',
      '¡Vamos, ' + corto + '! 💪'
    ];
    return frases[Math.floor(Math.random() * frases.length)];
  }
  /* Primer ingreso: show completo */
  function arrancar() {
    limpiar();
    aplicarConfig();
    var nombre   = (AGENTE || CONFIG.nombre || 'crack');
    var texto = saludo(nombre);
    var frase    = CONFIG.frase || 'Da lo mejor de ti :)';
    var espera   = Math.max(1, parseFloat(CONFIG.tiempo) || 3) * 1000;
    var estilo   = CONFIG.estilo || 'suave';
    var piezas   = Math.max(0, parseInt(CONFIG.piezas, 10) || 0);
    var esquinas = CONFIG.esquinas !== false;
    var tam      = Math.min(260, Math.max(60, parseInt(CONFIG.tam, 10) || 130));

    lanzarConfeti(piezas, espera + 1400);
    if (esquinas) montarFiesta(tam);

    var caja = document.createElement('div');
    caja.id = 'wg-welcome';
    caja.innerHTML = '<div class="wg-card">' + media(gifURL, true) + '<span></span></div>';
    caja.querySelector('span').textContent = texto;
    var visual = caja.querySelector('img, video');
    if (visual) {
      visual.addEventListener('error', function () { gifURL = ''; visual.outerHTML = perritoSVG(true, 'wg-media'); });
      if (visual.tagName === 'VIDEO') { visual.muted = true; visual.play().catch(function () {}); }
    }
    document.body.appendChild(caja);

    timers.push(setTimeout(function () {
      var s = caja.querySelector('span'); if (s) s.style.opacity = '0';
    }, Math.max(0, espera - 150)));
    timers.push(setTimeout(function () { volarHaciaTab(caja, frase, estilo); }, espera));
  }
  /* ================== ARRANQUE CONTROLADO ================== */
  function enDashboard() { return /\/app\/accounts\//.test(location.pathname); }

  function yaVisto() {
    if (CONFIG.frecuencia === 'siempre') return false;
    try {
      if (CONFIG.frecuencia === 'dia') {
        return localStorage.getItem('bp-welcome') === new Date().toISOString().slice(0, 10);
      }
      return !!sessionStorage.getItem('bp-welcome');
    } catch (e) { return false; }
  }
  function marcarVisto() {
    try {
      if (CONFIG.frecuencia === 'dia') localStorage.setItem('bp-welcome', new Date().toISOString().slice(0, 10));
      else if (CONFIG.frecuencia === 'sesion') sessionStorage.setItem('bp-welcome', '1');
    } catch (e) {}
  }

  
   /* nombre del agente logueado — cookie de sesión de Chatwoot */
  function resolverAgente() {
    try {
      var c = document.cookie.split(';').filter(function (x) {
        return x.trim().indexOf('cw_d_session_info=') === 0;
      })[0];
      if (c) {
        var s = JSON.parse(decodeURIComponent(c.split('=').slice(1).join('=')));
        if (s && s['access-token']) {
          return fetch('/api/v1/profile', {
            headers: {
              'access-token': s['access-token'],
              'client':       s.client,
              'uid':          s.uid,
              'token-type':   'Bearer',
              'Accept':       'application/json'
            }
          })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (u) {
              return (u && (u.available_name || u.name)) || guardado();
            })
            .catch(function () { return guardado(); });
        }
      }
    } catch (e) {}
    return Promise.resolve(guardado());
  }

  function guardado() {
    try { return localStorage.getItem('bp-agente') || CONFIG.nombre; }
    catch (e) { return CONFIG.nombre; }
  }

  /* espera a que el dashboard SPA esté montado */
  function cuandoListo(cb) {
    var intentos = 0;
    (function esperar() {
      var app = document.getElementById('app');
      if (enDashboard() && app && app.children.length) { cb(); return; }
      if (++intentos > 100) return;   // techo ~20s
      setTimeout(esperar, 200);
    })();
  }

    if (window.top === window.self) {
    cuandoListo(function () {
      resolverAgente().then(function (n) {
        AGENTE = n;
        if (yaVisto()) {
          soloTab();                      // recarga → solo el deslizante
        } else {
          marcarVisto();
          arrancar();                     // primer ingreso → animación completa
        }
      });
    });
  }
})();
