# V59 - Redis Cloud / Vercel REDIS_URL

Bản này đã đổi phần lưu link thông số từ Upstash REST sang Redis Cloud mà Vercel vừa kết nối.

## Environment Variables cần có
- REDIS_URL (Vercel Redis integration tự tạo)
- ADMIN_PASSWORD
- ADMIN_SESSION_SECRET
- KIOTVIET_RETAILER
- KIOTVIET_CLIENT_ID
- KIOTVIET_CLIENT_SECRET

Không cần tạo UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, KV_REST_API_URL hay KV_REST_API_TOKEN.

## Sau khi upload/deploy
1. Redeploy project để Vercel cài dependency `redis` và nhận environment variables.
2. Mở `/admin-specs`.
3. Đăng nhập bằng ADMIN_PASSWORD.
4. Gắn link nguồn cho một model và bấm Lưu.
5. Reload `/admin-specs`: nếu link vẫn còn thì Redis đã lưu thành công.
6. Mở sản phẩm tương ứng để kiểm tra mục Thông số kỹ thuật.

REDIS_URL chỉ được đọc trong server-side API qua `lib/redis.js`; frontend không nhận URL/mật khẩu Redis.
