'use strict';

(function () {
  const D = GAME_DATA;
  const E = GameEngine;
  const R = Renderer;
  const U = UI;

  let gs = null;
  let clickMode = 'select'; // 'select' | 'trade'

  function redraw() {
    R.render(gs);
    if (gs) {
      U.updateScorePanel(gs);
      U.updateTurnInfo(gs);
    }
  }

  function startGame(numPlayers, assignments) {
    gs = E.newGame(numPlayers, assignments);
    E.setState(gs);
    U.setGs(gs);
    U.clearCity();
    clickMode = 'select';
    R.setSelected(null);
    R.setHighlighted([]);
    redraw();
    U.setStatus('Click a city to manage it.');
  }

  function onCityClick(city) {
    if (!gs) return;

    if (clickMode === 'trade') {
      const primary = U.getSelectedCity();
      if (!primary || city.id === primary.id) {
        // cancel trade mode
        clickMode = 'select';
        R.setHighlighted([]);
        U.hideTradePanel();
        U.setStatus('');
      } else {
        R.setSelected(primary);
        U.showTradePanel(primary, city);
        U.setStatus(`Trade: ${primary.name} → ${city.name}. Click map to cancel.`);
        R.setHighlighted([city.id]);
      }
      redraw();
      return;
    }

    // select mode
    R.setSelected(city);
    U.showProductionPanel(city);
    clickMode = 'select';
    R.setHighlighted([]);

    // wire up offer button
    document.getElementById('btn-offer').onclick = () => {
      U.showOfferModal(city, gs.currentPlayer, (level) => {
        if (E.sendMission(gs, gs.currentPlayer, city.id, level)) {
          U.setStatus(`Mission sent to ${city.name} at level ${level}.`);
        }
      });
    };

    redraw();
  }

  function onMapClick(e) {
    if (!gs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const city = R.cityAtPixel(px, py);
    if (city) {
      onCityClick(city);
    } else if (clickMode === 'trade') {
      clickMode = 'select';
      R.setHighlighted([]);
      U.hideTradePanel();
      U.setStatus('');
      redraw();
    }
  }

  function onMapRightClick(e) {
    e.preventDefault();
    if (!gs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const city = R.cityAtPixel(e.clientX - rect.left, e.clientY - rect.top);
    if (!city) return;

    const primary = U.getSelectedCity();
    if (!primary) {
      onCityClick(city);
      return;
    }

    // right-click = set trade target
    clickMode = 'trade';
    onCityClick(city);
  }

  async function runAiTurns() {
    while (gs && gs.playerTypes[gs.currentPlayer] === 'computer') {
      U.setStatus(`${D.PLAYER_NAMES[gs.currentPlayer]} (AI) is thinking…`);
      await delay(400);
      E.doComputerTurn(gs, gs.currentPlayer);
      const { dropped, joined } = E.doEndTurn(gs);
      if (dropped.length > 0 || joined.length > 0) {
        await new Promise(resolve => U.showReport(dropped, joined, resolve));
      }
      redraw();
      if (gs.playerTypes[gs.currentPlayer] === 'human') {
        U.setStatus('Your turn.');
        break;
      }
    }
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function onEndTurn() {
    if (!gs) return;
    if (gs.playerTypes[gs.currentPlayer] !== 'human') return;

    const { dropped, joined } = E.doEndTurn(gs);
    U.clearCity();
    R.setSelected(null);
    R.setHighlighted([]);
    clickMode = 'select';
    redraw();

    if (dropped.length > 0 || joined.length > 0) {
      U.showReport(dropped, joined, () => runAiTurns());
    } else {
      runAiTurns();
    }
  }

  function init() {
    const canvas = document.getElementById('map-canvas');
    R.init(canvas);

    // draw bare map before game starts
    R.render(null);

    canvas.addEventListener('click', onMapClick);
    canvas.addEventListener('contextmenu', onMapRightClick);

    document.getElementById('btn-end-turn').addEventListener('click', onEndTurn);

    document.getElementById('btn-new-game').addEventListener('click', () => {
      U.showNewGame((numPlayers, assignments) => {
        startGame(numPlayers, assignments);
      });
    });

    // Auto-start a default game so there's something to see
    startGame(2, [
      { cityId: 0,  player: 0 },  // Boston → Red
      { cityId: 23, player: 0 },  // Chicago → Red
      { cityId: 42, player: 0 },  // LA → Red
      { cityId: 14, player: 1 },  // New Orleans → Green (AI)
      { cityId: 31, player: 1 },  // Houston → Green (AI)
      { cityId: 45, player: 1 },  // Seattle → Green (AI)
    ]);

    U.setStatus('Left-click a city to select. Right-click a second city for trade.');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
