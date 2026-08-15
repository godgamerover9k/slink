/* ============================================================
   1. Engine — grid geometry
   ============================================================ */
const UNK = 0,
  ON = 1,
  OFF = 2;

function Engine(R, C) {
  const H_EDGE_COUNT = (R + 1) * C,
    VN = R * (C + 1),
    EDGE_COUNT = H_EDGE_COUNT + VN,
    DOT_COUNT = (R + 1) * (C + 1),
    CELL_COUNT = R * C;
  const H = (r, c) => r * C + c,
    V = (r, c) => H_EDGE_COUNT + r * (C + 1) + c;
  const ea = new Int32Array(EDGE_COUNT),
    eb = new Int32Array(EDGE_COUNT);
  for (let r = 0; r <= R; r++)
    for (let c = 0; c < C; c++) {
      const i = H(r, c);
      ea[i] = r * (C + 1) + c;
      eb[i] = r * (C + 1) + c + 1;
    }
  for (let r = 0; r < R; r++)
    for (let c = 0; c <= C; c++) {
      const i = V(r, c);
      ea[i] = r * (C + 1) + c;
      eb[i] = (r + 1) * (C + 1) + c;
    }
  const vDeg = new Int8Array(DOT_COUNT),
    vEdge = new Int32Array(DOT_COUNT * 4).fill(-1);
  for (let i = 0; i < EDGE_COUNT; i++) {
    vEdge[ea[i] * 4 + vDeg[ea[i]]++] = i;
    vEdge[eb[i] * 4 + vDeg[eb[i]]++] = i;
  }
  const cEdge = new Int32Array(CELL_COUNT * 4);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c;
      cEdge[k * 4] = H(r, c);
      cEdge[k * 4 + 1] = H(r + 1, c);
      cEdge[k * 4 + 2] = V(r, c);
      cEdge[k * 4 + 3] = V(r, c + 1);
    }
  // per cell, 4 corners: [inA,inB,out1,out2]
  const corner = new Int32Array(CELL_COUNT * 16).fill(-1);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c,
        b = k * 16,
        top = H(r, c),
        bot = H(r + 1, c),
        lef = V(r, c),
        rig = V(r, c + 1);
      corner[b] = top;
      corner[b + 1] = lef;
      corner[b + 2] = c > 0 ? H(r, c - 1) : -1;
      corner[b + 3] = r > 0 ? V(r - 1, c) : -1;
      corner[b + 4] = top;
      corner[b + 5] = rig;
      corner[b + 6] = c + 1 < C ? H(r, c + 1) : -1;
      corner[b + 7] = r > 0 ? V(r - 1, c + 1) : -1;
      corner[b + 8] = bot;
      corner[b + 9] = lef;
      corner[b + 10] = c > 0 ? H(r + 1, c - 1) : -1;
      corner[b + 11] = r + 1 < R ? V(r + 1, c) : -1;
      corner[b + 12] = bot;
      corner[b + 13] = rig;
      corner[b + 14] = c + 1 < C ? H(r + 1, c + 1) : -1;
      corner[b + 15] = r + 1 < R ? V(r + 1, c + 1) : -1;
    }
  const cellsAtV = [];
  for (let v = 0; v < DOT_COUNT; v++) cellsAtV.push([]);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const k = r * C + c;
      cellsAtV[r * (C + 1) + c].push(k);
      cellsAtV[r * (C + 1) + c + 1].push(k);
      cellsAtV[(r + 1) * (C + 1) + c].push(k);
      cellsAtV[(r + 1) * (C + 1) + c + 1].push(k);
    }
  const affN = new Int8Array(EDGE_COUNT),
    aff = new Int32Array(EDGE_COUNT * 6).fill(-1);
  for (let i = 0; i < EDGE_COUNT; i++) {
    const set = new Set([...cellsAtV[ea[i]], ...cellsAtV[eb[i]]]);
    for (const k of set) aff[i * 6 + affN[i]++] = k;
  }
  return {
    R,
    C,
    HN: H_EDGE_COUNT,
    VN,
    E: EDGE_COUNT,
    VC: DOT_COUNT,
    NC: CELL_COUNT,
    H,
    V,
    ea,
    eb,
    vDeg,
    vEdge,
    cEdge,
    corner,
    affN,
    aff,
  };
}
