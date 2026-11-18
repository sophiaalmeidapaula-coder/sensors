/* =========================================================
   SENSORS.JS
   Site educacional — Sensores de Luz, Radiação Solar
   e o Projeto da Piscina do CEP
   
   Estrutura:
   01. Configuração e utilitários
   02. Acessibilidade (tema, fonte, VLibras)
   03. Atalhos de teclado globais
   04. Simulador 1 — Resposta do LDR
   05. Simulador 2 — Comparativo de posições
   06. Simulador 3 — Posicionamento do coletor solar
   07. Animações de entrada (IntersectionObserver)
   08. Barra de progresso de leitura
   09. Exportação de dados dos simuladores
   10. Inicialização segura
   ========================================================= */

(function () {
  'use strict';

  /* =========================================================
     01. CONFIGURAÇÃO E UTILITÁRIOS
     ========================================================= */
  const STORAGE_KEYS = {
    contrast: 'sensors-contrast',
    dyslexic: 'sensors-dyslexic',
    fontSize: 'sensors-fontsize'
  };

  const root = document.documentElement;

  /** Lê um valor do localStorage com fallback */
  const storage = {
    get(key) {
      try { return localStorage.getItem(key); }
      catch (_) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); }
      catch (_) { /* armazenamento indisponível */ }
    }
  };

  /** Busca elemento seguro (retorna null se não existir) */
  const $(sel) => document.querySelector(sel);
  const $all = (sel) => Array.from(document.querySelectorAll(sel));

  /** Formata número com separador PT-BR */
  const fmt = (n, dec = 0) =>
    Number(n).toLocaleString('pt-BR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec
    });

  /** Anuncia mensagem para leitores de tela via região aria-live */
  function announce(message, priority = 'polite') {
    let region = $('#a11y-announcer');
    if (!region) {
      region = document.createElement('div');
      region.id = 'a11y-announcer';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', priority);
      region.className = 'visually-hidden';
      document.body.appendChild(region);
    }
    region.textContent = '';
    // Pequeno delay para o leitor detectar a mudança
    requestAnimationFrame(() => { region.textContent = message; });
  }


  /* =========================================================
     02. ACESSIBILIDADE — tema, fonte, VLibras
     ========================================================= */
  const a11y = {
    init() {
      // Restaurar preferências salvas
      if (storage.get(STORAGE_KEYS.contrast) === '1') this.setContrast(true, false);
      if (storage.get(STORAGE_KEYS.dyslexic) === '1') this.setDyslexic(true, false);

      const fontSaved = storage.get(STORAGE_KEYS.fontSize);
      if (fontSaved) {
        root.style.setProperty('--font-size', fontSaved + 'px');
      }

      // Eventos dos botões
      $('#btnContrast')?.addEventListener('click', () =>
        this.setContrast(root.dataset.theme !== 'high-contrast'));
      $('#btnDyslexic')?.addEventListener('click', () =>
        this.setDyslexic(root.dataset.font !== 'dyslexic'));
      $('#btnFontUp')?.addEventListener('click', () => this.changeFont(+2));
      $('#btnFontDown')?.addEventListener('click', () => this.changeFont(-2));
      $('#btnVlibras')?.addEventListener('click', () => this.openVlibras());
    },

    setContrast(on, save = true) {
      root.dataset.theme = on ? 'high-contrast' : 'default';
      $('#btnContrast')?.setAttribute('aria-pressed', String(on));
      if (save) storage.set(STORAGE_KEYS.contrast, on ? '1' : '0');
      announce(on ? 'Alto contraste ativado' : 'Alto contraste desativado');
    },

    setDyslexic(on, save = true) {
      root.dataset.font = on ? 'dyslexic' : 'default';
      $('#btnDyslexic')?.setAttribute('aria-pressed', String(on));
      if (save) storage.set(STORAGE_KEYS.dyslexic, on ? '1' : '0');
      announce(on ? 'Fonte para dislexia ativada' : 'Fonte padrão ativada');
    },

    changeFont(delta) {
      const cur = parseInt(getComputedStyle(root).getPropertyValue('--font-size')) || 17;
      const next = Math.max(14, Math.min(26, cur + delta));
      root.style.setProperty('--font-size', next + 'px');
      storage.set(STORAGE_KEYS.fontSize, next);
      announce(`Tamanho da fonte: ${next} pixels`);
    },

    openVlibras() {
      // Tenta clicar no botão flutuante do VLibras
      const btn = document.querySelector('.vpw-button, [vw-access-button]');
      if (btn) {
        btn.click();
        announce('Widget do VLibras aberto');
      } else {
        announce('O widget do VLibras ainda está carregando. Tente novamente em instantes.');
      }
    }
  };


  /* =========================================================
     03. ATALHOS DE TECLADO GLOBAIS
     Alt+1 a Alt+6 navegam entre seções
     Alt+C = contraste | Alt+D = dislexia | Alt+0 = topo
     ========================================================= */
  const shortcuts = {
    init() {
      document.addEventListener('keydown', (e) => {
        // Ignora se estiver em campo de texto
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

        if (e.altKey && !e.ctrlKey && !e.metaKey) {
          const key = e.key.toLowerCase();
          const sectionMap = {
            '1': '#radiacao',
            '2': '#sensores',
            '3': '#simuladores',
            '4': '#piscina',
            '5': '#limitacoes',
            '6': '#mapa'
          };
          if (sectionMap[key]) {
            e.preventDefault();
            document.querySelector(sectionMap[key])?.focus();
            announce(`Navegando para seção ${key}`);
          } else if (key === 'c') {
            e.preventDefault();
            a11y.setContrast(root.dataset.theme !== 'high-contrast');
          } else if (key === 'd') {
            e.preventDefault();
            a11y.setDyslexic(root.dataset.font !== 'dyslexic');
          } else if (key === '0') {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            announce('Voltando ao topo');
          }
        }
      });
    }
  };


  /* =========================================================
     04. SIMULADOR 1 — RESPOSTA DO LDR
     Modelo: R_LDR = 500.000 / (lux + 1) Ω (limitado)
     Divisor: Vcc → Rfix(10k) → Vout → LDR → GND
     Vout = Vcc × R_LDR / (Rfix + R_LDR)
     ========================================================= */
  const sim1 = {
    els: {},
    init() {
      this.els = {
        light: $('#sim1-light'),
        vcc:   $('#sim1-vcc'),
        sun:   $('#sim1-sun'),
        led:   $('#sim1-led')
      };
      if (!this.els.light) return;

      this.els.light.addEventListener('input', () => this.update());
      this.els.vcc.addEventListener('input',   () => this.update());
      this.update();
    },

    update() {
      const lux = +this.els.light.value;
      const vcc = +this.els.vcc.value;

      $('#sim1-light-val').textContent = fmt(lux);
      $('#sim1-vcc-val').textContent   = fmt(vcc, 1);

      // Modelo do LDR
      const Rldr = Math.max(200, Math.min(2e6, 500000 / (lux + 1)));
      const Rfix = 10000;
      const vout = vcc * (Rldr / (Rfix + Rldr));

      // Visual do sol
      const norm = Math.min(1, lux / 1500);
      this.els.sun.style.opacity = (0.25 + 0.75 * norm).toFixed(2);
      this.els.sun.style.transform =
        `translateX(-50%) scale(${(0.5 + 0.8 * norm).toFixed(2)})`;

      // LED acende quando há muita luz (lux > 400)
      const ledOn = lux > 400;
      this.els.led.classList.toggle('on', ledOn);

      // Readout
      $('#sim1-r-lux').textContent  = `${fmt(lux)} lux`;
      $('#sim1-r-ldr').textContent  = Rldr >= 1000
        ? `${fmt(Rldr / 1000, 1)} kΩ`
        : `${fmt(Rldr)} Ω`;
      $('#sim1-r-vout').textContent = `${fmt(vout, 2)} V`;
      $('#sim1-r-led').textContent  = ledOn ? 'Aceso ✅' : 'Apagado';
    }
  };


  /* =========================================================
     05. SIMULADOR 2 — COMPARATIVO DE POSIÇÕES
     Lei do inverso do quadrado: E = I₀ / d²
     ========================================================= */
  const sim2 = {
    I0: 1000, // intensidade da fonte (lux·m²)
    sensors: ['s2a', 's2b', 's2c'],

    init() {
      this.sensors.forEach(id => {
        const el = $(`#${id}`);
        if (!el) return;
        el.addEventListener('input', () => this.update(id));
        this.update(id);
      });
    },

    update(id) {
      const el   = $(`#${id}`);
      const d    = +el.value;
      const E    = this.I0 / (d * d);
      $(`#${id}-v`).textContent    = fmt(d, 1);
      $(`#${id}-read`).textContent = `${fmt(E)} lux`;
    }
  };


  /* =========================================================
     06. SIMULADOR 3 — POSICIONAMENTO DO COLETOR SOLAR
     - Altura solar simplificada (equinócio, decl=0°)
     - Atenuação atmosférica via massa de ar
     - Irradiância efetiva = E₀ × cos(θ) × exp(-0.2·(AM-1))
     ========================================================= */
  const sim3 = {
    els: {},
    init() {
      this.els = {
        angle: $('#s3-angle'),
        hour:  $('#s3-hour'),
        lat:   $('#s3-lat'),
        sun:   $('#s3-sun'),
        panel: $('#s3-panel'),
        stage: $('.collector-stage')
      };
      if (!this.els.angle) return;

      ['angle', 'hour', 'lat'].forEach(k =>
        this.els[k].addEventListener('input', () => this.update()));

      // Reajusta posição do sol ao redimensionar
      const ro = new ResizeObserver(() => this.update());
      if (this.els.stage) ro.observe(this.els.stage);

      this.update();
    },

    update() {
      const angle = +this.els.angle.value;
      const hour  = +this.els.hour.value;
      const lat   = +this.els.lat.value;

      // Labels
      $('#s3-angle-v').textContent = fmt(angle);
      const h = Math.floor(hour);
      const m = Math.round((hour - h) * 60);
      $('#s3-hour-v').textContent =
        String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      $('#s3-lat-v').textContent = fmt(lat, 1);

      // Altura solar aproximada (equinócio, declinação = 0°)
      const alt = Math.max(0, 90 - Math.abs(lat) - Math.abs(12 - hour) * 15);

      // Posição do sol no palco
      const stageW = this.els.stage.clientWidth || 600;
      const stageH = this.els.stage.clientHeight || 300;
      const xNorm  = (hour - 6) / 12;
      const yNorm  = 1 - (alt / 90);
      this.els.sun.style.left = (xNorm * (stageW - 60)) + 'px';
      this.els.sun.style.top  = (yNorm * (stageH - 120) + 10) + 'px';

      // Rotação do painel (hemisfério sul: inclina para o norte)
      this.els.panel.style.transform =
        `translateX(-50%) rotate(${-angle}deg)`;

      // Ângulo de incidência
      const theta = Math.abs(angle - alt);
      const cosT  = Math.max(0, Math.cos(theta * Math.PI / 180));

      // Atenuação atmosférica
      const E0 = 1000; // W/m²
      const airMass = alt > 0 ? 1 / Math.sin(alt * Math.PI / 180) : 99;
      const atm  = Math.exp(-0.2 * (airMass - 1));
      const Eeff = E0 * cosT * atm;

      // Energia estimada no dia (kWh/m²)
      const hoursEquiv = Math.max(0, 12 - Math.abs(12 - hour)) * 0.5 + 3;
      const energy = (Eeff * hoursEquiv / 1000);

      $('#s3-r-alt').textContent    = `${fmt(alt, 1)}°`;
      $('#s3-r-inc').textContent    = `${fmt(theta, 1)}°`;
      $('#s3-r-irr').textContent    = `${fmt(Eeff)} W/m²`;
      $('#s3-r-energy').textContent = `${fmt(energy, 2)} kWh/m²`;
    }
  };


  /* =========================================================
     07. ANIMAÇÕES DE ENTRADA (IntersectionObserver)
     Cards e simuladores aparecem suavemente ao entrar na viewport
     ========================================================= */
  const reveal = {
    init() {
      // Respeita preferência de movimento reduzido
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const targets = $all('.card, .simulator, .callout, .libras-box');
      targets.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px)';
        el.style.transition = 'opacity .5s ease, transform .5s ease';
      });

      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });

      targets.forEach(el => io.observe(el));
    }
  };


  /* =========================================================
     08. BARRA DE PROGRESSO DE LEITURA
     ========================================================= */
  const progress = {
    bar: null,
    init() {
      this.bar = document.createElement('div');
      Object.assign(this.bar.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        height: '4px',
        width: '0%',
        background: 'linear-gradient(90deg, var(--sol-2), var(--agua-3))',
        zIndex: '100',
        transition: 'width 80ms linear',
        pointerEvents: 'none'
      });
      this.bar.setAttribute('role', 'progressbar');
      this.bar.setAttribute('aria-label', 'Progresso de leitura');
      this.bar.setAttribute('aria-valuemin', '0');
      this.bar.setAttribute('aria-valuemax', '100');
      this.bar.setAttribute('aria-valuenow', '0');
      document.body.appendChild(this.bar);

      window.addEventListener('scroll', () => this.update(), { passive: true });
      this.update();
    },
    update() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0;
      this.bar.style.width = pct + '%';
      this.bar.setAttribute('aria-valuenow', Math.round(pct));
    }
  };


  /* =========================================================
     09. EXPORTAÇÃO DE DADOS DOS SIMULADORES (CSV)
     Adiciona um botão "Exportar CSV" em cada simulador
     ========================================================= */
  const exporter = {
    init() {
      this.addButton('sim1', 'Exportar dados do LDR', () => this.exportSim1());
      this.addButton('sim2', 'Exportar comparativo',  () => this.exportSim2());
      this.addButton('sim3', 'Exportar coletor',      () => this.exportSim3());
    },

    addButton(simId, label, onClick) {
      const sim = $(`#${simId}`) || $(`[aria-labelledby="${simId}-title"]`)?.closest('.simulator');
      if (!sim) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.style.marginTop = '12px';
      btn.textContent = '📥 ' + label;
      btn.addEventListener('click', onClick);
      sim.appendChild(btn);
    },

    download(filename, content) {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      announce(`Arquivo ${filename} baixado`);
    },

    exportSim1() {
      const lux = +$('#sim1-light').value;
      const vcc = +$('#sim1-vcc').value;
      const Rldr = Math.max(200, Math.min(2e6, 500000 / (lux + 1)));
      const Rfix = 10000;
      const vout = vcc * (Rldr / (Rfix + Rldr));
      const rows = [
        ['lux','vcc_V','R_LDR_ohm','Vout_V','LED'],
        [lux, vcc, Rldr.toFixed(2), vout.toFixed(3), lux > 400 ? 'aceso' : 'apagado']
      ];
      this.download('sensors_sim1_ldr.csv', rows.map(r => r.join(';')).join('\n'));
    },

    exportSim2() {
      const rows = [['sensor','distancia_m','iluminamento_lux']];
      sim2.sensors.forEach(id => {
        const d = +$(`#${id}`).value;
        rows.push([id.toUpperCase(), d.toFixed(2), (sim2.I0 / (d*d)).toFixed(2)]);
      });
      this.download('sensors_sim2_comparativo.csv', rows.map(r => r.join(';')).join('\n'));
    },

    exportSim3() {
      const angle = +$('#s3-angle').value;
      const hour  = +$('#s3-hour').value;
      const lat   = +$('#s3-lat').value;
      const alt   = Math.max(0, 90 - Math.abs(lat) - Math.abs(12 - hour) * 15);
      const theta = Math.abs(angle - alt);
      const cosT  = Math.max(0, Math.cos(theta * Math.PI / 180));
      const airMass = alt > 0 ? 1 / Math.sin(alt * Math.PI / 180) : 99;
      const atm  = Math.exp(-0.2 * (airMass - 1));
      const Eeff = 1000 * cosT * atm;
      const rows = [
        ['inclinacao_graus','hora','latitude','altura_solar','incidencia','irradiancia_Wm2'],
        [angle, hour.toFixed(2), lat.toFixed(2), alt.toFixed(2), theta.toFixed(2), Eeff.toFixed(2)]
      ];
      this.download('sensors_sim3_coletor.csv', rows.map(r => r.join(';')).join('\n'));
    }
  };


  /* =========================================================
     10. INICIALIZAÇÃO SEGURA
     ========================================================= */
  function initVlibras() {
    try {
      if (window.VLibras) new window.VLibras();
    } catch (err) {
      console.warn('[Sensors] VLibras não pôde ser inicializado:', err);
    }
  }

  function boot() {
    a11y.init();
    shortcuts.init();
    sim1.init();
    sim2.init();
    sim3.init();
    reveal.init();
    progress.init();
    exporter.init();
    initVlibras();

    console.info(
      '%c☀ Sensors carregado %c• Acesse Alt+0 para voltar ao topo',
      'background:#ff8a00;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold',
      'color:#0077b6;font-weight:bold'
    );
  }

  // Aguarda o DOM estar pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
