# TikTok Shop AI – Siêu Di Động v492

## Thông tin app hiện tại

- Service ID: `7680117059338225428`
- App Key: `6l59apmu4302k`
- Redirect URL: `https://sieudidong.vn/api/tiktok-connect`
- Webhook URL: `https://sieudidong.vn/api/tiktok-webhook`
- Market: Việt Nam / ROW
- Customer Service scope: `seller.customer_service` (đang chờ TikTok xét duyệt tại thời điểm tạo bản này)

App Key và Service ID đã có fallback trong code v492. App Secret KHÔNG được ghi vào code.

## Vercel Environment Variables

Bắt buộc nhập:

- `TIKTOK_SHOP_APP_SECRET=<secret thật trong Partner Center>`
- `TIKTOK_SHOP_AUTH_REGION=ROW`
- `TIKTOK_AI_ENABLED=1`
- `SITE_URL=https://sieudidong.vn`
- `REDIS_URL=<Redis hiện tại>`
- `GEMINI_API_KEY=<Gemini key hiện tại>`

Tùy chọn (để ghi đè fallback trong code):

- `TIKTOK_SHOP_APP_KEY=6l59apmu4302k`
- `TIKTOK_SHOP_SERVICE_ID=7680117059338225428`

Sau khi thêm biến môi trường phải Redeploy.

## Quyền API cần có

1. `seller.customer_service` – Customer Service (đang xét duyệt).
2. `seller.authorization.info` – Shop Authorized Information. Bật scope này trong Manage API vì endpoint Get Authorized Shops cần nó để lấy `shop_cipher`.

Không bật các scope không cần thiết.

## Khi Customer Service được duyệt

1. Kiểm tra `seller.authorization.info` đã bật.
2. Công bố custom app/service trong Partner Center nếu vẫn là Bản nháp.
3. Mở `https://sieudidong.vn/api/tiktok-connect` và authorize đúng Seller Center.
4. Backend đổi `code` lấy access/refresh token, gọi Get Authorized Shops lấy `shop_cipher`, lưu Redis, rồi đăng ký webhook `NEW_MESSAGE`.
5. Test trạng thái: `https://sieudidong.vn/api/tiktok-setup` và `https://sieudidong.vn/api/tiktok-connect?status=1`.

## Luồng chat

Buyer message → NEW_MESSAGE webhook → xác thực HMAC bằng raw body → chống trùng → gọi AI chat hiện tại → Send Message API trả lời buyer.

Bản v492 vẫn giữ cơ chế handoff: khi khách yêu cầu nhân viên/người thật/chốt/giữ máy thì AI tạm dừng cuộc hội thoại 30 phút.
