#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import sys
import time

# Target output file
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "market_snapshot.json")

# Standard headers
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        return None

def fetch_sina_page(page, page_size=80):
    """Fetches a single page of A-shares list from Sina OpenAPI proxy"""
    url = f"http://money.finance.sina.com.cn/d/api/openapi_proxy.php/?__s=[[%22hq%22,%22hs_a%22,%22%22,0,{page},{page_size}]]"
    res = fetch_json(url)
    if res and isinstance(res, list) and len(res) > 0:
        return res[0].get("items", [])
    return None

def get_stock_list():
    """Fetches full A-share list containing code, name, and symbol concurrently from Sina"""
    print("[*] 正在从新浪财经 OpenAPI 代理获取 A 股（沪深）股票列表...")
    stocks = []
    
    # Page size 80, fetch 75 pages to cover 6000 stocks
    pages = list(range(1, 76))
    
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_sina_page, p): p for p in pages}
        for future in as_completed(futures):
            items = future.result()
            if items and isinstance(items, list):
                for item in items:
                    symbol = item[0] # e.g. "sh600261"
                    code = item[1]   # e.g. "600261"
                    name = item[2]   # e.g. "海星股份"
                    # Filter: Only process Shanghai (sh) and Shenzhen (sz) stocks, skipping Beijing (bj)
                    if symbol.startswith(("sh", "sz")):
                        stocks.append({
                            "code": code,
                            "name": name,
                            "symbol": symbol
                        })
                        
    # De-duplicate by stock code
    unique_stocks = {s["code"]: s for s in stocks}.values()
    stocks = list(unique_stocks)
    print(f"[+] 成功获取 {len(stocks)} 只沪深股票")
    return stocks

def fetch_kline_for_stock(stock, limit=500):
    """Fetches daily K-line for a single stock from Tencent Finance (Forward adjusted / 前复权)"""
    symbol = stock["symbol"]
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={symbol},day,,,{limit},qfq"
    
    res = fetch_json(url)
    if not res or "data" not in res or not res["data"] or symbol not in res["data"]:
        return stock["code"], None
    
    stock_data = res["data"][symbol]
    qfq_data = stock_data.get("qfqday") or stock_data.get("day")
    if not qfq_data:
        return stock["code"], None
    
    klines = []
    for item in qfq_data:
        # Tencent K-line format: [Date, Open, Close, High, Low, Volume]
        try:
            date = item[0]
            op = float(item[1])
            cl = float(item[2])
            hi = float(item[3])
            lo = float(item[4])
            vol = int(float(item[5]))  # Convert float string to int volume
            klines.append([date, op, cl, hi, lo, vol, 0.0, 0.0])
        except (ValueError, IndexError):
            continue
            
    return stock["code"], {
        "name": stock["name"],
        "klines": klines
    }

def main():
    start_time = time.time()
    
    # Create output dir if not exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    stocks = get_stock_list()
    if not stocks:
        sys.exit(1)
        
    market_data = {}
    total = len(stocks)
    completed = 0
    
    print(f"[*] 开始并行从腾讯财经抓取 K 线数据 (并发线程数: 50)...")
    
    # Fetch concurrently using thread pool
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = {executor.submit(fetch_kline_for_stock, s): s for s in stocks}
        
        for future in as_completed(futures):
            code, data = future.result()
            completed += 1
            if data and len(data["klines"]) > 100:  # Only save stocks with sufficient history
                market_data[code] = data
            
            # Print progress bar
            if completed % 100 == 0 or completed == total:
                percent = (completed / total) * 100
                sys.stdout.write(f"\r[+] 进度: {completed}/{total} ({percent:.2f}%) - 已抓取有效股: {len(market_data)}")
                sys.stdout.flush()
                
    print("\n[*] 正在将数据写入本地文件...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        # Mini json format to save space
        json.dump(market_data, f, ensure_ascii=False)
        
    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    duration = time.time() - start_time
    print(f"[+] 抓取完成!")
    print(f"    - 保存路径: {OUTPUT_FILE}")
    print(f"    - 数据大小: {size_mb:.2f} MB")
    print(f"    - 耗时: {duration:.2f} 秒")

if __name__ == "__main__":
    main()
