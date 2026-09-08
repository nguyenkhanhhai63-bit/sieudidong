GÓI KHÔI PHỤC BACKEND TỪ COMMIT 5ffe3be

Upload đè các file/thư mục này vào ROOT project Vercel/GitHub.

QUAN TRỌNG: đăng nhập và dữ liệu động không nằm trong file source.
Cần giữ/khôi phục Environment Variables trên Vercel:
- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET
- REDIS_URL
- KIOTVIET_CLIENT_ID
- KIOTVIET_CLIENT_SECRET
- KIOTVIET_RETAILER

Tuỳ cấu hình có thể còn các biến khác trong Vercel.

Dữ liệu Dịch vụ/Trả góp được lưu trong Redis theo các key:
- service:site:pricing
- installment:site:settings
Nếu REDIS_URL trỏ sang Redis mới/trống thì dữ liệu tùy chỉnh cũ không tự quay lại từ GitHub.

Tra cứu bảo hành lấy trực tiếp từ KiotViet API nên cần đủ KIOTVIET_*.
