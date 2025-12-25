#!/usr/bin/env bash
set -euo pipefail

# ============== แก้ 2 ตัวนี้ก่อนรัน ==============
DOMAIN="sakura-production.online"          # เช่น sakura.yourdomain.com 
EMAIL="65143366@g.cmru.ac.th"            # อีเมลสำหรับ Let's Encrypt 
# ==============================================

NEXT_PORT="3000"
APP_NAME="sakuranew"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"

if [[ "$DOMAIN" == "YOUR_DOMAIN_HERE" ]]; then
  echo "ERROR: กรุณาแก้ DOMAIN ในสคริปต์ก่อนรัน"
  exit 1
fi
if [[ "$EMAIL" == "YOUR_EMAIL_HERE" ]]; then
  echo "ERROR: กรุณาแก้ EMAIL ในสคริปต์ก่อนรัน"
  exit 1
fi

echo "==> 1) ติดตั้ง Nginx + Certbot"
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> 2) เปิดพอร์ตไฟร์วอลล์ (ถ้าใช้ UFW)"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 80/tcp || true
  sudo ufw allow 443/tcp || true
fi

echo "==> 3) สร้าง Nginx reverse proxy config สำหรับ ${DOMAIN}"
sudo tee "${NGINX_SITE}" >/dev/null <<NGINX
server {
  listen 80;
  listen [::]:80;

  server_name ${DOMAIN};

  # ป้องกัน body ใหญ่เกิน (อัปโหลดไฟล์ได้) ปรับได้
  client_max_body_size 50m;

  location / {
    proxy_pass http://127.0.0.1:${NEXT_PORT};
    proxy_http_version 1.1;

    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    # websockets (เผื่อมี)
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX

echo "==> 4) Enable site + ตรวจ config"
sudo ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/${APP_NAME}"
sudo nginx -t
sudo systemctl reload nginx

echo "==> 5) ขอใบรับรอง HTTPS (Let's Encrypt) และทำ auto-redirect http->https"
sudo certbot --nginx \
  -d "${DOMAIN}" \
  --agree-tos \
  -m "${EMAIL}" \
  --redirect \
  --non-interactive

echo "==> 6) ตั้ง APP_URL ให้ระบบรู้ว่าเป็น https (เพื่อ Secure cookie ถูกต้อง)"
sudo mkdir -p "/etc/systemd/system/${APP_NAME}.service.d"
sudo tee "/etc/systemd/system/${APP_NAME}.service.d/override.conf" >/dev/null <<SYSTEMD
[Service]
Environment=APP_URL=https://${DOMAIN}
SYSTEMD

sudo systemctl daemon-reload
sudo systemctl restart "${APP_NAME}.service"

echo "==> DONE"
echo "ทดสอบ:"
echo "  curl -I https://${DOMAIN}"
echo "  และลอง sign-in ผ่าน browser ที่ https://${DOMAIN}"
