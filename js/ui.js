'use strict';

const UI = (() => {
  const D = GAME_DATA;
  const E = GameEngine;

  let _gs = null;
  let _selectedCity = null;
  let _tradeCity = null; // second city for trade panel

  function setGs(gs) { _gs = gs; }

  // --- Production Panel ---
  function showProductionPanel(city) {
    if (!_gs) return;
    _selectedCity = city;

    document.getElementById('panel-city-name').textContent = city.name;
    document.getElementById('panel-production').classList.remove('hidden');

    const isHumanCity = city.league === _gs.currentPlayer &&
                        _gs.playerTypes[_gs.currentPlayer] === 'human';

    updateProductionPanel();

    // show/hide offer button
    const btnOffer = document.getElementById('btn-offer');
    const canOffer = city.league === D.NO_LEAGUE && _gs.playerTypes[_gs.currentPlayer] === 'human';
    btnOffer.classList.toggle('hidden', !canOffer);

    document.getElementById('panel-city-info').classList.remove('hidden');
    updateCityInfo(city);
  }

  function updateProductionPanel() {
    if (!_selectedCity || !_gs) return;
    const city = _selectedCity;
    const laborUsed = E.getLaborUsed(_gs.cities, city.id);
    const laborAvail = D.BASE_LABOR - laborUsed;

    document.getElementById('prod-labor-display').textContent =
      `Labor: ${laborUsed}/${D.BASE_LABOR}`;

    const isHuman = city.league === _gs.currentPlayer &&
                    _gs.playerTypes[_gs.currentPlayer] === 'human';
    const tbody = document.getElementById('prod-tbody');
    tbody.innerHTML = '';

    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const cost = E.getProductionCost(city, g);
      const qty  = city.production[g];
      const tr = document.createElement('tr');
      const canInc = isHuman && cost > 0 && cost <= laborAvail;
      const canDec = isHuman && qty > 0;

      tr.innerHTML = `
        <td class="${D.GOOD_CSS[g]}">${D.GOOD_NAMES[g]}</td>
        <td>${cost > 0 ? cost : '—'}</td>
        <td><span class="qty-display">${qty}</span></td>
        <td>
          ${isHuman ? `
            <button class="qty-btn prod-dec" data-good="${g}" ${canDec ? '' : 'disabled'}>−</button>
            <button class="qty-btn prod-inc" data-good="${g}" ${canInc ? '' : 'disabled'}>+</button>
          ` : ''}
        </td>`;
      tbody.appendChild(tr);
    }

    if (isHuman) {
      tbody.querySelectorAll('.prod-inc').forEach(btn => {
        btn.addEventListener('click', () => {
          const g = parseInt(btn.dataset.good);
          if (E.changeProduction(_gs, city.id, g, 1)) updateProductionPanel();
        });
      });
      tbody.querySelectorAll('.prod-dec').forEach(btn => {
        btn.addEventListener('click', () => {
          const g = parseInt(btn.dataset.good);
          if (E.changeProduction(_gs, city.id, g, -1)) updateProductionPanel();
        });
      });
    }
  }

  function updateCityInfo(city) {
    const autarchy = E.getAutarchicLevel(_gs.cities, city.id);
    const utility  = E.getUtility(_gs.cities, city.id);
    const owner = city.league === D.NO_LEAGUE ? 'Neutral' :
      `<span class="player-${city.league}">${D.PLAYER_NAMES[city.league]}</span>`;

    let html = `
      <div>Owner: ${owner}</div>
      <div>Utility: ${utility.toFixed(2)}</div>
      <div>Autarchy: ${autarchy.toFixed(2)}</div>
    `;

    // item totals
    html += '<table><thead><tr><th>Good</th><th>Prod</th><th>Net</th><th>Total</th></tr></thead><tbody>';
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const prod = city.production[g];
      const net  = E.getNetTrade(_gs.cities, city.id, g);
      const tot  = E.getItemTotalValue(_gs.cities, city.id, g);
      html += `<tr>
        <td class="${D.GOOD_CSS[g]}">${D.GOOD_NAMES[g]}</td>
        <td>${prod}</td>
        <td>${net > 0 ? '-' + net : net < 0 ? '+' + (-net) : 0}</td>
        <td>${tot}</td>
      </tr>`;
    }
    html += '</tbody></table>';

    document.getElementById('city-info-content').innerHTML = html;
  }

  // --- Trade Panel ---
  function showTradePanel(city1, city2) {
    if (!_gs) return;
    _tradeCity = city2;

    document.getElementById('panel-trade').classList.remove('hidden');
    document.getElementById('trade-target-info').textContent =
      `${city1.name} ↔ ${city2.name}`;
    updateTradePanel(city1, city2);
  }

  function updateTradePanel(city1, city2) {
    if (!city1 || !city2 || !_gs) return;
    const isHuman = city1.league === _gs.currentPlayer &&
                    _gs.playerTypes[_gs.currentPlayer] === 'human';
    const tbody = document.getElementById('trade-tbody');
    tbody.innerHTML = '';

    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const exp12 = E.getTradeFlow(_gs.cities, city1.id, city2.id, g);
      const exp21 = E.getTradeFlow(_gs.cities, city2.id, city1.id, g);
      const tr = document.createElement('tr');
      const canIncExp = isHuman && E.canChangeExport(_gs, city1.id, city2.id, g, 1);
      const canDecExp = isHuman && exp12 > 0;

      tr.innerHTML = `
        <td class="${D.GOOD_CSS[g]}">${D.GOOD_NAMES[g]}</td>
        <td>
          ${isHuman ? `<button class="qty-btn exp-dec" data-good="${g}" ${canDecExp ? '' : 'disabled'}>−</button>` : ''}
          <span class="qty-display">${exp12}</span>
          ${isHuman ? `<button class="qty-btn exp-inc" data-good="${g}" ${canIncExp ? '' : 'disabled'}>+</button>` : ''}
        </td>
        <td>${exp21}</td>`;
      tbody.appendChild(tr);
    }

    if (isHuman) {
      tbody.querySelectorAll('.exp-inc').forEach(btn => {
        btn.addEventListener('click', () => {
          const g = parseInt(btn.dataset.good);
          if (E.canChangeExport(_gs, city1.id, city2.id, g, 1)) {
            E.changeExport(_gs.cities, city1.id, city2.id, g, 1);
            updateTradePanel(city1, city2);
            updateProductionPanel();
          }
        });
      });
      tbody.querySelectorAll('.exp-dec').forEach(btn => {
        btn.addEventListener('click', () => {
          const g = parseInt(btn.dataset.good);
          E.changeExport(_gs.cities, city1.id, city2.id, g, -1);
          updateTradePanel(city1, city2);
          updateProductionPanel();
        });
      });
    }
  }

  // --- Score Panel ---
  function updateScorePanel(gs) {
    if (!gs) return;
    const tbody = document.getElementById('score-tbody');
    tbody.innerHTML = '';
    for (let p = 0; p < gs.numPlayers; p++) {
      const cities = gs.cities.filter(c => c.league === p);
      const totalUtil = cities.reduce((sum, c) => sum + E.getUtility(gs.cities, c.id), 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="player-${p}">${D.PLAYER_NAMES[p]}${gs.playerTypes[p] === 'computer' ? ' (AI)' : ''}</td>
        <td>${cities.length}</td>
        <td>${totalUtil.toFixed(1)}</td>`;
      tbody.appendChild(tr);
    }
  }

  // --- Turn info ---
  function updateTurnInfo(gs) {
    if (!gs) return;
    const pName = D.PLAYER_NAMES[gs.currentPlayer];
    const pType = gs.playerTypes[gs.currentPlayer];
    document.getElementById('turn-info').innerHTML =
      `<span class="player-${gs.currentPlayer}">${pName}</span> &mdash; Turn ${gs.turn}`;
    document.getElementById('btn-end-turn').textContent =
      pType === 'computer' ? 'AI Turn' : 'End Turn';
    document.getElementById('btn-end-turn').disabled = pType === 'computer';
  }

  function setStatus(msg) {
    document.getElementById('status-msg').textContent = msg;
  }

  // --- End-of-turn report modal ---
  function showReport(dropped, joined, onOk) {
    const modal = document.getElementById('report-modal');
    const content = document.getElementById('report-content');
    let html = '';
    if (joined.length === 0 && dropped.length === 0) {
      html = '<p>No changes this turn.</p>';
    }
    for (const { cityName, player } of joined) {
      html += `<p class="report-joined">${cityName} joined <span class="player-${player}">${D.PLAYER_NAMES[player]}</span></p>`;
    }
    for (const { cityName, player } of dropped) {
      html += `<p class="report-left">${cityName} left <span class="player-${player}">${D.PLAYER_NAMES[player]}</span>'s league</p>`;
    }
    content.innerHTML = html;
    modal.classList.remove('hidden');
    document.getElementById('report-ok').onclick = () => {
      modal.classList.add('hidden');
      if (onOk) onOk();
    };
  }

  // --- New Game modal ---
  function showNewGame(onStart) {
    const modal = document.getElementById('new-game-modal');
    modal.classList.remove('hidden');

    const playersSelect = document.getElementById('ng-players');
    const container = document.getElementById('ng-city-assignments');

    function rebuildAssignments() {
      const n = parseInt(playersSelect.value);
      container.innerHTML = '';
      // default starting cities per player
      const defaults = [
        [0, 23, 42],   // Red: Boston, Chicago, LA
        [14, 31, 45],  // Green: New Orleans, Houston, Seattle
        [35, 29, 4],   // Blue: Denver, Minneapolis, Washington
        [13, 25, 47],  // Yellow: Memphis, Kansas City, Calgary
      ];
      for (let p = 0; p < n; p++) {
        const label = document.createElement('div');
        label.className = 'section-title';
        label.style.color = D.PLAYER_COLORS[p];
        label.textContent = `${D.PLAYER_NAMES[p]} starting cities:`;
        container.appendChild(label);
        const picks = defaults[p] || [];
        for (let i = 0; i < 3; i++) {
          const row = document.createElement('div');
          row.className = 'city-assign-row';
          const sel = document.createElement('select');
          sel.dataset.player = p;
          sel.dataset.slot = i;
          const optNone = document.createElement('option');
          optNone.value = -1;
          optNone.textContent = '(none)';
          sel.appendChild(optNone);
          D.CITY_DEFS.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            if (picks[i] === c.id) opt.selected = true;
            sel.appendChild(opt);
          });
          row.appendChild(sel);
          container.appendChild(row);
        }
      }
    }

    playersSelect.addEventListener('change', rebuildAssignments);
    rebuildAssignments();

    document.getElementById('ng-start').onclick = () => {
      const n = parseInt(playersSelect.value);
      const assignments = [];
      container.querySelectorAll('select').forEach(sel => {
        const cityId = parseInt(sel.value);
        const player = parseInt(sel.dataset.player);
        if (cityId >= 0) assignments.push({ cityId, player });
      });
      modal.classList.add('hidden');
      onStart(n, assignments);
    };

    document.getElementById('ng-cancel').onclick = () => {
      modal.classList.add('hidden');
    };
  }

  // --- Offer modal ---
  function showOfferModal(city, fromPlayer, onSend) {
    const modal = document.getElementById('offer-modal');
    const content = document.getElementById('offer-content');
    const levelInput = document.getElementById('offer-level');
    const levelDisplay = document.getElementById('offer-level-display');
    const costDisplay = document.getElementById('offer-cost-display');

    content.textContent = `Send mission to ${city.name}`;
    levelInput.value = 5;
    levelDisplay.textContent = '5';

    function updateCost() {
      const level = parseInt(levelInput.value);
      levelDisplay.textContent = level;
      costDisplay.textContent = `Cost: ${level * 100} labor`;
    }
    levelInput.addEventListener('input', updateCost);
    updateCost();

    modal.classList.remove('hidden');

    document.getElementById('offer-send').onclick = () => {
      const level = parseInt(levelInput.value);
      modal.classList.add('hidden');
      onSend(level);
    };

    document.getElementById('offer-cancel').onclick = () => {
      modal.classList.add('hidden');
    };
  }

  // --- Clear panels ---
  function clearCity() {
    _selectedCity = null;
    _tradeCity = null;
    document.getElementById('panel-city-name').textContent = '(click a city)';
    document.getElementById('panel-production').classList.add('hidden');
    document.getElementById('panel-trade').classList.add('hidden');
    document.getElementById('panel-city-info').classList.add('hidden');
  }

  function hideTradePanel() {
    document.getElementById('panel-trade').classList.add('hidden');
    _tradeCity = null;
  }

  function getSelectedCity() { return _selectedCity; }
  function getTradeCity() { return _tradeCity; }

  return {
    setGs,
    showProductionPanel, updateProductionPanel,
    showTradePanel, updateTradePanel, hideTradePanel,
    updateScorePanel, updateTurnInfo, setStatus,
    showReport, showNewGame, showOfferModal,
    clearCity, getSelectedCity, getTradeCity,
    updateCityInfo,
  };
})();
