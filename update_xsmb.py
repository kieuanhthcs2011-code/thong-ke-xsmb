#!/usr/bin/env python3
"""Cập nhật data.json cho thongkesxmb.web.app (chạy bởi GitHub Actions lúc 19:00 GMT+7).

Dữ liệu:
- weeks_gdb    : list các tuần {monday, label, nums[7]} - tuần mới nhất ở đầu (cũng đọc được dạng list-of-list / dict).
- daily_prizes : list {date, prizes[10]} theo thời gian (cũng đọc được dạng dict {ngày: [...]}).
- latest_full_board : đủ 27 giải của ngày mới nhất.

Quy tắc làm sạch tuần (giống hệt app.js -> getNormalizedWeeks):
 1. Gom theo ngày Thứ 2, mỗi tuần đúng 7 ô, ô hợp lệ = đúng 5 chữ số.
 2. "00000" lặp >= 2 lần trong 1 tuần = ô giữ chỗ (ngày nghỉ Tết) -> để trống.
 3. Số trong daily_prizes là nguồn đúng nhất, ghi đè lên ô tương ứng.
 4. Hai ô cách nhau <= 16 ngày mà trùng hệt 5 chữ số = bản sao nhiễm nhầm: xóa ô CŨ HƠN
    (trừ khi ô đó đã được daily_prizes xác nhận). Mọi ô bị xóa đều ghi vào data["quality_log"].
 5. Lấp các tuần trống để chuỗi tuần liên tục.
"""
import json
import os
import re
import sys
import unicodedata
import time
import urllib.request
import html as html_lib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(HERE, "data.json")
VN_TZ = timezone(timedelta(hours=7))
DEFAULT_RSS = ["https://xskt.com.vn/rss-feed/mien-bac-xsmb.rss"]
FALLBACK_BASE_MONDAY = datetime(2026, 11, 23)
DUP_WINDOW_DAYS = 16
WEEKDAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

FIVE = re.compile(r"^\d{5}$")


def fmt(dt):
    return dt.strftime("%d/%m/%Y")


def parse_vn(s):
    s = str(s).strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    return None


# ---------------------------------------------------------------- phân tích kết quả
PRIZE_SPEC = [("DB", 1, 5), ("1", 1, 5), ("2", 2, 5), ("3", 6, 5),
              ("4", 4, 4), ("5", 6, 4), ("6", 3, 3), ("7", 4, 2)]
LABEL_RE = re.compile(
    r"(?:GIẢI\s*|G\.?\s*)?(ĐẶC\s*BIỆT|ĐB|DB|[1-7])\s*[:\-]\s*((?:\d{2,5}\s*[-–,;/]?\s*)+)")


def _clean(s):
    s = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    return unicodedata.normalize("NFC", html_lib.unescape(s)).upper()


def parse_board(text):
    """Trả về dict db,g1,g2,g3,g4,g5,g6,g7,top10 hoặc None nếu chưa đủ 27 giải."""
    found = {}
    for m in LABEL_RE.finditer(_clean(text)):
        key = "DB" if m.group(1).startswith(("Đ", "D")) else m.group(1)
        found.setdefault(key, re.findall(r"\d+", m.group(2)))
    out = {}
    for key, cnt, width in PRIZE_SPEC:
        nums = found.get(key, [])[:cnt]
        if len(nums) != cnt or not all(re.fullmatch(r"\d{%d}" % width, n) for n in nums):
            return None
        out[key] = nums
    if out["DB"][0] == "00000":  # ô giữ chỗ ngày nghỉ (Tết), không phải kết quả thật
        return None
    p = {"db": out["DB"][0], "g1": out["1"][0], "g2": out["2"], "g3": out["3"],
         "g4": out["4"], "g5": out["5"], "g6": out["6"], "g7": out["7"]}
    p["top10"] = [p["db"], p["g1"]] + p["g2"] + p["g3"]
    return p


