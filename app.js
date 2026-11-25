
let globalData = null;

function parseVNDate(str) {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
}
function formatVNDate(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}
function formatShortDate(dt) {
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
}
function getWeekdayName(dt) {
  return ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][dt.getDay()];
}
function sumLast2(numStr) {
  if (!numStr || numStr.length < 2) return null;
  return (parseInt(numStr[numStr.length - 2], 10) + parseInt(numStr[numStr.length - 1], 10)) % 10;
}
function canForm2Digit(fiveDigits, target2) {
  if (!fiveDigits || fiveDigits.length < 5 || !target2 || target2.length < 2) return false;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i !== j && (fiveDigits[i] + fiveDigits[j]) === target2) return true;
    }
  }
  return false;
}

function getNormalizedWeeks(rawWeeks) {
  const mapByMon = new Map();
  const baseMon = new Date(2026, 10, 23);
  rawWeeks.forEach((item, idx) => {
    let monStr, nums;
    if (Array.isArray(item)) {
      const dt = new Date(baseMon);
      dt.setDate(baseMon.getDate() - 7 * idx);
      monStr = formatVNDate(dt);
      nums = item;
    } else {
      monStr = item.monday;
      nums = item.nums;
    }
    const sig = nums.join('|');
    let exists = false;
    for (const ex of mapByMon.values()) {
      if (ex.nums.join('|') === sig && sig !== '||||||') { exists = true; break; }
    }
    if (!exists && !mapByMon.has(monStr)) {
      const mDt = parseVNDate(monStr);
      const sDt = new Date(mDt);
      sDt.setDate(mDt.getDate() + 6);
      mapByMon.set(monStr, {
        monday: monStr,
        mDt,
        label: `${formatShortDate(mDt)} - ${formatVNDate(sDt)}`,
        nums: [...nums]
      });
    }
  });
  return Array.from(mapByMon.values()).sort((a, b) => b.mDt - a.mDt);
}

function getAllHistoricalGDB(allWeeks) {
  const list = [];
  for (let w = allWeeks.length - 1; w >= 0; w--) {
    const wk = allWeeks[w];
    for (let d = 0; d < 7; d++) {
      const val = wk.nums[d];
      if (val && val.length >= 2) {
        const dt = new Date(wk.mDt);
        dt.setDate(wk.mDt.getDate() + d);
        list.push({ date: formatVNDate(dt), db: val, de: val.slice(-2) });
      }
    }
  }
  return list;
}

function computeDanStats(histGDB, targetSet) {
  let daysSince = 0, lastHitDate = "Chưa thấy", lastHitDe = "--", maxObserved = 0, curStreak = 0;
  for (let i = 0; i < histGDB.length; i++) {
    const item = histGDB[i];
    if (!item || !item.de || !/^\d{2}$/.test(item.de)) continue;
    if (targetSet.has(item.de)) {
      if (curStreak > maxObserved) maxObserved = curStreak;
      curStreak = 0;
      lastHitDate = item.date;
      lastHitDe = item.de;
    } else {
      curStreak++;
    }
  }
  daysSince = curStreak;
  if (curStreak > maxObserved) maxObserved = curStreak;
  return { daysSince, lastHitDate, lastHitDe, maxObserved };
}

function getBoKep4SoConfigs() {
  return [
    { name: "Bộ 00 (4 số)", excelMax: 45, nums: ["00", "05", "50", "55"] },
    { name: "Bộ 11 (4 số)", excelMax: 45, nums: ["11", "16", "61", "66"] },
    { name: "Bộ 22 (4 số)", excelMax: 45, nums: ["22", "27", "72", "77"] },
    { name: "Bộ 33 (4 số)", excelMax: 45, nums: ["33", "38", "83", "88"] },
    { name: "Bộ 44 (4 số)", excelMax: 45, nums: ["44", "49", "94", "99"] }
  ];
}

