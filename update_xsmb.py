import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

RSS_URL = "https://xskt.com.vn/rss-feed/mien-bac-xsmb.rss"
DATA_FILE = "data.json"
VN_TZ = timezone(timedelta(hours=7))

WEEKDAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

def parse_rss_description(desc):
    """Trích xuất đủ 27 giải (ĐB đến G7) từ chuỗi mô tả RSS XSMB."""
    m_db = re.search(r"ĐB:\s*(\d{5})", desc)
    m_g1 = re.search(r"1:\s*(\d{5})", desc)
    m_g2 = re.search(r"2:\s*([\d\s-]+?)(?:\s*3:|$)", desc)
    m_g3 = re.search(r"3:\s*([\d\s-]+?)(?:\s*4:|$)", desc)
    m_g4 = re.search(r"4:\s*([\d\s-]+?)(?:\s*5:|$)", desc)
    m_g5 = re.search(r"5:\s*([\d\s-]+?)(?:\s*6:|$)", desc)
    m_g6 = re.search(r"6:\s*([\d\s-]+?)(?:\s*7:|$)", desc)
    m_g7 = re.search(r"7:\s*([\d\s-]+)", desc)

    if not (m_db and m_g1 and m_g2 and m_g3):
        return None

    db = m_db.group(1)
    g1 = m_g1.group(1)
    g2 = re.findall(r"\d{5}", m_g2.group(1))[:2]
    g3 = re.findall(r"\d{5}", m_g3.group(1))[:6]
    g4 = re.findall(r"\d{4}", m_g4.group(1))[:4] if m_g4 else []
    g5 = re.findall(r"\d{4}", m_g5.group(1))[:6] if m_g5 else []
    g6 = re.findall(r"\d{3}", m_g6.group(1))[:3] if m_g6 else []
    g7 = re.findall(r"\d{2}", m_g7.group(1))[:4] if m_g7 else []

    if len(g2) < 2 or len(g3) < 6:
        return None

    return {
        "db": db,
        "g1": g1,
        "g2": g2,
        "g3": g3,
        "g4": g4,
        "g5": g5,
        "g6": g6,
        "g7": g7,
        "top10": [db, g1] + g2 + g3
    }

