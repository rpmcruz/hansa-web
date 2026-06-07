'use strict';

const GameEngine = (() => {
  const D = GAME_DATA;

  // --- Hex neighbor coordinates ---
  // dir: 1=N,2=NE,3=SE,4=S,5=SW,6=NW
  function getNeighbor(row, col, dir) {
    const odd = (row % 2 === 1) ? 1 : 0;
    switch (dir) {
      case D.DIR.N:  return [row,     col - 1];
      case D.DIR.S:  return [row,     col + 1];
      case D.DIR.NE: return [row + 1, col - 1 + odd];
      case D.DIR.SE: return [row + 1, col     + odd];
      case D.DIR.NW: return [row - 1, col - 1 + odd];
      case D.DIR.SW: return [row - 1, col     + odd];
      default: return [row, col];
    }
  }

  function inBounds(row, col) {
    return row >= 0 && row < D.ROW_SIZE && col >= 0 && col < D.COL_SIZE;
  }

  function getTerrain(row, col) {
    if (!inBounds(row, col)) return D.T.OCEAN;
    return D.TERRAIN[row][col];
  }

  function getRiver(row, col) {
    if (!inBounds(row, col)) return 0;
    return D.RIVER_MAP[row][col];
  }

  // --- Production cost helpers ---
  function countAdjacentTerrain(row, col, terrainType) {
    let count = 0;
    for (let d = D.DIR.N; d <= D.DIR.NW; d++) {
      const [nr, nc] = getNeighbor(row, col, d);
      if (inBounds(nr, nc) && getTerrain(nr, nc) === terrainType) count++;
    }
    return count;
  }

  function calcProductionCost(row, col, good) {
    const terrain = D.GOOD_TERRAIN[good];
    if (terrain === D.T.NONE) return 0; // silk: special
    const adj = countAdjacentTerrain(row, col, terrain);
    const capped = Math.min(adj, D.PRODUCTION_COST.length - 1);
    return D.PRODUCTION_COST[capped];
  }

  // --- Game state ---
  let state = null;

  function createCity(def) {
    return {
      id: def.id,
      name: def.name,
      row: def.row,
      col: def.col,
      league: D.NO_LEAGUE,      // which player owns this city (-1 = neutral)
      production: new Array(D.GOOD.COUNT).fill(0),
      silkProductionCost: 0,
      exports: {},              // exports[city2][good] = amount (positive = export)
      offers: {},               // offers[fromPlayer] = level
    };
  }

  function initProductionCosts(city) {
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      if (g === D.GOOD.SILK) continue;
      const cost = calcProductionCost(city.row, city.col, g);
      // store the computed cost — silkProductionCost is set separately
    }
    // silk cost: stored per-city, typically 0 for new game
    city.silkProductionCost = 0;
  }

  function getProductionCost(city, good) {
    if (good === D.GOOD.SILK) return city.silkProductionCost;
    return calcProductionCost(city.row, city.col, good);
  }

  function getProduction(city, good) {
    return city.production[good];
  }

  function getTradeFlow(cities, city1id, city2id, good) {
    const exp = cities[city1id].exports;
    if (!exp[city2id]) return 0;
    return exp[city2id][good] || 0;
  }

  function getImportsExports(cities, cityId, good) {
    let total = 0;
    const c = cities[cityId];
    // exports from this city (positive)
    for (const otherId in c.exports) {
      total += (c.exports[otherId][good] || 0);
    }
    // imports to this city = exports FROM others TO this city (negative)
    for (let i = 0; i < cities.length; i++) {
      if (i === cityId) continue;
      const flow = getTradeFlow(cities, i, cityId, good);
      if (flow < 0) total += flow; // negative = import to city1
    }
    // Actually trade is symmetric: flow from city1->city2 > 0 means city1 exports
    // Let's recalculate properly:
    return total;
  }

  // Net imports/exports for a city: positive = net export, negative = net import
  function getNetTrade(cities, cityId, good) {
    let net = 0;
    const c = cities[cityId];
    for (const otherId in c.exports) {
      net += (c.exports[otherId][good] || 0);
    }
    for (let i = 0; i < cities.length; i++) {
      if (i === cityId) continue;
      const other = cities[i];
      if (other.exports[cityId]) {
        net -= (other.exports[cityId][good] || 0);
      }
    }
    return net;
  }

  function getItemTotal(cities, cityId, good) {
    return getProduction(cities[cityId], good) + getNetTrade(cities, cityId, good) * -1;
    // Wait: net trade positive = exporting = losing goods
    // So itemTotal = production - net exports + net imports
    //             = production - getNetTrade(...)
    // Actually from city.c: GetItemTotal = GetProduction + GetImportsExports
    // GetImportsExports = sum of all trade flows (exports negative, imports positive)
    // Reformulate:
  }

  // From city.c: GetImportsExports sums positive imports and negative exports
  function getImportsExportsCorrect(cities, cityId, good) {
    let total = 0;
    // outgoing trades: city exports to others (positive flow = export = subtract from city)
    const c = cities[cityId];
    for (const otherId in c.exports) {
      const flow = c.exports[otherId][good] || 0;
      if (flow > 0) total -= flow; // exporting
      else if (flow < 0) total -= flow; // negative flow = importing from that city
    }
    // incoming trades: others export to this city
    for (let i = 0; i < cities.length; i++) {
      if (i === cityId) continue;
      const flow = getTradeFlow(cities, i, cityId, good);
      if (flow > 0) total += flow; // i exports to cityId = cityId imports
    }
    return total;
  }

  function getItemTotalValue(cities, cityId, good) {
    return cities[cityId].production[good] + getImportsExportsCorrect(cities, cityId, good);
  }

  function getUtility(cities, cityId) {
    let product = 1.0;
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      product *= (getItemTotalValue(cities, cityId, g) + 1);
    }
    return Math.pow(product - 1.0, 1.0 / D.GOOD.COUNT);
  }

  function getAutarchicLevel(cities, cityId) {
    const city = cities[cityId];
    const costs = [];
    let cheapest = 4;
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const cost = getProductionCost(city, g);
      if (cost > 0) {
        costs.push(cost);
        if (cost < cheapest) cheapest = cost;
      }
    }
    const n = costs.length;
    if (n === 0) return 0;
    const cSum = costs.reduce((a, b) => a + b, 0);
    const Q = costs.map(c => Math.floor(-1.0 + (50.0 + cSum) / (n * c)));
    // pad Q to 6 elements
    const Q6 = [0,0,0,0,0,0];
    let qi = 0;
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      if (getProductionCost(city, g) > 0) Q6[g] = Q[qi++];
    }
    // distribute remainder
    let excess = 50.0;
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const c = getProductionCost(city, g);
      if (c > 0) excess -= Q6[g] * c;
    }
    if (excess >= cheapest) {
      for (let g = 0; g < D.GOOD.COUNT; g++) {
        const c = getProductionCost(city, g);
        if (c > 0) {
          while (excess >= c) {
            Q6[g]++;
            excess -= c;
          }
        }
      }
    }
    let prod = 1.0;
    for (let g = 0; g < D.GOOD.COUNT; g++) prod *= (Q6[g] + 1.0);
    return Math.pow(prod - 1.0, 1.0 / D.GOOD.COUNT);
  }

  // --- Transport cost (Dijkstra) ---
  // From transport.c getHexCost
  function getHexCost(row, col, dir) {
    const terrain = getTerrain(row, col);
    if (terrain === D.T.NONE) return D.BASE_LABOR + 1;

    const riverBits = getRiver(row, col);
    const coast = D.COAST_MAP[row][col];

    // coast hex traversal cost = 1
    if (coast !== 0) return 1;

    // river: check direction
    const dirIdx = dir - 1; // 0-based
    if (dirIdx >= 0 && dirIdx < 6) {
      const outMask = D.OUT_MASKS[dirIdx];
      const inMask  = D.IN_MASKS[dirIdx];
      if (riverBits & outMask) return 20;   // downstream
      if (riverBits & inMask)  return 50;   // upstream
    }

    switch (terrain) {
      case D.T.OCEAN:   return 1;
      case D.T.CLEAR:   return 100;
      case D.T.FOREST:  return 100;
      case D.T.SWAMP:   return 500;
      case D.T.DESERT:  return 500;
      case D.T.MOUNTAIN:return 1000;
      default: return D.BASE_LABOR + 1;
    }
  }

  function getTransportCost(cities, city1id, city2id, good) {
    const src = cities[city1id];
    const dst = cities[city2id];

    // Dijkstra on hex grid
    const INF = D.BASE_LABOR * D.BASE_LABOR;
    const dist = {};
    const key = (r, c) => r * 100 + c;
    const heap = []; // min-heap via sorted insert (small map, OK)

    const startKey = key(src.row, src.col);
    dist[startKey] = 0;
    heap.push({ cost: 0, row: src.row, col: src.col });

    const pushHeap = (entry) => {
      heap.push(entry);
      heap.sort((a, b) => a.cost - b.cost);
    };

    let iters = 0;
    while (heap.length > 0 && iters++ < 50000) {
      const { cost, row, col } = heap.shift();
      const k = key(row, col);
      if (cost > (dist[k] ?? INF)) continue;
      if (row === dst.row && col === dst.col) break;

      for (let d = D.DIR.N; d <= D.DIR.NW; d++) {
        const [nr, nc] = getNeighbor(row, col, d);
        if (!inBounds(nr, nc)) continue;
        const moveCost = getHexCost(row, col, d);
        const newCost = cost + moveCost;
        const nk = key(nr, nc);
        if (newCost < (dist[nk] ?? INF)) {
          dist[nk] = newCost;
          pushHeap({ cost: newCost, row: nr, col: nc });
        }
      }
    }

    let baseCost = dist[key(dst.row, dst.col)] ?? INF;

    // silk and gold: divide by min(cost, 10)
    if (good === D.GOOD.SILK || good === D.GOOD.GOLD) {
      const divisor = Math.min(baseCost, 10);
      if (divisor > 0) baseCost = Math.floor(baseCost / divisor);
    }

    return baseCost;
  }

  function getMissionCost(dist) {
    return Math.max(100, dist * 100 - 300);
  }

  function enoughLaborToTransport(cities, cityId, good, amount, transportCostPerUnit) {
    const usedLabor = getLaborUsed(cities, cityId);
    const available = D.BASE_LABOR - usedLabor;
    return transportCostPerUnit * amount <= available;
  }

  function getLaborUsed(cities, cityId) {
    const city = cities[cityId];
    let used = 0;
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      used += city.production[g] * (getProductionCost(city, g) || 0);
    }
    // exports cost transport labor
    for (const otherId in city.exports) {
      for (let g = 0; g < D.GOOD.COUNT; g++) {
        const flow = city.exports[otherId][g] || 0;
        if (flow > 0) {
          // we need transport cost to charge labor — use cached or compute
          const tc = state ? getTransportCost(cities, cityId, parseInt(otherId), g) : 1;
          used += flow * tc;
        }
      }
    }
    return used;
  }

  function getLaborAvailable(cities, cityId) {
    return Math.max(0, D.BASE_LABOR - getLaborUsed(cities, cityId));
  }

  // --- Trade flow management ---
  function setTradeFlow(cities, city1id, city2id, good, val) {
    const c = cities[city1id];
    if (!c.exports[city2id]) c.exports[city2id] = {};
    if (val === 0) {
      delete c.exports[city2id][good];
      if (Object.keys(c.exports[city2id]).length === 0) delete c.exports[city2id];
    } else {
      c.exports[city2id][good] = val;
    }
  }

  function changeExport(cities, fromId, toId, good, delta) {
    const current = getTradeFlow(cities, fromId, toId, good);
    const newVal = current + delta;
    setTradeFlow(cities, fromId, toId, good, Math.max(0, newVal));
  }

  // --- Offer / league system ---
  function setOffer(city, fromPlayer, level) {
    if (level <= 0) {
      delete city.offers[fromPlayer];
    } else {
      city.offers[fromPlayer] = level;
    }
  }

  function getTopOffer(city) {
    let best = null, bestLevel = 0;
    for (const p in city.offers) {
      if (city.offers[p] > bestLevel) {
        bestLevel = city.offers[p];
        best = parseInt(p);
      }
    }
    return { player: best, level: bestLevel };
  }

  function resolveOffers(gs) {
    const joined = [], left = [];
    for (const city of gs.cities) {
      const { player, level } = getTopOffer(city);
      if (player === null) continue;
      // probability of joining
      const autarchy = getAutarchicLevel(gs.cities, city.id);
      const utility  = (city.league === D.NO_LEAGUE) ? 0 : getUtility(gs.cities, city.id);
      const adjustment = Math.round((utility - autarchy) * 100);
      const prob = (level * 100 + adjustment) * 10;
      if (Math.random() * 10000 < prob) {
        city.league = player;
        joined.push({ cityName: city.name, player });
      }
      city.offers = {};
    }
    return { joined, left };
  }

  function updateLeagueCities(gs) {
    const dropped = [];
    for (const city of gs.cities) {
      if (city.league === D.NO_LEAGUE) continue;
      const autarchy = getAutarchicLevel(gs.cities, city.id);
      const utility  = getUtility(gs.cities, city.id);
      if (utility < autarchy) {
        const dropProb = 500 + Math.round((autarchy - utility) * 10);
        if (Math.random() * 10000 < dropProb) {
          dropped.push({ cityName: city.name, player: city.league });
          dropCity(gs, city.id);
        }
      }
    }
    return dropped;
  }

  function dropCity(gs, cityId) {
    const city = gs.cities[cityId];
    city.league = D.NO_LEAGUE;
    city.offers = {};
    // zero all trade
    city.exports = {};
    for (let i = 0; i < gs.cities.length; i++) {
      if (gs.cities[i].exports[cityId]) delete gs.cities[i].exports[cityId];
    }
    city.production.fill(0);
  }

  // --- Computer AI ---
  function doComputerTurn(gs, playerIdx) {
    const leagueCities = gs.cities.filter(c => c.league === playerIdx);
    if (leagueCities.length === 0) return;

    const numOffers = Math.floor(leagueCities.length / 10) + Math.floor(Math.random() * 4);
    const neutral = gs.cities.filter(c => c.league === D.NO_LEAGUE);
    if (neutral.length === 0) return;

    // pick cities to offer to, prioritizing nearest by transport cost
    const candidates = neutral.slice().sort(() => Math.random() - 0.5).slice(0, numOffers + 4);
    for (let i = 0; i < Math.min(numOffers, candidates.length); i++) {
      const target = candidates[i];
      const level = 1 + Math.floor(Math.random() * 5);
      setOffer(target, playerIdx, level);
    }

    // optimize production for each league city
    for (const city of leagueCities) {
      autoOptimizeProduction(gs, city.id);
    }
  }

  function autoOptimizeProduction(gs, cityId) {
    const city = gs.cities[cityId];
    city.production.fill(0);
    let laborLeft = D.BASE_LABOR;

    // assign labor to goods proportional to cheapness
    const available = [];
    for (let g = 0; g < D.GOOD.COUNT; g++) {
      const cost = getProductionCost(city, g);
      if (cost > 0) available.push({ g, cost });
    }
    if (available.length === 0) return;

    // simple greedy: buy cheapest good first
    available.sort((a, b) => a.cost - b.cost);
    let changed = true;
    while (changed && laborLeft > 0) {
      changed = false;
      for (const { g, cost } of available) {
        if (cost <= laborLeft) {
          city.production[g]++;
          laborLeft -= cost;
          changed = true;
        }
      }
    }
  }

  // --- End turn ---
  function doEndTurn(gs) {
    gs.currentPlayer = (gs.currentPlayer + 1) % gs.numPlayers;
    if (gs.currentPlayer === 0) {
      // new round: process league updates and offers
      const dropped = updateLeagueCities(gs);
      const { joined } = resolveOffers(gs);
      gs.turn++;
      return { dropped, joined };
    }
    return { dropped: [], joined: [] };
  }

  // --- New game initialisation ---
  function newGame(numPlayers, leagueAssignments) {
    const cities = D.CITY_DEFS.map(def => createCity(def));
    // assign starting leagues
    for (const { cityId, player } of leagueAssignments) {
      if (cityId >= 0 && cityId < cities.length && player >= 0) {
        cities[cityId].league = player;
        autoOptimizeProduction({ cities }, cityId);
      }
    }
    state = {
      cities,
      numPlayers,
      currentPlayer: 0,
      turn: 1,
      playerTypes: Array.from({ length: numPlayers }, (_, i) =>
        i === 0 ? 'human' : 'computer'),
    };
    return state;
  }

  // --- Validation helpers for UI ---
  function canChangeProduction(gs, cityId, good, delta) {
    const city = gs.cities[cityId];
    const cost = getProductionCost(city, good);
    if (cost === 0) return false;
    const newQty = city.production[good] + delta;
    if (newQty < 0) return false;
    if (delta > 0) {
      return getLaborUsed(gs.cities, cityId) + cost <= D.BASE_LABOR;
    }
    return true;
  }

  function changeProduction(gs, cityId, good, delta) {
    if (!canChangeProduction(gs, cityId, good, delta)) return false;
    gs.cities[cityId].production[good] += delta;
    return true;
  }

  function canChangeExport(gs, fromId, toId, good, delta) {
    const city = gs.cities[fromId];
    const current = getTradeFlow(gs.cities, fromId, toId, good);
    const newVal = current + delta;
    if (newVal < 0) return false;
    if (delta > 0) {
      // check enough goods and labor
      const itemTotal = getItemTotalValue(gs.cities, fromId, good);
      if (itemTotal <= 0) return false;
      const tc = getTransportCost(gs.cities, fromId, toId, good);
      return enoughLaborToTransport(gs.cities, fromId, good, delta, tc);
    }
    return true;
  }

  function canSendMission(gs, fromPlayer, targetCityId) {
    const target = gs.cities[targetCityId];
    return target.league === D.NO_LEAGUE || target.league === fromPlayer;
  }

  function sendMission(gs, fromPlayer, targetCityId, level) {
    if (!canSendMission(gs, fromPlayer, targetCityId)) return false;
    setOffer(gs.cities[targetCityId], fromPlayer, level);
    return true;
  }

  function getState() { return state; }
  function setState(s) { state = s; }

  return {
    getNeighbor, inBounds, getTerrain, getRiver,
    getProductionCost, calcProductionCost, countAdjacentTerrain,
    getProduction, getTradeFlow, getNetTrade,
    getItemTotalValue, getUtility, getAutarchicLevel,
    getTransportCost, getMissionCost,
    getLaborUsed, getLaborAvailable,
    setTradeFlow, changeExport,
    setOffer, getTopOffer, resolveOffers, updateLeagueCities, dropCity,
    doComputerTurn, autoOptimizeProduction,
    doEndTurn, newGame,
    canChangeProduction, changeProduction,
    canChangeExport,
    canSendMission, sendMission,
    getState, setState,
  };
})();