def fetch_rss(urls):
    last_err = None
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            root = ET.fromstring(urllib.request.urlopen(req, timeout=20).read())
        except Exception as e:  # noqa: BLE001
            last_err = e
            print(f"Lỗi nguồn {url}: {e}")
            continue
        results = []
        for item in root.iter("item"):
            title = item.findtext("title") or ""
            desc = (item.findtext("description") or "") + "\n" + (
                item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or "")
            m = re.search(r"(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}))?", title)
            if not m:
                continue
            year = int(m.group(3)) if m.group(3) else datetime.now(VN_TZ).year
            try:
                dt = datetime(year, int(m.group(2)), int(m.group(1)))
            except ValueError:
                continue
            parsed = parse_board(title + "\n" + desc)
            if parsed:
                results.append({"date": fmt(dt), "dt": dt, "weekday_idx": dt.weekday(),
                                "weekday_name": WEEKDAY_NAMES[dt.weekday()], "parsed": parsed})
        if results:
            results.sort(key=lambda x: x["dt"])
            print(f"Nguồn {url}: đọc được {len(results)} ngày")
            return results
    if last_err:
        print("Không đọc được RSS:", last_err)
    return []


def fetch_day_minhngoc(dt):
    """Dự phòng: lấy 27 giải của 1 ngày từ Minh Ngọc."""
    url = f"https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/{dt.strftime('%d-%m-%Y')}.html"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    page = urllib.request.urlopen(req, timeout=8).read().decode("utf-8", errors="ignore")
    parts = []
    names = [("giaidb", "ĐB"), ("giai1", "1"), ("giai2", "2"), ("giai3", "3"),
             ("giai4", "4"), ("giai5", "5"), ("giai6", "6"), ("giai7", "7")]
    for cls, label in names:
        m = re.search(r'class="%s"[^>]*>(.*?)</td>' % cls, page, re.S)
        if not m:
            return None
        parts.append(f"{label}: " + " - ".join(re.findall(r"\d+", m.group(1))))
    return parse_board("\n".join(parts))


# ---------------------------------------------------------------- chuẩn hóa daily_prizes
def _extract_prizes(v):
    if isinstance(v, list):
        return v
    if isinstance(v, dict):
        if isinstance(v.get("prizes"), list):
            return v["prizes"]
        if v.get("db"):
            return [v.get("db"), v.get("g1")] + list(v.get("g2") or []) + list(v.get("g3") or [])
    return None


def normalize_daily(raw):
    """list {date,prizes} | dict {ngày: [..] | {prizes:[..]} } -> dict 'dd/mm/yyyy' -> prizes."""
    out = {}

    def put(date, prizes):
        dt = parse_vn(date) if date is not None else None
        if not dt or not isinstance(prizes, list) or not prizes:
            return
        prizes = [str(x) for x in prizes]
        if FIVE.match(prizes[0]):
            out[fmt(dt)] = prizes

    if isinstance(raw, list):
        for it in raw:
            if isinstance(it, dict):
                put(it.get("date"), _extract_prizes(it))
            elif isinstance(it, (list, tuple)) and len(it) == 2:
                put(it[0], _extract_prizes(it[1]))
    elif isinstance(raw, dict):
        for k, v in raw.items():
            put(k, _extract_prizes(v))
    return out


# ---------------------------------------------------------------- chuẩn hóa weeks_gdb
def _week_items(raw, base_mon):
    """Đưa mọi dạng (list-of-list, list-of-dict, dict) về [(monday_dt, nums[7])]."""
    items = []
    if isinstance(raw, dict):
        for k, v in raw.items():
            dt = parse_vn(k)
            nums = v.get("nums") if isinstance(v, dict) else v
            if dt and isinstance(nums, list):
                items.append((dt, nums))
        return items
    for idx, wk in enumerate(raw or []):
        if isinstance(wk, dict) and wk.get("monday") and parse_vn(wk["monday"]):
            items.append((parse_vn(wk["monday"]), wk.get("nums") or []))
        elif isinstance(wk, list):
            items.append((base_mon - timedelta(days=7 * idx), wk))
    return items