function getDanConfigs() {
  const dan65 = ["00","03","04","06","09","10","11","13","14","16","19","22","23","24","26","29","30","31","32","33","34","37","38","39","40","42","43","44","45","46","48","49","50","51","52","53","54","57","59","60","63","64","65","66","67","68","69","70","71","72","73","74","75","76","81","82","84","85","86","88","89","91","96","97","99"];
  const danDan = ["02","14","26","38","50","62","74","86","98"];
  const danDau = ["09","21","33","45","57","69","81","93"];
  const danTy  = ["00","12","24","36","48","60","72","84","96"];
  const danTi  = ["05","17","29","41","53","65","77","89"];
  const kep2   = ["00","11","22","33","44","55","66","77","88","99","05","50","16","61","27","72","38","83","49","94"];

  // Tổng đề dùng cho lịch nuôi theo ngày trong tháng (từ ảnh)
  const all100 = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const tong38 = all100.filter(s => ((+s[0] + +s[1]) % 10) === 3 || ((+s[0] + +s[1]) % 10) === 8);
  const tong49 = all100.filter(s => ((+s[0] + +s[1]) % 10) === 4 || ((+s[0] + +s[1]) % 10) === 9);
  const tong16 = all100.filter(s => ((+s[0] + +s[1]) % 10) === 1 || ((+s[0] + +s[1]) % 10) === 6);

  return [
    // ==================== NHÓM 1: DÀN TRONG ẢNH (NUÔI THÁNG, CON GIÁP LẺ & 65 SỐ) ====================
    { group: "Dàn trong ảnh", short: "65 số", name: "Dàn 65 số cố định", count: 65, excelMax: 12, nums: dan65 },
    { group: "Dàn trong ảnh", short: "T3-8 (4→10)", name: "Mùng 4 nổ 44 nuôi Tổng 3-8 (từ 4→10)", count: 36, excelMax: 17, nums: tong38 },
    { group: "Dàn trong ảnh", short: "T4-9 (8→14)", name: "Từ ngày 8–14 nuôi Tổng 4-9", count: 36, excelMax: 17, nums: tong49 },
    { group: "Dàn trong ảnh", short: "2 Kép (15→22)", name: "Từ ngày 15–22 nuôi 2 Kép", count: 20, excelMax: 20, nums: kep2 },
    { group: "Dàn trong ảnh", short: "T1-6 (26→hết)", name: "Từ ngày 26–hết tháng nuôi Tổng 1-6", count: 36, excelMax: 18, nums: tong16 },
    { group: "Dàn trong ảnh", short: "Dần (9s)", name: "Con giáp: Dần (9s)", count: 9, excelMax: 45, nums: danDan },
    { group: "Dàn trong ảnh", short: "Dậu (8s)", name: "Con giáp: Dậu (8s)", count: 8, excelMax: 50, nums: danDau },
    { group: "Dàn trong ảnh", short: "Tý (9s)", name: "Con giáp: Tý (9s)", count: 9, excelMax: 45, nums: danTy },
    { group: "Dàn trong ảnh", short: "Tị (8s)", name: "Con giáp: Tị (8s)", count: 8, excelMax: 50, nums: danTi },

    // ==================== NHÓM 2: TOÀN BỘ 22 DÀN TỪ CHÚ THÍCH (COMMENT) CỘT T ====================
    { group: "Chú thích Cột T", short: "T3: 24s", name: "Cột T3 (24s - Chú thích)", count: 24, excelMax: 35, nums: ["12","21","18","81","23","32","27","72","28","82","29","92","37","73","38","83","39","93","78","87","79","97","89","98"] },
    { group: "Chú thích Cột T", short: "T5: 26s", name: "Cột T5 (26s - Chú thích)", count: 26, excelMax: 21, nums: ["00","02","09","12","14","17","24","26","33","36","38","45","48","50","57","60","62","65","72","77","81","84","86","93","96","98"] },
    { group: "Chú thích Cột T", short: "T7: 34s Giáp", name: "Cột T7: Dần Dậu Tí Tỵ (34s)", count: 34, excelMax: 20, nums: ["00","02","05","09","12","14","17","21","24","26","29","33","36","38","41","45","48","50","53","57","60","62","65","69","72","74","77","81","84","86","89","93","96","98"] },
    { group: "Chú thích Cột T", short: "T10: Hiệu 0,1", name: "Cột T10: Hiệu=0,=1 (30s)", count: 30, excelMax: 20, nums: ["00","11","22","33","44","55","66","77","88","99","01","10","12","21","23","32","34","43","45","54","56","65","67","76","78","87","89","98","09","90"] },
    { group: "Chú thích Cột T", short: "T12: /3", name: "Cột T12: Chia hết cho 3 (34s)", count: 34, excelMax: 19, nums: ["00","03","06","09","12","15","18","21","24","27","30","33","36","39","42","45","48","51","54","57","60","63","66","69","72","75","78","81","84","87","90","93","96","99"] },
    { group: "Chú thích Cột T", short: "T14: /3=2", name: "Cột T14: Chia 3 dư 2 (33s)", count: 33, excelMax: 27, nums: ["02","05","08","11","14","17","20","23","26","29","32","35","38","41","44","47","50","53","56","59","62","65","68","71","74","77","80","83","86","89","92","95","98"] },
    { group: "Chú thích Cột T", short: "T16: /3=1", name: "Cột T16: Chia 3 dư 1 (33s)", count: 33, excelMax: 22, nums: ["01","04","07","10","13","16","19","22","25","28","31","34","37","40","43","46","49","52","55","58","61","64","67","70","73","76","79","82","85","88","91","94","97"] },
    { group: "Chú thích Cột T", short: "T18: Dàn 0-5", name: "Cột T18: Dàn từ 0-5 (36s - Ghép chữ số 0..5)", count: 36, excelMax: 21, nums: ["00","01","02","03","04","05","10","11","12","13","14","15","20","21","22","23","24","25","30","31","32","33","34","35","40","41","42","43","44","45","50","51","52","53","54","55"] },
    { group: "Chú thích Cột T", short: "T20: Dàn 1-6", name: "Cột T20: Dàn từ 1-6 (36s - Ghép chữ số 1..6)", count: 36, excelMax: 18, nums: ["11","12","13","14","15","16","21","22","23","24","25","26","31","32","33","34","35","36","41","42","43","44","45","46","51","52","53","54","55","56","61","62","63","64","65","66"] },
    { group: "Chú thích Cột T", short: "T22: Dàn 2-7", name: "Cột T22: Dàn từ 2-7 (36s - Ghép chữ số 2..7)", count: 36, excelMax: 21, nums: ["22","23","24","25","26","27","32","33","34","35","36","37","42","43","44","45","46","47","52","53","54","55","56","57","62","63","64","65","66","67","72","73","74","75","76","77"] },
    { group: "Chú thích Cột T", short: "T24: Dàn 3-8", name: "Cột T24: Dàn từ 3-8 (36s - Ghép chữ số 3..8)", count: 36, excelMax: 17, nums: ["33","34","35","36","37","38","43","44","45","46","47","48","53","54","55","56","57","58","63","64","65","66","67","68","73","74","75","76","77","78","83","84","85","86","87","88"] },
    { group: "Chú thích Cột T", short: "T25: Dàn 4-9", name: "Cột T25: Dàn từ 4-9 (36s - Ghép chữ số 4..9)", count: 36, excelMax: 17, nums: ["44","45","46","47","48","49","54","55","56","57","58","59","64","65","66","67","68","69","74","75","76","77","78","79","84","85","86","87","88","89","94","95","96","97","98","99"] },
    { group: "Chú thích Cột T", short: "T27: Chẵn Chẵn", name: "Cột T27: Chẵn Chẵn (25s)", count: 25, excelMax: 36, nums: ["00","22","44","66","88","02","20","04","40","06","60","08","80","24","42","26","62","28","82","46","64","48","84","68","86"] },
    { group: "Chú thích Cột T", short: "T29: Lẻ Lẻ", name: "Cột T29: Lẻ Lẻ (25s)", count: 25, excelMax: 31, nums: ["11","33","55","77","99","13","31","15","51","17","71","19","91","35","53","37","73","39","93","57","75","59","95","79","97"] },
    { group: "Chú thích Cột T", short: "T31: Chẵn Lẻ", name: "Cột T31: Chẵn Lẻ (25s)", count: 25, excelMax: 32, nums: ["01","03","05","07","09","21","23","25","27","29","41","43","45","47","49","61","63","65","67","69","81","83","85","87","89"] },
    { group: "Chú thích Cột T", short: "T33: Lẻ Chẵn", name: "Cột T33: Lẻ Chẵn (25s)", count: 25, excelMax: 30, nums: ["10","12","14","16","18","30","32","34","36","38","50","52","54","56","58","70","72","74","76","78","90","92","94","96","98"] },
    { group: "Chú thích Cột T", short: "T35: Nhỏ Nhỏ", name: "Cột T35: Nhỏ Nhỏ (25s)", count: 25, excelMax: 26, nums: ["00","11","22","33","44","01","10","02","20","03","30","04","40","12","21","13","31","14","41","23","32","24","42","34","43"] },
    { group: "Chú thích Cột T", short: "T37: To To", name: "Cột T37: To To (25s)", count: 25, excelMax: 26, nums: ["55","66","77","88","99","56","65","57","75","58","85","59","95","67","76","68","86","69","96","78","87","79","97","89","98"] },
    { group: "Chú thích Cột T", short: "T39: Nhỏ To", name: "Cột T39: Nhỏ To (25s)", count: 25, excelMax: 26, nums: ["05","06","07","08","09","15","16","17","18","19","25","26","27","28","29","35","36","37","38","39","45","46","47","48","49"] },
    { group: "Chú thích Cột T", short: "T41: To Nhỏ", name: "Cột T41: To Nhỏ (25s)", count: 25, excelMax: 26, nums: ["90","91","92","93","94","80","81","82","83","84","70","71","72","73","74","60","61","62","63","64","50","51","52","53","54"] },
    { group: "Chú thích Cột T", short: "T43: Dàn 50s", name: "Cột T43: Dàn 50 số (Chú thích)", count: 50, excelMax: 15, nums: ["50","01","02","03","05","08","10","11","14","15","16","17","18","19","21","22","24","28","29","30","31","32","33","35","38","40","41","44","45","48","53","55","58","59","65","67","69","70","71","75","79","80","83","84","88","89","91","92","93","94"] },
    { group: "Chú thích Cột T", short: "T44: Dàn 44s", name: "Cột T44: Dàn 44 số (Chú thích)", count: 44, excelMax: 16, nums: ["02","05","08","10","11","14","15","16","17","21","22","24","29","30","31","32","33","35","40","41","43","44","45","48","49","50","53","59","63","65","67","68","75","77","79","80","88","89","90","91","92","93","97","99"] }
  ];
}

