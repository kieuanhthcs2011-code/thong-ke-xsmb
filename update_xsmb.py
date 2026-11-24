import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

RSS_URL = "https://xskt.com.vn/rss-feed/mien-bac-xsmb.rss"
DATA_FILE = "data.json"
VN_TZ = timezone(timedelta(hours=7))

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
        # Extract date DD/MM or DD/MM/YYYY from title
        m_date = re.search(r"(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", title)
        if not m_date:
            continue
        day = int(m_date.group(1))
        month = int(m_date.group(2))
        year = int(m_date.group(3)) if m_date.group(3) else datetime.now(VN_TZ).year
        dt = datetime(year, month, day)
        date_str = dt.strftime("%d/%m/%Y")

        m_db = re.search(r"ĐB:\s*(\d{5})", desc)
        m_g1 = re.search(r"1:\s*(\d{5})", desc)
        m_g2 = re.search(r"2:\s*([\d\s-]+)", desc)
        m_g3 = re.search(r"3:\s*([\d\s-]+)", desc)
        if not (m_db and m_g1 and m_g2 and m_g3):
            continue

        db = m_db.group(1)
        g1 = m_g1.group(1)
        g2 = re.findall(r"\d{5}", m_g2.group(1))[:2]
        g3 = re.findall(r"\d{5}", m_g3.group(1))[:6]
        if len(g2) == 2 and len(g3) == 6:
            results.append({
                "date": date_str,
                "weekday": dt.weekday(), # 0=T2 .. 6=CN
                "prizes": [db, g1] + g2 + g3
            })
    # Sort oldest to newest
    results.sort(key=lambda x: datetime.strptime(x["date"], "%d/%m/%Y"))
    return results

def main():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    rss_items = fetch_xsmb_rss()
    if not rss_items:
        print("Không lấy được dữ liệu mới từ RSS.")
        return

    existing_dates = {item["date"] for item in data["daily_prizes"]}
    updated = False

    for item in rss_items:
        date_str = item["date"]
        db = item["prizes"][0]
        wday = item["weekday"]

        # 1. Update daily_prizes (for Tab 3: ĐB -> G3-6)
        if date_str not in existing_dates:
            data["daily_prizes"].append({
                "date": date_str,
                "prizes": item["prizes"]
            })
            existing_dates.add(date_str)
            updated = True
            print(f"Đã thêm ngày {date_str}: ĐB = {db}")

        # 2. Update weeks_gdb (newest week at index 0, Monday=0 .. Sunday=6)
        # If weekday == 0 (Monday) and top week already has Monday filled with a different number, insert a new week at top
        top_week = data["weeks_gdb"][0]
        if wday == 0:
            if top_week[0] == "":
                top_week[0] = db
                updated = True
            elif top_week[0] != db:
                new_week = [db, "", "", "", "", "", ""]
                data["weeks_gdb"].insert(0, new_week)
                updated = True
        else:
            if top_week[wday] != db:
                top_week[wday] = db
                updated = True

    if updated:
        now_vn = datetime.now(VN_TZ).strftime("%d/%m/%Y %H:%M")
        data["last_updated"] = now_vn
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("Cập nhật data.json thành công lúc", now_vn)
    else:
        print("Dữ liệu đã mới nhất, không có thay đổi.")

if __name__ == "__main__":
    main()
