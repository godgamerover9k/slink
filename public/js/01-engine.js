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
  const H = (row, col) => row * C + col,
    V = (row, col) => H_EDGE_COUNT + row * (C + 1) + col;
  const ea = new Int32Array(EDGE_COUNT),
    eb = new Int32Array(EDGE_COUNT);
  for (let row = 0; row <= R; row++)
    for (let col = 0; col < C; col++) {
      const edge = H(row, col);
      ea[edge] = row * (C + 1) + col;
      eb[edge] = row * (C + 1) + col + 1;
    }
  for (let row = 0; row < R; row++)
    for (let col = 0; col <= C; col++) {
      const edge = V(row, col);
      ea[edge] = row * (C + 1) + col;
      eb[edge] = (row + 1) * (C + 1) + col;
    }
  const vDeg = new Int8Array(DOT_COUNT),
    vEdge = new Int32Array(DOT_COUNT * 4).fill(-1);
  for (let edge = 0; edge < EDGE_COUNT; edge++) {
    vEdge[ea[edge] * 4 + vDeg[ea[edge]]++] = edge;
    vEdge[eb[edge] * 4 + vDeg[eb[edge]]++] = edge;
  }
  const cEdge = new Int32Array(CELL_COUNT * 4);
  for (let row = 0; row < R; row++)
    for (let col = 0; col < C; col++) {
      const cell = row * C + col;
      cEdge[cell * 4] = H(row, col);
      cEdge[cell * 4 + 1] = H(row + 1, col);
      cEdge[cell * 4 + 2] = V(row, col);
      cEdge[cell * 4 + 3] = V(row, col + 1);
    }
  // per cell, 4 corners: [inA,inB,out1,out2]
  const corner = new Int32Array(CELL_COUNT * 16).fill(-1);
  for (let row = 0; row < R; row++)
    for (let col = 0; col < C; col++) {
      const cell = row * C + col,
        b = cell * 16,
        top = H(row, col),
        bot = H(row + 1, col),
        lef = V(row, col),
        rig = V(row, col + 1);
      corner[b] = top;
      corner[b + 1] = lef;
      corner[b + 2] = col > 0 ? H(row, col - 1) : -1;
      corner[b + 3] = row > 0 ? V(row - 1, col) : -1;
      corner[b + 4] = top;
      corner[b + 5] = rig;
      corner[b + 6] = col + 1 < C ? H(row, col + 1) : -1;
      corner[b + 7] = row > 0 ? V(row - 1, col + 1) : -1;
      corner[b + 8] = bot;
      corner[b + 9] = lef;
      corner[b + 10] = col > 0 ? H(row + 1, col - 1) : -1;
      corner[b + 11] = row + 1 < R ? V(row + 1, col) : -1;
      corner[b + 12] = bot;
      corner[b + 13] = rig;
      corner[b + 14] = col + 1 < C ? H(row + 1, col + 1) : -1;
      corner[b + 15] = row + 1 < R ? V(row + 1, col + 1) : -1;
    }
  const cellsAtV = [];
  for (let dot = 0; dot < DOT_COUNT; dot++) cellsAtV.push([]);
  for (let row = 0; row < R; row++)
    for (let col = 0; col < C; col++) {
      const cell = row * C + col;
      cellsAtV[row * (C + 1) + col].push(cell);
      cellsAtV[row * (C + 1) + col + 1].push(cell);
      cellsAtV[(row + 1) * (C + 1) + col].push(cell);
      cellsAtV[(row + 1) * (C + 1) + col + 1].push(cell);
    }
  const affN = new Int8Array(EDGE_COUNT),
    aff = new Int32Array(EDGE_COUNT * 6).fill(-1);
  for (let edge = 0; edge < EDGE_COUNT; edge++) {
    const set = new Set([...cellsAtV[ea[edge]], ...cellsAtV[eb[edge]]]);
    for (const cell of set) aff[edge * 6 + affN[edge]++] = cell;
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
