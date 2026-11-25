
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


/* ===================== CHUẨN HÓA DỮ LIỆU (giống update_xsmb.py) ===================== */
const FIVE_RE = /^\d{5}$/;
const DUP_WINDOW_DAYS = 16;

function toVNDateStr(s) {
  s = String(s == null ? "" : s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`;
  return null;
}
function extractPrizes(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    if (Array.isArray(v.prizes)) return v.prizes;
    if (v.db) return [v.db, v.g1, ...(v.g2 || []), ...(v.g3 || [])];
  }
  return null;
}
/* daily_prizes: list {date,prizes} | dict {ngày: [...] | {prizes:[...]}} -> list sắp theo thời gian */
function normalizeDailyPrizes(raw) {
  const out = new Map();
  const put = (date, prizes) => {
    const d = toVNDateStr(date);
    if (!d || !Array.isArray(prizes) || !prizes.length) return;
    const p = prizes.map(x => String(x == null ? "" : x));
    if (FIVE_RE.test(p[0])) out.set(d, p);
  };
  if (Array.isArray(raw)) {
    raw.forEach(it => {
      if (Array.isArray(it) && it.length === 2) put(it[0], extractPrizes(it[1]));
      else if (it && typeof it === "object") put(it.date, extractPrizes(it));
    });
  } else if (raw && typeof raw === "object") {
    Object.entries(raw).forEach(([k, v]) => put(k, extractPrizes(v)));
  }
  return Array.from(out, ([date, prizes]) => ({ date, prizes }))
    .sort((a, b) => parseVNDate(a.date) - parseVNDate(b.date));
}

function _weekItems(raw, baseMon) {
  const items = [];
  if (raw && !Array.isArray(raw) && typeof raw === "object") {
    Object.entries(raw).forEach(([k, v]) => {
      const ds = toVNDateStr(k), nums = Array.isArray(v) ? v : (v && v.nums);
      if (ds && Array.isArray(nums)) items.push([parseVNDate(ds), nums]);
    });
    return items;
  }
  (raw || []).forEach((wk, idx) => {
    if (Array.isArray(wk)) {
      const dt = new Date(baseMon); dt.setDate(baseMon.getDate() - 7 * idx);
      items.push([dt, wk]);
    } else if (wk && wk.monday && toVNDateStr(wk.monday)) {
      items.push([parseVNDate(toVNDateStr(wk.monday)), wk.nums || []]);
    }
  });
  return items;
}

/* Trả về danh sách tuần (mới -> cũ), mỗi tuần {monday, mDt, label, nums[7]} */
function getNormalizedWeeks(rawWeeks) {
  const daily = (typeof globalData !== "undefined" && globalData) ? normalizeDailyPrizes(globalData.daily_prizes) : [];
  const dayKey = dt => formatVNDate(dt);
  let baseMon = new Date(2026, 10, 23);
  if (daily.length) {
    const nd = parseVNDate(daily[daily.length - 1].date);
    baseMon = new Date(nd); baseMon.setDate(nd.getDate() - ((nd.getDay() + 6) % 7));
  }
  const byMon = new Map(); // key dd/mm/yyyy của Thứ 2 -> {mDt, nums}
  _weekItems(rawWeeks, baseMon).forEach(([mon0, nums]) => {
    const mon = new Date(mon0); mon.setDate(mon0.getDate() - ((mon0.getDay() + 6) % 7));
    const k = dayKey(mon);
    if (!byMon.has(k)) byMon.set(k, { mDt: mon, nums: ["", "", "", "", "", "", ""] });
    const cur = byMon.get(k).nums;
    for (let i = 0; i < 7; i++) {
      const c = String((nums || [])[i] == null ? "" : nums[i]).trim();
      if (FIVE_RE.test(c) && !cur[i]) cur[i] = c;
    }
  });
  if (!byMon.size && !daily.length) return [];

  // ô giữ chỗ "00000" (>= 2 lần trong 1 tuần) -> để trống
  byMon.forEach(w => {
    if (w.nums.filter(c => c === "00000").length >= 2) w.nums = w.nums.map(c => (c === "00000" ? "" : c));
  });

  // daily_prizes là nguồn đúng nhất
  const verified = new Set();
  daily.forEach(e => {
    const dt = parseVNDate(e.date);
    const mon = new Date(dt); mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    const k = dayKey(mon);
    if (!byMon.has(k)) byMon.set(k, { mDt: mon, nums: ["", "", "", "", "", "", ""] });
    byMon.get(k).nums[(dt.getDay() + 6) % 7] = e.prizes[0];
    verified.add(e.date);
  });

  // lấp tuần trống để chuỗi tuần liên tục
  const mons = Array.from(byMon.values()).map(w => w.mDt.getTime());
  const newest = Math.max(...mons), oldest = Math.min(...mons);
  for (let t = new Date(oldest); t.getTime() <= newest; t.setDate(t.getDate() + 7)) {
    const k = dayKey(t);
    if (!byMon.has(k)) byMon.set(k, { mDt: new Date(t), nums: ["", "", "", "", "", "", ""] });
  }

  // ô trùng hệt trong cửa sổ <= 16 ngày: xóa ô CŨ HƠN (trừ khi đã được daily xác nhận)
  const cells = [];
  byMon.forEach(w => w.nums.forEach((c, i) => {
    if (c) { const dt = new Date(w.mDt); dt.setDate(w.mDt.getDate() + i); cells.push({ dt, w, i, c }); }
  }));
  cells.sort((a, b) => a.dt - b.dt);
  const removed = [];
  for (let a = 0; a < cells.length; a++) {
    for (let b = a + 1; b < cells.length; b++) {
      const A = cells[a], B = cells[b];
      if (Math.round((B.dt - A.dt) / 86400000) > DUP_WINDOW_DAYS) break;
      if (A.c !== B.c || !A.w.nums[A.i] || !B.w.nums[B.i]) continue;
      const va = verified.has(dayKey(A.dt)), vb = verified.has(dayKey(B.dt));
      if (va && vb) continue;
      const t = (va && !vb) ? B : A;
      t.w.nums[t.i] = "";
      removed.push(`${dayKey(t.dt)}: xóa ${t.c} (trùng hệt ngày ${dayKey(t === A ? B.dt : A.dt)})`);
    }
  }
  if (removed.length && typeof console !== "undefined") console.info("Làm sạch tuần:", removed);

  return Array.from(byMon.values()).map(w => {
    const sDt = new Date(w.mDt); sDt.setDate(w.mDt.getDate() + 6);
    return {
      monday: formatVNDate(w.mDt), mDt: w.mDt,
      label: `${formatShortDate(w.mDt)} - ${formatVNDate(sDt)}`,
      nums: w.nums
    };
  }).sort((a, b) => b.mDt - a.mDt);
}

/* Chỉ mục ngày -> GĐB để đối chiếu 7 ngày liên tiếp theo LỊCH */
const _dayIdxCache = new WeakMap();
function buildDayIndex(allWeeks) {
  let c = _dayIdxCache.get(allWeeks);
  if (c) return c;
  const map = new Map(); let latest = null;
  allWeeks.forEach(wk => {
    for (let d = 0; d < 7; d++) {
      const v = wk.nums[d];
      if (v && FIVE_RE.test(v)) {
        const dt = new Date(wk.mDt); dt.setDate(wk.mDt.getDate() + d);
        map.set(formatVNDate(dt), v);
        if (!latest || dt > latest) latest = dt;
      }
    }
  });
  c = { map, latest };
  _dayIdxCache.set(allWeeks, c);
  return c;
}

/* 7 ngày liên tiếp NGAY SAU ngày (wIdx,dIdx): từ D+1 đến D+7.
   hasFull7 = cả 7 ngày đó đã trôi qua (D+7 <= ngày mới nhất có KQ). Ngày nghỉ quay (Tết) không có số thì bỏ qua. */
function getNext7ConsecutiveDaysStats(allWeeks, wIdx, dIdx) {
  const { map, latest } = buildDayIndex(allWeeks);
  const sumsSet = new Set(), chamSet = new Set(), daysDetail = [];
  const base = new Date(allWeeks[wIdx].mDt); base.setDate(base.getDate() + dIdx);
  const end = new Date(base); end.setDate(base.getDate() + 7);
  const hasFull7 = !!latest && end <= latest;
  for (let k = 1; k <= 7; k++) {
    const dt = new Date(base); dt.setDate(base.getDate() + k);
    if (!latest || dt > latest) break;
    const num = map.get(formatVNDate(dt));
    if (!num) continue;
    const d1 = parseInt(num[3], 10), d2 = parseInt(num[4], 10), s = (d1 + d2) % 10;
    sumsSet.add(s); chamSet.add(d1); chamSet.add(d2);
    daysDetail.push(`${formatShortDate(dt)}:${num.slice(-2)}(T${s})`);
  }
  return { count: daysDetail.length, hasFull7, sumsSet, chamSet, daysDetail };
}


/* Giải phụ lấy theo NGÀY từ data.daily_aux (do update_xsmb.py tự bù toàn bộ lịch sử). */
function auxOfDay(mDt, offset) {
  const dt = new Date(mDt); dt.setDate(mDt.getDate() + offset);
  const m = (typeof globalData !== "undefined" && globalData && globalData.daily_aux) || {};
  const r = m[formatVNDate(dt)];
  return (r && typeof r.g1 === "string" && r.g1.length >= 5 && Array.isArray(r.g7)) ? r : null;
}
function auxCols(wk) {
  const out = {};
  const mon = auxOfDay(wk.mDt, 0), sat = auxOfDay(wk.mDt, 5), sun = auxOfDay(wk.mDt, 6);
  const dg = (s, i) => parseInt(s[i], 10);
  if (mon && wk.nums[0]) {
    if (mon.g7[3] && mon.g7[3].length >= 2) out.c_g74 = String((dg(mon.g7[3], 0) + dg(mon.g7[3], 1)) % 10);
    out.d_g1 = String((dg(mon.g1, 3) + dg(mon.g1, 4)) % 10);
    out.e_bg1 = mon.g1[1];
  }
  if (sat && wk.nums[5]) {
    out.ar_bg1t7 = sat.g1[1];
    if (sat.g7[0] && sat.g7[3] && sat.g7[0].length >= 2 && sat.g7[3].length >= 2)
      out.as_g71_g74 = String((dg(sat.g7[0], 1) + dg(sat.g7[3], 0)) % 10);
  }
  if (sun && wk.nums[6]) out.g1cn = String((dg(sun.g1, 0) + dg(sun.g1, 1)) % 10);
  return out;
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
  // histGDB: chỉ gồm các ngày CÓ kết quả (ngày trống không được đếm), thứ tự cũ -> mới.
  let curStreak = 0, maxClosedStreak = 0, seenFirstHit = false;
  let streakStartDate = "", maxSpan = "";
  let lastHitDate = "Chưa thấy", lastHitDe = "--", hits = 0;
  for (let i = 0; i < histGDB.length; i++) {
    const item = histGDB[i];
    if (!item || !item.de || !/^\d{2}$/.test(item.de)) continue;
    if (targetSet.has(item.de)) {
      // Max thực tế = chu kỳ ĐÃ VỀ (mốc về trước -> lần về sau). Đoạn gan đầu lịch sử (chưa có mốc mở)
      // và chuỗi gan hiện tại (chưa về) KHÔNG được tính.
      if (seenFirstHit && curStreak >= maxClosedStreak) {
        maxClosedStreak = curStreak;
        maxSpan = `${streakStartDate} → ${item.date} (về ${item.de})`;
      }
      seenFirstHit = true;
      curStreak = 0;
      streakStartDate = item.date;
      lastHitDate = item.date;
      lastHitDe = item.de;
      hits++;
    } else {
      curStreak++;
    }
  }
  return { daysSince: curStreak, lastHitDate, lastHitDe, maxObserved: maxClosedStreak, maxSpan, hits };
}

/* Đánh giá 1 dàn: Max hiệu lực = max(Max chuẩn/tham chiếu, Max thực tế của các chu kỳ đã về).
   Chuỗi gan hiện tại KHÔNG bao giờ làm tăng Max. level: hit | max | watch | normal */
const WATCH_RATIO = 0.72;


function getCustomDans() {
  try {
    const a = JSON.parse(localStorage.getItem("thongke_custom_dans") || "[]");
    const b = JSON.parse(localStorage.getItem("xsmb_custom_dans_v1") || "[]");
    const merged = Array.isArray(a) ? a.slice() : [];
    if (Array.isArray(b) && b.length && !merged.length) return b;
    return merged;
  } catch (e) { return []; }
}
function saveCustomDans(list) {
  localStorage.setItem("thongke_custom_dans", JSON.stringify(list));
}



function computeNextDayKepDDEE(histGDB) {
  let curStreak = 0;
  let maxPureGap = 0;
  let maxInclHit = 0;
  let maxSpan = "Chưa đủ 2 lần về";
  let streakStartDate = histGDB.length ? histGDB[0].date : "";
  let seenFirstHit = false;
  let lastHitDate = "Chưa thấy";
  let lastHitDe = "--";
  let lastHitPrevInfo = "";
  const rows = [];

  for (let i = 0; i < histGDB.length; i++) {
    const cur = histGDB[i];
    if (!cur || !cur.db || !/^\d{5}$/.test(cur.db)) continue;
    const dChar = cur.db[3];
    const eChar = cur.db[4];
    const dd = dChar + dChar;
    const ee = eChar + eChar;
    const targets = dd === ee ? [dd] : [dd, ee];

    const next = i + 1 < histGDB.length ? histGDB[i + 1] : null;
    if (!next || !next.de || !/^\d{2}$/.test(next.de)) {
      rows.push({
        date: cur.date,
        db: cur.db,
        de: cur.de,
        targets,
        pending: true,
        nextDate: "",
        nextDb: "",
        nextDe: "",
        hit: false,
        streakAfter: curStreak
      });
      continue;
    }

    const hit = targets.includes(next.de);
    if (hit) {
      if (seenFirstHit) {
        if (curStreak > maxPureGap) maxPureGap = curStreak;
        const incl = curStreak + 1;
        if (incl >= maxInclHit) {
          maxInclHit = incl;
          maxSpan = `${streakStartDate} → ${next.date} (về ${next.de})`;
        }
      }
      seenFirstHit = true;
      curStreak = 0;
      streakStartDate = next.date;
      lastHitDate = next.date;
      lastHitDe = next.de;
      lastHitPrevInfo = `từ ĐB ${cur.db} (${cur.date})`;
    } else {
      curStreak++;
    }

    rows.push({
      date: cur.date,
      db: cur.db,
      de: cur.de,
      targets,
      pending: false,
      nextDate: next.date,
      nextDb: next.db,
      nextDe: next.de,
      hit,
      streakAfter: curStreak
    });
  }

  const latestRow = rows.length ? rows[rows.length - 1] : null;
  return {
    daysSince: curStreak,
    maxPureGap,
    maxInclHit,
    maxSpan,
    lastHitDate,
    lastHitDe,
    lastHitPrevInfo,
    latestTargets: latestRow ? latestRow.targets : [],
    latestDb: latestRow ? latestRow.db : "",
    latestDate: latestRow ? latestRow.date : "",
    rows
  };
}

function computeMketquaCycle(histGDB, nums) {
  const targetSet = new Set(nums);
  let curMiss = 0;
  let streakStartDate = histGDB.length ? histGDB[0].date : "";
  let seenFirstHit = false;
  let maxInclHit = 0;
  let maxInclSpan = "Chưa đủ 2 lần về";
  let maxPureGap = 0;
  let lastHitDate = "Chưa thấy";
  let lastHitDe = "--";
  let lastHitDb = "";

  for (let i = 0; i < histGDB.length; i++) {
    const it = histGDB[i];
    if (!it || !it.de || !/^\d{2}$/.test(it.de)) continue;
    if (targetSet.has(it.de)) {
      if (seenFirstHit) {
        if (curMiss > maxPureGap) maxPureGap = curMiss;
        const inclCount = curMiss + 1;
        if (inclCount >= maxInclHit) {
          maxInclHit = inclCount;
          maxInclSpan = `${streakStartDate} → ${it.date} (về ${it.de})`;
        }
      }
      seenFirstHit = true;
      curMiss = 0;
      streakStartDate = it.date;
      lastHitDate = it.date;
      lastHitDe = it.de;
      lastHitDb = it.db || "";
    } else {
      curMiss++;
    }
  }

  return {
    daysSince: curMiss,
    maxInclHit,
    maxInclSpan,
    maxPureGap,
    lastHitDate,
    lastHitDe,
    lastHitDb
  };
}

function analyzeDanCyclesInRange(histGDB, nums, fromDateISO, toDateISO) {
  const targetSet = new Set(nums);
  const fromDt = fromDateISO ? new Date(fromDateISO + "T00:00:00") : null;
  const toDt = toDateISO ? new Date(toDateISO + "T23:59:59") : null;

  const filtered = histGDB.filter(item => {
    if (!item || !item.de || !/^\d{2}$/.test(item.de)) return false;
    if (!fromDt && !toDt) return true;
    const d = parseVNDate(item.date);
    if (fromDt && d < fromDt) return false;
    if (toDt && d > toDt) return false;
    return true;
  });

  let curStreak = 0;
  let streakStartDate = filtered.length ? filtered[0].date : "";
  let seenFirstHit = false;
  let maxClosed = 0;
  let maxSpan = "Chưa đủ 2 lần về";
  let lastHitDate = "Chưa thấy";
  let lastHitDe = "--";
  let hitCount = 0;
  const closedCycles = [];
  const hitRecords = [];

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    if (targetSet.has(item.de)) {
      if (seenFirstHit) {
        closedCycles.push({
          days: curStreak,
          from: streakStartDate,
          to: item.date,
          de: item.de
        });
        if (curStreak >= maxClosed) {
          maxClosed = curStreak;
          maxSpan = `${streakStartDate} → ${item.date} (về ${item.de})`;
        }
      }
      seenFirstHit = true;
      curStreak = 0;
      streakStartDate = item.date;
      lastHitDate = item.date;
      lastHitDe = item.de;
      hitCount++;
      hitRecords.push({ date: item.date, db: item.db, de: item.de });
    } else {
      curStreak++;
    }
  }

  closedCycles.sort((a, b) => b.days - a.days);
  return {
    totalDays: filtered.length,
    fromDate: filtered.length ? filtered[0].date : "",
    toDate: filtered.length ? filtered[filtered.length - 1].date : "",
    daysSince: curStreak,
    maxClosed,
    maxSpan,
    lastHitDate,
    lastHitDe,
    hitCount,
    topCycles: closedCycles.slice(0, 5),
    recentHits: hitRecords.slice(-15).reverse()
  };
}

function evaluateDan(histGDB, nums, referenceMax) {
  const st = computeDanStats(histGDB, new Set(nums));
  const mk = computeMketquaCycle(histGDB, nums);
  const ref = Number(referenceMax) || 0;
  // Áp dụng chuẩn chu kỳ (kể cả ngày về: curMiss + 1) cho toàn bộ các dàn trên web
  const realMax = mk.maxInclHit > 0 ? mk.maxInclHit : (st.maxObserved > 0 ? st.maxObserved : ref);
  const effMax = realMax;
  const maxSpan = mk.maxInclHit > 0 ? mk.maxInclSpan : (st.maxSpan || "");
  const gan = mk.daysSince;
  let level = "normal";
  if (gan === 0) level = "hit";
  else if (realMax > 0 && gan >= realMax) level = "max";
  else if (realMax > 0 && gan >= Math.floor(realMax * WATCH_RATIO)) level = "watch";
  return {
    ...st,
    ...mk,
    maxSpan,
    gan,
    ref,
    realMax,
    effMax,
    level,
    over: realMax > 0 ? Math.max(0, gan - realMax) : 0
  };
}
const DAN_LEVEL = {
  hit:    { cls: "bg-green",     badge: "st-hit",    text: "Vừa về" },
  max:    { cls: "bg-red-alert", badge: "st-max",    text: "Vượt/Chạm Max!" },
  watch:  { cls: "bg-yellow",    badge: "st-watch",  text: "Sắp chạm Max" },
  normal: { cls: "",             badge: "st-normal", text: "Đang theo dõi" }
};

/* Ghép 2 số ĐB→G3-6 đối chiếu 2 số cuối GĐB NGÀY HÔM SAU (đúng ngày lịch liền kề). */
function buildGhepRows(dailyRaw) {
  const daily = normalizeDailyPrizes(dailyRaw).filter(e => e.prizes.length >= 10);
  const byDate = new Map(daily.map(e => [e.date, e]));
  const streaks = Array(10).fill(0), rows = [];
  daily.forEach((row, i) => {
    const dt = parseVNDate(row.date); const nx = new Date(dt); nx.setDate(dt.getDate() + 1);
    const nextRec = byDate.get(formatVNDate(nx));
    const prizes = row.prizes.slice(0, 10);
    const isLast = i === daily.length - 1;
    if (nextRec) {
      const nextDb = nextRec.prizes[0], nextDe = nextDb.slice(-2);
      const cells = prizes.map((p, idx) => {
        if (canForm2Digit(p, nextDe)) { streaks[idx] = 0; return { p, hit: true, streak: 0 }; }
        streaks[idx]++; return { p, hit: false, streak: streaks[idx] };
      });
      rows.push({ date: row.date, wd: getWeekdayName(dt), nextDb, nextDe, cells, pending: false });
    } else {
      rows.push({ date: row.date, wd: getWeekdayName(dt), nextDb: "", nextDe: "", pending: true, missing: !isLast,
        cells: prizes.map((p, idx) => ({ p, hit: false, streak: streaks[idx] })) });
    }
  });
  return { rows, streaks: streaks.slice() };
}

function getBoKep4SoConfigs() {
  return [
    { name: "Bộ 00 (4 số)", excelMax: 126, nums: ["00", "05", "50", "55"] },
    { name: "Bộ 11 (4 số)", excelMax: 149, nums: ["11", "16", "61", "66"] },
    { name: "Bộ 22 (4 số)", excelMax: 142, nums: ["22", "27", "72", "77"] },
    { name: "Bộ 33 (4 số)", excelMax: 162, nums: ["33", "38", "83", "88"] },
    { name: "Bộ 44 (4 số)", excelMax: 134, nums: ["44", "49", "94", "99"] }
  ];
}

function getDanConfigs() {
  const dan65 = ["00","03","04","06","09","10","11","13","14","16","19","22","23","24","26","29","30","31","32","33","34","37","38","39","40","42","43","44","45","46","48","49","50","51","52","53","54","57","59","60","63","64","65","66","67","68","69","70","71","72","73","74","75","76","81","82","84","85","86","88","89","91","96","97","99"];
  const danDan = ["02","14","26","38","50","62","74","86","98"];
  const danDau = ["09","21","33","45","57","69","81","93"];
  const danTy  = ["00","12","24","36","48","60","72","84","96"];
  const danTi  = ["05","17","29","41","53","65","77","89"];

  return [
    { group: "Dàn trong ảnh", short: "65 số", name: "Dàn 65 số cố định", count: 65, nums: dan65, excelMax: 12 },
    { group: "Dàn trong ảnh", short: "Dần (9s)", name: "Con giáp: Dần (9s)", count: danDan.length, nums: danDan, excelMax: 45 },
    { group: "Dàn trong ảnh", short: "Dậu (8s)", name: "Con giáp: Dậu (8s)", count: danDau.length, nums: danDau, excelMax: 50 },
    { group: "Dàn trong ảnh", short: "Tý (9s)", name: "Con giáp: Tý (9s)", count: danTy.length, nums: danTy, excelMax: 45 },
    { group: "Dàn trong ảnh", short: "Tị (8s)", name: "Con giáp: Tị (8s)", count: danTi.length, nums: danTi, excelMax: 50 },
    { group: "Chú thích Cột T", short: "T3 (24s)", name: "Cột T3 (24s - Chú thích)", count: 24, nums: ["12","21","18","81","23","32","27","72","28","82","29","92","37","73","38","83","39","93","78","87","79","97","89","98"], excelMax: 35 },
    { group: "Chú thích Cột T", short: "T5 (26s)", name: "Cột T5 (26s - Chú thích)", count: 26, nums: ["00","02","09","12","14","17","24","26","33","36","38","45","48","50","57","60","62","65","72","77","81","84","86","93","96","98"], excelMax: 21 },
    { group: "Chú thích Cột T", short: "T7 (34s)", name: "Cột T7: Dần Dậu Tí Tỵ (34s - Chú thích)", count: 34, nums: ["00","02","05","09","12","14","17","21","24","26","29","33","36","38","41","45","48","50","53","57","60","62","65","69","72","74","77","81","84","86","89","93","96","98"], excelMax: 20 },
    { group: "Chú thích Cột T", short: "T10 (30s)", name: "Cột T10: Hiệu=0,=1 (30s - Chú thích)", count: 30, nums: ["00","11","22","33","44","55","66","77","88","99","01","10","12","21","23","32","34","43","45","54","56","65","67","76","78","87","89","98","09","90"], excelMax: 20 },
    { group: "Chú thích Cột T", short: "T12 (34s)", name: "Cột T12: Chia hết cho 3 (34s - Chú thích)", count: 34, nums: ["00","03","06","09","12","15","18","21","24","27","30","33","36","39","42","45","48","51","54","57","60","63","66","69","72","75","78","81","84","87","90","93","96","99"], excelMax: 19 },
    { group: "Chú thích Cột T", short: "T14 (33s)", name: "Cột T14: Chia 3 dư 2 (33s - Chú thích)", count: 33, nums: ["02","05","08","11","14","17","20","23","26","29","32","35","38","41","44","47","50","53","56","59","62","65","68","71","74","77","80","83","86","89","92","95","98"], excelMax: 27 },
    { group: "Chú thích Cột T", short: "T16 (33s)", name: "Cột T16: Chia 3 dư 1 (33s - Chú thích)", count: 33, nums: ["01","04","07","10","13","16","19","22","25","28","31","34","37","40","43","46","49","52","55","58","61","64","67","70","73","76","79","82","85","88","91","94","97"], excelMax: 22 },
    { group: "Chú thích Cột T", short: "T18 (36s)", name: "Cột T18: Dàn từ 0-5 (36s - Ghép chữ số 0..5)", count: 36, nums: ["00","01","02","03","04","05","10","11","12","13","14","15","20","21","22","23","24","25","30","31","32","33","34","35","40","41","42","43","44","45","50","51","52","53","54","55"], excelMax: 21 },
    { group: "Chú thích Cột T", short: "T20 (36s)", name: "Cột T20: Dàn từ 1-6 (36s - Ghép chữ số 1..6)", count: 36, nums: ["11","12","13","14","15","16","21","22","23","24","25","26","31","32","33","34","35","36","41","42","43","44","45","46","51","52","53","54","55","56","61","62","63","64","65","66"], excelMax: 18 },
    { group: "Chú thích Cột T", short: "T22 (36s)", name: "Cột T22: Dàn từ 2-7 (36s - Ghép chữ số 2..7)", count: 36, nums: ["22","23","24","25","26","27","32","33","34","35","36","37","42","43","44","45","46","47","52","53","54","55","56","57","62","63","64","65","66","67","72","73","74","75","76","77"], excelMax: 21 },
    { group: "Chú thích Cột T", short: "T24 (36s)", name: "Cột T24: Dàn từ 3-8 (36s - Ghép chữ số 3..8)", count: 36, nums: ["33","34","35","36","37","38","43","44","45","46","47","48","53","54","55","56","57","58","63","64","65","66","67","68","73","74","75","76","77","78","83","84","85","86","87","88"], excelMax: 17 },
    { group: "Chú thích Cột T", short: "T25 (36s)", name: "Cột T25: Dàn từ 4-9 (36s - Ghép chữ số 4..9)", count: 36, nums: ["44","45","46","47","48","49","54","55","56","57","58","59","64","65","66","67","68","69","74","75","76","77","78","79","84","85","86","87","88","89","94","95","96","97","98","99"], excelMax: 17 },
    { group: "Chú thích Cột T", short: "T27 (25s)", name: "Cột T27: Chẵn Chẵn (25s - Chú thích)", count: 25, nums: ["00","22","44","66","88","02","20","04","40","06","60","08","80","24","42","26","62","28","82","46","64","48","84","68","86"], excelMax: 36 },
    { group: "Chú thích Cột T", short: "T29 (25s)", name: "Cột T29: Lẻ Lẻ (25s - Chú thích)", count: 25, nums: ["11","33","55","77","99","13","31","15","51","17","71","19","91","35","53","37","73","39","93","57","75","59","95","79","97"], excelMax: 31 },
    { group: "Chú thích Cột T", short: "T31 (25s)", name: "Cột T31: Chẵn Lẻ (25s - Chú thích)", count: 25, nums: ["01","03","05","07","09","21","23","25","27","29","41","43","45","47","49","61","63","65","67","69","81","83","85","87","89"], excelMax: 32 },
    { group: "Chú thích Cột T", short: "T33 (25s)", name: "Cột T33: Lẻ Chẵn (25s - Chú thích)", count: 25, nums: ["10","12","14","16","18","30","32","34","36","38","50","52","54","56","58","70","72","74","76","78","90","92","94","96","98"], excelMax: 30 },
    { group: "Chú thích Cột T", short: "T35 (25s)", name: "Cột T35: Nhỏ Nhỏ (25s - Chú thích)", count: 25, nums: ["00","11","22","33","44","01","10","02","20","03","30","04","40","12","21","13","31","14","41","23","32","24","42","34","43"], excelMax: 26 },
    { group: "Chú thích Cột T", short: "T37 (25s)", name: "Cột T37: To To (25s - Chú thích)", count: 25, nums: ["55","66","77","88","99","56","65","57","75","58","85","59","95","67","76","68","86","69","96","78","87","79","97","89","98"], excelMax: 26 },
    { group: "Chú thích Cột T", short: "T39 (25s)", name: "Cột T39: Nhỏ To (25s - Chú thích)", count: 25, nums: ["05","06","07","08","09","15","16","17","18","19","25","26","27","28","29","35","36","37","38","39","45","46","47","48","49"], excelMax: 26 },
    { group: "Chú thích Cột T", short: "T41 (25s)", name: "Cột T41: To Nhỏ (25s - Chú thích)", count: 25, nums: ["90","91","92","93","94","80","81","82","83","84","70","71","72","73","74","60","61","62","63","64","50","51","52","53","54"], excelMax: 26 },
    { group: "Chú thích Cột T", short: "T43 (50s)", name: "Cột T43: Dàn 50 số (Chú thích)", count: 50, nums: ["50","01","02","03","05","08","10","11","14","15","16","17","18","19","21","22","24","28","29","30","31","32","33","35","38","40","41","44","45","48","53","55","58","59","65","67","69","70","71","75","79","80","83","84","88","89","91","92","93","94"], excelMax: 15 },
    { group: "Chú thích Cột T", short: "T44 (44s)", name: "Cột T44: Dàn 44 số (Chú thích)", count: 44, nums: ["02","05","08","10","11","14","15","16","17","21","22","24","29","30","31","32","33","35","40","41","43","44","45","48","49","50","53","59","63","65","67","68","75","77","79","80","88","89","90","91","92","93","97","99"], excelMax: 16 }
  ];
}

function getLichNuoiThang(histGDB, refYear, refMonth) {
  const all100 = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
  const hasT = (s, t) => ((+s[0] + +s[1]) % 10) === t;
  const fallbackPool = {
    "T4-9 (8→14)": { short: "T4-9 (8→14)", name: "Từ ngày 8–14 nuôi Tổng 4-9", nums: all100.filter(s => hasT(s, 4) || hasT(s, 9)), excelMax: 17 },
    "2 Kép (15→22)": { short: "2 Kép (15→22)", name: "Từ ngày 15–22 nuôi 2 Kép", nums: ["00","11","22","33","44","55","66","77","88","99","05","50","16","61","27","72","38","83","49","94"], excelMax: 20 },
    "T1-6 (26→hết)": { short: "T1-6 (26→hết)", name: "Từ ngày 26–hết tháng nuôi Tổng 1-6", nums: all100.filter(s => hasT(s, 1) || hasT(s, 6)), excelMax: 18 }
  };
  Object.keys(fallbackPool).forEach(k => { fallbackPool[k].count = fallbackPool[k].nums.length; });
  const byShort = { ...fallbackPool };
  getDanConfigs().forEach(c => { byShort[c.short] = c; });

  // Tìm GĐB ngày mùng 4 của tháng (ưu tiên tháng đang xét, nếu chưa có thì tìm mùng 4 gần nhất)
  let d04Item = null;
  if (Array.isArray(histGDB) && histGDB.length) {
    if (refYear && refMonth) {
      d04Item = histGDB.find(it => it.dt && it.dt.getFullYear() === refYear && (it.dt.getMonth() + 1) === refMonth && it.dt.getDate() === 4) || null;
    }
    if (!d04Item) {
      for (let i = histGDB.length - 1; i >= 0; i--) {
        if (histGDB[i].dt && histGDB[i].dt.getDate() === 4) { d04Item = histGDB[i]; break; }
      }
    }
  }

  let m4Item = byShort["T3-8 (4→10)"] || { name: "Nuôi Tổng mùng 4", count: 10, nums: buildDanByTong(3), excelMax: 17 };
  let m4Label = "Mùng 4 → lấy tổng 2 số cuối ĐB nuôi đến ngày 10";
  if (d04Item && d04Item.de && /^\d{2}$/.test(d04Item.de)) {
    const dA = parseInt(d04Item.de[0], 10);
    const dB = parseInt(d04Item.de[1], 10);
    const rawSum = dA + dB;
    const tongVal = rawSum % 10;
    const tongNums = buildDanByTong(tongVal);
    m4Label = `Mùng 4 (${d04Item.date}) ĐB ${d04Item.db} → Đề ${d04Item.de} (${dA}+${dB}=${rawSum}, Tổng ${tongVal}) nuôi đến ngày 10`;
    m4Item = {
      name: `Tổng ${tongVal} (từ Đề ${d04Item.de} ngày ${d04Item.date})`,
      count: tongNums.length,
      nums: tongNums,
      excelMax: 54
    };
  }

  return [
    { from: 4,  to: 10, label: m4Label,                                   dan: m4Item },
    { from: 8,  to: 14, label: "Từ ngày 8–14 → nuôi Tổng 4-9",          dan: byShort["T4-9 (8→14)"] },
    { from: 15, to: 22, label: "Từ ngày 15–22 → nuôi 2 Kép",            dan: byShort["2 Kép (15→22)"] },
    { from: 26, to: 31, label: "Từ ngày 26–hết tháng → nuôi Tổng 1-6",  dan: byShort["T1-6 (26→hết)"] }
  ].filter(x => x.dan);
}

/* Các dàn có CÙNG tập số với tập `nums` (so với toàn bộ dàn đã cấu hình + danh sách thêm vào) */
function findDuplicateDans(nums, extraLists) {
  const sig = a => Array.from(new Set(a)).sort().join(",");
  const target = sig(nums), hits = [];
  const pools = [].concat(
    getDanConfigs().map(c => ({ name: c.name, nums: c.nums })),
    getChamTongConfigs().map(c => ({ name: c.name, nums: c.nums })),
    getBoKep4SoConfigs().map(c => ({ name: c.name, nums: c.nums })),
    getImageF3F9A1Configs().map(c => ({ name: c.name, nums: c.nums })),
    extraLists || []
  );
  pools.forEach(p => { if (sig(p.nums) === target) hits.push(p.name); });
  return Array.from(new Set(hits));
}


/* Gộp MỌI dàn (31 dàn nhóm 1-2, 10 Chạm–Tổng, 5 bộ kép, dàn BR–BT/ảnh) để theo dõi gan; bỏ dàn trùng tập số. */

function renderDanNumsPreview(nums, maxInline = 10) {
  if (!Array.isArray(nums) || !nums.length) return "—";
  const allStr = nums.join(", ");
  if (nums.length <= maxInline) {
    return `<span style="font-weight:600; color:#1e293b;">${allStr}</span>`;
  }
  const shortStr = nums.slice(0, maxInline).join(", ");
  return `<div class="dan-nums-wrap" style="text-align:left; white-space:normal; max-width:300px; line-height:1.4;">
    <span class="dan-short" style="font-weight:600; color:#1e293b;">${shortStr}, … </span>
    <span class="dan-full" style="display:none; font-weight:600; color:#1e293b;">${allStr} </span>
    <button type="button" onclick="const w=this.parentElement; const s=w.querySelector('.dan-short'); const f=w.querySelector('.dan-full'); const open=f.style.display==='none'; s.style.display=open?'none':'inline'; f.style.display=open?'inline':'none'; this.textContent=open?'[Thu gọn ▴]':'[Xem đủ '+${nums.length}+' số ▾]';" style="border:1px solid #9cbce2; background:#eef5fd; color:#0969da; border-radius:4px; padding:1px 6px; font-size:11px; font-weight:700; cursor:pointer; margin-left:2px;">[Xem đủ ${nums.length} số ▾]</button>
  </div>`;
}

function getAllDanForMonitor() {
  const sig = n => Array.from(new Set(n)).sort().join(",");
  const seen = new Set(), out = [];
  const add = (code, group, name, nums, ref) => {
    const k = sig(nums);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ code, group, name, nums, ref });
  };

  // 1. 5 Bộ Kép 4 số (ký hiệu BK-00 .. BK-44)
  getBoKep4SoConfigs().forEach(c => {
    const numId = (c.name.match(/\d{2}/) || ["00"])[0];
    add(`BK-${numId}`, "Bộ kép 4 số", c.name, c.nums, c.excelMax);
  });

  // 2. 10 Dàn Chạm–Tổng (ký hiệu CT-0 .. CT-9)
  getChamTongConfigs().forEach(c => {
    const dId = (c.name.match(/\d/) || ["0"])[0];
    add(`CT-${dId}`, "Chạm–Tổng", `Chạm–Tổng ${dId} (${c.name.replace(/\s+/g, '')})`, c.nums, c.excelMax);
  });

  // 3. 31 Dàn tiêu chuẩn (9 Dàn trong ảnh DA-01..DA-09 + 22 Dàn Cột T T3..T44)
  let daIdx = 1;
  getDanConfigs().forEach(c => {
    if (c.group === "Dàn trong ảnh") {
      const code = `DA-${String(daIdx++).padStart(2, "0")}`;
      add(code, c.group, c.name, c.nums, c.excelMax);
    } else {
      const m = c.name.match(/Cột\s*(T\d+)[:\s]*(.*)/i);
      const code = m ? m[1].toUpperCase() : `CT-${daIdx++}`;
      const cleanName = m && m[2] ? m[2].replace(/\(Chú thích\)/gi, "").trim() : c.name;
      add(code, c.group, cleanName, c.nums, c.excelMax);
    }
  });

  // 4. Các dàn bổ sung không trùng (Chạm 0-9, Tổng 0-9, Bộ 8 số, Khối màu, BR-BT)
  let kmIdx = 1;
  getImageF3F9A1Configs().forEach(c => {
    let code = "";
    if (c.name.startsWith("Chạm ")) code = `CH-${c.name.replace("Chạm ", "").trim()}`;
    else if (c.name.startsWith("Tổng ")) code = `TG-${c.name.replace("Tổng ", "").trim()}`;
    else if (c.name.startsWith("Bộ ")) code = `BO-${c.name.replace("Bộ ", "").replace("(4s)", "").trim()}`;
    else if (c.name.startsWith("Dàn BR-")) {
      const m = c.name.match(/BR-(\d+)/);
      code = m ? `BR-${m[1].padStart(2, "0")}` : `BR-${kmIdx++}`;
    } else {
      code = `KM-${String(kmIdx++).padStart(2, "0")}`;
    }
    const cleanName = c.name.replace(/\s*-\s*Ảnh/gi, "").trim();
    add(code, c.subGroup, cleanName, c.nums, c.excelMax);
  });

  return out;
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
  const grayDeStyle = { font: { bold: true, color: { rgb: "111827" } }, fill: { fgColor: { rgb: "E5E7EB" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
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
  XLSX.utils.book_append_sheet(wb, ws1, "T1. GDB Theo Tuan");

  // Sheet 2 (So sánh từng ngày với 7 ngày liên tiếp ngay sau ngày đó)
  const s2Rows = [ ["Tuần", "Tập Tổng 7N sau T2", ...Array.from({ length: 35 }, (_, i) => `Cột ${i + 1}`)].map(h => ({ v: h, s: headerStyle })) ];
  allWeeks.slice(0, 52).forEach((wk, idx) => {
    const tag = idx === 0 ? "Hiện tại" : `Tuần -${idx}`;
    const monNext7 = getNext7ConsecutiveDaysStats(allWeeks, idx, 0);
    const sumsLabel = monNext7.hasFull7 ? `{${Array.from(monNext7.sumsSet).sort().join(",")}}` : `Đang có ${monNext7.count}/7N`;
    const row = [{ v: `${tag} (${wk.label})`, s: baseCellStyle }, { v: sumsLabel, s: baseCellStyle }];
    for (let d = 0; d < 7; d++) {
      const num = wk.nums[d] || "";
      const next7 = getNext7ConsecutiveDaysStats(allWeeks, idx, d);
      for (let k = 0; k < 5; k++) {
        const ch = num[k] !== undefined ? num[k] : "";
        if (ch !== "" && next7.hasFull7) {
          const isY = !next7.sumsSet.has(parseInt(ch, 10));
          row.push({ v: parseInt(ch, 10), s: isY ? yellowStyle : ((k === 3 || k === 4) ? grayDeStyle : baseCellStyle) });
        } else {
          row.push({ v: ch === "" ? "" : parseInt(ch, 10), s: (ch !== "" && (k === 3 || k === 4)) ? grayDeStyle : baseCellStyle });
        }
      }
    }
    s2Rows.push(row);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
  ws2["!cols"] = [{ wch: 24 }, { wch: 20 }, ...Array(35).fill({ wch: 6 })];
  XLSX.utils.book_append_sheet(wb, ws2, "T3. Bang 35 Cot (Tong)");

  // Sheet 35 Cột theo Chạm (So sánh từng ngày với 7 ngày liên tiếp ngay sau ngày đó)
  const s2bRows = [ ["Tuần", "Tập Chạm 7N sau T2", ...Array.from({ length: 35 }, (_, i) => `Cột ${i + 1}`)].map(h => ({ v: h, s: headerStyle })) ];
  allWeeks.slice(0, 52).forEach((wk, idx) => {
    const tag = idx === 0 ? "Hiện tại" : `Tuần -${idx}`;
    const monNext7 = getNext7ConsecutiveDaysStats(allWeeks, idx, 0);
    const chamLabel = monNext7.hasFull7 ? `{${Array.from(monNext7.chamSet).sort().join(",")}}` : `Đang có ${monNext7.count}/7N`;
    const row = [{ v: `${tag} (${wk.label})`, s: baseCellStyle }, { v: chamLabel, s: baseCellStyle }];
    for (let d = 0; d < 7; d++) {
      const num = wk.nums[d] || "";
      const next7 = getNext7ConsecutiveDaysStats(allWeeks, idx, d);
      for (let k = 0; k < 5; k++) {
        const ch = num[k] !== undefined ? num[k] : "";
        if (ch !== "" && next7.hasFull7) {
          const isY = !next7.chamSet.has(parseInt(ch, 10));
          row.push({ v: parseInt(ch, 10), s: isY ? yellowStyle : ((k === 3 || k === 4) ? grayDeStyle : baseCellStyle) });
        } else {
          row.push({ v: ch === "" ? "" : parseInt(ch, 10), s: (ch !== "" && (k === 3 || k === 4)) ? grayDeStyle : baseCellStyle });
        }
      }
    }
    s2bRows.push(row);
  });
  const ws2b = XLSX.utils.aoa_to_sheet(s2bRows);
  ws2b["!cols"] = [{ wch: 24 }, { wch: 22 }, ...Array(35).fill({ wch: 6 })];
  XLSX.utils.book_append_sheet(wb, ws2b, "T4. Bang 35 Cot (Cham)");

  // Sheet 3 (Ghép 2 số - đối chiếu GĐB ngày hôm sau, 40 ngày)
  const prizeCols = ["ĐB", "G1", "G2-1", "G2-2", "G3-1", "G3-2", "G3-3", "G3-4", "G3-5", "G3-6"];
  const comp3 = buildGhepRows(globalData.daily_prizes).rows;
  const s3Rows = [ ["Ngày", "ĐB hôm sau", ...prizeCols].map(h => ({ v: h, s: headerStyle })) ];
  comp3.slice(-40).reverse().forEach(r => {
    const nextTxt = r.pending ? (r.missing ? "Thiếu KQ hôm sau" : "Chờ KQ hôm sau") : `${r.nextDb} (${r.nextDe})`;
    s3Rows.push([
      { v: r.date, s: baseCellStyle },
      { v: nextTxt, s: baseCellStyle },
      ...r.cells.map(c => ({
        v: c.hit ? `${c.p} [Trúng ${r.nextDe}]` : `${c.p} (${c.streak})`,
        s: c.hit ? greenStyle : baseCellStyle
      }))
    ]);
  });
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows);
  ws3["!cols"] = [{ wch: 15 }, { wch: 18 }, ...Array(10).fill({ wch: 16 })];
  XLSX.utils.book_append_sheet(wb, ws3, "T5. Ghep 2 So 40 Ngay");

  // Sheet Dàn nuôi (Max hiệu lực = max(Max chuẩn, Max thực tế các chu kỳ đã về))
  const redStyle = { font: { bold: true, color: { rgb: "B80000" } }, fill: { fgColor: { rgb: "FFE2E2" } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: borderStyle };
  const histGDB = getAllHistoricalGDB(allWeeks);
  const s4Rows = [ ["Tên Dàn Nuôi", "Số con", "Gan (ngày chưa về)", "Số ngày gan nhất", "Max chuẩn", "Khoảng gan nhất", "Về gần nhất", "Trạng thái"].map(h => ({ v: h, s: headerStyle })) ];
  getDanConfigs().forEach(cfg => {
    const ev = evaluateDan(histGDB, cfg.nums, cfg.excelMax);
    const style = ev.level === "hit" ? greenStyle : (ev.level === "max" ? redStyle : (ev.level === "watch" ? yellowStyle : baseCellStyle));
    s4Rows.push([
      { v: `${cfg.name} — ${ev.gan === 0 ? "vừa về (0 ngày)" : "gan " + ev.gan + " ngày"}`, s: style },
      { v: `${cfg.count}s`, s: style },
      { v: ev.gan, s: style },
      { v: ev.effMax, s: style },
      { v: ev.ref, s: style },
      { v: ev.maxSpan || "—", s: style },
      { v: `${ev.lastHitDate} (${ev.lastHitDe})`, s: style },
      { v: DAN_LEVEL[ev.level].text, s: style }
    ]);
  });
  const ws4 = XLSX.utils.aoa_to_sheet(s4Rows);
  ws4["!cols"] = [{ wch: 36 }, { wch: 9 }, { wch: 14 }, { wch: 12 }, { wch: 11 }, { wch: 12 }, { wch: 22 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws4, "T2. Dan Nuoi Chu Ky");

  XLSX.writeFile(wb, `Thongke_web_app_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

async function loadSharedData(onReadyCallback) {
  const statusEl = document.getElementById('status-text');
  try {
    let res = await fetch('data.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) res = await fetch('data.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    globalData = await res.json();
    try {
      if (Array.isArray(globalData.daily_prizes)) {
        globalData.daily_prizes = normalizeDailyPrizes(globalData.daily_prizes);
      }
    } catch (normErr) {
      console.warn("normalizeDailyPrizes warning:", normErr);
    }
    if (statusEl) statusEl.innerText = "Cập nhật tự động: " + (globalData.last_updated || "—");
    if (typeof onReadyCallback === "function") {
      try {
        onReadyCallback(globalData);
      } catch (cbErr) {
        console.error("onReadyCallback error:", cbErr);
        if (statusEl) statusEl.innerText = "Lỗi dựng giao diện: " + cbErr.message;
      }
    }
  } catch (e) {
    console.error("loadSharedData error:", e);
    if (statusEl) statusEl.innerText = "Lỗi tải data.json: " + e.message;
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

function computeChamSheetRow(wk, prevWk, auxMap, dailyPrizesList) {
  // wk.nums = [T2(AF), T3(AG), T4(AH), T5(AI), T6(AJ), T7(AK), CN(AL)]
  const n = wk.nums;
  const monGdb = n[0] || "";
  const satGdb = n[5] || "";
  const rawAux = (auxMap && monGdb && auxMap[monGdb]) ? { ...auxMap[monGdb] } : { c_g74: "", d_g1: "", e_bg1: "", ar_bg1t7: "", as_g71_g74: "" };

  // Tự động bổ sung từ daily_prizes nếu tuần đó có dữ liệu giải trong daily_prizes
  if (Array.isArray(dailyPrizesList) && wk.mDt) {
    const monStr = formatVNDate(wk.mDt);
    const satDt = new Date(wk.mDt);
    satDt.setDate(wk.mDt.getDate() + 5);
    const satStr = formatVNDate(satDt);
    const monRec = dailyPrizesList.find(d => d.date === monStr);
    const satRec = dailyPrizesList.find(d => d.date === satStr);
    if (monRec && Array.isArray(monRec.prizes) && monRec.prizes.length >= 2) {
      const g1Mon = monRec.prizes[1] || "";
      if (g1Mon.length >= 5) {
        if (rawAux.d_g1 === "") rawAux.d_g1 = String((parseInt(g1Mon[3], 10) + parseInt(g1Mon[4], 10)) % 10);
        if (rawAux.e_bg1 === "") rawAux.e_bg1 = g1Mon[1];
      }
    }
    if (satRec && Array.isArray(satRec.prizes) && satRec.prizes.length >= 2) {
      const g1Sat = satRec.prizes[1] || "";
      if (g1Sat.length >= 5 && rawAux.ar_bg1t7 === "") {
        rawAux.ar_bg1t7 = g1Sat[1];
      }
    }
  }

  // Không tự suy ra c_g74 / d_g1 / e_bg1 / ar_bg1t7 / as_g71_g74 từ GĐB: các cột này lấy từ Giải Nhất & Giải Bảy.
  // Tuần chưa có dữ liệu giải Nhất/Bảy để trống cho tới khi update_xsmb.py bù được.
  const byDay = auxCols(wk);
  Object.keys(byDay).forEach(k => { if (k !== 'g1cn') rawAux[k] = byDay[k]; });
  const aux = rawAux;

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

function computeTinhCauRow(wk, g1cnMap, dailyPrizesList) {
  // wk.nums = [T2(AG), T3(AH), T4(AI), T5(AJ), T6(AK), T7(AL), CN(AM)]
  const n = wk.nums;
  const monGdb = n[0] || "";
  const sunGdb = n[6] || "";
  const byDayT = auxCols(wk);
  let g1cnVal = byDayT.g1cn !== undefined ? byDayT.g1cn : ((g1cnMap && monGdb && g1cnMap[monGdb] !== undefined && g1cnMap[monGdb] !== "") ? g1cnMap[monGdb] : "");
  if (g1cnVal === "" && Array.isArray(dailyPrizesList) && wk.mDt) {
    const sunDt = new Date(wk.mDt);
    sunDt.setDate(wk.mDt.getDate() + 6);
    const sunRec = dailyPrizesList.find(d => d.date === formatVNDate(sunDt));
    if (sunRec && Array.isArray(sunRec.prizes) && sunRec.prizes[1] && sunRec.prizes[1].length >= 2) {
      g1cnVal = String((parseInt(sunRec.prizes[1][0], 10) + parseInt(sunRec.prizes[1][1], 10)) % 10);
    }
  }

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
  // 10 dàn Chạm–Tổng C0,T0 → C9,T9 (Max chuẩn từ tab 'tổng' BF–BH; số lấy từ Comment). Sắp theo C0..C9.
  const list = [
    { name: "C1,T1", excelMax: 21, nums: ["01","10","11","12","21","13","31","14","41","15","51","16","61","17","71","18","81","19","91","29","92","38","83","47","74","56","65"] },
    { name: "C0,T0", excelMax: 23, nums: ["00","01","10","02","20","03","30","04","40","05","50","06","60","07","70","08","80","09","90","19","91","28","82","37","73","46","64","55"] },
    { name: "C2,T2", excelMax: 29, nums: ["02","20","12","21","22","23","32","24","42","25","52","26","62","27","72","28","82","29","92","11","66","39","93","48","84","57","75"] },
    { name: "C3,T3", excelMax: 26, nums: ["03","30","13","31","23","32","33","34","43","35","53","36","63","37","73","38","83","39","93","12","21","49","94","58","85","67","76"] },
    { name: "C4,T4", excelMax: 32, nums: ["04","40","14","41","24","42","34","43","44","45","54","46","64","47","74","48","84","49","94","13","31","22","59","95","68","86","77"] },
    { name: "C5,T5", excelMax: 37, nums: ["05","50","15","51","25","52","35","53","45","54","55","56","65","57","75","58","85","59","95","14","41","23","32","69","96","78","87"] },
    { name: "C6,T6", excelMax: 27, nums: ["06","60","16","61","26","62","36","63","46","64","56","65","66","67","76","68","86","69","96","15","51","24","42","33","88","79","97"] },
    { name: "C7,T7", excelMax: 21, nums: ["07","70","17","71","27","72","37","73","47","74","57","75","67","76","77","78","87","79","97","16","61","25","52","34","43","89","98"] },
    { name: "C8,T8", excelMax: 34, nums: ["08","80","18","81","28","82","38","83","48","84","58","85","68","86","78","87","88","89","98","17","71","26","62","35","53","44","99"] },
    { name: "C9,T9", excelMax: 27, nums: ["09","90","19","91","29","92","39","93","49","94","59","95","69","96","79","97","89","98","99","18","81","27","72","36","63","45","54"] }
  ];
  return list.sort((x, y) => x.name.localeCompare(y.name));
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
    // 4. Bộ Kép 4 số (BK-BM): 11, 00, 22, 33, 44 (mỗi bộ 4 số tăng/giảm 5 đơn vị)
    ...[
      { k: "11", mx: 149, nums: ["11", "16", "61", "66"] },
      { k: "00", mx: 126, nums: ["00", "05", "50", "55"] },
      { k: "22", mx: 142, nums: ["22", "27", "72", "77"] },
      { k: "33", mx: 162, nums: ["33", "38", "83", "88"] },
      { k: "44", mx: 134, nums: ["44", "49", "94", "99"] }
    ].map(x => ({ subGroup: "Bộ Kép 4 số (BK-BM)", name: `Bộ ${x.k} (4s)`, excelMax: x.mx, nums: x.nums })),
    // 5. Các dàn riêng lẻ & dàn khối màu trong ảnh (BR-BT & BD-BM)
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn 17 (33..98) - Ảnh", excelMax: 17, nums: ["33","34","35","36","37","38","43","53","63","73","83","44","45","46","47","48","54","55","56","57","58","64","65","66","67","68","74","75","76","77","78","84","85","86","87","88","94","95","96","97","98"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn 18 (26..99) - Ảnh", excelMax: 18, nums: ["26","62","27","72","28","82","29","92","36","63","37","73","38","83","39","93","46","64","47","74","48","84","49","94","56","65","57","75","58","85","59","95","67","76","68","86","69","96","78","87","79","97","89","98","99"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Xanh Dương (50s) - Ảnh", excelMax: 25, nums: ["01","02","03","05","08","10","11","14","15","16","17","18","19","21","22","24","28","29","30","31","32","33","35","38","40","41","44","45","48","50","53","55","58","59","65","67","69","70","71","75","79","80","83","84","88","89","91","92","93","94"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Vàng (50s) - Ảnh", excelMax: 25, nums: ["00","04","06","07","09","12","13","20","23","25","26","27","34","36","37","39","42","43","46","47","49","51","52","54","56","57","60","61","62","63","64","66","68","72","73","74","76","77","78","81","82","85","86","87","90","95","96","97","98","99"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Hồng (Max 21 - 32s) - Ảnh", excelMax: 21, nums: ["06","07","08","09","16","17","18","19","23","24","25","26","33","34","35","36","56","57","58","59","66","67","68","69","73","74","75","76","83","84","85","86"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Đỏ (Max 19 - 30s) - Ảnh", excelMax: 19, nums: ["03","13","23","33","43","53","63","73","83","93","05","15","25","35","45","55","65","75","85","95","07","17","27","37","47","57","67","77","87","97"] },
    { subGroup: "Dàn lẻ / Khối (BR-BT & BD-BM)", name: "Dàn Tím (60s) - Ảnh", excelMax: 20, nums: ["04","06","07","12","13","18","23","25","26","28","35","37","46","47","53","58","60","66","69","70","79","80","83","94","95","98"] },
    // 6. Các bộ 5 số / dàn cột BR-BT (Đúng Max thực tế từ ảnh Excel)
    ...[
      { n: "Dàn BR-1 (03..83)", mx: 124, nums: ["03","23","43","63","83"] },
      { n: "Dàn BR-2 (01..81)", mx: 195, nums: ["01","21","41","61","81"] },
      { n: "Dàn BR-3 (05..85)", mx: 134, nums: ["05","25","45","65","85"] },
      { n: "Dàn BR-4 (07..87)", mx: 192, nums: ["07","27","47","67","87"] },
      { n: "Dàn BR-5 (09..89)", mx: 104, nums: ["09","29","49","69","89"] },
      { n: "Dàn BR-6 (10..90)", mx: 115, nums: ["10","30","50","70","90"] },
      { n: "Dàn BR-7 (12..92)", mx: 129, nums: ["12","32","52","72","92"] },
      { n: "Dàn BR-8 (14..94)", mx: 137, nums: ["14","34","54","74","94"] },
      { n: "Dàn BR-9 (16..96)", mx: 113, nums: ["16","36","56","76","96"] },
      { n: "Dàn BR-10 (18..98)", mx: 186, nums: ["18","38","58","78","98"] },
      { n: "Dàn BR-11 (11..19)", mx: 118, nums: ["11","13","15","17","19"] },
      { n: "Dàn BR-12 (31..39)", mx: 111, nums: ["31","33","35","37","39"] },
      { n: "Dàn BR-13 (51..59)", mx: 155, nums: ["51","53","55","57","59"] },
      { n: "Dàn BR-14 (71..79)", mx: 101, nums: ["71","73","75","77","79"] },
      { n: "Dàn BR-15 (91..99)", mx: 106, nums: ["91","93","95","97","99"] },
      { n: "Dàn BR-16 (00..08)", mx: 98,  nums: ["00","02","04","06","08"] },
      { n: "Dàn BR-17 (20..28)", mx: 125, nums: ["20","22","24","26","28"] },
      { n: "Dàn BR-18 (40..48)", mx: 140, nums: ["40","42","44","46","48"] },
      { n: "Dàn BR-19 (60..68)", mx: 138, nums: ["60","62","64","66","68"] },
      { n: "Dàn BR-20 (80..88)", mx: 114, nums: ["80","82","84","86","88"] }
    ].map(x => ({ subGroup: "Nhóm Dàn BR-BT (Ảnh)", name: x.n, excelMax: x.mx, nums: x.nums }))
  ];

  // Tự động loại bỏ toàn bộ các dàn trùng tập số với các bảng chính (Cột T, Chạm-Tổng, Bộ Kép 4 số) hoặc trùng nội bộ
  const sigOf = arr => Array.from(new Set(arr)).sort().join(",");
  const globalSeen = new Set();
  getDanConfigs().forEach(c => globalSeen.add(sigOf(c.nums)));
  getChamTongConfigs().forEach(c => globalSeen.add(sigOf(c.nums)));
  getBoKep4SoConfigs().forEach(c => globalSeen.add(sigOf(c.nums)));

  const uniqueItems = [];
  items.forEach(it => {
    const s = sigOf(it.nums);
    if (!globalSeen.has(s)) {
      globalSeen.add(s);
      uniqueItems.push(it);
    }
  });
  return uniqueItems;
}
