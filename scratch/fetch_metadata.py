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
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "stock_metadata.json")

def fetch_sina_page(page, page_size=80):
    """Fetches a single page of A-shares list from Sina OpenAPI proxy"""
    url = f"http://money.finance.sina.com.cn/d/api/openapi_proxy.php/?__s=[[%22hq%22,%22hs_a%22,%22%22,0,{page},{page_size}]]"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "http://finance.sina.com.cn/"
        }
    )
    
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    
    try:
        with opener.open(req, timeout=10) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data)
    except Exception:
        return None

def fetch_industry_nodes():
    """Fetches Shenwan Level 1 industry nodes from Sina Finance, with static fallback"""
    url = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodes"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
    )
    
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    
    try:
        with opener.open(req, timeout=8) as r:
            data = json.loads(r.read().decode('gbk', errors='ignore'))
            
        sw_nodes = []
        for item in data[1]:
            if item[0] == 'A股':
                for sub in item[1]:
                    if sub[0] == '申万一级':
                        for s in sub[1]:
                            sw_nodes.append((s[2], s[0])) # (node_id, node_name)
        if sw_nodes:
            return sw_nodes
    except Exception as e:
        # Expected if rate limited, fall back silently
        pass
        
    return [
        ("sw1_770000", "美容护理"),
        ("sw1_760000", "环保"),
        ("sw1_750000", "石油石化"),
        ("sw1_740000", "煤炭"),
        ("sw1_730000", "通信"),
        ("sw1_720000", "传媒"),
        ("sw1_710000", "计算机"),
        ("sw1_650000", "国防军工"),
        ("sw1_640000", "机械设备"),
        ("sw1_630000", "电力设备"),
        ("sw1_620000", "建筑装饰"),
        ("sw1_610000", "建筑材料"),
        ("sw1_510000", "综合"),
        ("sw1_490000", "非银金融"),
        ("sw1_480000", "银行"),
        ("sw1_460000", "社会服务"),
        ("sw1_450000", "商贸零售"),
        ("sw1_430000", "房地产"),
        ("sw1_420000", "交通运输"),
        ("sw1_410000", "公用事业"),
        ("sw1_370000", "医药生物"),
        ("sw1_360000", "轻工制造"),
        ("sw1_350000", "纺织服饰"),
        ("sw1_340000", "食品饮料"),
        ("sw1_330000", "家用电器"),
        ("sw1_280000", "汽车"),
        ("sw1_270000", "电子"),
        ("sw1_240000", "有色金属"),
        ("sw1_230000", "钢铁"),
        ("sw1_220000", "基础化工"),
        ("sw1_110000", "农林牧渔")
    ]

def fetch_industry_stocks(node_id, node_name):
    """Fetches all pages of stocks belonging to a specific industry node with rate limiting"""
    page = 1
    mapped_codes = []
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    
    while True:
        # Throttle request rate
        time.sleep(0.5)
        
        url = f"http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page={page}&num=100&sort=symbol&asc=1&node={node_id}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "Referer": "http://vip.stock.finance.sina.com.cn/"
            }
        )
        try:
            with opener.open(req, timeout=12) as r:
                res_list = json.loads(r.read().decode('gbk', errors='ignore'))
                if not res_list or not isinstance(res_list, list) or len(res_list) == 0:
                    break
                for item in res_list:
                    if 'code' in item:
                        mapped_codes.append(item['code'])
                if len(res_list) < 100:
                    break
                page += 1
        except Exception as e:
            # Check for HTTP 456 rate limit
            is_rate_limited = False
            if hasattr(e, 'code') and e.code == 456:
                is_rate_limited = True
                
            if is_rate_limited:
                # Cool down and retry
                time.sleep(6.0)
                try:
                    with opener.open(req, timeout=12) as r:
                        res_list = json.loads(r.read().decode('gbk', errors='ignore'))
                        if not res_list or not isinstance(res_list, list) or len(res_list) == 0:
                            break
                        for item in res_list:
                            if 'code' in item:
                                mapped_codes.append(item['code'])
                        if len(res_list) < 100:
                            break
                        page += 1
                except Exception:
                    break
            else:
                break
    return node_name, mapped_codes

def main():
    print("[*] 正在从新浪全球公开通道拉取全 A 股行情列表...")
    
    # Page size 80, fetch 75 pages to cover 6000 stocks
    pages = list(range(1, 76))
    raw_items = []
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_sina_page, p): p for p in pages}
        for future in as_completed(futures):
            res = future.result()
            if res and isinstance(res, list) and len(res) > 0:
                items = res[0].get("items", [])
                raw_items.extend(items)
                
    if not raw_items:
        print("[-] 无法获取 A 股行情列表，请确认网络状态。")
        sys.exit(1)
        
    print(f"[+] 成功获取 {len(raw_items)} 只个股基本行情数据。")
    
    # Fetch Shenwan Level 1 nodes
    sw_nodes = fetch_industry_nodes()
    
    print(f"[*] 正在并发获取 {len(sw_nodes)} 个申万一级行业的成份股映射 (并发数: 2)...")
    
    stock_to_industry = {}
    completed = 0
    total_nodes = len(sw_nodes)
    
    # Use max_workers=2 to prevent hitting rate limits
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = {executor.submit(fetch_industry_stocks, n_id, n_name): n_id for n_id, n_name in sw_nodes}
        for future in as_completed(futures):
            name, codes = future.result()
            for code in codes:
                stock_to_industry[code] = name
            completed += 1
            percent = (completed / total_nodes) * 100
            sys.stdout.write(f"\r[+] 行业解析进度: {completed}/{total_nodes} ({percent:.2f}%)")
            sys.stdout.flush()
    print("\n[+] 行业板块成分股解析完成。")
    
    # Merge and build metadata map
    meta_map = {}
    for item in raw_items:
        code = item[1]
        name = item[2]
        price = float(item[3] or 0)
        total_cap = float(item[19] or 0) * 10000
        circ_cap = float(item[20] or 0) * 10000
        
        # Look up industry
        industry = stock_to_industry.get(code, "其它")
        
        meta_map[code] = {
            "price": price,
            "totalCap": total_cap,
            "circCap": circ_cap,
            "industry": industry
        }
        
    # Write output
    print("[*] 正在写入本地文件...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(meta_map, f, ensure_ascii=False, indent=2)
        
    print(f"[+] 元数据抓取并写入成功!")
    print(f"    - 路径: {OUTPUT_FILE}")
    print(f"    - 股票数量: {len(meta_map)}")
    sys.exit(0)

if __name__ == "__main__":
    main()