def clean_weeks(raw, daily_map, base_mon=None):
    """Trả về (list tuần mới -> cũ, log các ô đã xóa)."""
    log = []
    if base_mon is None:
        if daily_map:
            newest = max(parse_vn(d) for d in daily_map)
            base_mon = newest - timedelta(days=newest.weekday())
        else:
            base_mon = FALLBACK_BASE_MONDAY
    by_mon = {}
    for mon, nums in _week_items(raw, base_mon):
        mon = mon - timedelta(days=mon.weekday())  # luôn căn về Thứ 2
        cells = [(str(x).strip() if x is not None else "") for x in (list(nums) + [""] * 7)[:7]]
        cells = [c if FIVE.match(c) else "" for c in cells]
        cur = by_mon.setdefault(mon, [""] * 7)
        for i, c in enumerate(cells):
            if c and not cur[i]:
                cur[i] = c
    if not by_mon:
        return [], log

    # 2. ô giữ chỗ 00000
    for mon, cells in by_mon.items():
        if sum(1 for c in cells if c == "00000") >= 2:
            for i, c in enumerate(cells):
                if c == "00000":
                    cells[i] = ""
                    log.append(f"{fmt(mon + timedelta(days=i))}: bỏ ô giữ chỗ 00000")

    # 3. daily_prizes là nguồn đúng
    verified = set()
    for d, prizes in daily_map.items():
        dt = parse_vn(d)
        mon = dt - timedelta(days=dt.weekday())
        by_mon.setdefault(mon, [""] * 7)[dt.weekday()] = prizes[0]
        verified.add(dt)

    # 5. lấp tuần trống
    newest, oldest = max(by_mon), min(by_mon)
    m = oldest
    while m <= newest:
        by_mon.setdefault(m, [""] * 7)
        m += timedelta(days=7)

    # 4. ô trùng hệt trong cửa sổ <= 16 ngày
    cells = []
    for mon, nums in by_mon.items():
        for i, c in enumerate(nums):
            if c:
                cells.append((mon + timedelta(days=i), mon, i, c))
    cells.sort(key=lambda t: t[0])
    for a in range(len(cells)):
        for b in range(a + 1, len(cells)):
            da, mona, ia, ca = cells[a]
            db, monb, ib, cb = cells[b]
            if (db - da).days > DUP_WINDOW_DAYS:
                break
            if ca != cb or not by_mon[mona][ia] or not by_mon[monb][ib]:
                continue
            va, vb = da in verified, db in verified
            if va and vb:
                continue
            target = (monb, ib, db) if (va and not vb) else (mona, ia, da)
            by_mon[target[0]][target[1]] = ""
            log.append(f"{fmt(target[2])}: xóa {ca} (trùng hệt ngày {fmt(db if target[2] == da else da)})")

    weeks = []
    for mon in sorted(by_mon, reverse=True):
        sun = mon + timedelta(days=6)
        weeks.append({"monday": fmt(mon), "label": f"{mon.strftime('%d/%m')} - {fmt(sun)}",
                      "nums": by_mon[mon]})
    return weeks, log


# ---------------------------------------------------------------- cột giải phụ (tự động 100%)
def d2(s):
    return (int(s[0]) + int(s[1])) % 10


def needed_aux_dates(weeks):
    """Các ngày cần Giải Nhất/Giải Bảy: T2 (C,D,E), T7 (AR,AS), CN (G1CN) - mới -> cũ.
    Ngày Tết/ngày trống (không có GĐB) bỏ qua, để trống."""
    out = []
    for wk in weeks:
        mon = parse_vn(wk["monday"])
        for wd in (0, 5, 6):
            if wk["nums"][wd]:
                out.append((mon + timedelta(days=wd), wk["nums"][wd]))
    return out


