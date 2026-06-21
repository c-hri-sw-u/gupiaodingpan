import urllib.request
import json

def extract_nodes(item):
    if isinstance(item, list):
        if len(item) >= 3 and isinstance(item[2], str) and item[2].startswith("sinahy_"):
            print(f"Node: {item[0]} -> {item[2]}")
        for x in item:
            extract_nodes(x)

def main():
    url = "http://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodes"
    res = urllib.request.urlopen(url).read().decode('gbk')
    data = json.loads(res)
    extract_nodes(data)

if __name__ == "__main__":
    main()