def fetch_xsmb_rss():
    req = urllib.request.Request(
        RSS_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    xml_bytes = urllib.request.urlopen(req, timeout=20).read()
    root = ET.fromstring(xml_bytes)
    results = []
    for item in root.findall("./channel/item"):
        title = item.findtext("title") or ""
        desc = item.findtext("description") or ""
        m_date = re.search(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", title)
        if not m_date:
            continue
        day = int(m_date.group(1))
        month = int(m_date.group(2))
        year = int(m_date.group(3)) if m_date.group(3) else datetime.now(VN_TZ).year
        dt = datetime(year, month, day)
        parsed = parse_rss_description(desc)
        if parsed:
            results.append({
                "date": dt.strftime("%d/%m/%Y"),
                "dt": dt,
                "weekday_idx": dt.weekday(),
                "weekday_name": WEEKDAY_NAMES[dt.weekday()],
                "parsed": parsed
            })
    results.sort(key=lambda x: x["dt"])
    return results

def fetch_day_minhngoc(dt):
    """Lấy đầy đủ 27 giải từ Minh Ngọc cho 1 ngày cụ thể."""
    url = f"https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/{dt.strftime('%d-%m-%Y')}.html"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
    m_db = re.search(r'class="giaidb"[^>]*>\s*(\d{5})', html)
    m_g1 = re.search(r'class="giai1"[^>]*>\s*(\d{5})', html)
    m_g2 = re.search(r'class="giai2"[^>]*>(.*?)</td>', html, re.S)
    m_g3 = re.search(r'class="giai3"[^>]*>(.*?)</td>', html, re.S)
    m_g4 = re.search(r'class="giai4"[^>]*>(.*?)</td>', html, re.S)
    m_g5 = re.search(r'class="giai5"[^>]*>(.*?)</td>', html, re.S)
    m_g6 = re.search(r'class="giai6"[^>]*>(.*?)</td>', html, re.S)
    m_g7 = re.search(r'class="giai7"[^>]*>(.*?)</td>', html, re.S)
    if not (m_db and m_g1 and m_g2 and m_g3):
        return None
    g2 = re.findall(r"\d{5}", m_g2.group(1))[:2]
    g3 = re.findall(r"\d{5}", m_g3.group(1))[:6]
    g4 = re.findall(r"\d{4}", m_g4.group(1))[:4] if m_g4 else []
    g5 = re.findall(r"\d{4}", m_g5.group(1))[:6] if m_g5 else []
    g6 = re.findall(r"\d{3}", m_g6.group(1))[:3] if m_g6 else []
    g7 = re.findall(r"\d{2}", m_g7.group(1))[:4] if m_g7 else []
    if len(g2) < 2 or len(g3) < 6:
        return None
    return {
        "db": m_db.group(1),
        "g1": m_g1.group(1),
        "g2": g2,
        "g3": g3,
        "g4": g4,
        "g5": g5,
        "g6": g6,
        "g7": g7,
        "top10": [m_db.group(1), m_g1.group(1)] + g2 + g3
    }

def normalize_weeks_list(weeks_gdb):
    """Chuẩn hóa danh sách weeks_gdb, loại bỏ tuần trùng lặp một phần (ghost week)."""
    base_mon = datetime(2026, 11, 23)
    by_mon = {}
    for idx, wk in enumerate(weeks_gdb):
        if isinstance(wk, dict) and wk.get("monday"):
            m_str = wk["monday"]
            nums = (wk.get("nums", []) + ["", "", "", "", "", "", ""])[:7]
        elif isinstance(wk, list):
            m_dt = base_mon - timedelta(days=7 * idx)
            m_str = m_dt.strftime("%d/%m/%Y")
            nums = (wk + ["", "", "", "", "", "", ""])[:7]
        else:
            continue
        if m_str not in by_mon:
            m_dt = datetime.strptime(m_str, "%d/%m/%Y")
            s_dt = m_dt + timedelta(days=6)
            by_mon[m_str] = {
                "monday": m_str,
                "label": f"{m_dt.strftime('%d/%m')} - {s_dt.strftime('%d/%m/%Y')}",
                "nums": nums
            }
    norm = sorted(by_mon.values(), key=lambda w: datetime.strptime(w["monday"], "%d/%m/%Y"), reverse=True)
    # Loại bỏ tuần cũ hơn nếu chuỗi số khác rỗng của nó bị trùng hoàn toàn với tuần mới hơn (ví dụ 09/11 bị dính 94495 của 23/11)
    deduped = []
    seen_sigs = []
    for wk in norm:
        sig = "|".join([x for x in wk["nums"] if x])
        if sig and any(s == sig or s.startswith(sig + "|") for s in seen_sigs):
            continue
        if sig:
            seen_sigs.append(sig)
        deduped.append(wk)
    weeks_gdb[:] = deduped

def upsert_week_gdb(weeks_gdb, dt, db):
    normalize_weeks_list(weeks_gdb)
    mon_dt = dt - timedelta(days=dt.weekday())
    sun_dt = mon_dt + timedelta(days=6)
    mon_str = mon_dt.strftime("%d/%m/%Y")
    label_str = f"{mon_dt.strftime('%d/%m')} - {sun_dt.strftime('%d/%m/%Y')}"

    target_wk = None
    for wk in weeks_gdb:
        if isinstance(wk, dict) and wk.get("monday") == mon_str:
            target_wk = wk
            break

    if target_wk is None:
        target_wk = {
            "monday": mon_str,
            "label": label_str,
            "nums": ["", "", "", "", "", "", ""]
        }
        weeks_gdb.append(target_wk)
        weeks_gdb.sort(key=lambda w: datetime.strptime(w["monday"], "%d/%m/%Y"), reverse=True)

    if target_wk["nums"][dt.weekday()] != db:
        target_wk["nums"][dt.weekday()] = db
        return True
    return False

def main():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    normalize_weeks_list(data.setdefault("weeks_gdb", []))
    daily_map = {item["date"]: item["prizes"] for item in data["daily_prizes"]}
    updated = False

    try:
        rss_items = fetch_xsmb_rss()
        for item in rss_items:
            d_str = item["date"]
            p = item["parsed"]
            if d_str not in daily_map:
                daily_map[d_str] = p["top10"]
                updated = True
            # Tự động tính 5 cột phụ của Sheet 1 (chạm) từ giải Nhất & giải Bảy Thứ 2 / Thứ 7
            mon_dt_item = item["dt"] - timedelta(days=item["dt"].weekday())
            # Tìm GĐB Thứ 2 của tuần đó
            mon_gdb_val = p["db"] if item["weekday_idx"] == 0 else ""
            if not mon_gdb_val:
                for wk in data["weeks_gdb"]:
                    if wk.get("monday") == mon_dt_item.strftime("%d/%m/%Y"):
                        mon_gdb_val = wk["nums"][0]
                        break
            if mon_gdb_val:
                aux_map = data.setdefault("cham_aux_by_mon_gdb", {})
                rec = aux_map.setdefault(mon_gdb_val, {"c_g74": "", "d_g1": "", "e_bg1": "", "ar_bg1t7": "", "as_g71_g74": ""})
                if item["weekday_idx"] == 0 and p.get("g1") and len(p.get("g7", [])) >= 4:
                    g1_s = p["g1"]
                    g7_4 = p["g7"][3]
                    rec["c_g74"] = str((int(g7_4[0]) + int(g7_4[1])) % 10)
                    rec["d_g1"] = str((int(g1_s[3]) + int(g1_s[4])) % 10)
                    rec["e_bg1"] = g1_s[1]
                    updated = True
                if item["weekday_idx"] == 6 and p.get("g1"):
                    g1_sun = p["g1"]
                    g1cn_map = data.setdefault("tinh_g1cn_by_mon_gdb", {})
                    g1cn_map[mon_gdb_val] = str((int(g1_sun[0]) + int(g1_sun[1])) % 10)
                    updated = True
                if item["weekday_idx"] == 5 and p.get("g1") and len(p.get("g7", [])) >= 4:
                    g1_s = p["g1"]
                    g7_1 = p["g7"][0]
                    g7_4 = p["g7"][3]
                    rec["ar_bg1t7"] = g1_s[1]
                    rec["as_g71_g74"] = str((int(g7_1[1]) + int(g7_4[0])) % 10)
                    updated = True

            if upsert_week_gdb(data["weeks_gdb"], item["dt"], p["db"]):
                updated = True

        # Cập nhật bảng kết quả đầy đủ 27 giải mới nhất cho Trang chủ
        if rss_items:
            newest = rss_items[-1]
            np = newest["parsed"]
            new_board = {
                "date": newest["date"],
                "weekday": newest["weekday_name"],
                "db": np["db"],
                "g1": np["g1"],
                "g2": np["g2"],
                "g3": np["g3"],
                "g4": np["g4"],
                "g5": np["g5"],
                "g6": np["g6"],
                "g7": np["g7"]
            }
            if data.get("latest_full_board", {}).get("date") != new_board["date"]:
                data["latest_full_board"] = new_board
                updated = True
    except Exception as e:
        print("Lỗi đọc RSS:", e)

    # Tự động bù lịch sử đủ 45 ngày gần nhất cho Bảng 3 (40 ngày)
    if len(daily_map) < 45:
        all_dts = [datetime.strptime(d, "%d/%m/%Y") for d in daily_map.keys()]
        newest_dt = max(all_dts) if all_dts else datetime.now(VN_TZ).replace(tzinfo=None)
        for offset in range(1, 46):
            check_dt = newest_dt - timedelta(days=offset)
            c_str = check_dt.strftime("%d/%m/%Y")
            if c_str not in daily_map:
                try:
                    p = fetch_day_minhngoc(check_dt)
                    if p:
                        daily_map[c_str] = p["top10"]
                        upsert_week_gdb(data["weeks_gdb"], check_dt, p["db"])
                        updated = True
                except Exception:
                    pass

    sorted_daily = [
        {"date": d, "prizes": daily_map[d]}
        for d in sorted(daily_map.keys(), key=lambda x: datetime.strptime(x, "%d/%m/%Y"))
    ][-90:]
    data["daily_prizes"] = sorted_daily
    for item_d in sorted_daily:
        dt_d = datetime.strptime(item_d["date"], "%d/%m/%Y")
        if upsert_week_gdb(data["weeks_gdb"], dt_d, item_d["prizes"][0]):
            updated = True

    # Đảm bảo tất cả các tuần gần đây đều có đủ dữ liệu giải phụ (C, D, E, AR, AS, G1CN)
    aux_map = data.setdefault("cham_aux_by_mon_gdb", {})
    g1cn_map = data.setdefault("tinh_g1cn_by_mon_gdb", {})
    for wk in data["weeks_gdb"][:25]:
        if not isinstance(wk, dict):
            continue
        mon_gdb = wk["nums"][0] if len(wk.get("nums", [])) > 0 else ""
        if not mon_gdb:
            continue
        rec = aux_map.setdefault(mon_gdb, {"c_g74": "", "d_g1": "", "e_bg1": "", "ar_bg1t7": "", "as_g71_g74": ""})
        mon_dt = datetime.strptime(wk["monday"], "%d/%m/%Y")
        sat_dt = mon_dt + timedelta(days=5)
        sun_dt = mon_dt + timedelta(days=6)
        if not rec.get("c_g74") or not rec.get("d_g1") or not rec.get("e_bg1"):
            try:
                p_mon = fetch_day_minhngoc(mon_dt)
                if p_mon and p_mon.get("g1") and len(p_mon.get("g7", [])) >= 4:
                    rec["c_g74"] = str((int(p_mon["g7"][3][0]) + int(p_mon["g7"][3][1])) % 10)
                    rec["d_g1"] = str((int(p_mon["g1"][3]) + int(p_mon["g1"][4])) % 10)
                    rec["e_bg1"] = p_mon["g1"][1]
                    updated = True
            except Exception:
                pass
        if not rec.get("ar_bg1t7") or not rec.get("as_g71_g74"):
            try:
                p_sat = fetch_day_minhngoc(sat_dt)
                if p_sat and p_sat.get("g1") and len(p_sat.get("g7", [])) >= 4:
                    rec["ar_bg1t7"] = p_sat["g1"][1]
                    rec["as_g71_g74"] = str((int(p_sat["g7"][0][1]) + int(p_sat["g7"][3][0])) % 10)
                    updated = True
            except Exception:
                pass
        if mon_gdb not in g1cn_map or not g1cn_map[mon_gdb]:
            try:
                p_sun = fetch_day_minhngoc(sun_dt)
                if p_sun and p_sun.get("g1"):
                    g1cn_map[mon_gdb] = str((int(p_sun["g1"][0]) + int(p_sun["g1"][1])) % 10)
                    updated = True
            except Exception:
                pass

    if updated:
        now_vn = datetime.now(VN_TZ).strftime("%d/%m/%Y %H:%M")
        data["last_updated"] = now_vn
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Đã cập nhật Thongke.web.app lúc", now_vn)
    else:
        print("Dữ liệu đã mới nhất.")

if __name__ == "__main__":
    main()