def backfill_daily_aux(data, weeks, budget, fetcher=None, pause=0.2):
    """Bù data['daily_aux'][ngày] = {g1, g7[4]} cho TOÀN BỘ lịch sử, mỗi lần chạy tối đa `budget` lần tải.
    Chạy nhiều ngày liên tiếp là đủ hết. Chỉ nhận khi GĐB tải về khớp GĐB đang lưu."""
    aux = data.setdefault("daily_aux", {})
    fetcher = fetcher or fetch_day_minhngoc
    fails = 0
    for dt, db in needed_aux_dates(weeks):
        key = fmt(dt)
        if key in aux:
            continue
        if budget <= 0 or fails >= 5:
            break
        budget -= 1
        try:
            b = fetcher(dt)
        except Exception:  # noqa: BLE001
            b = None
        if not b:
            fails += 1
            continue
        fails = 0
        if b["db"] != db:
            print(f"CẢNH BÁO {key}: nguồn bù ra GĐB {b['db']} khác dữ liệu {db} -> bỏ qua")
            continue
        aux[key] = {"g1": b["g1"], "g7": b["g7"]}
        if pause:
            time.sleep(pause)
    data["daily_aux"] = {k: aux[k] for k in sorted(aux, key=parse_vn)}


def derive_aux_maps(data, weeks):
    """Tính 5 cột phụ tab 'chạm' + G1CN tab 'tính' cho từng tuần từ daily_aux (cũ -> khóa theo GĐB T2)."""
    aux = data.get("daily_aux", {})
    cham = data.setdefault("cham_aux_by_mon_gdb", {})
    g1cn = data.setdefault("tinh_g1cn_by_mon_gdb", {})
    for wk in weeks:
        mon_gdb = wk["nums"][0]
        if not mon_gdb:
            continue
        mon = parse_vn(wk["monday"])
        rec = cham.setdefault(mon_gdb, {"c_g74": "", "d_g1": "", "e_bg1": "", "ar_bg1t7": "", "as_g71_g74": ""})
        m = aux.get(fmt(mon))
        if m:
            rec["c_g74"] = str(d2(m["g7"][3]))                              # d+e (G7-4) T2
            rec["d_g1"] = str((int(m["g1"][3]) + int(m["g1"][4])) % 10)      # d+e (G1) T2
            rec["e_bg1"] = m["g1"][1]                                        # b (G1) T2
        sat = aux.get(fmt(mon + timedelta(days=5)))
        if sat:
            rec["ar_bg1t7"] = sat["g1"][1]                                   # b (G1) T7
            rec["as_g71_g74"] = str((int(sat["g7"][0][1]) + int(sat["g7"][3][0])) % 10)  # b(G7-1)+a(G7-4) T7
        sun = aux.get(fmt(mon + timedelta(days=6)))
        if sun:
            g1cn[mon_gdb] = str(d2(sun["g1"]))                               # a+b (G1) CN


