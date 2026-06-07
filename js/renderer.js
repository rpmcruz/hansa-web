'use strict';

const Renderer = (() => {
  const D = GAME_DATA;
  const E = GameEngine;

  let canvas, ctx;
  let selectedCity = null;
  let highlightedCities = new Set();

  // hex half-dimensions (scaled 3× from original)
  const HX = 13;  // half-width at center
  const HY = 12;  // half-height
  const HT = 7;   // half-width at top/bottom edge

  function hexCenter(row, col) {
    const x = row * D.ROW_SPACING + HX + 1;
    const y = col * D.COL_SPACING + HY + (row % 2 === 1 ? D.ROW_OFFSET : 0) + 1;
    return { x, y };
  }

  function hexPath(cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx - HT, cy - HY);
    ctx.lineTo(cx + HT, cy - HY);
    ctx.lineTo(cx + HX, cy);
    ctx.lineTo(cx + HT, cy + HY);
    ctx.lineTo(cx - HT, cy + HY);
    ctx.lineTo(cx - HX, cy);
    ctx.closePath();
  }

  function init(canvasEl) {
    canvas = canvasEl;
    const W = D.ROW_SIZE * D.ROW_SPACING + HX * 2 + 4;
    const H = D.COL_SIZE * D.COL_SPACING + HY * 2 + D.ROW_OFFSET + 4;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
  }

  function drawTerrain() {
    for (let row = 0; row < D.ROW_SIZE; row++) {
      for (let col = 0; col < D.COL_SIZE; col++) {
        const t = D.TERRAIN[row][col];
        const { x, y } = hexCenter(row, col);
        hexPath(x, y);
        ctx.fillStyle = D.TERRAIN_COLORS[t] || '#333';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  function drawRiversAndCoasts() {
    ctx.lineWidth = 2;
    for (let row = 0; row < D.ROW_SIZE; row++) {
      for (let col = 0; col < D.COL_SIZE; col++) {
        const rv = D.RIVER_MAP[row][col];
        const cv = D.COAST_MAP[row][col];
        if (!rv && !cv) continue;
        const { x, y } = hexCenter(row, col);
        if (rv) drawRiverSegments(x, y, rv);
        // coast rendering handled by terrain colour (ocean border)
      }
    }
  }

  function edgeMidpoint(cx, cy, dirIdx) {
    // midpoint of the edge facing direction dirIdx (0=N,1=NE,2=SE,3=S,4=SW,5=NW)
    const angles = [-90, -30, 30, 90, 150, 210];
    const a = (angles[dirIdx] * Math.PI) / 180;
    const dist = HY * 0.85;
    return { x: cx + dist * Math.cos(a), y: cy + dist * Math.sin(a) };
  }

  function drawRiverSegments(cx, cy, bits) {
    ctx.strokeStyle = '#5ba4d4';
    ctx.lineWidth = 2;
    for (let d = 0; d < 6; d++) {
      const inMask  = D.IN_MASKS[d];
      const outMask = D.OUT_MASKS[d];
      if (bits & inMask || bits & outMask) {
        const ep = edgeMidpoint(cx, cy, d);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(ep.x, ep.y);
        ctx.stroke();
      }
    }
  }

  function drawCities(gs) {
    if (!gs) return;
    for (const city of gs.cities) {
      const { x, y } = hexCenter(city.row, city.col);
      const isSelected = selectedCity && selectedCity.id === city.id;
      const isHighlighted = highlightedCities.has(city.id);

      // city dot
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 7 : 5, 0, Math.PI * 2);
      if (city.league !== D.NO_LEAGUE) {
        ctx.fillStyle = D.PLAYER_COLORS[city.league];
      } else {
        ctx.fillStyle = '#ccc';
      }
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      if (isHighlighted) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // city label
      ctx.font = isSelected ? 'bold 8px sans-serif' : '7px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(city.name, x, y - 7);
    }
  }

  function drawTradeRoutes(gs, fromCityId) {
    if (!gs || fromCityId === null) return;
    const city = gs.cities[fromCityId];
    const { x: x1, y: y1 } = hexCenter(city.row, city.col);

    for (const otherId in city.exports) {
      const other = gs.cities[parseInt(otherId)];
      const { x: x2, y: y2 } = hexCenter(other.row, other.col);
      let hasFlow = false;
      for (let g = 0; g < D.GOOD.COUNT; g++) {
        if ((city.exports[otherId][g] || 0) > 0) { hasFlow = true; break; }
      }
      if (!hasFlow) continue;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(255,209,102,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // also draw incoming
    for (const other of gs.cities) {
      if (other.id === fromCityId) continue;
      if (!other.exports[fromCityId]) continue;
      let hasFlow = false;
      for (let g = 0; g < D.GOOD.COUNT; g++) {
        if ((other.exports[fromCityId][g] || 0) > 0) { hasFlow = true; break; }
      }
      if (!hasFlow) continue;
      const { x: x2, y: y2 } = hexCenter(other.row, other.col);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = 'rgba(6,214,160,0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function render(gs) {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTerrain();
    drawRiversAndCoasts();
    if (gs) {
      drawTradeRoutes(gs, selectedCity ? selectedCity.id : null);
      drawCities(gs);
    }
  }

  function cityAtPixel(px, py) {
    const gs = GameEngine.getState();
    if (!gs) return null;
    let best = null, bestDist = 12;
    for (const city of gs.cities) {
      const { x, y } = hexCenter(city.row, city.col);
      const d = Math.hypot(px - x, py - y);
      if (d < bestDist) { bestDist = d; best = city; }
    }
    return best;
  }

  function hexAtPixel(px, py) {
    // rough inverse of hexCenter
    for (let row = 0; row < D.ROW_SIZE; row++) {
      for (let col = 0; col < D.COL_SIZE; col++) {
        const { x, y } = hexCenter(row, col);
        if (Math.abs(px - x) <= HX && Math.abs(py - y) <= HY) return { row, col };
      }
    }
    return null;
  }

  function setSelected(city) { selectedCity = city; }
  function getSelected() { return selectedCity; }
  function setHighlighted(ids) { highlightedCities = new Set(ids); }

  return { init, render, hexCenter, cityAtPixel, hexAtPixel, setSelected, getSelected, setHighlighted };
})();