function exportFullWorkbook() {
  if (!globalData || typeof XLSX === "undefined") {
    alert("Đang tải dữ liệu hoặc thư viện Excel, vui lòng đợi 2 giây!");
    return;
  }
  const wb = XLSX.utils.book_new();
  const borderStyle = { top: { style: "thin", color: { rgb: "BFBFBF" } }, bottom: { style: "thin", color: { rgb: "BFBFBF" } }, left: { style: "thin", color: { rgb: "BFBFBF" } }, right: { style: "thin", color: { rgb: "BFBFBF" } } };
  const headerStyle = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1E569B" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
  const baseCellStyle = { alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderStyle };
  const yellowStyle = { font: { bold: true, color: { rgb: "C00000" } }, fill: { fgColor: { rgb: "FFF200" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
  const greenStyle = { font: { bold: true, color: { rgb: "0F3D0F" } }, fill: { fgColor: { rgb: "92D050" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderStyle };

  const allWeeks = getNormalizedWeeks(globalData.weeks_gdb);
  const daysName = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];

  // Sheet 1
  const s1Rows = [ ["Tuần", ...daysName].map(h => ({ v: h, s: headerStyle })) ];
  allWeeks.slice(0, 52).forEach((wk, idx) => {
    const tag = idx === 0 ? "Tuần hiện tại" : `Tuần -${idx}`;
    const row = [{ v: `${tag} (${wk.label})`, s: baseCellStyle }];
    for (let d = 0; d < 7; d++) {
      const val = wk.nums[d] || "";
      row.push({ v: val ? `${val} (Đề ${val.slice(-2)} - T${sumLast2(val)})` : "", s: baseCellStyle });
    }
    s1Rows.push(row);
  });
  const ws1 = XLSX.utils.aoa_to_sheet(s1Rows);
  ws1["!cols"] = [{ wch: 24 }, ...Array(7).fill({ wch: 22 })];
  XLSX.utils.book_append_sheet(wb, ws1, "1. GDB Theo Tuan");

  // Sheet 2
  const s2Rows = [ ["Tuần", "Tập Tổng 7 ngày sau", ...Array.from({ length: 35 }, (_, i) => `Cột ${i + 1}`)].map(h => ({ v: h, s: headerStyle })) ];
  allWeeks.slice(0, 52).forEach((wk, idx) => {
    const tag = idx === 0 ? "Hiện tại" : `Tuần -${idx}`;
    const nextWeek = idx > 0 ? allWeeks[idx - 1] : null;
    const nextSumsSet = new Set();
    if (nextWeek) nextWeek.nums.forEach(n => { const s = sumLast2(n); if (s !== null) nextSumsSet.add(s); });
    const hasNext = nextSumsSet.size > 0;
    const sumsLabel = hasNext ? `{${Array.from(nextSumsSet).sort().join(",")}}` : "Chờ 7 ngày sau";
    const row = [{ v: `${tag} (${wk.label})`, s: baseCellStyle }, { v: sumsLabel, s: baseCellStyle }];
    for (let d = 0; d < 7; d++) {
      const num = wk.nums[d] || "";
      for (let k = 0; k < 5; k++) {
        const ch = num[k] !== undefined ? num[k] : "";
        if (ch !== "" && hasNext) {
          const isY = !nextSumsSet.has(parseInt(ch, 10));
          row.push({ v: parseInt(ch, 10), s: isY ? yellowStyle : baseCellStyle });
        } else {
          row.push({ v: ch === "" ? "" : parseInt(ch, 10), s: baseCellStyle });
        }
      }
    }
    s2Rows.push(row);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
  ws2["!cols"] = [{ wch: 24 }, { wch: 20 }, ...Array(35).fill({ wch: 6 })];
  XLSX.utils.book_append_sheet(wb, ws2, "3. Bang 35 Cot (Tong)");

  // Sheet 35 Cột theo Chạm (1 trong 2 số cuối ĐB 7 ngày tiếp theo)
  const s2bRows = [ ["Tuần", "Tập Chạm 2 Số Cuối 7N Sau", ...Array.from({ length: 35 }, (_, i) => `Cột ${i + 1}`)].map(h => ({ v: h, s: headerStyle })) ];
  allWeeks.slice(0, 52).forEach((wk, idx) => {
    const tag = idx === 0 ? "Hiện tại" : `Tuần -${idx}`;
    const nextWeek = idx > 0 ? allWeeks[idx - 1] : null;
    const nextChamSet = new Set();
    if (nextWeek) {
      nextWeek.nums.forEach(n => {
        if (n && n.length >= 2) {
          nextChamSet.add(parseInt(n[n.length - 2], 10));
          nextChamSet.add(parseInt(n[n.length - 1], 10));
        }
      });
    }
    const hasNext = nextChamSet.size > 0;
    const chamLabel = hasNext ? `{${Array.from(nextChamSet).sort().join(",")}}` : "Chờ 7 ngày sau";
    const row = [{ v: `${tag} (${wk.label})`, s: baseCellStyle }, { v: chamLabel, s: baseCellStyle }];
    for (let d = 0; d < 7; d++) {
      const num = wk.nums[d] || "";
      for (let k = 0; k < 5; k++) {
        const ch = num[k] !== undefined ? num[k] : "";
        if (ch !== "" && hasNext) {
          const isY = !nextChamSet.has(parseInt(ch, 10));
          row.push({ v: parseInt(ch, 10), s: isY ? yellowStyle : baseCellStyle });
        } else {
          row.push({ v: ch === "" ? "" : parseInt(ch, 10), s: baseCellStyle });
        }
      }
    }
    s2bRows.push(row);
  });
  const ws2b = XLSX.utils.aoa_to_sheet(s2bRows);
  ws2b["!cols"] = [{ wch: 24 }, { wch: 22 }, ...Array(35).fill({ wch: 6 })];
  XLSX.utils.book_append_sheet(wb, ws2b, "4. Bang 35 Cot (Cham)");

  // Sheet 3 (40 days)
  const daily = globalData.daily_prizes;
  const prizeCols = ["ĐB", "G1", "G2-1", "G2-2", "G3-1", "G3-2", "G3-3", "G3-4", "G3-5", "G3-6"];
  let streaks = Array(10).fill(0);
  const comp3 = [];
  for (let i = 0; i < daily.length; i++) {
    const row = daily[i];
    if (i < daily.length - 1) {
      const nextDb = daily[i + 1].prizes[0];
      const nextDe = nextDb.slice(-2);
      const cells = row.prizes.map((p, pIdx) => {
        if (canForm2Digit(p, nextDe)) { streaks[pIdx] = 0; return { hit: true, v: `${p} [Trúng ${nextDe}]` }; }
        streaks[pIdx]++; return { hit: false, v: `${p} (${streaks[pIdx]})` };
      });
      comp3.push({ date: row.date, next: `${nextDb} (${nextDe})`, cells });
    } else {
      comp3.push({ date: row.date, next: "Chờ KQ hôm sau", cells: row.prizes.map((p, idx) => ({ hit: false, v: `${p} (${streaks[idx]})` })) });
    }
  }
  const s3Rows = [ ["Ngày", "ĐB hôm sau", ...prizeCols].map(h => ({ v: h, s: headerStyle })) ];
  comp3.slice(-40).reverse().forEach(r => {
    s3Rows.push([
      { v: r.date, s: baseCellStyle },
      { v: r.next, s: baseCellStyle },
      ...r.cells.map(c => ({ v: c.v, s: c.hit ? greenStyle : baseCellStyle }))
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows);
  ws3["!cols"] = [{ wch: 15 }, { wch: 18 }, ...Array(10).fill({ wch: 16 })];
  XLSX.utils.book_append_sheet(wb, ws3, "3. Ghep 2 So 40 Ngay");

  // Sheet 4 (Dàn Nuôi)
  const histGDB = getAllHistoricalGDB(allWeeks);
  const s4Rows = [ ["Tên Dàn Nuôi", "Số con", "Chưa về (Ngày)", "Chu kỳ Max", "Về gần nhất"].map(h => ({ v: h, s: headerStyle })) ];
  getDanConfigs().forEach(cfg => {
    const st = computeDanStats(histGDB, new Set(cfg.nums));
    const style = st.daysSince === 0 ? greenStyle : (st.daysSince >= Math.floor(cfg.excelMax * 0.72) ? yellowStyle : baseCellStyle);
    s4Rows.push([
      { v: `${cfg.name} — ${st.daysSince === 0 ? "vừa về (0 ngày)" : "gan " + st.daysSince + " ngày"}`, s: style },
      { v: `${cfg.count}s`, s: style },
      { v: st.daysSince, s: style },
      { v: cfg.excelMax, s: style },
      { v: `${st.lastHitDate} (${st.lastHitDe})`, s: style }
    ]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(s4Rows);
  ws4["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws4, "4. Dan Nuoi Chu Ky");

  XLSX.writeFile(wb, `Thongke_web_app_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function loadSharedData(onReadyCallback) {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    globalData = await res.json();
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.innerText = "Cập nhật tự động: " + globalData.last_updated;
    if (onReadyCallback) onReadyCallback(globalData);
  } catch (e) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) statusEl.innerText = "Lỗi tải data.json";
  }
}


// ==================== TÍNH TOÁN TỰ ĐỘNG SHEET 1 (CHẠM & CẦU PASCAL 82 CỘT) ====================
function computePascalChain(gdb5) {
  if (!gdb5 || gdb5.length < 5) return { p4: "", p3: "", p2: "", sum2: "" };
  const d = gdb5.split("").map(Number);
  const p4Arr = [
    (d[0] + d[1]) % 10,
    (d[1] + d[2]) % 10,
    (d[2] + d[3]) % 10,
    (d[3] + d[4]) % 10
  ];
  const p3Arr = [
    (p4Arr[0] + p4Arr[1]) % 10,
    (p4Arr[1] + p4Arr[2]) % 10,
    (p4Arr[2] + p4Arr[3]) % 10
  ];
  const p2Arr = [
    (p3Arr[0] + p3Arr[1]) % 10,
    (p3Arr[1] + p3Arr[2]) % 10
  ];
  const sum2 = (p2Arr[0] + p2Arr[1]) % 10;
  return {
    p4: p4Arr.join(""),
    p3: p3Arr.join(""),
    p2: p2Arr.join(""),
    sum2: String(sum2)
  };
}

function computeChamSheetRow(wk, prevWk, auxMap) {
  // wk.nums = [T2(AF), T3(AG), T4(AH), T5(AI), T6(AJ), T7(AK), CN(AL)]
  const n = wk.nums;
  const monGdb = n[0] || "";
  const aux = (auxMap && monGdb && auxMap[monGdb]) ? auxMap[monGdb] : { c_g74: "", d_g1: "", e_bg1: "", ar_bg1t7: "", as_g71_g74: "" };

  const dig = (s, idx) => (s && s.length > idx) ? parseInt(s[idx], 10) : null;
  const modAdd = (x, y) => (x !== null && y !== null) ? String((x + y) % 10) : "";
  const modSub = (x, y) => (x !== null && y !== null) ? String(((x - y) % 10 + 10) % 10) : "";

  // T2 (AF = n[0])
  const b2 = dig(n[0], 1), c2 = dig(n[0], 2), d2 = dig(n[0], 3), e2 = dig(n[0], 4);
  // T3 (AG = n[1])
  const b3 = dig(n[1], 1), c3 = dig(n[1], 2), d3 = dig(n[1], 3), e3 = dig(n[1], 4);
  // T4 (AH = n[2])
  const b4 = dig(n[2], 1), c4 = dig(n[2], 2), d4 = dig(n[2], 3), e4 = dig(n[2], 4);
  // T5 (AI = n[3])
  const b5 = dig(n[3], 1), c5 = dig(n[3], 2), d5 = dig(n[3], 3), e5 = dig(n[3], 4);
  // T6 (AJ = n[4])
  const b6 = dig(n[4], 1), c6 = dig(n[4], 2), d6 = dig(n[4], 3), e6 = dig(n[4], 4);
  // T7 (AK = n[5])
  const b7 = dig(n[5], 1), c7 = dig(n[5], 2), d7 = dig(n[5], 3), e7 = dig(n[5], 4);
  // CN (AL = n[6])
  const b8 = dig(n[6], 1), c8 = dig(n[6], 2), d8 = dig(n[6], 3), e8 = dig(n[6], 4);

  // Cộng dồn 7 ngày trong tuần (AT, AU, AV)
  const dList = [d2, d3, d4, d5, d6, d7, d8];
  const bList = [b2, b3, b4, b5, b6, b7, b8];
  const cList = [c2, c3, c4, c5, c6, c7, c8];

  const sumDigits = (arr) => arr.every(v => v !== null) ? String(arr.reduce((a, b) => a + b, 0) % 10) : "";

  // Pascal 7 ngày (BF..BZ) & Tổng 2 số Pascal (AX..BD)
  const pascals = n.map(x => computePascalChain(x));

  return {
    weekLabel: wk.label,
    // Nhóm 2: Tách số T2 -> CN (A..AE)
    A: modAdd(d2, e2), B: modSub(d2, e2),
    C: aux.c_g74, D: aux.d_g1, E: aux.e_bg1,
    F: b2 ?? "", G: c2 ?? "",
    H: c3 ?? "", I: modAdd(d3, e3), J: modSub(d3, e3), K: b3 ?? "",
    L: b4 ?? "", M: c4 ?? "", N: modAdd(d4, e4), O: modSub(d4, e4),
    P: b5 ?? "", Q: c5 ?? "", R: modAdd(e5, d5), S: modSub(e5, d5),
    T: b6 ?? "", U: c6 ?? "", V: modAdd(e6, d6), W: modSub(e6, d6),
    X: b7 ?? "", Y: c7 ?? "", Z: modAdd(e7, d7), AA: modSub(e7, d7),
    AB: b8 ?? "", AC: c8 ?? "", AD: modAdd(e8, d8), AE: modSub(e8, d8),
    // Nhóm 1: GĐB gốc T2 -> CN (AF..AL)
    AF: n[0] || "", AG: n[1] || "", AH: n[2] || "", AI: n[3] || "", AJ: n[4] || "", AK: n[5] || "", AL: n[6] || "",
    // Nhóm 3: Cầu chạm tuần (AM..AV)
    AM: c4 ?? "", AN: c7 ?? "", AO: c8 ?? "",
    AP: e5 !== null ? String((e5 + 1) % 10) : "",
    AQ: e6 !== null ? String(((e6 - 1) % 10 + 10) % 10) : "",
    AR: aux.ar_bg1t7, AS: aux.as_g71_g74,
    AT: sumDigits(dList), AU: sumDigits(bList), AV: sumDigits(cList),
    // Nhóm 5: Tổng 2 số Pascal (AX..BD)
    AX: pascals[0].sum2, AY: pascals[1].sum2, AZ: pascals[2].sum2,
    BA: pascals[3].sum2, BB: pascals[4].sum2, BC: pascals[5].sum2, BD: pascals[6].sum2,
    // Nhóm 4: Chi tiết Pascal 7 ngày (BF..BZ)
    pascals
  };
}


// ==================== TÍNH TOÁN TỰ ĐỘNG CÁC CỘT SOI CẦU SHEET 2 ('tính' CỘT AA -> BA) ====================
function getBo8So(twoDigits) {
  if (!twoDigits || twoDigits.length < 2) return "";
  const a = parseInt(twoDigits[0], 10);
  const b = parseInt(twoDigits[1], 10);
  const bong = (x) => (x + 5) % 10;
  const ba = bong(a), bb = bong(b);
  const set = new Set([
    `${a}${b}`, `${b}${a}`,
    `${a}${bb}`, `${bb}${a}`,
    `${ba}${b}`, `${b}${ba}`,
    `${ba}${bb}`, `${bb}${ba}`
  ]);
  return Array.from(set).sort().join(", ");
}

function computeTinhCauRow(wk, g1cnMap) {
  // wk.nums = [T2(AG), T3(AH), T4(AI), T5(AJ), T6(AK), T7(AL), CN(AM)]
  const n = wk.nums;
  const monGdb = n[0] || "";
  const g1cnVal = (g1cnMap && monGdb && g1cnMap[monGdb] !== undefined) ? g1cnMap[monGdb] : "";

  const dig = (s, idx) => (s && s.length > idx) ? parseInt(s[idx], 10) : null;
  const modAdd = (x, y) => (x !== null && y !== null) ? String((x + y) % 10) : "";

  // T2 (AG = n[0]): d=3, e=4
  const d2 = dig(n[0], 3), e2 = dig(n[0], 4);
  // T3 (AH = n[1]): b=1, c=2, d=3, e=4
  const b3 = dig(n[1], 1), c3 = dig(n[1], 2), d3 = dig(n[1], 3), e3 = dig(n[1], 4);
  // T4 (AI = n[2]): a=0
  const a4 = dig(n[2], 0);
  // T5 (AJ = n[3]): a=0, b=1, c=2, d=3, e=4
  const a5 = dig(n[3], 0), b5 = dig(n[3], 1), c5 = dig(n[3], 2), d5 = dig(n[3], 3), e5 = dig(n[3], 4);
  const mid3T5 = (n[3] && n[3].length >= 4) ? n[3].slice(1, 4) : "";
  const cdT5 = (n[3] && n[3].length >= 4) ? n[3].slice(2, 4) : "";
  const deT5 = (n[3] && n[3].length >= 5) ? n[3].slice(3, 5) : "";
  // T6 (AK = n[4]): c=2, d=3
  const c6 = dig(n[4], 2), d6 = dig(n[4], 3);
  // T7 (AL = n[5]): e=4
  const e7 = dig(n[5], 4);
  // CN (AM = n[6]): a=0
  const a8 = dig(n[6], 0);

  return {
    weekLabel: wk.label,
    AA: modAdd(d2, e2),       // tong (D+E)T2
    AB: mid3T5,               // Tổng(3N) T5 (bcd)
    AC: modAdd(c5, d5),       // tổng(C+D) T5
    AD: modAdd(d5, e5),       // tong(d+e) T5
    AE: modAdd(e7, a8),       // Tổng(eT7+aCN)
    AF: modAdd(e3, a4),       // cham e(T3)+a(T4)
    AG: n[0] || "", AH: n[1] || "", AI: n[2] || "", AJ: n[3] || "", AK: n[4] || "", AL: n[5] || "", AM: n[6] || "",
    AN: g1cnVal,              // chạm(a+b G1CN)
    AO: g1cnVal,              // tong(a+b G1CN)
    AP: c3 ?? "",             // tổng C(T3)
    AQ: modAdd(b3, c3),       // tong(b+c)T3
    AR: modAdd(c3, d3),       // tong(c+d)T3
    AS: cdT5,                 // tong (C&D) T5 (2 số cd)
    AT: modAdd(c6, d6),       // tong (C&D) T6
    AU: deT5,                 // bộ (de)T5
    AU_bo: getBo8So(deT5),    // dàn 8 số của bộ (de)T5
    AY: c5 ?? "",             // tong c T5
    AZ: c5 ?? "",             // Cham C T5
    BA: modAdd(a5, b5)        // chạm (a+b) db t5
  };
}


function getChamTongConfigs() {
  // Exact order & Max values from user's image (image_ea0fa3.png) + exact numbers from Excel Comments
  return [
    { name: "C1,T1", excelMax: 21, nums: ["01","10","11","12","21","13","31","14","41","15","51","16","61","17","71","18","81","19","91","29","92","38","83","47","74","56","65"] },
    { name: "C0,T0", excelMax: 23, nums: ["00","01","10","02","20","03","30","04","40","05","50","06","60","07","70","08","80","09","90","19","91","28","82","37","73","46","64","55"] },
    { name: "C2,T2", excelMax: 29, nums: ["02","20","12","21","22","23","32","24","42","25","52","26","62","27","72","28","82","29","92","11","66","39","93","48","84","57","75"] },
    { name: "C3,T3", excelMax: 26, nums: ["03","30","13","31","23","32","33","34","43","35","53","36","63","37","73","38","83","39","93","12","21","49","94","58","85","67","76"] },
    { name: "C4, T4", excelMax: 32, nums: ["04","40","14","41","24","42","34","43","44","45","54","46","64","47","74","48","84","49","94","13","31","22","59","95","68","86","77"] },
    { name: "C5, T5", excelMax: 37, nums: ["05","50","15","51","25","52","35","53","45","54","55","56","65","57","75","58","85","59","95","14","41","23","32","69","96","78","87"] },
    { name: "C6 ,T6", excelMax: 27, nums: ["06","60","16","61","26","62","36","63","46","64","56","65","66","67","76","68","86","69","96","15","51","24","42","33","88","79","97"] },
    { name: "C7, T7", excelMax: 21, nums: ["07","70","17","71","27","72","37","73","47","74","57","75","67","76","77","78","87","79","97","16","61","25","52","34","43","89","98"] },
    { name: "C8, T8", excelMax: 34, nums: ["08","80","18","81","28","82","38","83","48","84","58","85","68","86","78","87","88","89","98","17","71","26","62","35","53","44","99"] },
    { name: "C9, T9", excelMax: 27, nums: ["09","90","19","91","29","92","39","93","49","94","59","95","69","96","79","97","89","98","99","18","81","27","72","36","63","45","54"] }
  ];
}


function getImageF3F9A1Configs() {
  const all100 = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const hasCham = (s, d) => s[0] === String(d) || s[1] === String(d);
  const hasTong = (s, t) => ((+s[0] + +s[1]) % 10) === t;
  const bo8 = (two) => {
    const a = +two[0], b = +two[1], ba = (a + 5) % 10, bb = (b + 5) % 10;
    return Array.from(new Set([`${a}${b}`,`${b}${a}`,`${a}${bb}`,`${bb}${a}`,`${ba}${b}`,`${b}${ba}`,`${ba}${bb}`,`${bb}${ba}`]));
  };
  const kepBang = ["00","11","22","33","44","55","66","77","88","99"];

  const items = [
    // 1. Chạm 0..9 (BC-BE)
    ...[0,1,2,3,4,5,6,7,8,9].map((d, idx) => {
      const excelMaxArr = [41,40,41,33,41,50,35,40,43,43];
      return { subGroup: "Chạm 0-9 (BC-BE)", name: `Chạm ${d}`, excelMax: excelMaxArr[idx] || 40, nums: all100.filter(s => hasCham(s, d)) };
    }),
    // 2. Tổng 0..9 (BF-BG)
    ...[0,1,2,3,4,5,6,7,8,9].map((t, idx) => {
      const excelMaxArr = [54,72,85,78,63,59,69,55,68,92];
      return { subGroup: "Tổng 0-9 (BF-BG)", name: `Tổng ${t}`, excelMax: excelMaxArr[idx] || 75, nums: all100.filter(s => hasTong(s, t)) };
    }),
    // 3. Bộ 2 số (BH-BI): 02, 01, 03, 04, 12, 13, 14, 23, 24, 34
    ...[
      { b: "02", mx: 63 }, { b: "01", mx: 65 }, { b: "03", mx: 100 }, { b: "04", mx: 88 },
      { b: "12", mx: 83 }, { b: "13", mx: 83 }, { b: "14", mx: 76 }, { b: "23", mx: 100 },
      { b: "24", mx: 79 }, { b: "34", mx: 82 }
    ].map(x => ({ subGroup: "Bộ 8 số (BH-BI)", name: `Bộ ${x.b}`, excelMax: x.mx, nums: bo8(x.b) })),
    // 4. Kép bằng (BK-BM): 11, 00, 22, 33, 44
    ...[
      { k: "11", mx: 149 }, { k: "00", mx: 126 }, { k: "22", mx: 142 }, { k: "33", mx: 162 }, { k: "44", mx: 134 }
    ].map(x => ({ subGroup: "Kép bằng (BK-BM)", name: `Kép ${x.k}`, excelMax: x.mx, nums: [x.k] })),
    // 5. Các dàn riêng lẻ & dàn khối màu trong ảnh (BR-BT & BD-BM)
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn 17 (33..98) - Ảnh", excelMax: 17, nums: ["33","34","35","36","37","38","43","53","63","73","83","44","45","46","47","48","54","55","56","57","58","64","65","66","67","68","74","75","76","77","78","84","85","86","87","88","94","95","96","97","98"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn 18 (26..99) - Ảnh", excelMax: 18, nums: ["26","62","27","72","28","82","29","92","36","63","37","73","38","83","39","93","46","64","47","74","48","84","49","94","56","65","57","75","58","85","59","95","67","76","68","86","69","96","78","87","79","97","89","98","99"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Xanh Dương (50s) - Ảnh", excelMax: 25, nums: ["01","02","03","05","08","10","11","14","15","16","17","18","19","21","22","24","28","29","30","31","32","33","35","38","40","41","44","45","48","50","53","55","58","59","65","67","69","70","71","75","79","80","83","84","88","89","91","92","93","94"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Vàng (50s) - Ảnh", excelMax: 25, nums: ["00","04","06","07","09","12","13","20","23","25","26","27","34","36","37","39","42","43","46","47","49","51","52","54","56","57","60","61","62","63","64","66","68","72","73","74","76","77","78","81","82","85","86","87","90","95","96","97","98","99"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Hồng (Max 21 - 32s) - Ảnh", excelMax: 21, nums: ["06","07","08","09","16","17","18","19","23","24","25","26","33","34","35","36","56","57","58","59","66","67","68","69","73","74","75","76","83","84","85","86"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Đỏ (Max 19 - 30s) - Ảnh", excelMax: 19, nums: ["03","13","23","33","43","53","63","73","83","93","05","15","25","35","45","55","65","75","85","95","07","17","27","37","47","57","67","77","87","97"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Tím (60s) - Ảnh", excelMax: 20, nums: ["04","06","07","12","13","18","23","25","26","28","35","37","46","47","53","58","60","66","69","70","79","80","83","94","95","98"] },
    // 6. Các bộ 5 số / dàn cột BR-BT
    ...[
      { n: "Dàn BR-1 (03..83)", mx: 25, nums: ["03","23","43","63","83"] },
      { n: "Dàn BR-2 (01..81)", mx: 40, nums: ["01","21","41","61","81"] },
      { n: "Dàn BR-3 (05..85)", mx: 65, nums: ["05","25","45","65","85"] },
      { n: "Dàn BR-4 (07..87)", mx: 25, nums: ["07","27","47","67","87"] },
      { n: "Dàn BR-5 (09..89)", mx: 25, nums: ["09","29","49","69","89"] },
      { n: "Dàn BR-6 (10..90)", mx: 25, nums: ["10","30","50","70","90"] },
      { n: "Dàn BR-7 (12..92)", mx: 40, nums: ["12","32","52","72","92"] },
      { n: "Dàn BR-8 (14..94)", mx: 25, nums: ["14","34","54","74","94"] },
      { n: "Dàn BR-9 (16..96)", mx: 25, nums: ["16","36","56","76","96"] },
      { n: "Dàn BR-10 (18..98)", mx: 50, nums: ["18","38","58","78","98"] },
      { n: "Dàn BR-11 (11..19)", mx: 25, nums: ["11","13","15","17","19"] },
      { n: "Dàn BR-12 (31..39)", mx: 25, nums: ["31","33","35","37","39"] },
      { n: "Dàn BR-13 (51..59)", mx: 25, nums: ["51","53","55","57","59"] },
      { n: "Dàn BR-14 (71..79)", mx: 25, nums: ["71","73","75","77","79"] },
      { n: "Dàn BR-15 (91..99)", mx: 25, nums: ["91","93","95","97","99"] },
      { n: "Dàn BR-16 (00..08)", mx: 25, nums: ["00","02","04","06","08"] },
      { n: "Dàn BR-17 (20..28)", mx: 25, nums: ["20","22","24","26","28"] },
      { n: "Dàn BR-18 (40..48)", mx: 70, nums: ["40","42","44","46","48"] },
      { n: "Dàn BR-19 (60..68)", mx: 25, nums: ["60","62","64","66","68"] },
      { n: "Dàn BR-20 (80..88)", mx: 25, nums: ["80","82","84","86","88"] }
    ].map(x => ({ subGroup: "Nhóm Dàn BR-BT (Ảnh)", name: x.n, excelMax: x.mx, nums: x.nums }))
  ];

  // Detect duplicate sets (dàn có cùng tập hợp số hoặc trùng hoàn toàn với dàn khác)
  const seenSignatures = new Map();
  items.forEach(it => {
    const sig = Array.from(new Set(it.nums)).sort().join(",");
    if (seenSignatures.has(sig)) {
      it.dupOf = seenSignatures.get(sig);
    } else {
      seenSignatures.set(sig, it.name);
    }
  });
  return items;
}