# ---------------------------------------------------------------- main
def main():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    before = json.dumps({k: data.get(k) for k in ("weeks_gdb", "daily_prizes", "latest_full_board",
                                                  "cham_aux_by_mon_gdb", "tinh_g1cn_by_mon_gdb", "daily_aux", "history_boards")},
                        sort_keys=True, ensure_ascii=False)

    daily = normalize_daily(data.get("daily_prizes"))
    board_by_date = {}

    urls = [u.strip() for u in os.environ.get("XSMB_RSS_URLS", "").split(",") if u.strip()] or DEFAULT_RSS
    rss_items = fetch_rss(urls)
    hist_boards = data.setdefault("history_boards", {})
    for it in rss_items:
        daily.setdefault(it["date"], it["parsed"]["top10"])
        board_by_date[it["date"]] = it
        p = it["parsed"]
        hist_boards[it["date"]] = {
            "date": it["date"], "weekday": it["weekday_name"], "db": p["db"],
            "g1": p["g1"], "g2": p["g2"], "g3": p["g3"], "g4": p["g4"],
            "g5": p["g5"], "g6": p["g6"], "g7": p["g7"]
        }

    # bù lịch sử 45 ngày gần nhất (dừng sớm nếu nguồn lỗi liên tiếp)
    if daily:
        newest_dt = max(parse_vn(d) for d in daily)
        fails, calls = 0, 0
        for off in range(1, 46):
            if len(daily) >= 45 or fails >= 3 or calls >= 45:
                break
            dt = newest_dt - timedelta(days=off)
            d_str = fmt(dt)
            if d_str in daily and d_str in hist_boards:
                continue
            calls += 1
            try:
                b = fetch_day_minhngoc(dt)
            except Exception:  # noqa: BLE001
                fails += 1
                continue
            if b:
                daily[d_str] = b["top10"]
                if b.get("db"):
                    wd_name = WEEKDAY_NAMES[dt.weekday()]
                    hist_boards[d_str] = {
                        "date": d_str, "weekday": wd_name, "db": b["db"],
                        "g1": b.get("g1", ""), "g2": b.get("g2", ["",""]), "g3": b.get("g3", ["","","","","",""]),
                        "g4": b.get("g4", ["","","",""]), "g5": b.get("g5", ["","","","","",""]),
                        "g6": b.get("g6", ["","",""]), "g7": b.get("g7", ["","","",""])
                    }

    keep = sorted(daily, key=lambda d: parse_vn(d))[-90:]
    daily = {d: daily[d] for d in keep}
    hb_keep = sorted(hist_boards.keys(), key=lambda d: parse_vn(d))[-60:]
    data["history_boards"] = {d: hist_boards[d] for d in hb_keep}

    weeks, log = clean_weeks(data.get("weeks_gdb"), daily)
    data["weeks_gdb"] = weeks
    data["daily_prizes"] = [{"date": d, "prizes": daily[d]} for d in keep]
    if log:
        data["quality_log"] = log[-200:]
        for line in log:
            print("LÀM SẠCH:", line)
    else:
        data.pop("quality_log", None)

    aux = data.setdefault("daily_aux", {})
    for it in rss_items:
        aux[it["date"]] = {"g1": it["parsed"]["g1"], "g7": it["parsed"]["g7"]}
    backfill_daily_aux(data, weeks, budget=int(os.environ.get("XSMB_AUX_BUDGET", "60")))
    hist_pairs = fetch_history_from_env()
    if hist_pairs:
        n_hist = ingest_historical_gdb_pairs(data, hist_pairs)
        if n_hist:
            weeks = data.get("weeks_gdb") or []
            print(f"Đã nạp thêm {n_hist} ngày lịch sử GĐB (tổng {len(weeks)} tuần).")
    derive_aux_maps(data, weeks)

    if rss_items:
        n = rss_items[-1]
        p = n["parsed"]
        data["latest_full_board"] = {"date": n["date"], "weekday": n["weekday_name"], "db": p["db"],
                                     "g1": p["g1"], "g2": p["g2"], "g3": p["g3"], "g4": p["g4"],
                                     "g5": p["g5"], "g6": p["g6"], "g7": p["g7"]}

    after = json.dumps({k: data.get(k) for k in ("weeks_gdb", "daily_prizes", "latest_full_board",
                                                 "cham_aux_by_mon_gdb", "tinh_g1cn_by_mon_gdb", "daily_aux", "history_boards")},
                       sort_keys=True, ensure_ascii=False)
    if after != before:
        now_vn = datetime.now(VN_TZ).strftime("%d/%m/%Y %H:%M")
        data["last_updated"] = now_vn
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
        print("Đã cập nhật Thongke.web.app lúc", now_vn)
    else:
        print("Dữ liệu đã mới nhất.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
